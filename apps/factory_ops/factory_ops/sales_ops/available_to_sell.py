"""Available-to-sell stock (Milestone 5, DECISIONS D-027).

Available to sell = sellable stock - active reservations, per item (and per warehouse). Stock is
*sellable* only when all of these hold:

- it is in a warehouse of type **Usable** (QC Hold, Rejected, Retained Samples and Job Work are
  excluded, and untyped warehouses are not counted either);
- for a batch item, the batch is not expired and has at least the minimum remaining shelf life for
  dispatch (Factory Ops Settings).

Quantities come from the stock ledger (Serial and Batch Entries for batch items, Bin for others).
Reservations come from submitted Stock Reservation Entries (reserved - delivered). Nothing is
stored separately. The same function drives the "Available to Sell" report and the reservation
check, so the figure a salesperson sees is the figure that is enforced.
"""

from collections import defaultdict

import frappe
from frappe.utils import cint, date_diff, flt, getdate, nowdate

from factory_ops.constants import (
	WH_TYPE_NOT_FOR_DISPATCH,
	WH_TYPE_QC_HOLD,
	WH_TYPE_REJECTED,
	WH_TYPE_USABLE,
)
from factory_ops.inventory.stock_queries import LEDGER_BUNDLE


def min_shelf_life_days() -> int:
	return cint(frappe.db.get_single_value("Factory Ops Settings", "min_shelf_life_days_for_dispatch"))


def _empty():
	return {
		"sellable": 0.0,
		"short_dated": 0.0,
		"expired": 0.0,
		"qc_hold": 0.0,
		"rejected": 0.0,
		"reserved": 0.0,
	}


def stock_positions(company: str, item_code: str | None = None, warehouse: str | None = None) -> dict:
	"""{(item_code, warehouse): {sellable, short_dated, expired, qc_hold, rejected, reserved}}"""
	today = nowdate()
	min_days = min_shelf_life_days()
	positions: dict = defaultdict(_empty)
	values = {"company": company, "item_code": item_code, "warehouse": warehouse}
	item_cond = " and sbb.item_code = %(item_code)s" if item_code else ""
	wh_cond = " and sbe.warehouse = %(warehouse)s" if warehouse else ""

	# batch items: balances per batch and warehouse from the batch side of the ledger
	for r in frappe.db.sql(
		f"""
		select sbb.item_code, sbe.warehouse, w.warehouse_type, b.expiry_date, sum(sbe.qty) as qty
		from `tabSerial and Batch Entry` sbe
		inner join `tabSerial and Batch Bundle` sbb on sbb.name = sbe.parent
		inner join `tabWarehouse` w on w.name = sbe.warehouse
		inner join `tabBatch` b on b.name = sbe.batch_no
		where sbb.docstatus = 1 and sbb.is_cancelled = 0 and {LEDGER_BUNDLE} and w.company = %(company)s
			and sbe.batch_no is not null {item_cond} {wh_cond}
		group by sbb.item_code, sbe.warehouse, sbe.batch_no
		having sum(sbe.qty) > 0
		""",
		values,
		as_dict=True,
	):
		pos = positions[(r.item_code, r.warehouse)]
		_classify(pos, r.warehouse_type, flt(r.qty), r.expiry_date, today, min_days)

	# items without batches: Bin
	bin_item_cond = " and bin.item_code = %(item_code)s" if item_code else ""
	bin_wh_cond = " and bin.warehouse = %(warehouse)s" if warehouse else ""
	for r in frappe.db.sql(
		f"""
		select bin.item_code, bin.warehouse, w.warehouse_type, bin.actual_qty as qty
		from `tabBin` bin
		inner join `tabWarehouse` w on w.name = bin.warehouse
		inner join `tabItem` i on i.name = bin.item_code
		where w.company = %(company)s and i.has_batch_no = 0 and bin.actual_qty > 0
			{bin_item_cond} {bin_wh_cond}
		""",
		values,
		as_dict=True,
	):
		_classify(positions[(r.item_code, r.warehouse)], r.warehouse_type, flt(r.qty), None, today, min_days)

	# active reservations
	sre_item_cond = " and sre.item_code = %(item_code)s" if item_code else ""
	sre_wh_cond = " and sre.warehouse = %(warehouse)s" if warehouse else ""
	for r in frappe.db.sql(
		f"""
		select sre.item_code, sre.warehouse, sum(sre.reserved_qty - sre.delivered_qty) as qty
		from `tabStock Reservation Entry` sre
		where sre.docstatus = 1 and sre.company = %(company)s
			and sre.status not in ('Delivered', 'Cancelled') {sre_item_cond} {sre_wh_cond}
		group by sre.item_code, sre.warehouse
		""",
		values,
		as_dict=True,
	):
		positions[(r.item_code, r.warehouse)]["reserved"] += max(flt(r.qty), 0)
	return positions


def _classify(pos, wh_type, qty, expiry_date, today, min_days):
	if wh_type == WH_TYPE_QC_HOLD:
		pos["qc_hold"] += qty
	elif wh_type == WH_TYPE_REJECTED:
		pos["rejected"] += qty
	elif wh_type == WH_TYPE_NOT_FOR_DISPATCH:
		pos[
			"expired"
			if expiry_date and date_diff(getdate(expiry_date), getdate(today)) < 0
			else "short_dated"
		] += qty
	elif wh_type != WH_TYPE_USABLE:
		return  # retained samples, job work, untyped: never offered for sale
	elif expiry_date and date_diff(getdate(expiry_date), getdate(today)) < 0:
		pos["expired"] += qty
	elif expiry_date and date_diff(getdate(expiry_date), getdate(today)) < min_days:
		pos["short_dated"] += qty
	else:
		pos["sellable"] += qty


def available_to_sell(company: str, item_code: str, warehouse: str | None = None) -> float:
	"""Sellable qty minus active reservations, for one item (optionally one warehouse)."""
	total = 0.0
	for (_item, _wh), pos in stock_positions(company, item_code, warehouse).items():
		total += pos["sellable"] - pos["reserved"]
	return flt(total, 6)


@frappe.whitelist()
def get_available_to_sell(company: str, item_code: str, warehouse: str | None = None) -> float:
	frappe.has_permission("Item", "read", throw=True)
	return available_to_sell(company, item_code, warehouse)
