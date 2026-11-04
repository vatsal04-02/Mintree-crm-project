"""Production controls on top of ERPNext's standard BOM, Work Order and Stock Entry.

The production flow itself is ERPNext's (DECISIONS D-020): a BULK Work Order in kg, then a
fill-and-pack FG Work Order in units that consumes the released bulk. factory_ops adds:

- **Warehouse defaults** for Work Orders: WIP-PRODUCTION, output into the item's QC Hold
  warehouse, and each component drawn from its group's usable store (RM-STORES, PM-STORES,
  BULK-STORES). The QC guards (``inventory/guards.py``) still check whatever ends up set.
- **BOM guard**: a BOM line may not name a QC Hold or Rejected source warehouse.
- **Wastage reasons**: every Material Issue row (stock written off) needs an enabled Wastage
  Reason, except scrap from the Rejected warehouse, which has its own disposal reason (G2).
"""

import frappe
from frappe import _

from factory_ops.constants import WIP_WAREHOUSE
from factory_ops.inventory.guards import QCGuardError
from factory_ops.inventory.stock_queries import is_qc_hold, is_rejected, is_restricted
from factory_ops.setup.warehouses import wh_name


class WastageReasonError(frappe.ValidationError):
	pass


# ---------------------------------------------------------------------------
# Warehouse defaults
# ---------------------------------------------------------------------------
def default_item_warehouse(item_code: str, company: str) -> str | None:
	"""Item-level default warehouse for the company, else the item group's."""
	from erpnext.setup.doctype.item_group.item_group import get_item_group_defaults
	from erpnext.stock.doctype.item.item import get_item_defaults

	defaults = get_item_defaults(item_code, company) or {}
	if defaults.get("default_warehouse"):
		return defaults["default_warehouse"]
	return (get_item_group_defaults(item_code, company) or {}).get("default_warehouse")


def usable_store(item_code: str, company: str) -> str | None:
	"""Where production draws an item from: the release destination of its QC Hold default
	(RM-QC-HOLD -> RM-STORES), or the default itself when it is already usable."""
	default = default_item_warehouse(item_code, company)
	if not default:
		return None
	if is_qc_hold(default):
		return frappe.get_cached_value("Warehouse", default, "fo_release_warehouse")
	return None if is_restricted(default) else default


def wip_warehouse(company: str) -> str | None:
	name = wh_name(WIP_WAREHOUSE, company)
	return name if frappe.db.exists("Warehouse", name) else None


def set_work_order_header_defaults(doc, method=None):
	"""before_validate: WIP and output warehouses, before ERPNext validates them."""
	if not doc.get("company") or not doc.get("production_item"):
		return
	if not doc.get("wip_warehouse") and not doc.get("skip_transfer"):
		doc.wip_warehouse = wip_warehouse(doc.company)
	if not doc.get("fg_warehouse"):
		doc.fg_warehouse = default_item_warehouse(doc.production_item, doc.company)


def set_work_order_component_sources(doc, method=None):
	"""validate: ERPNext fills required_items from the BOM in its own validate; give every
	component without a source warehouse its usable store."""
	if not doc.get("company"):
		return
	for row in doc.get("required_items") or []:
		if not row.get("source_warehouse"):
			row.source_warehouse = usable_store(row.item_code, doc.company)


# ---------------------------------------------------------------------------
# BOM
# ---------------------------------------------------------------------------
def validate_bom(doc, method=None):
	for row in doc.get("items") or []:
		if is_restricted(row.get("source_warehouse")):
			frappe.throw(
				_("Row #{0}: {1} cannot be drawn from {2} (QC Hold or Rejected stock).").format(
					row.idx, row.item_code, row.source_warehouse
				),
				exc=QCGuardError,
				title=_("Blocked by QC control"),
			)


# ---------------------------------------------------------------------------
# Wastage reasons
# ---------------------------------------------------------------------------
def validate_wastage_reasons(doc, method=None):
	if doc.purpose != "Material Issue":
		return
	for row in doc.items:
		if not row.s_warehouse or is_rejected(row.s_warehouse):
			continue  # scrap from Rejected is covered by the disposal reason (guards G2)
		reason = row.get("fo_wastage_reason")
		if not reason:
			frappe.throw(
				_("Row #{0}: select a Wastage Reason for issuing {1} from {2}.").format(
					row.idx, row.item_code, row.s_warehouse
				),
				WastageReasonError,
			)
		if not frappe.db.get_value("Wastage Reason", reason, "enabled"):
			frappe.throw(
				_("Row #{0}: Wastage Reason {1} is disabled.").format(row.idx, reason), WastageReasonError
			)
