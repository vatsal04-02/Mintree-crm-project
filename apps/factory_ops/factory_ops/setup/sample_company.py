"""SAMPLE company and master data for development and UAT.

Every name here is a labelled placeholder (brief section 2): no real Mintree product, supplier,
price, quality limit or tax registration. Replace through the master-data import templates when
the client confirms real data.

- ``setup_dev_site()``: runs ERPNext's own setup wizard (company + April-March financial year)
  on an empty development site, then ``setup_company_masters``.
- ``setup_company_masters(company)``: idempotent; also used by the automated tests against
  ERPNext's ``_Test Company``.
"""

import frappe
from frappe.utils import getdate, nowdate

from factory_ops.setup.install import apply_setup
from factory_ops.setup.warehouses import ensure_warehouse_tree, wh_name

SAMPLE_COMPANY = "SAMPLE Mintree Manufacturing"
SAMPLE_ABBR = "SMM"

FACTORY_GROUP = "Factory Items"
# group: (QC release required, supplier COA required, default receiving / output warehouse)
ITEM_GROUPS = {
	"RM": (1, 1, "RM-QC-HOLD"),
	"PM": (1, 0, "PM-QC-HOLD"),
	"BULK": (1, 0, "BULK-QC-HOLD"),
	"FG": (1, 0, "FG-QC-HOLD"),
}

SUPPLIER_GROUP = "SAMPLE Suppliers"
SUPPLIERS = ("SAMPLE Supplier - Actives", "SAMPLE Supplier - Packaging")
CUSTOMERS = ("SAMPLE Customer - Distributor",)

# code: (name, group, stock uom, has_expiry_date, shelf life days)
ITEMS = {
	"SAMPLE-RM-0001": ("SAMPLE Niacinamide", "RM", "Kg", 1, 730),
	"SAMPLE-RM-0002": ("SAMPLE Glycerin", "RM", "Kg", 1, 1095),
	"SAMPLE-PM-0001": ("SAMPLE Bottle 30 mL amber glass", "PM", "Nos", 0, 0),
	"SAMPLE-BULK-0001": ("SAMPLE Bulk serum base", "BULK", "Kg", 1, 365),
	"SAMPLE-FG-0001": ("SAMPLE Serum 30 mL", "FG", "Nos", 1, 730),
}

UOM_CONVERSIONS = (("Kg", "Gram", 1000), ("Litre", "Millilitre", 1000))


def financial_year_for(date=None) -> tuple[str, str]:
	"""Indian financial year (April to March) containing ``date``."""
	d = getdate(date or nowdate())
	start_year = d.year if d.month >= 4 else d.year - 1
	return f"{start_year}-04-01", f"{start_year + 1}-03-31"


def setup_dev_site(company: str = SAMPLE_COMPANY, abbr: str = SAMPLE_ABBR) -> str:
	"""Run on an empty development site: bench --site <site> execute factory_ops.setup.sample_company.setup_dev_site"""
	if not frappe.is_setup_complete():
		from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

		fy_start, fy_end = financial_year_for()
		result = setup_complete(
			{
				"language": "English",
				"country": "India",
				"timezone": "Asia/Kolkata",
				"currency": "INR",
				"full_name": "SAMPLE Administrator",
				"email": "admin@sample.invalid",
				"company_name": company,
				"company_abbr": abbr,
				"chart_of_accounts": "Standard",
				"fy_start_date": fy_start,
				"fy_end_date": fy_end,
				"setup_demo": 0,
			}
		)
		if (result or {}).get("status") != "ok":
			frappe.throw(f"Setup wizard did not complete: {result}")
	ensure_next_financial_year()
	setup_company_masters(company)
	configure_stock_settings()
	frappe.db.commit()
	return company


STOCK_SETTINGS = {
	# A fresh v16 site has batch tracking switched off; batch-tracked items cannot be received
	# until it is on (ERPNext's test bootstrap turns it on, so only a real site shows this).
	"enable_serial_and_batch_no_for_item": 1,
	"allow_negative_stock": 0,
	"allow_negative_stock_for_batch": 0,
	"pick_serial_and_batch_based_on": "Expiry",  # FEFO
	"valuation_method": "Moving Average",
	"enable_stock_reservation": 1,
	"action_if_quality_inspection_is_not_submitted": "Stop",
	"action_if_quality_inspection_is_rejected": "Stop",
}


def configure_stock_settings():
	"""Stock Settings for the factory (also listed in docs/DATABASE_AND_WORKFLOW_DESIGN.md)."""
	for field, value in STOCK_SETTINGS.items():
		frappe.db.set_single_value("Stock Settings", field, value)


