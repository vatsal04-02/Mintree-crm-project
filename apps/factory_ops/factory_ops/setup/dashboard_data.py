"""Figures for workspace number cards that ERPNext has no standard card for (Milestone 6, D-037).

Every figure is read straight from ERPNext's ledgers and documents, never stored or estimated:

- stock value by factory group and in Rejected warehouses: ``tabBin.stock_value`` (the stock
  ledger's running value per item and warehouse, the same source as ERPNext's "Total Stock Value"
  card and Stock Balance report);
- wastage value: the outgoing value of submitted "Wastage" Stock Entries.

Tests reconcile each figure with ERPNext's own reports or the GL.
"""

import frappe
from frappe.utils import add_days, flt, nowdate

from factory_ops.constants import WH_TYPE_REJECTED


def _company(filters) -> str | None:
	return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


def stock_value(
	company: str | None = None, factory_group: str | None = None, warehouse_type: str | None = None
) -> float:
	"""Σ Bin.stock_value for the company, optionally for one factory group (with its sub-groups)
	or one warehouse type."""
	conditions, values = ["w.company = %(company)s"], {"company": company}
	if factory_group:
		lft, rgt = frappe.db.get_value("Item Group", factory_group, ["lft", "rgt"])
		conditions.append("ig.lft >= %(lft)s and ig.rgt <= %(rgt)s")
		values.update(lft=lft, rgt=rgt)
	if warehouse_type:
		conditions.append("w.warehouse_type = %(wh_type)s")
		values["wh_type"] = warehouse_type
	return flt(
		frappe.db.sql(
			f"""select coalesce(sum(bin.stock_value), 0)
			from `tabBin` bin
			inner join `tabWarehouse` w on w.name = bin.warehouse
			inner join `tabItem` i on i.name = bin.item_code
			inner join `tabItem Group` ig on ig.name = i.item_group
			where {" and ".join(conditions)}""",
			values,
		)[0][0],
		2,
	)


def wastage_value(company: str | None = None, days: int = 30) -> float:
	return flt(
		frappe.db.sql(
			"""select coalesce(sum(se.total_outgoing_value), 0) from `tabStock Entry` se
			inner join `tabStock Entry Type` t on t.name = se.stock_entry_type
			where se.docstatus = 1 and t.fo_is_wastage = 1 and se.company = %s and se.posting_date >= %s""",
			(company, add_days(nowdate(), -days)),
		)[0][0],
		2,
	)


def _card(value: float) -> dict:
	return {"value": value, "fieldtype": "Currency"}


def _guard(doctype: str = "Bin"):
	frappe.has_permission(doctype, "read", throw=True)


@frappe.whitelist()
def rm_stock_value(filters=None):
	_guard()
	return _card(stock_value(_company(filters), "RM"))


@frappe.whitelist()
def pm_stock_value(filters=None):
	_guard()
	return _card(stock_value(_company(filters), "PM"))


@frappe.whitelist()
def bulk_stock_value(filters=None):
	_guard()
	return _card(stock_value(_company(filters), "BULK"))


@frappe.whitelist()
def fg_stock_value(filters=None):
	_guard()
	return _card(stock_value(_company(filters), "FG"))


@frappe.whitelist()
def rejected_stock_value(filters=None):
	_guard()
	return _card(stock_value(_company(filters), warehouse_type=WH_TYPE_REJECTED))


@frappe.whitelist()
def wastage_value_30_days(filters=None):
	_guard("Stock Entry")
	return _card(wastage_value(_company(filters)))
