"""HTTP-level check of the Master Data Import form (Milestone 6), as SAMPLE users.

Uploads real XLSX/CSV files built from the committed templates' header rows, through the same
endpoints the Desk form uses (upload_file, /api/resource, run_doc_method), and checks:
who may import, that an invalid file reports row/column issues and writes nothing, that import is
refused until the file is clean, that a corrected file imports all rows with the factory item
controls applied, that a second import of the same rows is refused, and that a finished import
cannot be pointed at another file.

Usage (development only):
    python acceptance_import_http.py http://127.0.0.1:8000 factory.localhost \
        ~/frappe-bench/sites/factory.localhost/private/sample_users.json
"""

import csv
import io
import json
import os
import sys
import time

import requests
from openpyxl import Workbook

BASE, HOST, CREDS = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
COMPANY = "SAMPLE Mintree Manufacturing"
TEMPLATES = os.path.join(os.path.dirname(__file__), "../../apps/factory_ops/factory_ops/master_data/templates")
TAG = time.strftime("%H%M%S")
results = []


def check(name, cond, detail=""):
	results.append((name, bool(cond)))
	print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
	if not cond:
		raise SystemExit(1)


class Client:
	def __init__(self, user):
		self.s = requests.Session()
		self.s.trust_env = False
		self.s.headers["Host"] = HOST
		self.s.post(f"{BASE}/api/method/login", data={"usr": user, "pwd": CREDS[user]}).raise_for_status()

	def upload(self, filename, data):
		r = self.s.post(f"{BASE}/api/method/upload_file", files={"file": (filename, data)}, data={"is_private": 1})
		r.raise_for_status()
		return r.json()["message"]["file_url"]

	def new_import(self, import_type, file_url):
		return self.s.post(
			f"{BASE}/api/resource/Master Data Import",
			json={"import_type": import_type, "company": COMPANY, "import_file": file_url},
		)

	def method(self, name, method):
		return self.s.post(f"{BASE}/api/method/run_doc_method", data={"dt": "Master Data Import", "dn": name, "method": method})

	def get(self, doctype, name):
		r = self.s.get(f"{BASE}/api/resource/{doctype}/{name}")
		return r.json().get("data") if r.status_code == 200 else None

	def exists(self, doctype, name):
		r = self.s.post(f"{BASE}/api/method/frappe.client.get_count", data={"doctype": doctype, "filters": json.dumps({"name": name})})
		return r.status_code == 200 and r.json()["message"] > 0


def header(template):
	with open(os.path.join(TEMPLATES, f"{template}.csv")) as f:
		return next(csv.reader(f))


def xlsx(head, rows):
	wb = Workbook()
	ws = wb.active
	ws.append(head)
	for row in rows:
		ws.append([row.get(h.rstrip("*"), None) for h in head])
	buf = io.BytesIO()
	wb.save(buf)
	return buf.getvalue()


def csv_bytes(head, rows):
	buf = io.StringIO()
	w = csv.writer(buf)
	w.writerow(head)
	for row in rows:
		w.writerow([row.get(h.rstrip("*"), "") for h in head])
	return buf.getvalue().encode()


items_head = header("items")
good = [
	{"item_code": f"SAMPLE-RM-IMP{TAG}A", "item_name": "SAMPLE import test RM A", "item_group": "RM", "stock_uom": "Kg", "has_expiry_date": 1, "shelf_life_in_days": 365},
	{"item_code": f"SAMPLE-PM-IMP{TAG}B", "item_name": "SAMPLE import test PM B", "item_group": "PM", "stock_uom": "Nos"},
]
bad = [
	dict(good[0]),  # valid on its own
	{"item_code": f"SAMPLE-RM-IMP{TAG}C", "item_name": "", "item_group": "RM", "stock_uom": "Kg"},  # missing name
	{"item_code": f"SAMPLE-RM-IMP{TAG}D", "item_name": "SAMPLE bad group", "item_group": "NO-SUCH-GROUP", "stock_uom": "Kg"},
	{"item_code": f"SAMPLE-RM-IMP{TAG}E", "item_name": "SAMPLE bad uom", "item_group": "RM", "stock_uom": "NO-SUCH-UOM"},
	dict(good[0]),  # duplicate of row 2 in the same file
]

md = Client("sample.masterdata@sample.invalid")