def ensure_next_financial_year():
	start, end = financial_year_for()
	next_start = f"{int(start[:4]) + 1}-04-01"
	next_end = f"{int(end[:4]) + 1}-03-31"
	for s, e in ((start, end), (next_start, next_end)):
		if not frappe.db.exists("Fiscal Year", {"year_start_date": s}):
			frappe.get_doc(
				{
					"doctype": "Fiscal Year",
					"year": f"{s[:4]}-{e[2:4]}",
					"year_start_date": s,
					"year_end_date": e,
				}
			).insert(ignore_permissions=True)


def setup_company_masters(company: str) -> dict:
	apply_setup()
	warehouses = ensure_warehouse_tree(company)
	ensure_uoms()
	ensure_item_groups(company)
	ensure_suppliers()
	ensure_customers()
	ensure_items()
	return warehouses


def ensure_customers():
	for name in CUSTOMERS:
		if not frappe.db.exists("Customer", name):
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": name,
					"customer_type": "Company",
					"territory": "India" if frappe.db.exists("Territory", "India") else "All Territories",
					"customer_group": "Commercial"
					if frappe.db.exists("Customer Group", "Commercial")
					else "All Customer Groups",
				}
			).insert(ignore_permissions=True)


def ensure_uoms():
	for uom in ("Kg", "Gram", "Litre", "Millilitre", "Nos"):
		if not frappe.db.exists("UOM", uom):
			frappe.get_doc({"doctype": "UOM", "uom_name": uom}).insert(ignore_permissions=True)
	frappe.db.set_value("UOM", "Nos", "must_be_whole_number", 1)
	for from_uom, to_uom, value in UOM_CONVERSIONS:
		if not frappe.db.exists("UOM Conversion Factor", {"from_uom": from_uom, "to_uom": to_uom}):
			category = frappe.db.get_value("UOM Conversion Factor", {"from_uom": from_uom}, "category")
			frappe.get_doc(
				{
					"doctype": "UOM Conversion Factor",
					"category": category or "Mass",
					"from_uom": from_uom,
					"to_uom": to_uom,
					"value": value,
				}
			).insert(ignore_permissions=True)


def ensure_item_groups(company: str):
	if not frappe.db.exists("Item Group", FACTORY_GROUP):
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": FACTORY_GROUP,
				"is_group": 1,
				"parent_item_group": "All Item Groups",
			}
		).insert(ignore_permissions=True)
	for group, (qc, coa, warehouse) in ITEM_GROUPS.items():
		if not frappe.db.exists("Item Group", group):
			frappe.get_doc(
				{"doctype": "Item Group", "item_group_name": group, "parent_item_group": FACTORY_GROUP}
			).insert(ignore_permissions=True)
		doc = frappe.get_doc("Item Group", group)
		doc.fo_qc_required = qc
		doc.fo_coa_required = coa
		default = next((d for d in doc.item_group_defaults if d.company == company), None)
		if not default:
			default = doc.append("item_group_defaults", {"company": company})
		default.default_warehouse = wh_name(warehouse, company)
		doc.save(ignore_permissions=True)


def ensure_suppliers():
	if not frappe.db.exists("Supplier Group", SUPPLIER_GROUP):
		frappe.get_doc(
			{
				"doctype": "Supplier Group",
				"supplier_group_name": SUPPLIER_GROUP,
				"parent_supplier_group": "All Supplier Groups",
			}
		).insert(ignore_permissions=True)
	for name in SUPPLIERS:
		if not frappe.db.exists("Supplier", name):
			frappe.get_doc(
				{
					"doctype": "Supplier",
					"supplier_name": name,
					"supplier_group": SUPPLIER_GROUP,
					"country": "India",
				}
			).insert(ignore_permissions=True)


def ensure_items():
	for code, (name, group, uom, has_expiry, shelf_life) in ITEMS.items():
		if frappe.db.exists("Item", code):
			continue
		item = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": name,
				"description": f"{name}. SAMPLE placeholder, not a real Mintree item.",
				"item_group": group,
				"stock_uom": uom,
				"is_stock_item": 1,
				"is_purchase_item": group in ("RM", "PM"),
				"is_sales_item": group == "FG",
				"has_expiry_date": has_expiry,
				"shelf_life_in_days": shelf_life,
				"batch_number_series": f"{code}-.YY.-.#####",
			}
		)
		for from_uom, to_uom, value in UOM_CONVERSIONS:
			if from_uom == uom:
				item.append("uoms", {"uom": to_uom, "conversion_factor": 1 / value})
		item.insert(ignore_permissions=True)
