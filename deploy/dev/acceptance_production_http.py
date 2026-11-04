"""HTTP-level production acceptance against a running development site (Milestone 4).

Runs after acceptance_http.py on the SAMPLE company, through Frappe's REST API only, each step as
the SAMPLE user who would do it:

  stores receives RM and PM into QC Hold -> QC releases them -> production plans a BULK Work Order
  (100 kg, 2 % process loss) -> transfer + manufacture -> 98 kg bulk in BULK-QC-HOLD -> filling held
  bulk is refused -> QC releases the bulk -> FG Work Order (1,000 units) -> short fill of 950 into
  FG-QC-HOLD -> order closed, components returned -> wastage write-off with a reason -> batch label
  PDF -> ERPNext's Stock and Account Value Comparison shows no difference.

It leaves the FG batch in QC Hold and a draft QC Release for it, and prints both, for ui_check.js.

Usage (development only):
    python acceptance_production_http.py http://127.0.0.1:8000 factory.localhost \\
        ~/frappe-bench/sites/factory.localhost/private/sample_users.json
"""

import io
import json
import sys
from datetime import date

import requests
from pypdf import PdfReader

BASE, HOST, CREDS = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
COMPANY, ABBR = "SAMPLE Mintree Manufacturing", "SMM"
RM1, RM2, PM = "SAMPLE-RM-0001", "SAMPLE-RM-0002", "SAMPLE-PM-0001"
BULK, FG = "SAMPLE-BULK-0001", "SAMPLE-FG-0001"
WO_API = "erpnext.manufacturing.doctype.work_order.work_order"
QCR_API = "factory_ops.quality.doctype.qc_release.qc_release"
results: list[tuple[str, bool, str]] = []


def wh(name):
    return f"{name} - {ABBR}"


class Client:
    def __init__(self, user):
        self.user = user
        self.s = requests.Session()
        self.s.headers["Host"] = HOST
        self.s.trust_env = False  # local server, never through the proxy
        self.s.post(
            f"{BASE}/api/method/login", data={"usr": user, "pwd": CREDS[user]}
        ).raise_for_status()

    def call(self, method, **kwargs):
        return self.s.post(f"{BASE}/api/method/{method}", json=kwargs)

    def insert(self, doc):
        return self.s.post(f"{BASE}/api/resource/{doc['doctype']}", json=doc)

    def get(self, doctype, name):
        r = self.s.get(f"{BASE}/api/resource/{doctype}/{name}")
        r.raise_for_status()
        return r.json()["data"]

    def submit(self, doctype, name):
        return self.call("frappe.client.submit", doc=self.get(doctype, name))

    def insert_submit(self, doc, what):
        doc = ok(self.insert(doc), f"insert {what}")
        ok(self.submit(doc["doctype"], doc["name"]), f"submit {what}")
        return self.get(doc["doctype"], doc["name"])


def ok(r, what):
    if r.status_code != 200:
        raise SystemExit(f"FAILED: {what}: HTTP {r.status_code} {r.text[:600]}")
    data = r.json()
    return data.get("data") if "data" in data else data.get("message")


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(
        ("PASS " if condition else "FAIL ") + name + (f" — {detail}" if detail else "")
    )
    if not condition:
        raise SystemExit(1)


def refused(r):
    return r.status_code >= 400


stores = Client("sample.stores@sample.invalid")
qc = Client("sample.qc@sample.invalid")
production = Client("sample.production@sample.invalid")
accounts = Client("sample.accounts@sample.invalid")


def sle(voucher):
    rows = ok(
        stores.call(
            "frappe.client.get_list",
            doctype="Stock Ledger Entry",
            filters={"voucher_no": voucher, "is_cancelled": 0},
            fields=["item_code", "warehouse", "actual_qty"],
            limit_page_length=0,
        ),
        "sle",
    )
    # totals per item and warehouse: FEFO may split a row across several batches
    totals = {}
    for r in rows:
        key = (r["item_code"], r["warehouse"])
        totals[key] = totals.get(key, 0) + r["actual_qty"]
    return sorted((item, wh_, round(qty, 3)) for (item, wh_), qty in totals.items())


