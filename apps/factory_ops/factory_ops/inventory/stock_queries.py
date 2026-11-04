"""Read-only stock queries used by the QC engine.

Batch balances are read from submitted, non-cancelled Serial and Batch Entries (the batch
side of the stock ledger). Nothing here writes stock.
"""

import frappe
from frappe.utils import flt

from factory_ops.constants import WH_TYPE_QC_HOLD, WH_TYPE_REJECTED


def warehouse_type(warehouse: str | None) -> str | None:
	if not warehouse:
		return None
	return frappe.get_cached_value("Warehouse", warehouse, "warehouse_type")


def is_qc_hold(warehouse: str | None) -> bool:
	return warehouse_type(warehouse) == WH_TYPE_QC_HOLD


def is_rejected(warehouse: str | None) -> bool:
	if not warehouse:
		return False
	wh_type, flag = frappe.get_cached_value(
		"Warehouse", warehouse, ["warehouse_type", "is_rejected_warehouse"]
	)
	return wh_type == WH_TYPE_REJECTED or bool(flag)


def is_restricted(warehouse: str | None) -> bool:
	"""Stock in a restricted warehouse may not be consumed, reserved, picked or sold."""
	return is_qc_hold(warehouse) or is_rejected(warehouse)


def batch_qty_by_warehouse(batch_no: str) -> dict[str, float]:
	rows = frappe.db.sql(
		"""
		select sbe.warehouse, sum(sbe.qty) as qty
		from `tabSerial and Batch Entry` sbe
		inner join `tabSerial and Batch Bundle` sbb on sbb.name = sbe.parent
		where sbe.batch_no = %s and sbb.docstatus = 1 and sbb.is_cancelled = 0
		group by sbe.warehouse
		""",
		(batch_no,),
		as_dict=True,
	)
	return {r.warehouse: flt(r.qty) for r in rows if flt(r.qty)}


def batch_qty_in_warehouse(batch_no: str, warehouse: str) -> float:
	return flt(batch_qty_by_warehouse(batch_no).get(warehouse, 0))


def batch_qty_in_qc_hold(batch_no: str) -> float:
	return sum(qty for wh, qty in batch_qty_by_warehouse(batch_no).items() if is_qc_hold(wh))


def get_row_batches(row) -> list[str]:
	"""Batches on a transaction row, from the legacy batch field or its bundle."""
	batches = []
	if row.get("batch_no"):
		batches.append(row.batch_no)
	for field in ("serial_and_batch_bundle", "rejected_serial_and_batch_bundle"):
		bundle = row.get(field)
		if bundle:
			batches.extend(
				frappe.get_all(
					"Serial and Batch Entry",
					filters={"parent": bundle, "batch_no": ("is", "set")},
					pluck="batch_no",
				)
			)
	return list(dict.fromkeys(batches))
