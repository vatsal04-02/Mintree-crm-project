"""End-to-end demo scenario on the local demo site: purchase -> QC -> production -> QC -> sale -> cash.

Uses one product from the public website catalogue (its real public name and price) and DEMO - NOT
REAL materials, suppliers, BOMs and QC data (factory_ops/demo/data.py). Each step runs as the sample
user who would do it, through the REST API the Desk screens use, and is checked:

 1 Purchase Orders (buyer) and approval (approver)    8 FG manufacture into FG-QC-HOLD
 2 Goods receipt into QC Hold with lot, dates, COA     9 FG inspection and release to FG-STORES
 3 Quality Inspections (QC officer)                   10 Sales Order (sales)
 4 QC Release of accepted materials                   11 FEFO Pick List of eligible batches, reserved
 5 Work Orders for the bulk and the website product   12 Delivery Note (dispatch)
 6 Material issue (transfer for manufacture)          13 Sales Invoice (accounts)
 7 Bulk manufacture, bulk QC release                  14 Payment, and every voucher's GL entries balance

Usage (local demo site only):
    python deploy/demo/demo_scenario_http.py http://127.0.0.1:8001 demo.localhost \\
        ~/frappe-bench/sites/demo.localhost/private/sample_users.json
"""

import io
import json
import math
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests
from pypdf import PdfWriter

BASE, HOST, CREDS_PATH = sys.argv[1], sys.argv[2], sys.argv[3]
CREDS = json.load(open(CREDS_PATH))
SC = json.load(open(Path(CREDS_PATH).with_name("demo_scenario.json")))
COMPANY, ABBR, FG, BULK = SC["company"], SC["abbr"], SC["fg_item"], SC["bulk_item"]
TODAY, RUN = date.today(), time.strftime("%m%d%H%M%S")
WO_API = "erpnext.manufacturing.doctype.work_order.work_order"
QCR_API = "factory_ops.quality.doctype.qc_release.qc_release"
docs: dict[str, list[str]] = {}
results = []

if not FG:
	raise SystemExit("No website product on this demo site: run the extraction and reset-demo.sh first.")


def wh(name):
	return f"{name} - {ABBR}"


class Client:
	def __init__(self, user):
		self.s = requests.Session()
		self.s.trust_env = False
		self.s.headers["Host"] = HOST
		self.s.post(f"{BASE}/api/method/login", data={"usr": user, "pwd": CREDS[user]}).raise_for_status()

	def call(self, method, **kw):
		return self.s.post(f"{BASE}/api/method/{method}", json=kw)

	def insert(self, doc):
		return self.s.post(f"{BASE}/api/resource/{doc['doctype']}", json=doc)

	def get(self, doctype, name):
		r = self.s.get(f"{BASE}/api/resource/{doctype}/{name}")
		r.raise_for_status()
		return r.json()["data"]

	def put(self, doctype, name, values):
		return self.s.put(f"{BASE}/api/resource/{doctype}/{name}", json=values)

	def submit(self, doctype, name):
		return self.call("frappe.client.submit", doc=self.get(doctype, name))

	def list(self, doctype, filters, fields, **kw):
		return ok(self.call("frappe.client.get_list", doctype=doctype, filters=filters, fields=fields, limit_page_length=0, **kw), f"list {doctype}")


def ok(r, what):
	if r.status_code != 200:
		raise SystemExit(f"FAILED: {what}: HTTP {r.status_code} {r.text[:800]}")
	d = r.json()
	return d.get("data") if "data" in d else d.get("message")


def check(step, cond, detail=""):
	results.append((step, bool(cond)))
	print(("PASS " if cond else "FAIL ") + step + (f" — {detail}" if detail else ""))
	if not cond:
		raise SystemExit(1)


def keep(kind, name):
	docs.setdefault(kind, []).append(name)
	return name


buyer, approver = Client("sample.buyer@sample.invalid"), Client("sample.approver@sample.invalid")
stores, qc = Client("sample.stores@sample.invalid"), Client("sample.qc@sample.invalid")
production, sales = Client("sample.production@sample.invalid"), Client("sample.sales@sample.invalid")
dispatch, accounts = Client("sample.dispatch@sample.invalid"), Client("sample.accounts@sample.invalid")

fg_item = stores.get("Item", FG)
print(f"Website product for the demo: {FG} — {fg_item['item_name']} (group {fg_item['item_group']})\n")

# FG plan: up to 100 units, limited by the bulk a 20 kg batch yields
fg_bom = stores.get("BOM", stores.list("BOM", {"item": FG, "is_default": 1, "docstatus": 1}, ["name"])[0]["name"])
bulk_per_unit = next(r["qty"] for r in fg_bom["items"] if r["item_code"] == BULK) / fg_bom["quantity"]
bulk_bom = stores.get("BOM", stores.list("BOM", {"item": BULK, "is_default": 1, "docstatus": 1}, ["name"])[0]["name"])
BULK_QTY = 20
need = {r["item_code"]: r["qty"] * BULK_QTY / bulk_bom["quantity"] for r in bulk_bom["items"]}

