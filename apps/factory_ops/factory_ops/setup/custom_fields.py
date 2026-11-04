"""Custom fields added to standard ERPNext DocTypes. All names start with ``fo_``."""

CUSTOM_FIELDS = {
	"Warehouse": [
		{
			"fieldname": "fo_release_warehouse",
			"label": "QC Release Warehouse",
			"fieldtype": "Link",
			"options": "Warehouse",
			"insert_after": "warehouse_type",
			"depends_on": "eval:doc.warehouse_type=='QC Hold'",
			"description": "Usable warehouse that released stock moves to by default.",
		},
	],
	"Item": [
		{
			"fieldname": "fo_qc_required",
			"label": "QC Release Required",
			"fieldtype": "Check",
			"default": "0",
			"insert_after": "inspection_required_before_delivery",
			"description": "Receipts and production output must land in a QC Hold warehouse and be released by QC.",
		},
	],
	"Batch": [
		{
			"fieldname": "fo_qc_status",
			"label": "QC Status",
			"fieldtype": "Select",
			"options": "\nHold\nPartly Released\nReleased\nRejected",
			"read_only": 1,
			"permlevel": 1,
			"no_copy": 1,
			"in_list_view": 1,
			"in_standard_filter": 1,
			"insert_after": "batch_id",
			"description": "Derived from QC Releases and warehouse balances. The stock ledger is the record of truth.",
		},
		{
			"fieldname": "fo_supplier_batch_no",
			"label": "Supplier Batch No",
			"fieldtype": "Data",
			"insert_after": "supplier",
		},
	],
	"Stock Entry": [
		{
			"fieldname": "fo_qc_release",
			"label": "QC Release",
			"fieldtype": "Link",
			"options": "QC Release",
			"read_only": 1,
			"no_copy": 1,
			"insert_after": "stock_entry_type",
		},
		{
			"fieldname": "fo_disposal_reason",
			"label": "Disposal Reason",
			"fieldtype": "Small Text",
			"no_copy": 1,
			"insert_after": "fo_qc_release",
			"description": "Required when stock leaves the Rejected warehouse.",
		},
	],
}
