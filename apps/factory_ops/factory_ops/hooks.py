app_name = "factory_ops"
app_title = "Factory Ops"
app_publisher = "FlowHQ"
app_description = "Mintree Factory OS: factory-specific operations on ERPNext (QC quarantine, approvals, production controls)"
app_email = "dev@flowhq.invalid"
app_license = "gpl-3.0"

required_apps = ["frappe/erpnext"]

# ---------------------------------------------------------------------------
# Installation. Custom fields, roles, permissions and warehouse types are
# declared in code (factory_ops/setup/*) and re-applied on every migrate, so a
# fresh site and an upgraded site end up identical. See docs/DECISIONS.md D-005.
# ---------------------------------------------------------------------------
after_install = "factory_ops.setup.install.after_install"
after_migrate = "factory_ops.setup.install.after_migrate"
before_uninstall = "factory_ops.setup.install.before_uninstall"

# ---------------------------------------------------------------------------
# Server-side QC guards. Every route that can move, reserve or plan stock out of
# a QC Hold or Rejected warehouse is checked here. See
# docs/DATABASE_AND_WORKFLOW_DESIGN.md section 3.3.
# ---------------------------------------------------------------------------
_guard = "factory_ops.inventory.guards"
_recv = "factory_ops.inventory.receiving"
_prod = "factory_ops.production.controls"
_sales = "factory_ops.sales_ops.controls"

doc_events = {
	"Item": {
		"validate": "factory_ops.inventory.items.apply_item_group_controls",
	},
	"Purchase Order": {
		"before_submit": "factory_ops.purchase.approval.validate_purchase_order_approval",
	},
	"Stock Entry": {
		"validate": [f"{_guard}.validate_stock_entry", f"{_prod}.validate_wastage"],
		"before_submit": [f"{_guard}.validate_stock_entry", f"{_prod}.validate_wastage"],
		"on_submit": f"{_guard}.on_inward_submit",
		"before_cancel": f"{_guard}.before_cancel_stock_entry",
		"on_cancel": f"{_guard}.on_inward_cancel",
	},
	"Purchase Receipt": {
		"before_validate": f"{_recv}.set_receipt_defaults",
		"validate": [f"{_guard}.validate_purchase_receipt", f"{_recv}.validate_receipt_data"],
		"before_submit": [
			f"{_guard}.validate_purchase_receipt",
			f"{_recv}.validate_receipt_data",
			f"{_recv}.create_supplier_batches",
		],
		"on_submit": f"{_guard}.on_inward_submit",
		"on_cancel": f"{_guard}.on_inward_cancel",
	},
	"Purchase Invoice": {
		"validate": f"{_guard}.validate_purchase_receipt",
		"before_submit": f"{_guard}.validate_purchase_receipt",
	},
	"Delivery Note": {
		"before_validate": f"{_sales}.inherit_sales_channel",
		"validate": [
			f"{_guard}.validate_outward_sales_doc",
			f"{_sales}.validate_reserved_batches_dispatchable",
		],
		"before_submit": [f"{_guard}.validate_outward_sales_doc", f"{_sales}.validate_dispatch_details"],
		# batches may be auto-selected (FEFO) during submit, so G6 runs again once bundles exist
		"on_submit": f"{_guard}.validate_shelf_life",
	},
	"Sales Invoice": {
		"before_validate": f"{_sales}.inherit_sales_channel",
		"validate": [f"{_guard}.validate_outward_sales_doc", f"{_sales}.validate_invoice_stock_path"],
		"before_submit": [f"{_guard}.validate_outward_sales_doc", f"{_sales}.validate_invoice_stock_path"],
		# batches may be auto-selected (FEFO) during submit, so G6 runs again once bundles exist
		"on_submit": f"{_guard}.validate_shelf_life",
	},
	"Pick List": {
		"before_validate": f"{_guard}.default_pick_list_warehouse",
		"validate": f"{_guard}.validate_pick_list",
		# ERPNext computes locations in before_save, after validate, so check again there
		"before_save": f"{_guard}.validate_pick_list",
		"before_submit": f"{_guard}.validate_pick_list",
	},
	"Sales Order": {
		"validate": [f"{_guard}.validate_sales_order", f"{_sales}.validate_sales_channel"],
		"before_submit": f"{_guard}.validate_sales_order",
	},
	"Stock Reservation Entry": {
		"validate": f"{_guard}.validate_stock_reservation",
		"before_submit": [
			f"{_guard}.validate_stock_reservation",
			f"{_sales}.validate_reservation_is_sellable",
		],
	},
	"Work Order": {
		"before_validate": f"{_prod}.set_work_order_header_defaults",
		# component sources are defaulted after ERPNext fills required_items, then guarded
		"validate": [
			f"{_prod}.validate_two_stage",
			f"{_prod}.set_work_order_component_sources",
			f"{_guard}.validate_work_order",
		],
		"before_submit": [f"{_prod}.validate_two_stage", f"{_guard}.validate_work_order"],
	},
	"BOM": {
		"validate": f"{_prod}.validate_bom",
	},
	"Stock Entry Type": {
		"validate": f"{_prod}.validate_stock_entry_type",
	},
	"Material Request": {
		"validate": f"{_guard}.validate_material_request",
		"before_submit": f"{_guard}.validate_material_request",
	},
	"Subcontracting Order": {
		"validate": f"{_guard}.validate_subcontracting_order",
		"before_submit": f"{_guard}.validate_subcontracting_order",
	},
	"Stock Reconciliation": {
		"validate": f"{_guard}.validate_stock_reconciliation",
		"before_submit": f"{_guard}.validate_stock_reconciliation",
	},
}

scheduler_events = {
	"daily": [
		"factory_ops.quality.batch_status.nightly_consistency_check",
		"factory_ops.sales_ops.shelf_life.segregate_undispatchable_stock",
	],
}

# Exported configuration that is edited in Desk and then version-controlled.
fixtures = [
	{"dt": "Workspace", "filters": [["module", "in", ["Factory Ops", "Quality"]]]},
]
