"""Idempotent install/migrate setup for factory_ops.

Everything here can run any number of times: on install, on every migrate and from tests.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.permissions import add_permission, update_permission_property

from factory_ops.constants import FACTORY_WAREHOUSE_TYPES, QC_ROLES, ROLE_QA_MANAGER, ROLE_QC_OFFICER
from factory_ops.setup.custom_fields import CUSTOM_FIELDS


def after_install():
	apply_setup()


def after_migrate():
	apply_setup()


def before_uninstall():
	# Custom fields stay in place on uninstall so historical documents keep their data.
	pass


def apply_setup():
	create_roles()
	create_warehouse_types()
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True, update=True)
	grant_qc_permissions()
	frappe.clear_cache()


def create_roles():
	for role in QC_ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc(
				{"doctype": "Role", "role_name": role, "desk_access": 1, "two_factor_auth": 0}
			).insert(ignore_permissions=True)


def create_warehouse_types():
	for wh_type in FACTORY_WAREHOUSE_TYPES:
		if not frappe.db.exists("Warehouse Type", wh_type):
			frappe.get_doc({"doctype": "Warehouse Type", "name": wh_type}).insert(ignore_permissions=True)


# (doctype, role, permlevel 0 rights). Custom DocPerm rows; the standard ERPNext
# permissions on these DocTypes are left as they are.
QC_DOCPERMS = (
	("Quality Inspection", ROLE_QC_OFFICER, ("read", "write", "create", "submit", "print", "report")),
	(
		"Quality Inspection",
		ROLE_QA_MANAGER,
		("read", "write", "create", "submit", "cancel", "print", "report"),
	),
	("Quality Inspection Template", ROLE_QC_OFFICER, ("read",)),
	("Quality Inspection Template", ROLE_QA_MANAGER, ("read", "write", "create")),
	("Batch", ROLE_QC_OFFICER, ("read", "report")),
	("Batch", ROLE_QA_MANAGER, ("read", "report")),
	("Item", ROLE_QC_OFFICER, ("read",)),
	("Item", ROLE_QA_MANAGER, ("read",)),
	("Warehouse", ROLE_QC_OFFICER, ("read",)),
	("Warehouse", ROLE_QA_MANAGER, ("read",)),
	("Stock Entry", ROLE_QC_OFFICER, ("read",)),
	("Stock Entry", ROLE_QA_MANAGER, ("read",)),
	# ERPNext v16 lets only Item Manager create Batches, but a batch is auto-created when
	# stock is received or produced. Receivers and producers need create (not write).
	("Batch", "Stock User", ("read", "create")),
	("Batch", "Manufacturing User", ("read", "create")),
	# Submitting the QC Release's transfer creates and cancels Serial and Batch Bundles, and
	# ERPNext checks the session user's rights on them. Same rights as Stock User has.
	("Serial and Batch Bundle", ROLE_QC_OFFICER, ("read", "create", "write", "submit", "cancel")),
	("Serial and Batch Bundle", ROLE_QA_MANAGER, ("read", "create", "write", "submit", "cancel")),
)

# Read access to permlevel-1 fields (Batch.fo_qc_status). Nobody is given write at
# level 1, so the derived QC status can only be set by server code.
LEVEL1_READ = (
	("Batch", ROLE_QC_OFFICER),
	("Batch", ROLE_QA_MANAGER),
	("Batch", "Stock User"),
	("Batch", "Stock Manager"),
	("Batch", "Item Manager"),
	("Batch", "Manufacturing User"),
	("Batch", "Sales User"),
)


def _ensure_perm_row(doctype: str, role: str, permlevel: int) -> None:
	if not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": permlevel}):
		add_permission(doctype, role, permlevel)


def grant_qc_permissions():
	for doctype, role, rights in QC_DOCPERMS:
		if not frappe.db.exists("DocType", doctype):
			continue
		_ensure_perm_row(doctype, role, 0)
		for right in rights:
			update_permission_property(doctype, role, 0, right, 1, validate=False)
	for doctype, role in LEVEL1_READ:
		_ensure_perm_row(doctype, role, 1)
		update_permission_property(doctype, role, 1, "read", 1, validate=False)
