"""SAMPLE users for a development or UAT site, one per factory role.

Development only. Passwords are random and written to the site's private folder
(``sites/<site>/private/sample_users.json``), never to the repository.

    bench --site factory.localhost execute factory_ops.setup.sample_users.create_sample_users
"""

import json
import os
import secrets

import frappe

from factory_ops.constants import ROLE_QA_MANAGER, ROLE_QC_OFFICER

# email: (first name, roles, purchase approval limit or None)
SAMPLE_USERS = {
	"sample.buyer@sample.invalid": ("SAMPLE Buyer", ["Purchase User"], None),
	"sample.approver@sample.invalid": (
		"SAMPLE Purchase Approver",
		["Purchase Manager", "Purchase User"],
		500_000,
	),
	"sample.stores@sample.invalid": ("SAMPLE Stores", ["Stock User", "Stock Manager"], None),
	"sample.qc@sample.invalid": ("SAMPLE QC Officer", [ROLE_QC_OFFICER], None),
	"sample.qa@sample.invalid": ("SAMPLE QA Manager", [ROLE_QC_OFFICER, ROLE_QA_MANAGER], None),
	"sample.production@sample.invalid": (
		"SAMPLE Production",
		["Manufacturing User", "Manufacturing Manager", "Stock User"],
		None,
	),
	"sample.sales@sample.invalid": ("SAMPLE Sales", ["Sales User", "Stock User"], None),
	"sample.accounts@sample.invalid": ("SAMPLE Accounts", ["Accounts User", "Accounts Manager"], None),
}


def create_sample_users() -> str:
	if not frappe.conf.get("developer_mode"):
		frappe.throw("Sample users are for development sites only (developer_mode is off).")
	credentials = {}
	for email, (first_name, roles, limit) in SAMPLE_USERS.items():
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": first_name,
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", email)
		user.add_roles(*roles)
		password = secrets.token_urlsafe(12)
		user.new_password = password
		user.save(ignore_permissions=True)
		credentials[email] = password
		if limit is not None:
			if frappe.db.exists("Purchase Approval Limit", email):
				frappe.db.set_value("Purchase Approval Limit", email, {"approval_limit": limit, "enabled": 1})
			else:
				frappe.get_doc(
					{"doctype": "Purchase Approval Limit", "user": email, "approval_limit": limit}
				).insert(ignore_permissions=True)
	path = frappe.get_site_path("private", "sample_users.json")
	fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
	with os.fdopen(fd, "w") as f:
		json.dump(credentials, f, indent=1)
	os.chmod(path, 0o600)
	frappe.db.commit()
	return path
