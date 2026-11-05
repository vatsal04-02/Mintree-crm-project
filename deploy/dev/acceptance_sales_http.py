"""HTTP-level sales, dispatch and accounts acceptance against a running development site (Milestone 5).

Through Frappe's REST API only, each step as the SAMPLE user who would do it:

  stores receives FG into QC Hold, QC releases it -> credit limit refusal and Sales Manager override
  -> B2B Sales Order -> FEFO Pick List -> reservation of the picked batches -> Delivery Note refused
  without dispatch details, then with transporter/LR and a Packing Slip -> Sales Invoice from the
  Delivery Note (a stock-updating invoice is refused) -> Payment Entry -> Accounts Receivable and
  reconciliation; dispatch from QC Hold refused; D2C orders imported with Data Import, and the same
  file imported again creates nothing.

Usage (development only; after setup_dev_site and create_sample_users):
    python acceptance_sales_http.py http://127.0.0.1:8000 factory.localhost \\
        ~/frappe-bench/sites/factory.localhost/private/sample_users.json
"""

import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

BASE, HOST, CREDS = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
COMPANY = "SAMPLE Mintree Manufacturing"
FG = "SAMPLE-FG-0001"
FG_HOLD, FG_STORES = "FG-QC-HOLD - SMM", "FG-STORES - SMM"
DISTRIBUTOR, RETAILER, D2C = (
    "SAMPLE Customer - Distributor",
    "SAMPLE Customer - Retailer",
    "SAMPLE D2C - Website Orders",
)
TODAY = date.today()
RUN = str(int(time.time()))  # makes this run's D2C order numbers unique
SO_API = "erpnext.selling.doctype.sales_order.sales_order"
DN_API = "erpnext.stock.doctype.delivery_note.delivery_note"
QCR_API = "factory_ops.quality.doctype.qc_release.qc_release"
results: list[tuple[str, bool, str]] = []


class Client:
    def __init__(self, user):
        self.s = requests.Session()
        self.s.headers["Host"] = HOST
        self.s.trust_env = False
        self.s.post(
            f"{BASE}/api/method/login", data={"usr": user, "pwd": CREDS[user]}
        ).raise_for_status()

    def call(self, method, **kwargs):
        return self.s.post(f"{BASE}/api/method/{method}", json=kwargs)

    def insert(self, doc):
        return self.s.post(f"{BASE}/api/resource/{doc['doctype']}", json=doc)

    def update(self, doctype, name, values):
        return self.s.put(f"{BASE}/api/resource/{doctype}/{name}", json=values)

    def get(self, doctype, name):
        r = self.s.get(f"{BASE}/api/resource/{doctype}/{name}")
        r.raise_for_status()
        return r.json()["data"]

    def submit(self, doctype, name):
        return self.call("frappe.client.submit", doc=self.get(doctype, name))

    def doc_method(self, doctype, name, method):
        return self.s.post(
            f"{BASE}/api/v2/document/{doctype}/{name}/method/{method}", json={}
        )

    def report(self, name, **filters):
        return ok(
            self.call(
                "frappe.desk.query_report.run", report_name=name, filters=filters
            ),
            name,
        )["result"]


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


def refused(r, text=None):
    return r.status_code >= 400 and (text is None or text in r.text)


stores = Client("sample.stores@sample.invalid")
dispatch = Client("sample.dispatch@sample.invalid")
qc = Client("sample.qc@sample.invalid")
sales = Client("sample.sales@sample.invalid")
manager = Client("sample.salesmanager@sample.invalid")
accounts = Client("sample.accounts@sample.invalid")


def sle_rows(voucher):
    rows = ok(
        stores.call(
            "frappe.client.get_list",
            doctype="Stock Ledger Entry",
            filters={"voucher_no": voucher, "is_cancelled": 0},
            fields=["warehouse", "actual_qty"],
            limit_page_length=0,
        ),
        "sle",
    )
    return sorted((r["warehouse"], round(r["actual_qty"], 3)) for r in rows)


