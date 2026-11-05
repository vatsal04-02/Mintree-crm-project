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

## Session boot endpoint

| Method | Why the standard API is not enough | Checks |
|---|---|---|
| `GET factory_ops.api.factory_os.boot` | The front end needs, in one call, the signed-in user, roles, this session's CSRF token, default company/currency, and which of its DocTypes (read/create/write/submit/cancel) and reports the user may use. Frappe exposes these only inside Desk's boot page, not as an API; deriving them client-side would mean dozens of calls and duplicating Frappe's permission logic. | Refuses Guest (`AuthenticationError`). Read-only; answers with `frappe.has_permission` and `Report.is_permitted` for the same user, so it can never claim more than the server allows. Tests: `tests/test_factory_os_api.py` (3). |

No business logic is duplicated in the front end: every rule below runs on the server.

## Website route (new, configuration only)

`factory_ops/hooks.py`: `website_route_rules = [{"from_route": "/factory/<path:app_path>", "to_route": "factory"}]`
with `factory_ops/www/factory.py` (no cache) serving the built `www/factory.html`.

## Next-phase endpoints and document methods (2026-11-05)

Each one checks permissions on the server; React only shows what the boot answer allows.

| Method | Used by | Server checks | Tests |
|---|---|---|---|
| `Formulation.apply_action(action, note)` (doc method) | R&D formulation page | role per action (R&D Chemist / Manager), submitter cannot approve or reject, total meets target before review, a passed trial before approval, a reason to reject | test_research |
| `Formulation.new_version()` | R&D | R&D roles; not from Draft | test_research, e2e rnd |
| `Formulation.create_bom(company)` | R&D (shown to users who may create **and** submit BOMs) | Approved only; BULK product; one BOM per version; demo formulations refused outside a demo site | test_research, e2e rnd |
| `GET factory_ops.api.maintenance.dashboard(company)` | Maintenance overview | section only if the user may read its DocType | test_maintenance |
| `POST factory_ops.api.maintenance.register_asset(...)` | Register equipment | Asset create + submit; purchase value required | test_maintenance, e2e maintenance |
| Asset Repair submit (standard) | Approve closure | factory_ops `before_submit`: Maintenance Manager only, with resolution, root cause, technician | test_maintenance |
| `GET factory_ops.api.marketplace.overview()` | Marketplace overview | Marketplace Order read | test_marketplace |
| `GET factory_ops.api.marketplace.inventory_allocation(company)` | Inventory to publish | Marketplace Listing read | test_marketplace, e2e marketplace |
| `POST factory_ops.api.marketplace.refresh_published_quantities(company)` | Inventory to publish | Marketplace Listing write | — |
| `POST factory_ops.api.marketplace.test_connection(channel)` | Channel page | Marketplace Channel write; logged; refused while not implemented | test_marketplace, e2e marketplace |
| `POST factory_ops.api.marketplace.webhook?channel=` (guest) | marketplaces, in future | channel webhook secret configured; HMAC-SHA256 signature, constant-time compare; 120 / min; duplicate-safe | test_marketplace |
| `Marketplace Order.make_sales_order(company)` | Order page | Marketplace Order write + Sales Order create; listing must map every SKU; not cancelled; once | test_marketplace, e2e marketplace |
| `Marketplace Settlement.reconcile()` | Settlement page | write permission | test_marketplace |
| `GET factory_ops.api.marketing.overview()` | Marketing overview | Marketing Campaign read | test_marketing |
| `Marketing Campaign.apply_action` / `Marketing Content.apply_action` | Campaign / content pages | roles per action; submitter cannot decide; reason to reject; creative or caption before review; URL before published | test_marketing, e2e marketing |
| `Meta Connection.test_connection()` | Meta page | write permission; always refused today (no live call) | test_marketing, e2e marketing |
| `GET factory_ops.api.integrations.integrations()` | Integration Centre | signed in; marketplace / Meta rows only for roles that may read them | e2e run (no connected marketplace) |

Standard REST (`/api/resource`) is used for every list, form and save, with Frappe's own permission
checks. Credentials are Password fields: write-only from the screens, never returned to the browser.