# 1. Purchase Orders by the buyer, approved by the approver
pos = []
# every material the run consumes is bought (DEMO opening stock is only a top-up), so the scenario can be repeated
for supplier_key, items in (("chem", SC["rm_items"]), ("pack", SC["pm_items"])):
	rows = []
	for code in items:
		qty = math.ceil(need[code] * 1.5) if code in need else 150
		rows.append({"item_code": code, "qty": qty, "rate": SC["buying_rates"][code], "schedule_date": str(TODAY + timedelta(days=3))})
	po = ok(buyer.insert({"doctype": "Purchase Order", "company": COMPANY, "supplier": SC["suppliers"][supplier_key], "schedule_date": str(TODAY + timedelta(days=3)), "items": rows}), "PO")
	check("1 buyer cannot approve the PO", buyer.submit("Purchase Order", po["name"]).status_code >= 400, po["name"])
	ok(approver.submit("Purchase Order", po["name"]), "approve PO")
	pos.append(keep("Purchase Order", po["name"]))
check("1 Purchase Orders approved, delivering into QC Hold", all(approver.get("Purchase Order", p)["docstatus"] == 1 for p in pos), ", ".join(pos))

# 2. Goods receipt into QC Hold with supplier lot, dates and a COA where required
w = PdfWriter()
w.add_blank_page(width=200, height=200)
buf = io.BytesIO()
w.write(buf)
coa = ok(stores.s.post(f"{BASE}/api/method/upload_file", files={"file": ("DEMO-COA-NOT-REAL.pdf", buf.getvalue(), "application/pdf")}, data={"is_private": 1}), "COA")["file_url"]
received = []  # (item, batch, hold warehouse)
for po in pos:
	pr = ok(stores.call("erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt", source_name=po), "map PR")
	for i, row in enumerate(pr["items"], 1):
		row.update({"fo_supplier_batch_no": f"DEMO-LOT-{RUN}-{i}", "fo_mfg_date": str(TODAY - timedelta(days=20)), "fo_expiry_date": str(TODAY + timedelta(days=600)), "fo_coa": coa})
	pr = ok(stores.insert(pr), "insert PR")
	ok(stores.submit("Purchase Receipt", pr["name"]), "submit PR")
	pr = stores.get("Purchase Receipt", keep("Purchase Receipt", pr["name"]))
	received += [(r["item_code"], r["batch_no"], r["warehouse"]) for r in pr["items"]]
check("2 materials received into QC Hold, one batch per line", all(w_.endswith(("RM-QC-HOLD - " + ABBR, "PM-QC-HOLD - " + ABBR)) and b for _, b, w_ in received), f"{len(received)} batches")

r = stores.insert({"doctype": "Stock Entry", "purpose": "Material Transfer", "stock_entry_type": "Material Transfer", "company": COMPANY,
	"items": [{"item_code": received[0][0], "qty": 1, "s_warehouse": received[0][2], "t_warehouse": wh("RM-STORES"), "use_serial_batch_fields": 1, "batch_no": received[0][1]}]})  # fmt: skip
check("2 held material cannot be moved by hand", r.status_code >= 400 and "QC" in r.text)


# 3-4. Quality Inspection and QC Release (QC officer)
def inspect_and_release(item, batch, hold, inspection_type="Incoming"):
	rel = ok(qc.insert({"doctype": "QC Release", "company": COMPANY, "item_code": item, "batch_no": batch, "source_warehouse": hold, "decision": "Release"}), f"QC Release {batch}")
	qi_name = ok(qc.call(f"{QCR_API}.create_quality_inspection", qc_release=rel["name"], inspection_type=inspection_type), "QI")
	qi = qc.get("Quality Inspection", qi_name)
	for reading in qi.get("readings") or []:
		reading["status"] = "Accepted"
	qi.update({"manual_inspection": 1, "status": "Accepted", "remarks": "DEMO inspection (NOT REAL results)"})
	ok(qc.put("Quality Inspection", qi_name, qi), "save QI")
	ok(qc.submit("Quality Inspection", qi_name), "submit QI")
	keep("Quality Inspection", qi_name)
	ok(qc.submit("QC Release", rel["name"]), f"release {batch}")
	return qc.get("QC Release", keep("QC Release", rel["name"]))


rels = [inspect_and_release(*x) for x in received]
check("3 Quality Inspections recorded and accepted", len(docs["Quality Inspection"]) == len(received))
check("4 accepted materials released to the stores", all(r["docstatus"] == 1 for r in rels))