# 1. who may import
qc = Client("sample.qc@sample.invalid")
url = qc.upload(f"qc-{TAG}.xlsx", xlsx(items_head, good))
r = qc.new_import("Items", url)
check("QC officer cannot create a Master Data Import", r.status_code >= 400, f"HTTP {r.status_code}")
stores = Client("sample.stores@sample.invalid")
r = stores.new_import("Items", stores.upload(f"stores-{TAG}.xlsx", xlsx(items_head, good)))
stores_mdi = r.json()["data"]["name"]
stores.method(stores_mdi, "validate_file")
doc = stores.get("Master Data Import", stores_mdi)
check(
	"Stores (no Item Manager) is told they cannot create Items",
	doc["status"] == "Has Errors" and any("not permitted to create Item" in i["message"] for i in doc["issues"]),
	doc["summary"],
)
check("... and no item was created", not md.exists("Item", good[0]["item_code"]))

# 2. invalid file: row/column issues, nothing written, import refused
r = md.new_import("Items", md.upload(f"items-bad-{TAG}.xlsx", xlsx(items_head, bad)))
name = r.json()["data"]["name"]
r = md.method(name, "validate_file")
doc = md.get("Master Data Import", name)
rows_with_errors = {i["row_no"] for i in doc["issues"] if i["severity"] == "Error"}
check("invalid XLSX is reported, not imported", doc["status"] == "Has Errors", doc["summary"])
check("issues name the bad rows (3, 4, 5, 6)", {3, 4, 5, 6} <= rows_with_errors, str(sorted(rows_with_errors)))
check("issues name columns", all(i["column_name"] for i in doc["issues"] if i["row_no"] in (3, 4, 5)))
check("nothing was written, not even the valid row", not any(md.exists("Item", b["item_code"]) for b in bad))
r = md.method(name, "start_import")
check("Import is refused while the file has errors", r.status_code >= 400, f"HTTP {r.status_code}")
check("... and still nothing was written", not any(md.exists("Item", b["item_code"]) for b in bad))

# 3. attach a corrected file to the same import: back to Draft, validates, imports everything
fixed = md.upload(f"items-good-{TAG}.xlsx", xlsx(items_head, good))
r = md.s.put(f"{BASE}/api/resource/Master Data Import/{name}", json={"import_file": fixed})
check("a new file resets the import to Draft", r.status_code == 200 and r.json()["data"]["status"] == "Draft")
md.method(name, "validate_file")
check("corrected file is Ready to Import", md.get("Master Data Import", name)["status"] == "Ready to Import")
r = md.method(name, "start_import")
doc = md.get("Master Data Import", name)
check("import completes", r.status_code == 200 and doc["status"] == "Imported", doc["summary"])
for g in good:
	item = md.get("Item", g["item_code"])
	check(f"{g['item_code']} exists", item is not None)
rm = md.get("Item", good[0]["item_code"])
check(
	"factory controls applied to the imported RM (batch, QC release, COA)",
	(rm["has_batch_no"], rm["fo_qc_required"], rm["fo_coa_required"]) == (1, 1, 1),
)

# 4. a second import of the same rows is refused
r = md.new_import("Items", md.upload(f"items-again-{TAG}.xlsx", xlsx(items_head, good)))
again = r.json()["data"]["name"]
md.method(again, "validate_file")
check("re-importing existing items is reported as errors", md.get("Master Data Import", again)["status"] == "Has Errors")

# 5. a finished import cannot be pointed at another file
r = md.s.put(f"{BASE}/api/resource/Master Data Import/{name}", json={"import_file": fixed + "?x"})
check("a finished import cannot take another file", r.status_code >= 400, f"HTTP {r.status_code}")

# 6. CSV path: suppliers
sup_head = header("suppliers")
sup = [{"supplier_name": f"SAMPLE Import Supplier {TAG}", "supplier_group": "SAMPLE Suppliers", "supplier_type": "Company", "country": "India", "default_currency": "INR"}]
r = md.new_import("Suppliers", md.upload(f"suppliers-{TAG}.csv", csv_bytes(sup_head, sup)))
sname = r.json()["data"]["name"]
md.method(sname, "validate_file")
r = md.method(sname, "start_import")
check("supplier CSV imports", md.get("Master Data Import", sname)["status"] == "Imported")
check("... supplier exists", md.exists("Supplier", sup[0]["supplier_name"]))

print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} checks passed")
