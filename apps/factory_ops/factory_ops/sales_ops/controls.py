"""Sales and dispatch controls on top of standard ERPNext selling (Milestone 5).

The flow is ERPNext's own: Sales Order → Stock Reservation Entry → Pick List (FEFO) → Delivery
Note (+ Packing Slip) → Sales Invoice → Payment Entry. Credit limits, FEFO batch selection and the
refusal to update stock twice from an invoice linked to a Delivery Note are ERPNext behaviour.
factory_ops adds only what ERPNext does not have (DECISIONS D-026 to D-030):

- **Sales channel** on the Sales Order: B2B, or a manually entered / imported D2C channel. A D2C
  order needs its external order number, and the same number cannot be entered twice per channel
  (duplicate imports are refused).
- **Reservation of sellable stock only**: a Stock Reservation Entry for a Sales Order may reserve
  only stock that is available to sell (released, in a Usable warehouse, not expired, enough shelf
  life left, not already reserved). Reserved batches are checked the same way.
- **One stock path**: stock leaves only through a Delivery Note. A Sales Invoice may not update
  stock unless Factory Ops Settings allows it (off by default); returns are unaffected.
- **Dispatch details**: when Factory Ops Settings requires them, a Delivery Note cannot be
  submitted without the transporter and the LR / AWB number.

QC Hold / Rejected warehouses and expired or short-dated batches are already refused on Sales
Order, Pick List, Delivery Note and Sales Invoice by ``inventory/guards.py`` (G1-G3, G6).
"""

import frappe
from frappe import _
from frappe.utils import cint, date_diff, flt, getdate, nowdate

from factory_ops.constants import D2C_CHANNELS
from factory_ops.inventory.guards import QCGuardError
from factory_ops.sales_ops.available_to_sell import available_to_sell, min_shelf_life_days


class DuplicateOrderError(frappe.ValidationError):
	pass


class InsufficientSellableStockError(frappe.ValidationError):
	pass


class SalesStockPathError(frappe.ValidationError):
	pass


class DispatchDetailsError(frappe.ValidationError):
	pass


def _setting(field: str) -> int:
	return cint(frappe.db.get_single_value("Factory Ops Settings", field))


# ---------------------------------------------------------------------------
# Sales Order: channel and external order number
# ---------------------------------------------------------------------------
def validate_sales_channel(doc, method=None):
	if not doc.get("fo_sales_channel"):
		doc.fo_sales_channel = "B2B"
	ref = (doc.get("fo_external_order_id") or "").strip()
	doc.fo_external_order_id = ref or None
	if doc.fo_sales_channel in D2C_CHANNELS and not ref:
		frappe.throw(
			_("Enter the {0} order number (External Order ID) for a {1} order.").format(
				doc.fo_sales_channel, doc.fo_sales_channel
			),
			DuplicateOrderError,
		)
	if not ref:
		return
	duplicate = frappe.db.get_value(
		"Sales Order",
		{
			"fo_sales_channel": doc.fo_sales_channel,
			"fo_external_order_id": ref,
			"docstatus": ("<", 2),
			"name": ("!=", doc.name or ""),
		},
		"name",
	)
	if duplicate:
		frappe.throw(
			_("{0} order {1} has already been entered as Sales Order {2}.").format(
				doc.fo_sales_channel, ref, duplicate
			),
			DuplicateOrderError,
		)


def inherit_sales_channel(doc, method=None):
	"""Delivery Note / Sales Invoice: take channel and external order number from the Sales Order.

	The order's External Order ID is ``no_copy`` (so duplicating an order does not duplicate the
	number), which also stops ERPNext's mapper carrying it to the DN and invoice."""
	so_field = "against_sales_order" if doc.doctype == "Delivery Note" else "sales_order"
	orders = {row.get(so_field) for row in doc.items if row.get(so_field)}
	if len(orders) != 1:
		if not doc.get("fo_sales_channel"):
			doc.fo_sales_channel = "B2B"
		return
	channel, ref = frappe.db.get_value(
		"Sales Order", orders.pop(), ["fo_sales_channel", "fo_external_order_id"]
	)
	doc.fo_sales_channel = channel or "B2B"
	doc.fo_external_order_id = ref


