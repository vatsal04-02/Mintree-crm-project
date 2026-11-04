"""Purchase Order approval: per-user limits and no self-approval (brief section 6, rules 4-5).

Approval = submitting the Purchase Order. Enforced in ``before_submit`` so it holds for Desk,
the REST API and data import alike. Limits live in the Purchase Approval Limit DocType and
compare against the PO's base (company currency) grand total.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, fmt_money


class ApprovalLimitError(frappe.PermissionError):
	pass


class SelfApprovalError(frappe.PermissionError):
	pass


def approval_enforced() -> bool:
	return bool(cint(frappe.db.get_single_value("Factory Ops Settings", "enforce_purchase_approval")))


def get_limit(user: str, company: str) -> float | None:
	rows = frappe.get_all(
		"Purchase Approval Limit",
		filters={"user": user, "enabled": 1},
		fields=["approval_limit", "company"],
	)
	for row in rows:
		if not row.company or row.company == company:
			return flt(row.approval_limit)
	return None


def validate_purchase_order_approval(doc, method=None):
	if not approval_enforced():
		return
	user = frappe.session.user
	if doc.owner == user:
		frappe.throw(
			_("You created Purchase Order {0}, so another approver must submit it.").format(doc.name),
			SelfApprovalError,
			title=_("Approval required"),
		)
	limit = get_limit(user, doc.company)
	total = flt(doc.base_grand_total)
	currency = frappe.get_cached_value("Company", doc.company, "default_currency")
	if limit is None:
		frappe.throw(
			_("You have no purchase approval limit. Ask an approver to submit {0}.").format(doc.name),
			ApprovalLimitError,
			title=_("Approval required"),
		)
	if total > limit:
		frappe.throw(
			_("Purchase Order {0} is {1}, above your approval limit of {2}.").format(
				doc.name, fmt_money(total, currency=currency), fmt_money(limit, currency=currency)
			),
			ApprovalLimitError,
			title=_("Approval required"),
		)