def ats():
    rows = sales.report("Available to Sell", company=COMPANY, item_code=FG)
    return next(
        (
            r["available"]
            for r in rows
            if isinstance(r, dict) and r.get("item_code") == FG
        ),
        0,
    )


def released_fg(qty, expiry_days):
    # the batch is created with its expiry first (stores may create batches, not edit them)
    batch = ok(
        stores.insert(
            {
                "doctype": "Batch",
                "item": FG,
                "manufacturing_date": str(TODAY - timedelta(days=5)),
                "expiry_date": str(TODAY + timedelta(days=expiry_days)),
            }
        ),
        "batch",
    )["name"]
    se = ok(
        stores.insert(
            {
                "doctype": "Stock Entry",
                "purpose": "Material Receipt",
                "stock_entry_type": "Material Receipt",
                "company": COMPANY,
                "items": [
                    {
                        "item_code": FG,
                        "qty": qty,
                        "t_warehouse": FG_HOLD,
                        "basic_rate": 100,
                        "use_serial_batch_fields": 1,
                        "batch_no": batch,
                    }
                ],
            }
        ),
        "FG receipt",
    )
    ok(stores.submit("Stock Entry", se["name"]), "submit FG receipt")
    rel = ok(
        qc.insert(
            {
                "doctype": "QC Release",
                "company": COMPANY,
                "item_code": FG,
                "batch_no": batch,
                "source_warehouse": FG_HOLD,
                "decision": "Release",
            }
        ),
        "QC Release",
    )
    qi = ok(
        qc.call(
            f"{QCR_API}.create_quality_inspection",
            qc_release=rel["name"],
            inspection_type="Outgoing",
        ),
        "QI",
    )
    doc = qc.get("Quality Inspection", qi)
    doc.update({"manual_inspection": 1, "status": "Accepted"})
    ok(qc.update("Quality Inspection", qi, doc), "QI save")
    ok(qc.submit("Quality Inspection", qi), "QI submit")
    ok(qc.submit("QC Release", rel["name"]), "release")
    return batch


# 0. QC-released finished goods: two batches with different expiry
early = released_fg(100, 300)
late = released_fg(100, 700)
check("FG received into QC Hold and released by QC", True, f"{early}, {late}")
ats0 = ats()

# 1. Credit limit: the retailer's limit is 25,000
over = ok(
    sales.insert(
        {
            "doctype": "Sales Order",
            "company": COMPANY,
            "customer": RETAILER,
            "delivery_date": str(TODAY + timedelta(days=5)),
            "set_warehouse": FG_STORES,
            "items": [{"item_code": FG, "qty": 120, "rate": 250}],
        }
    ),
    "retailer SO",
)
check(
    "order above the credit limit refused for the salesperson (HTTP)",
    refused(sales.submit("Sales Order", over["name"]), "Credit limit"),
)
ok(manager.submit("Sales Order", over["name"]), "manager override")
check(
    "Sales Manager (credit controller) can approve it",
    manager.get("Sales Order", over["name"])["docstatus"] == 1,
)
ok(
    manager.call("frappe.client.cancel", doctype="Sales Order", name=over["name"]),
    "cancel override order",
)

# 2. B2B Sales Order 150 x 250
so = ok(
    sales.insert(
        {
            "doctype": "Sales Order",
            "company": COMPANY,
            "customer": DISTRIBUTOR,
            "delivery_date": str(TODAY + timedelta(days=5)),
            "set_warehouse": FG_STORES,
            "items": [{"item_code": FG, "qty": 150, "rate": 250}],
        }
    ),
    "SO",
)
ok(sales.submit("Sales Order", so["name"]), "submit SO")
so = sales.get("Sales Order", so["name"])
check(
    "B2B Sales Order 37,500, channel B2B",
    so["grand_total"] == 37500 and so["fo_sales_channel"] == "B2B",
    so["name"],
)