# 5-7. Bulk Work Order, material issue, manufacture, bulk QC
def wo_entry(wo, purpose, qty, what):
	se = ok(production.call(f"{WO_API}.make_stock_entry", work_order_id=wo, purpose=purpose, qty=qty), what)
	se = ok(production.insert(se), what)
	ok(production.submit("Stock Entry", se["name"]), what)
	return production.get("Stock Entry", keep("Stock Entry", se["name"]))


bulk_wo = ok(production.insert({"doctype": "Work Order", "company": COMPANY, "production_item": BULK, "qty": BULK_QTY}), "bulk WO")
ok(production.submit("Work Order", bulk_wo["name"]), "submit bulk WO")
keep("Work Order", bulk_wo["name"])
issue = wo_entry(bulk_wo["name"], "Material Transfer for Manufacture", BULK_QTY, "bulk issue")
check("6 materials issued to production from released stock only", all(r["s_warehouse"].endswith(("RM-STORES - " + ABBR,)) for r in issue["items"]), issue["name"])
made = wo_entry(bulk_wo["name"], "Manufacture", BULK_QTY, "bulk manufacture")
out = next(r for r in made["items"] if r["item_code"] == BULK and r.get("t_warehouse"))
bulk_batch = production.get("Serial and Batch Bundle", out["serial_and_batch_bundle"])["entries"][0]["batch_no"]
check("7 bulk made into BULK-QC-HOLD (2 % DEMO process loss)", out["t_warehouse"] == wh("BULK-QC-HOLD") and round(out["qty"], 3) == BULK_QTY * 0.98, f"{bulk_batch}: {out['qty']} kg")
inspect_and_release(BULK, bulk_batch, wh("BULK-QC-HOLD"), "In Process")
check("7 bulk inspected and released", True, bulk_batch)

fg_qty = int(min(100, math.floor(out["qty"] / bulk_per_unit)))
fg_wo = ok(production.insert({"doctype": "Work Order", "company": COMPANY, "production_item": FG, "qty": fg_qty}), "FG WO")
ok(production.submit("Work Order", fg_wo["name"]), "submit FG WO")
keep("Work Order", fg_wo["name"])
check("5 Work Orders for the bulk and the website product", True, f"{bulk_wo['name']}, {fg_wo['name']} ({fg_qty} units)")
wo_entry(fg_wo["name"], "Material Transfer for Manufacture", fg_qty, "FG issue")
fg_made = wo_entry(fg_wo["name"], "Manufacture", fg_qty, "FG manufacture")
fg_out = next(r for r in fg_made["items"] if r["item_code"] == FG and r.get("t_warehouse"))
fg_batch = production.get("Serial and Batch Bundle", fg_out["serial_and_batch_bundle"])["entries"][0]["batch_no"]
check("8 finished goods made into FG-QC-HOLD", fg_out["t_warehouse"] == wh("FG-QC-HOLD") and fg_out["qty"] == fg_qty, f"{fg_batch}: {fg_qty} units")

# 9. FG QC and release
inspect_and_release(FG, fg_batch, wh("FG-QC-HOLD"), "Outgoing")
check("9 finished goods inspected and released to FG-STORES", stores.get("Batch", fg_batch)["fo_qc_status"] == "Released", fg_batch)

# 10. Sales Order at the website's public selling price
sell_qty = min(40, fg_qty)
# no rate given: ERPNext fills it from the Standard Selling price list (the website's selling price)
so = ok(sales.insert({"doctype": "Sales Order", "company": COMPANY, "customer": SC["customer"], "selling_price_list": "Standard Selling", "delivery_date": str(TODAY + timedelta(days=3)), "set_warehouse": wh("FG-STORES"), "items": [{"item_code": FG, "qty": sell_qty}]}), "SO")
row = so["items"][0]
check("10 Sales Order priced from the website selling price list", row["price_list_rate"] > 0 and row["rate"] == row["price_list_rate"], f"{row['rate']} per unit")
ok(sales.submit("Sales Order", so["name"]), "submit SO")
so = sales.get("Sales Order", keep("Sales Order", so["name"]))
check("10 Sales Order submitted", so["docstatus"] == 1, f"{so['name']}: {sell_qty} x {row['rate']} = {so['grand_total']}")