def output_batch(voucher, item):
    """The batch a Manufacture entry created (bundle names are read back from the server)."""
    se = stores.get("Stock Entry", voucher)
    row = next(
        r for r in se["items"] if r["item_code"] == item and r.get("t_warehouse")
    )
    return stores.get("Serial and Batch Bundle", row["serial_and_batch_bundle"])[
        "entries"
    ][0]["batch_no"]


def receive(item, hold, qty, rate):
    se = stores.insert_submit(
        {
            "doctype": "Stock Entry",
            "purpose": "Material Receipt",
            "stock_entry_type": "Material Receipt",
            "company": COMPANY,
            "items": [
                {"item_code": item, "qty": qty, "t_warehouse": hold, "basic_rate": rate}
            ],
        },
        f"receipt of {item}",
    )
    return stores.get(
        "Serial and Batch Bundle", se["items"][0]["serial_and_batch_bundle"]
    )["entries"][0]["batch_no"]


def release(item, batch, hold, submit=True, inspection_type="Incoming"):
    rel = ok(
        qc.insert(
            {
                "doctype": "QC Release",
                "company": COMPANY,
                "item_code": item,
                "batch_no": batch,
                "source_warehouse": hold,
                "decision": "Release",
            }
        ),
        f"QC Release {batch}",
    )
    if not submit:
        return rel
    qi_name = ok(
        qc.call(
            f"{QCR_API}.create_quality_inspection",
            qc_release=rel["name"],
            inspection_type=inspection_type,
        ),
        "QI",
    )
    qi = qc.get("Quality Inspection", qi_name)
    qi.update({"manual_inspection": 1, "status": "Accepted"})
    ok(
        qc.s.put(f"{BASE}/api/resource/Quality Inspection/{qi_name}", json=qi),
        "save QI",
    )
    ok(qc.submit("Quality Inspection", qi_name), "submit QI")
    ok(qc.submit("QC Release", rel["name"]), f"release {batch}")
    return qc.get("QC Release", rel["name"])


def wo_entry(wo, purpose, qty, what):
    se = ok(
        production.call(
            f"{WO_API}.make_stock_entry", work_order_id=wo, purpose=purpose, qty=qty
        ),
        what,
    )
    return production.insert_submit(se, what)


# 0. Released inputs: RM1 already usable from acceptance_http.py (60 kg); receive RM2 and PM
rm2 = receive(RM2, wh("RM-QC-HOLD"), 100, 20)
release(RM2, rm2, wh("RM-QC-HOLD"))
pm = receive(PM, wh("PM-QC-HOLD"), 1100, 5)
release(PM, pm, wh("PM-QC-HOLD"))
check("RM and PM received into QC Hold and released by QC", True, f"{rm2}, {pm}")

# 1. BULK Work Order by production, warehouses from configuration
bulk_wo = production.insert_submit(
    {"doctype": "Work Order", "company": COMPANY, "production_item": BULK, "qty": 100},
    "bulk WO",
)
check(
    "bulk Work Order defaults: WIP, output into BULK-QC-HOLD, RM from RM-STORES",
    bulk_wo["wip_warehouse"] == wh("WIP-PRODUCTION")
    and bulk_wo["fg_warehouse"] == wh("BULK-QC-HOLD")
    and {r["source_warehouse"] for r in bulk_wo["required_items"]} == {wh("RM-STORES")},
    bulk_wo["name"],
)

# 2-3. Transfer and manufacture: 100 kg in, 2 % loss, 98 kg into hold
wo_entry(bulk_wo["name"], "Material Transfer for Manufacture", 100, "bulk transfer")
make_bulk = wo_entry(bulk_wo["name"], "Manufacture", 100, "bulk manufacture")
check(
    "bulk manufacture: 5 + 95 kg consumed, 98 kg into BULK-QC-HOLD (2 kg process loss)",
    sle(make_bulk["name"])
    == sorted(
        [
            (RM1, wh("WIP-PRODUCTION"), -5.0),
            (RM2, wh("WIP-PRODUCTION"), -95.0),
            (BULK, wh("BULK-QC-HOLD"), 98.0),
        ]
    )
    and round(make_bulk["process_loss_qty"], 3) == 2,
    make_bulk["name"],
)
bulk = output_batch(make_bulk["name"], BULK)
check(
    "bulk batch is on QC Hold",
    stores.get("Batch", bulk)["fo_qc_status"] == "Hold",
    bulk,
)

