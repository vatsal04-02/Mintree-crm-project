"""HTTP-level acceptance run against a running development site.

Drives Supplier -> PO -> GRN -> QC Hold -> QI -> QC Release -> usable stock as the separate
SAMPLE users, through Frappe's REST API only (what a browser or integration would do), and
checks that refused requests roll back completely: a refused request leaves no stock ledger
rows, and a failure raised after ERPNext has written ledger rows (shelf-life check on submit)
leaves nothing either.

Usage (development only):
    python acceptance_http.py http://127.0.0.1:8000 factory.localhost \
        ~/frappe-bench/sites/factory.localhost/private/sample_users.json

Exits non-zero on the first failed check. Prints a step-by-step report.
"""

import io
import json
import sys
from datetime import date, timedelta

import requests

BASE, HOST, CREDS = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
COMPANY = "SAMPLE Mintree Manufacturing"
RM, SUPPLIER = "SAMPLE-RM-0001", "SAMPLE Supplier - Actives"
HOLD, STORES, REJECTED = "RM-QC-HOLD - SMM", "RM-STORES - SMM", "REJECTED - SMM"
TODAY = date.today()
results: list[tuple[str, bool, str]] = []


class Client:
	def __init__(self, user, password):
		self.user = user
		self.s = requests.Session()
		self.s.headers["Host"] = HOST
		self.s.trust_env = False  # local server, never through the proxy
		r = self.s.post(f"{BASE}/api/method/login", data={"usr": user, "pwd": password})
		r.raise_for_status()

	def call(self, method, **kwargs):
		r = self.s.post(f"{BASE}/api/method/{method}", json=kwargs)
		return r

	def insert(self, doc):
		return self.s.post(f"{BASE}/api/resource/{doc['doctype']}", json=doc)

	def get(self, doctype, name):
		r = self.s.get(f"{BASE}/api/resource/{doctype}/{name}")
		r.raise_for_status()
		return r.json()["data"]

	def submit(self, doctype, name):
		return self.call("frappe.client.submit", doc=self.get(doctype, name))


def ok(r, what):
	if r.status_code != 200:
		raise SystemExit(f"FAILED: {what}: HTTP {r.status_code} {r.text[:400]}")
	data = r.json()
	return data.get("data") or data.get("message")