# 3. FEFO Pick List and reservation of the picked batches
pl = ok(
    stores.call(f"{SO_API}.create_pick_list", source_name=so["name"]), "map pick list"
)
pl = ok(stores.insert(pl), "insert pick list")
ok(stores.submit("Pick List", pl["name"]), "submit pick list")
pl = stores.get("Pick List", pl["name"])
locations = [(r["batch_no"], r["qty"]) for r in pl["locations"]]
expiries = [stores.get("Batch", b)["expiry_date"] for b, _ in locations]
check(
    "Pick List is FEFO, from FG-STORES only, never expired",
    expiries == sorted(expiries)
    and all(r["warehouse"] == FG_STORES for r in pl["locations"])
    and all(e >= str(TODAY) for e in expiries),
    str(locations),
)
check("picking moved no stock", sle_rows(pl["name"]) == [] and ats() == ats0)
ok(
    stores.doc_method("Pick List", pl["name"], "create_stock_reservation_entries"),
    "reserve",
)
check(
    "picked batches reserved: available to sell down by 150",
    round(ats0 - ats(), 3) == 150,
)

# 4. Delivery Note: refused without dispatch details, then with them and a Packing Slip
dn = ok(
    dispatch.call(
        "erpnext.stock.doctype.pick_list.pick_list.create_delivery_note",
        source_name=pl["name"],
    ),
    "map DN",
)
check(
    "Delivery Note without transporter / LR refused (HTTP)",
    refused(dispatch.submit("Delivery Note", dn["name"]), "dispatch details"),
)
ok(
    dispatch.update(
        "Delivery Note",
        dn["name"],
        {
            "transporter_name": "SAMPLE Transport Co",
            "lr_no": f"SAMPLE-LR-{RUN}",
            "lr_date": str(TODAY),
            "vehicle_no": "SAMPLE-MH-00",
        },
    ),
    "dispatch details",
)
ps = ok(
    dispatch.call(f"{DN_API}.make_packing_slip", source_name=dn["name"]),
    "map packing slip",
)
for row in ps["items"]:
    row["net_weight"] = 0.05
ps = ok(dispatch.insert(ps), "packing slip")
ok(dispatch.submit("Packing Slip", ps["name"]), "submit packing slip")
ok(dispatch.submit("Delivery Note", dn["name"]), "submit DN")
check(
    "Delivery Note: 150 units leave FG-STORES once",
    sum(q for w, q in sle_rows(dn["name"]) if w == FG_STORES) == -150
    and all(w == FG_STORES for w, _ in sle_rows(dn["name"])),
    dn["name"],
)

# 5. Sales Invoice from the Delivery Note; a stock-updating invoice is refused
si = ok(accounts.call(f"{DN_API}.make_sales_invoice", source_name=dn["name"]), "map SI")
bad = dict(si, update_stock=1)
check(
    "invoice with stock update against the Delivery Note refused (HTTP)",
    refused(accounts.insert(bad)),
)
si = ok(accounts.insert(si), "insert SI")
ok(accounts.submit("Sales Invoice", si["name"]), "submit SI")
si = accounts.get("Sales Invoice", si["name"])
check(
    "Sales Invoice 37,500, no stock movement, Delivery Note fully billed",
    si["grand_total"] == 37500
    and sle_rows(si["name"]) == []
    and dispatch.get("Delivery Note", dn["name"])["per_billed"] == 100,
    si["name"],
)


# 6. Accounts Receivable shows it, then payment clears it
def ar_outstanding(voucher):
    rows = accounts.report(
        "Accounts Receivable",
        company=COMPANY,
        report_date=str(TODAY),
        party_type="Customer",
        party=[DISTRIBUTOR],
        range="30, 60, 90, 120",
    )
    return round(
        sum(
            r.get("outstanding", 0)
            for r in rows
            if isinstance(r, dict) and r.get("voucher_no") == voucher
        ),
        2,
    )