# 4. FG Work Order consumes bulk (not its raw materials); held bulk cannot be filled
fg_wo = production.insert_submit(
    {"doctype": "Work Order", "company": COMPANY, "production_item": FG, "qty": 1000},
    "FG WO",
)
check(
    "FG Work Order: two-stage (no multi-level), bulk from BULK-STORES, bottles from PM-STORES",
    fg_wo["use_multi_level_bom"] == 0
    and {r["item_code"]: r["source_warehouse"] for r in fg_wo["required_items"]}
    == {BULK: wh("BULK-STORES"), PM: wh("PM-STORES")},
    fg_wo["name"],
)
se = ok(
    production.call(
        f"{WO_API}.make_stock_entry",
        work_order_id=fg_wo["name"],
        purpose="Material Transfer for Manufacture",
        qty=1000,
    ),
    "map FG transfer",
)
for row in se["items"]:
    if row["item_code"] == BULK:
        row.update(
            {
                "s_warehouse": wh("BULK-QC-HOLD"),
                "use_serial_batch_fields": 1,
                "batch_no": bulk,
            }
        )
r = production.insert(se)
check(
    "filling held bulk refused (HTTP)",
    refused(r) and "QC" in r.text,
    f"HTTP {r.status_code}",
)
check(
    "production user cannot release the bulk",
    refused(
        production.insert(
            {
                "doctype": "QC Release",
                "company": COMPANY,
                "item_code": BULK,
                "batch_no": bulk,
                "source_warehouse": wh("BULK-QC-HOLD"),
                "decision": "Release",
            }
        )
    ),
)

# 5. QC releases the bulk
release(BULK, bulk, wh("BULK-QC-HOLD"), inspection_type="In Process")
check(
    "bulk released to BULK-STORES",
    stores.get("Batch", bulk)["fo_qc_status"] == "Released",
)

# 6-7. FG transfer and short fill of 950
wo_entry(fg_wo["name"], "Material Transfer for Manufacture", 1000, "FG transfer")
make_fg = wo_entry(fg_wo["name"], "Manufacture", 950, "FG manufacture")
check(
    "short fill: 28.5 kg bulk + 950 bottles consumed, 950 units into FG-QC-HOLD",
    sle(make_fg["name"])
    == sorted(
        [
            (BULK, wh("WIP-PRODUCTION"), -28.5),
            (PM, wh("WIP-PRODUCTION"), -950.0),
            (FG, wh("FG-QC-HOLD"), 950.0),
        ]
    ),
    make_fg["name"],
)
fg_batch = output_batch(make_fg["name"], FG)

# 8. Close the short-filled order, return unused components
ok(
    production.call(
        f"{WO_API}.close_work_order", work_order=fg_wo["name"], status="Closed"
    ),
    "close WO",
)
ret = ok(
    production.call(f"{WO_API}.make_stock_return_entry", work_order=fg_wo["name"]),
    "map return",
)
ret = production.insert_submit(ret, "component return")
check(
    "unused 1.5 kg bulk and 50 bottles returned from WIP to stores",
    sle(ret["name"])
    == sorted(
        [
            (BULK, wh("WIP-PRODUCTION"), -1.5),
            (BULK, wh("BULK-STORES"), 1.5),
            (PM, wh("WIP-PRODUCTION"), -50.0),
            (PM, wh("PM-STORES"), 50.0),
        ]
    ),
    ret["name"],
)