def check(name, condition, detail=""):
	results.append((name, bool(condition), detail))
	print(("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail else ""))
	if not condition:
		raise SystemExit(1)


def refused(r):
	return r.status_code >= 400


buyer = Client("sample.buyer@sample.invalid", CREDS["sample.buyer@sample.invalid"])
approver = Client("sample.approver@sample.invalid", CREDS["sample.approver@sample.invalid"])
stores = Client("sample.stores@sample.invalid", CREDS["sample.stores@sample.invalid"])
qc = Client("sample.qc@sample.invalid", CREDS["sample.qc@sample.invalid"])
qa = Client("sample.qa@sample.invalid", CREDS["sample.qa@sample.invalid"])


def sle_count(client, voucher):
	return ok(client.call("frappe.client.get_count", doctype="Stock Ledger Entry", filters={"voucher_no": voucher}), "count")


def batch_rows(client, batch):
	"""Batch quantity per warehouse, from the Stock by QC Status report (as a user would see it)."""
	data = ok(
		client.call("frappe.desk.query_report.run", report_name="Stock by QC Status", filters={"company": COMPANY, "item_code": RM}),
		"report",
	)
	return {r["warehouse"]: r["qty"] for r in data["result"] if isinstance(r, dict) and r.get("batch_no") == batch}


# 1. Purchase Order by the buyer; the buyer cannot approve it; the approver can
po = ok(buyer.insert({
	"doctype": "Purchase Order", "company": COMPANY, "supplier": SUPPLIER,
	"schedule_date": str(TODAY + timedelta(days=7)),
	"items": [{"item_code": RM, "qty": 100, "rate": 50, "schedule_date": str(TODAY + timedelta(days=7))}],
}), "create PO")
check("PO created by buyer, ordered into QC Hold", po["items"][0]["warehouse"] == HOLD, po["name"])
check("buyer cannot approve own PO (HTTP)", refused(buyer.submit("Purchase Order", po["name"])))
ok(approver.submit("Purchase Order", po["name"]), "approve PO")
check("approver approves PO", approver.get("Purchase Order", po["name"])["docstatus"] == 1)

# 2. Goods receipt with supplier batch, dates and an uploaded COA
pr = ok(stores.call("erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt", source_name=po["name"]), "map PR")
from pypdf import PdfWriter  # noqa: E402

w = PdfWriter(); w.add_blank_page(width=200, height=200); buf = io.BytesIO(); w.write(buf)
up = stores.s.post(f"{BASE}/api/method/upload_file", files={"file": ("SAMPLE-COA-HTTP.pdf", buf.getvalue(), "application/pdf")}, data={"is_private": 1})
coa = ok(up, "upload COA")["file_url"]
pr["items"][0].update({
	"fo_supplier_batch_no": "SAMPLE-HTTP-LOT-1", "fo_mfg_date": str(TODAY - timedelta(days=15)),
	"fo_expiry_date": str(TODAY + timedelta(days=700)), "fo_coa": coa,
})
pr = ok(stores.insert(pr), "insert PR")
ok(stores.submit("Purchase Receipt", pr["name"]), "submit PR")
pr = stores.get("Purchase Receipt", pr["name"])
batch = pr["items"][0]["batch_no"]
check("GRN submitted, stock in QC Hold", batch_rows(stores, batch) == {HOLD: 100}, f"{pr['name']} batch {batch}")
check("GRN wrote exactly one stock ledger row", sle_count(stores, pr["name"]) == 1)

# 3. Refused movement: nothing written
before = ok(stores.call("frappe.client.get_count", doctype="Stock Ledger Entry", filters={"item_code": RM}), "count")
r = stores.insert({
	"doctype": "Stock Entry", "purpose": "Material Transfer", "stock_entry_type": "Material Transfer", "company": COMPANY,
	"items": [{"item_code": RM, "qty": 100, "s_warehouse": HOLD, "t_warehouse": STORES, "use_serial_batch_fields": 1, "batch_no": batch}],
})
after = ok(stores.call("frappe.client.get_count", doctype="Stock Ledger Entry", filters={"item_code": RM}), "count")
check("manual transfer out of QC Hold refused (HTTP)", refused(r) and "QC" in r.text, f"HTTP {r.status_code}")
check("refused request wrote no ledger rows", before == after and batch_rows(stores, batch) == {HOLD: 100})

# 4. QC: inspection + partial release of 60 by the QC officer
rel = ok(qc.insert({
	"doctype": "QC Release", "company": COMPANY, "item_code": RM, "batch_no": batch,
	"source_warehouse": HOLD, "decision": "Partial Release", "qty": 60,
}), "QC Release")
qi_name = ok(qc.call("factory_ops.quality.doctype.qc_release.qc_release.create_quality_inspection", qc_release=rel["name"]), "QI")
qi = qc.get("Quality Inspection", qi_name)
qi.update({"manual_inspection": 1, "status": "Accepted"})
ok(qc.s.put(f"{BASE}/api/resource/Quality Inspection/{qi_name}", json=qi), "save QI")
ok(qc.submit("Quality Inspection", qi_name), "submit QI")
check("stores user cannot submit the QC Release", refused(stores.submit("QC Release", rel["name"])))
ok(qc.submit("QC Release", rel["name"]), "submit QC Release")
check("partial release: 60 usable, 40 still held", batch_rows(qc, batch) == {HOLD: 40, STORES: 60})

# 5. Reject the remaining 40; QA sends 10 back for re-test; release needs a fresh QI
rej = ok(qc.insert({
	"doctype": "QC Release", "company": COMPANY, "item_code": RM, "batch_no": batch,
	"source_warehouse": HOLD, "decision": "Reject", "qty": 40, "reason": "SAMPLE: out of specification",
}), "reject")
qi2 = ok(qc.call("factory_ops.quality.doctype.qc_release.qc_release.create_quality_inspection", qc_release=rej["name"]), "QI2")
doc = qc.get("Quality Inspection", qi2); doc.update({"manual_inspection": 1, "status": "Rejected"})
ok(qc.s.put(f"{BASE}/api/resource/Quality Inspection/{qi2}", json=doc), "save QI2")
ok(qc.submit("Quality Inspection", qi2), "submit QI2")
ok(qc.submit("QC Release", rej["name"]), "submit reject")
check("rejected 40 segregated", batch_rows(qc, batch) == {STORES: 60, REJECTED: 40})
check("QC officer cannot send for re-test",
	refused(qc.call("factory_ops.quality.doctype.qc_retest.qc_retest.send_for_retest", qc_release=rej["name"], reason="x", qty=10)))
ok(qa.call("factory_ops.quality.doctype.qc_retest.qc_retest.send_for_retest", qc_release=rej["name"], reason="SAMPLE: re-test", qty=10), "retest")
check("QA re-test moves 10 back to QC Hold", batch_rows(qa, batch) == {STORES: 60, REJECTED: 30, HOLD: 10})

# 6. Failure after ledger rows are written rolls back completely (shelf-life check on submit).
#    A finished good is needed for a Delivery Note: receive one as opening stock into FG-QC-HOLD,
#    release it through QC, then try to dispatch it below the minimum remaining shelf life.
FG, FG_HOLD, FG_STORES = "SAMPLE-FG-0001", "FG-QC-HOLD - SMM", "FG-STORES - SMM"
se = ok(stores.insert({
	"doctype": "Stock Entry", "purpose": "Material Receipt", "stock_entry_type": "Material Receipt", "company": COMPANY,
	"items": [{"item_code": FG, "qty": 50, "t_warehouse": FG_HOLD, "basic_rate": 100}],
}), "FG opening receipt")
ok(stores.submit("Stock Entry", se["name"]), "submit FG receipt")
fg_bundle = stores.get("Stock Entry", se["name"])["items"][0]["serial_and_batch_bundle"]
fg_batch = stores.get("Serial and Batch Bundle", fg_bundle)["entries"][0]["batch_no"]
fg_rel = ok(qc.insert({
	"doctype": "QC Release", "company": COMPANY, "item_code": FG, "batch_no": fg_batch,
	"source_warehouse": FG_HOLD, "decision": "Release",
}), "FG release")
qi3 = ok(qc.call("factory_ops.quality.doctype.qc_release.qc_release.create_quality_inspection",
	qc_release=fg_rel["name"], inspection_type="Outgoing"), "QI3")
doc = qc.get("Quality Inspection", qi3); doc.update({"manual_inspection": 1, "status": "Accepted"})
ok(qc.s.put(f"{BASE}/api/resource/Quality Inspection/{qi3}", json=doc), "save QI3")
ok(qc.submit("Quality Inspection", qi3), "submit QI3")
ok(qc.submit("QC Release", fg_rel["name"]), "release FG")

ok(qa.call("frappe.client.set_value", doctype="Factory Ops Settings", name="Factory Ops Settings",
	fieldname="min_shelf_life_days_for_dispatch", value=5000), "set shelf life")
try:
	dn = ok(stores.insert({
		"doctype": "Delivery Note", "company": COMPANY, "customer": "SAMPLE Customer - Distributor",
		"items": [{"item_code": FG, "qty": 5, "rate": 100, "warehouse": FG_STORES}],  # batch picked FEFO on submit
	}), "DN draft")
	r = stores.submit("Delivery Note", dn["name"])
	check("dispatch below minimum shelf life refused (HTTP)", refused(r) and "shelf life" in r.text, f"HTTP {r.status_code}")
	check("failed submit left the Delivery Note as draft", stores.get("Delivery Note", dn["name"])["docstatus"] == 0)
	check("failed submit left no stock ledger rows", sle_count(stores, dn["name"]) == 0)
	fg_left = ok(stores.call("frappe.client.get_count", doctype="Serial and Batch Bundle",
		filters={"voucher_no": dn["name"]}), "bundles")
	check("failed submit left no batch bundles", fg_left == 0)
finally:
	ok(qa.call("frappe.client.set_value", doctype="Factory Ops Settings", name="Factory Ops Settings",
		fieldname="min_shelf_life_days_for_dispatch", value=0), "reset shelf life")

print(f"\n{sum(1 for _, p, _ in results if p)}/{len(results)} checks passed")