check(
    "Accounts Receivable shows 37,500 outstanding", ar_outstanding(si["name"]) == 37500
)
pe = ok(
    accounts.call(
        "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry",
        dt="Sales Invoice",
        dn=si["name"],
    ),
    "map PE",
)
pe.update({"reference_no": f"SAMPLE-UTR-{RUN}", "reference_date": str(TODAY)})
pe = ok(accounts.insert(pe), "insert PE")
ok(accounts.submit("Payment Entry", pe["name"]), "submit PE")
si = accounts.get("Sales Invoice", si["name"])
check(
    "payment clears the invoice; AR empty for it",
    si["outstanding_amount"] == 0
    and si["status"] == "Paid"
    and ar_outstanding(si["name"]) == 0,
    pe["name"],
)

# 7. Dispatch from QC Hold refused
held = ok(
    stores.insert(
        {
            "doctype": "Stock Entry",
            "purpose": "Material Receipt",
            "stock_entry_type": "Material Receipt",
            "company": COMPANY,
            "items": [
                {"item_code": FG, "qty": 5, "t_warehouse": FG_HOLD, "basic_rate": 100}
            ],
        }
    ),
    "held receipt",
)
ok(stores.submit("Stock Entry", held["name"]), "submit held receipt")
hold_dn = dispatch.insert(
    {
        "doctype": "Delivery Note",
        "company": COMPANY,
        "customer": DISTRIBUTOR,
        "transporter_name": "X",
        "lr_no": "X",
        "items": [{"item_code": FG, "qty": 1, "rate": 250, "warehouse": FG_HOLD}],
    }
)
check("Delivery Note from QC Hold refused (HTTP)", refused(hold_dn))

# 8. D2C orders imported with Data Import; importing the same file again creates nothing
template = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "templates"
    / "d2c_sales_orders_import.csv"
).read_text()
csv = template.replace("SAMPLE-WEB-0001", f"WEB-{RUN}").replace(
    "SAMPLE-MKT-0001", f"MKT-{RUN}"
)
csv = (
    csv.replace("2026-11-05", str(TODAY))
    .replace("2026-11-08", str(TODAY + timedelta(days=3)))
    .replace("2026-11-09", str(TODAY + timedelta(days=4)))
)


def import_orders(label):
    up = manager.s.post(
        f"{BASE}/api/method/upload_file",
        files={"file": (f"d2c-{RUN}-{label}.csv", csv.encode(), "text/csv")},
        data={"is_private": 1},
    )
    url = ok(up, "upload")["file_url"]
    di = ok(
        manager.insert(
            {
                "doctype": "Data Import",
                "reference_doctype": "Sales Order",
                "import_type": "Insert New Records",
                "submit_after_import": 1,
                "import_file": url,
            }
        ),
        "Data Import",
    )
    ok(
        manager.call(
            "frappe.core.doctype.data_import.data_import.form_start_import",
            data_import=di["name"],
        ),
        "start import",
    )
    for _ in range(60):
        status = manager.get("Data Import", di["name"])["status"]
        if status not in ("Pending",):
            break
        time.sleep(1)
    return di["name"], status


def d2c_orders():
    return ok(
        sales.call(
            "frappe.client.get_list",
            doctype="Sales Order",
            filters={
                "fo_external_order_id": ["in", [f"WEB-{RUN}", f"MKT-{RUN}"]],
                "docstatus": 1,
            },
            fields=["name", "fo_sales_channel", "fo_external_order_id"],
        ),
        "d2c",
    )


di1, status1 = import_orders("first")
orders = d2c_orders()
check(
    "D2C file imported: 2 submitted orders with channel and order number",
    status1 == "Success" and len(orders) == 2,
    di1,
)
di2, status2 = import_orders("again")
check(
    "same file imported again: refused as duplicates, still 2 orders",
    status2 != "Success" and len(d2c_orders()) == 2,
    f"{di2}: {status2}",
)