# 9. Wastage: refused without a reason; with one it posts to the wastage account
waste = {
    "doctype": "Stock Entry",
    "purpose": "Material Issue",
    "stock_entry_type": "Wastage",
    "company": COMPANY,
    "items": [
        {
            "item_code": PM,
            "qty": 10,
            "s_warehouse": wh("PM-STORES"),
            "use_serial_batch_fields": 1,
            "batch_no": pm,
        }
    ],
}
check("wastage without a reason refused (HTTP)", refused(stores.insert(waste)))
waste["items"][0]["fo_wastage_reason"] = "Damaged in handling"
waste = stores.insert_submit(waste, "wastage")
wastage_account = ok(
    stores.call(
        "frappe.client.get_value",
        doctype="Company",
        filters=COMPANY,
        fieldname="fo_wastage_account",
    ),
    "account",
)["fo_wastage_account"]
gl = ok(
    accounts.call(
        "frappe.client.get_list",
        doctype="GL Entry",
        filters={"voucher_no": waste["name"], "is_cancelled": 0},
        fields=["account", "debit", "credit"],
    ),
    "wastage GL",
)
check(
    "wastage of 10 bottles debits the wastage account 50.00, GL balanced",
    sum(g["debit"] for g in gl if g["account"] == wastage_account) == 50
    and round(sum(g["debit"] - g["credit"] for g in gl), 2) == 0,
    waste["name"],
)

# 10. Batch label PDF, through the standard print endpoint
r = qc.s.get(
    f"{BASE}/api/method/frappe.utils.print_format.download_pdf",
    params={"doctype": "Batch", "name": fg_batch, "format": "Batch Label"},
)
pdf = PdfReader(io.BytesIO(r.content)) if r.status_code == 200 else None
box = pdf.pages[0].mediabox if pdf else None
text = pdf.pages[0].extract_text() if pdf else ""
check(
    "batch label PDF: one 100 x 60 mm page with batch, item, Work Order and QC status",
    pdf is not None
    and len(pdf.pages) == 1
    and round(float(box.width) * 25.4 / 72) == 100
    and round(float(box.height) * 25.4 / 72) == 60
    and all(t in text for t in (fg_batch, FG, fg_wo["name"], "QC: HOLD")),
    f"HTTP {r.status_code}",
)

# 11. Stock ledger vs general ledger, by ERPNext's own comparison report (as accounts)
report = ok(
    accounts.call(
        "frappe.desk.query_report.run",
        report_name="Stock and Account Value Comparison",
        filters={"company": COMPANY, "as_on_date": str(date.today())},
    ),
    "comparison report",
)
diffs = [
    row
    for row in report["result"]
    if isinstance(row, dict) and abs(row.get("difference_value") or 0) > 0.005
]
check(
    "Stock and Account Value Comparison report lists no mismatching voucher",
    not diffs,
)

# 12. Direct reconciliation: total stock ledger value = balance of the company's stock accounts
stock_accounts = [
    a["name"]
    for a in ok(
        accounts.call(
            "frappe.client.get_list",
            doctype="Account",
            filters={"company": COMPANY, "account_type": "Stock", "is_group": 0},
            fields=["name"],
            limit_page_length=0,
        ),
        "stock accounts",
    )
]
gl_rows = ok(
    accounts.call(
        "frappe.client.get_list",
        doctype="GL Entry",
        filters={
            "company": COMPANY,
            "is_cancelled": 0,
            "account": ["in", stock_accounts],
        },
        fields=["debit", "credit"],
        limit_page_length=0,
    ),
    "stock GL",
)
sle_rows = ok(
    stores.call(
        "frappe.client.get_list",
        doctype="Stock Ledger Entry",
        filters={"company": COMPANY, "is_cancelled": 0},
        fields=["stock_value_difference"],
        limit_page_length=0,
    ),
    "all SLE",
)
gl_value = round(sum(r["debit"] - r["credit"] for r in gl_rows), 2)
sle_value = round(sum(r["stock_value_difference"] for r in sle_rows), 2)
check(
    "stock ledger value equals stock account balance",
    abs(gl_value - sle_value) < 0.01 and sle_value > 0,
    f"SLE {sle_value:,.2f} = GL {gl_value:,.2f} over {len(sle_rows)} ledger rows",
)

# Leave a draft QC Release for the held FG batch (for ui_check.js)
draft = release(FG, fg_batch, wh("FG-QC-HOLD"), submit=False)
print(f"\n{sum(1 for _, p, _ in results if p)}/{len(results)} checks passed")
print(f"held FG batch: {fg_batch}  draft QC Release: {draft['name']}")