# 11. FEFO Pick List of eligible batches, reserved
pl = ok(stores.call("erpnext.selling.doctype.sales_order.sales_order.create_pick_list", source_name=so["name"]), "map PL")
pl = ok(stores.insert(pl), "PL")
ok(stores.submit("Pick List", pl["name"]), "submit PL")
pl = stores.get("Pick List", keep("Pick List", pl["name"]))
picked = [(r["batch_no"], r["qty"]) for r in pl["locations"]]
batches = [stores.get("Batch", b) for b, _ in picked]
check(
	"11 Pick List: released, unexpired batches from FG-STORES, earliest expiry first (FEFO)",
	all(r["warehouse"] == wh("FG-STORES") for r in pl["locations"])
	and all(b["fo_qc_status"] == "Released" and b["expiry_date"] >= str(TODAY) for b in batches)
	and [b["expiry_date"] for b in batches] == sorted(b["expiry_date"] for b in batches),
	str(picked),
)
ok(stores.s.post(f"{BASE}/api/method/run_doc_method", json={"dt": "Pick List", "dn": pl["name"], "method": "create_stock_reservation_entries"}), "reserve")

# 12. Delivery Note with dispatch details
dn = ok(dispatch.call("erpnext.stock.doctype.pick_list.pick_list.create_delivery_note", source_name=pl["name"]), "map DN")
ok(dispatch.put("Delivery Note", dn["name"], {"transporter_name": "DEMO Transport (NOT REAL)", "lr_no": f"DEMO-LR-{RUN}", "lr_date": str(TODAY), "vehicle_no": "DEMO-MH-00"}), "dispatch details")
ok(dispatch.submit("Delivery Note", dn["name"]), "submit DN")
dn = dispatch.get("Delivery Note", keep("Delivery Note", dn["name"]))
check("12 Delivery Note submitted from the picked batches", dn["docstatus"] == 1 and {r["batch_no"] for r in dn["items"]} == {b for b, _ in picked}, dn["name"])

# 13. Sales Invoice from the Delivery Note
si = ok(accounts.call("erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice", source_name=dn["name"]), "map SI")
si = ok(accounts.insert(si), "SI")
ok(accounts.submit("Sales Invoice", si["name"]), "submit SI")
si = accounts.get("Sales Invoice", keep("Sales Invoice", si["name"]))
check("13 Sales Invoice from the Delivery Note (no GST: none configured)", si["docstatus"] == 1 and si["grand_total"] == so["grand_total"], f"{si['name']}: {si['grand_total']}")

# 14. Payment and accounting checks
pe = ok(accounts.call("erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", dt="Sales Invoice", dn=si["name"]), "map PE")
pe.update({"reference_no": f"DEMO-UTR-{RUN}", "reference_date": str(TODAY)})
pe = ok(accounts.insert(pe), "PE")
ok(accounts.submit("Payment Entry", pe["name"]), "submit PE")
keep("Payment Entry", pe["name"])
check("14 payment clears the invoice", accounts.get("Sales Invoice", si["name"])["status"] == "Paid", pe["name"])
vouchers = docs["Purchase Receipt"] + docs["Stock Entry"] + docs["Delivery Note"] + docs["Sales Invoice"] + docs["Payment Entry"]
unbalanced, no_gl = [], []
for v in vouchers:
	gl = accounts.list("GL Entry", {"voucher_no": v, "is_cancelled": 0}, ["debit", "credit"])
	if gl and round(sum(g["debit"] - g["credit"] for g in gl), 2) != 0:
		unbalanced.append(v)
	elif not gl:
		# correct only for a stock entry that moves value between warehouses on the same stock
		# account (here every warehouse uses the company's Stock In Hand) with no value difference
		if not (v in docs["Stock Entry"] and production.get("Stock Entry", v)["value_difference"] == 0):
			unbalanced.append(v)
		no_gl.append(v)
check(
	"14 every voucher posted balanced GL entries",
	not unbalanced,
	f"{len(vouchers) - len(no_gl)} posted; {len(no_gl)} production entries need none (same stock account, zero value difference)"
	if not unbalanced else str(unbalanced),
)
report = ok(accounts.call("frappe.desk.query_report.run", report_name="Stock and Account Value Comparison", filters={"company": COMPANY, "as_on_date": str(TODAY)}), "comparison report")
diffs = [r for r in report["result"] if isinstance(r, dict) and abs(r.get("difference_value") or 0) > 0.005]
check("14 stock ledger and stock account agree (ERPNext Stock and Account Value Comparison)", not diffs, str(diffs[:3]))
cogs = accounts.list("GL Entry", {"voucher_no": dn["name"], "is_cancelled": 0, "debit": (">", 0)}, ["account", "debit"])
check("14 delivery booked cost of goods sold at manufactured cost", any("Cost of Goods Sold" in g["account"] for g in cogs), str(cogs))

print(f"\n{sum(ok_ for _, ok_ in results)}/{len(results)} checks passed\n\nDocuments for the walkthrough:")
for kind, names in docs.items():
	print(f"  {kind}: {', '.join(names)}")
Path(CREDS_PATH).with_name("demo_documents.json").write_text(json.dumps(docs, indent=2))