# 8b. Ship and invoice the imported website order, leave it unpaid
web_so = next(
    o["name"] for o in d2c_orders() if o["fo_external_order_id"] == f"WEB-{RUN}"
)
web_dn = ok(
    dispatch.call(
        "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
        source_name=web_so,
    ),
    "map web DN",
)
web_dn.update({"transporter_name": "SAMPLE Courier (manual)", "lr_no": f"AWB-{RUN}"})
web_dn = ok(dispatch.insert(web_dn), "web DN")
ok(dispatch.submit("Delivery Note", web_dn["name"]), "submit web DN")
web_si = ok(
    accounts.call(f"{DN_API}.make_sales_invoice", source_name=web_dn["name"]),
    "map web SI",
)
web_si = ok(accounts.insert(web_si), "web SI")
ok(accounts.submit("Sales Invoice", web_si["name"]), "submit web SI")
web_dn = dispatch.get("Delivery Note", web_dn["name"])
web_si = accounts.get("Sales Invoice", web_si["name"])
check(
    "website order shipped and invoiced: order number on DN and invoice, 500.00 outstanding",
    web_dn["fo_external_order_id"] == f"WEB-{RUN}"
    and web_si["fo_external_order_id"] == f"WEB-{RUN}"
    and web_si["fo_sales_channel"] == "D2C Website"
    and web_si["outstanding_amount"] == 500,
    f"{web_dn['name']}, {web_si['name']}",
)

# 9. Reconciliation: receivables ledger = open invoices; stock ledger = stock accounts
gl = ok(
    accounts.call(
        "frappe.client.get_list",
        doctype="GL Entry",
        filters={"company": COMPANY, "party_type": "Customer", "is_cancelled": 0},
        fields=["debit", "credit"],
        limit_page_length=0,
    ),
    "receivable GL",
)
invoices = ok(
    accounts.call(
        "frappe.client.get_list",
        doctype="Sales Invoice",
        filters={"company": COMPANY, "docstatus": 1},
        fields=["outstanding_amount"],
        limit_page_length=0,
    ),
    "invoices",
)
receivable_gl = round(sum(r["debit"] - r["credit"] for r in gl), 2)
open_invoices = round(sum(r["outstanding_amount"] for r in invoices), 2)
check(
    "customer ledger balance equals open invoices",
    abs(receivable_gl - open_invoices) < 0.01 and open_invoices > 0,
    f"GL {receivable_gl:,.2f} = invoices {open_invoices:,.2f}",
)
stock_accounts = [
    a["name"]
    for a in ok(
        accounts.call(
            "frappe.client.get_list",
            doctype="Account",
            filters={"company": COMPANY, "account_type": "Stock", "is_group": 0},
            fields=["name"],
        ),
        "stock accounts",
    )
]
stock_gl = ok(
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
    "stock gl",
)
sle_all = ok(
    stores.call(
        "frappe.client.get_list",
        doctype="Stock Ledger Entry",
        filters={"company": COMPANY, "is_cancelled": 0},
        fields=["stock_value_difference"],
        limit_page_length=0,
    ),
    "sle",
)
gl_value = round(sum(r["debit"] - r["credit"] for r in stock_gl), 2)
sle_value = round(sum(r["stock_value_difference"] for r in sle_all), 2)
check(
    "stock ledger value equals stock account balance",
    abs(gl_value - sle_value) < 0.01,
    f"SLE {sle_value:,.2f} = GL {gl_value:,.2f}",
)

print(f"\n{sum(1 for _, p, _ in results if p)}/{len(results)} checks passed")
print(
    f"for ui_check_sales.js: SO {so['name']} DN {dn['name']} SI {si['name']} PE {pe['name']}"
)