# ---------------------------------------------------------------------------
# Delivery Note: batches already pinned by a reservation must still be dispatchable
# ---------------------------------------------------------------------------
def validate_reserved_batches_dispatchable(doc, method=None):
	"""A Delivery Note against a reserved order ships the reserved batches. If one of them has
	expired or dropped below the minimum shelf life since it was reserved, refuse here with a
	clear message (ERPNext would otherwise fail later, inside its reservation update)."""
	if cint(doc.get("is_return")):
		return
	min_days = min_shelf_life_days()
	for row in doc.items:
		if not row.get("so_detail") or row.get("batch_no"):
			continue  # explicitly chosen batches are checked by the dispatch guard (G6)
		for b in frappe.db.sql(
			"""select sbe.batch_no, b.expiry_date
			from `tabSerial and Batch Entry` sbe
			inner join `tabStock Reservation Entry` sre on sre.name = sbe.parent
			inner join `tabBatch` b on b.name = sbe.batch_no
			where sbe.parenttype = 'Stock Reservation Entry' and sre.docstatus = 1
				and sre.voucher_detail_no = %s and sre.warehouse = %s
				and sre.status not in ('Delivered', 'Cancelled') and sbe.qty > sbe.delivered_qty""",
			(row.so_detail, row.warehouse),
			as_dict=True,
		):
			if not b.expiry_date:
				continue
			remaining = date_diff(getdate(b.expiry_date), getdate(doc.get("posting_date") or nowdate()))
			if remaining < 0 or remaining < min_days:
				frappe.throw(
					_(
						"Row #{0}: batch {1}, reserved for this order, has {2} days of shelf life left; at least {3} are required for dispatch. Cancel the reservation and reserve again so another batch is chosen."
					).format(row.idx, b.batch_no, remaining, min_days),
					exc=QCGuardError,
					title=_("Blocked by QC control"),
				)


# ---------------------------------------------------------------------------
# Stock Reservation Entry: only stock that is available to sell
# ---------------------------------------------------------------------------
def validate_reservation_is_sellable(doc, method=None):
	"""before_submit. Runs after the QC guard has refused QC Hold / Rejected warehouses."""
	if doc.voucher_type != "Sales Order":
		return
	for row in doc.get("sb_entries") or []:
		if not row.get("batch_no"):
			continue
		expiry = frappe.db.get_value("Batch", row.batch_no, "expiry_date")
		if expiry and not _batch_sellable(expiry):
			frappe.throw(
				_(
					"Batch {0} cannot be reserved: it is expired or below the minimum shelf life for dispatch."
				).format(row.batch_no),
				InsufficientSellableStockError,
			)
	available = available_to_sell(doc.company, doc.item_code, doc.warehouse)
	if flt(doc.reserved_qty) > flt(available) + 1e-9:
		frappe.throw(
			_(
				"Only {0} of {1} is available to sell in {2} (released, in date and not already reserved); cannot reserve {3}."
			).format(flt(available), doc.item_code, doc.warehouse, flt(doc.reserved_qty)),
			InsufficientSellableStockError,
		)


def _batch_sellable(expiry_date) -> bool:
	remaining = date_diff(getdate(expiry_date), getdate(nowdate()))
	return remaining >= 0 and remaining >= min_shelf_life_days()


# ---------------------------------------------------------------------------
# Sales Invoice: stock leaves only through a Delivery Note
# ---------------------------------------------------------------------------
def validate_invoice_stock_path(doc, method=None):
	if not cint(doc.get("update_stock")) or cint(doc.get("is_return")) or cint(doc.get("is_pos")):
		return
	if _setting("allow_sales_invoice_stock_update"):
		return
	for row in doc.items:
		if frappe.get_cached_value("Item", row.item_code, "is_stock_item"):
			frappe.throw(
				_(
					"Row #{0}: {1} is a stock item. Dispatch it with a Delivery Note and invoice it from the Delivery Note, so stock is deducted once."
				).format(row.idx, row.item_code),
				SalesStockPathError,
			)


# ---------------------------------------------------------------------------
# Delivery Note: dispatch details
# ---------------------------------------------------------------------------
def validate_dispatch_details(doc, method=None):
	if cint(doc.get("is_return")) or not _setting("require_dispatch_details"):
		return
	missing = []
	if not (doc.get("transporter") or (doc.get("transporter_name") or "").strip()):
		missing.append(_("Transporter"))
	if not (doc.get("lr_no") or "").strip():
		missing.append(_("Transport Receipt No (LR / AWB)"))
	if missing:
		frappe.throw(
			_("Enter the dispatch details before submitting: {0}.").format(", ".join(missing)),
			DispatchDetailsError,
		)
