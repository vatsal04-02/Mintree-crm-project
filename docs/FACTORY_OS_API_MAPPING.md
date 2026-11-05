# Factory OS front end — API mapping

Every backend call the React app makes. All calls are same-origin, use the Frappe session cookie,
and send `X-Frappe-CSRF-Token` on writes. Generic calls are implemented once in
`apps/web/src/api/frappe.ts`.

## Generic Frappe API (reused, unchanged)

| Client function | HTTP | Used for |
|---|---|---|
| `login(usr, pwd)` | `POST /api/method/login` | sign in |
| `logout()` | `POST /api/method/logout` | sign out |
| `getDoc(dt, name)` | `GET /api/resource/<dt>/<name>` | every document page |
| `getList(dt, …)` | `POST /api/method/frappe.client.get_list` | list tabs, related lists, notifications |
| `getCount(dt, filters)` | `POST /api/method/frappe.client.get_count` | Command Center queues |
| `insert(doc)` | `POST /api/resource/<dt>` | every create (ERPNext `insert`, all hooks) |
| `save(doc)` / `setValues(dt, name, values)` | `PUT /api/resource/<dt>/<name>` | Quality Inspection readings; delivery dispatch details |
| `submit(dt, name)` | `GET` the document, then `POST frappe.client.submit` | every submit / approve / post |
| `docMethod(doc, method)` | `POST /api/method/run_doc_method` | Pick List `create_stock_reservation_entries` |
| `runReport(name, filters)` | `POST /api/method/frappe.desk.query_report.run` | every report page; QC queue count |
| `searchLink(dt, txt, filters)` | `POST /api/method/frappe.desk.search.search_link` | Link fields; global search |
| `uploadFile(file)` | `POST /api/method/upload_file` (private) | certificate of analysis on a GRN |
| `pdfUrl(dt, name, format)` | `GET /api/method/frappe.utils.print_format.download_pdf` | batch label PDF |

## ERPNext mapping methods (reused, unchanged)

| Workflow step | Method |
|---|---|
| Material request → purchase order | `erpnext.stock.doctype.material_request.material_request.make_purchase_order` |
| Purchase order → goods receipt | `erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt` |
| Work order → issue / manufacture entry | `erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry` |
| Sales order → pick list | `erpnext.selling.doctype.sales_order.sales_order.create_pick_list` |
| Pick list → delivery note | `erpnext.stock.doctype.pick_list.pick_list.create_delivery_note` |
| Delivery note → packing slip | `erpnext.stock.doctype.delivery_note.delivery_note.make_packing_slip` |
| Delivery note → sales invoice | `erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice` |
| Invoice → payment entry | `erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry` |

## factory_ops methods (existing, reused)

| Method | Screen | Server checks |
|---|---|---|
| `factory_ops.quality.doctype.qc_release.qc_release.create_quality_inspection` | QC release page | QC Release permission, release state |
| `factory_ops.quality.doctype.qc_retest.qc_retest.send_for_retest` | Submitted rejection (QA) | QA Manager role, submitted Reject only |
| `factory_ops.sales_ops.available_to_sell.get_available_to_sell` | Sales order item rows | Item read permission |

Reports (existing): Stock by QC Status, QC Queue, Available to Sell, Dispatch Register, RM PM
Requirements, Wastage by Reason (factory_ops); Accounts Receivable, Accounts Payable (ERPNext).

## New endpoint (one)

| Method | Why the standard API is not enough | Checks |
|---|---|---|
| `GET factory_ops.api.factory_os.boot` | The front end needs, in one call, the signed-in user, roles, this session's CSRF token, default company/currency, and which of its DocTypes (read/create/write/submit/cancel) and reports the user may use. Frappe exposes these only inside Desk's boot page, not as an API; deriving them client-side would mean dozens of calls and duplicating Frappe's permission logic. | Refuses Guest (`AuthenticationError`). Read-only; answers with `frappe.has_permission` and `Report.is_permitted` for the same user, so it can never claim more than the server allows. Tests: `tests/test_factory_os_api.py` (3). |

No other endpoint was added. No business logic was added to or duplicated in the front end.

## Website route (new, configuration only)

`factory_ops/hooks.py`: `website_route_rules = [{"from_route": "/factory/<path:app_path>", "to_route": "factory"}]`
with `factory_ops/www/factory.py` (no cache) serving the built `www/factory.html`.
