# Factory OS front end — capability map

What the backend (ERPNext v16.53.0 + `factory_ops`) can do today, and how much of it the React
front end (`apps/web`, served at `/factory`) exposes. Audited 2026-11-05 against the running
development site and the code.

Classification:

- **IMPLEMENTED** — the backend does it and a role user can do it end to end in Factory OS.
- **PARTIAL** — the backend does it; Factory OS covers the daily path, the rest is in ERPNext Desk.
- **CONFIGURATION REQUIRED** — code exists; settings or client data are missing.
- **NOT IMPLEMENTED** — no backend code exists; Factory OS states this and shows nothing else.
- **BLOCKED** — cannot proceed without an outside decision.

Test references: `B:` = backend test module in `apps/factory_ops/factory_ops/tests/`;
`E2E:` = check name in `apps/web/e2e/run.mjs` (browser, through the React UI);
`H:` = HTTP acceptance script in `deploy/dev/`.

## 1. Procurement — IMPLEMENTED

| Capability | DocTypes / methods | Factory OS screen | Permission (server) | Tests |
|---|---|---|---|---|
| Material request for purchase | Material Request; `material_request.make_purchase_order` | `/procurement/material-requests`, `/new`, `/:name` | Purchase User create/submit | B: test_purchase; covered by REST in H: acceptance_http |
| Purchase order into QC Hold | Purchase Order (warehouse defaulted to the item group's QC Hold by `factory_ops`) | `/procurement/purchase-orders/new` | Purchase User create | E2E: "buyer creates a purchase order in React" |
| Approval limits, no self-approval | `purchase.approval.validate_purchase_order_approval` (before_submit), Purchase Approval Limit | "Approve and submit" on the order | Purchase Manager / limits | B: test_purchase; E2E: "buyer cannot approve own order", "approver approves" |
| Goods receipt (GRN) with supplier batch, mfg/expiry, COA | Purchase Receipt; `purchase_order.make_purchase_receipt`; `inventory.receiving.*`; `upload_file` | "Receive goods" → `/procurement/receipts/new` | Stock User / Purchase User | B: test_qc_release, test_lifecycle_routes; E2E: "stores receives goods in React" |
| RM/PM requirements | Report `RM PM Requirements` | `/procurement/requirements` | report roles | E2E: report sweep |
| Purchase invoice, supplier master, price lists | Purchase Invoice, Supplier, Item Price | **Desk** | Accounts / Purchase | B: test_guards (PI guard) |

## 2. Inventory and warehouse — IMPLEMENTED

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Stock by QC status, batch, expiry, dispatch eligibility | Report `Stock by QC Status` | `/inventory/stock` (status filter, item filter, `?batch=`) | Stock / QC / management | E2E: "Stock by QC Status shows the held batch" |
| Transfers between usable warehouses | Stock Entry (Material Transfer); QC guards G1–G6 | `/inventory/movements/new` | Stock User | E2E: "moving QC Hold stock from React is refused and writes nothing"; B: test_guards |
| Wastage write-off with reason | Stock Entry type `Wastage`; `production.controls.validate_wastage`; Wastage Reason | "Write off wastage" → `/inventory/movements/new?type=wastage` | Stock / Manufacturing User | B: test_production |
| Stock movement view and posting | Stock Entry | `/inventory/movements/:name` | Stock User | E2E (production steps) |
| Batch label PDF | Print Format `Batch Label` | Output batches panel on a manufacture entry | Batch read | B: test_production |
| Stock reconciliation, opening stock | Stock Reconciliation; Master Data Import | **Desk** | Stock Manager / System Manager | B: test_master_data |

## 3. Production — IMPLEMENTED

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Work order (bulk in kg, FG from released bulk; two-stage) | Work Order; `production.controls.*` (defaults, two-stage, component sources) | `/production/work-orders/new`, `/:name` | Manufacturing User | E2E: "production runs a work order in React"; B: test_production |
| Issue materials, record output into QC Hold, process loss | `work_order.make_stock_entry` (Material Transfer for Manufacture / Manufacture) | "Issue materials to production", "Record output" → movement form | Manufacturing / Stock User | E2E; H: acceptance_production_http |
| Held bulk cannot be filled | QC guards on Stock Entry | server refusal shown in the movement form | — | B: test_production; H: acceptance_production_http |
| Wastage by reason | Report `Wastage by Reason` | `/production/wastage` (last 30 days) | report roles | E2E: report sweep |
| BOM authoring, workstations, operations | BOM (validated by `validate_bom`) | **Desk** | Manufacturing Manager | B: test_production |

## 4. Quality — IMPLEMENTED

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| QC queue with SLA and age | Report `QC Queue` | `/quality/queue` | QC Officer / QA Manager | E2E: report sweep |
| Release / partial / conditional / reject | QC Release (submittable) | Queue row → `/quality/releases/new` → `/:name` | QC Officer, QA Manager | E2E: "QC officer releases the batch in React"; B: test_qc_release |
| Inspection with readings and outcome | Quality Inspection; `qc_release.create_quality_inspection` | Inspection panel on the release | QC Officer | E2E; B: test_spike_qi_lifecycle |
| Deviation for conditional release, QA approval | QC Deviation (submit = approve) | `/quality/deviations`, `/new`, `/:name` | QC Officer create, QA Manager submit | B: test_qc_release |
| Re-test of rejected stock | `qc_retest.send_for_retest` (QA Manager only, checked on the server) | "Send for re-test" on a submitted rejection | QA Manager | B: test_qc_retest; H: acceptance_http |
| QI templates, parameters, SLA settings | Quality Inspection Template / Parameter; Factory Ops Settings | **Desk** | System / QA Manager | B: test_master_data |

## 5. Sales and dispatch — IMPLEMENTED

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Sales order with channel and external order ID | Sales Order; `sales_ops.controls.validate_sales_channel` | `/sales/orders/new` | Sales User | E2E: "sales user creates and submits a sales order"; B: test_sales |
| Available to sell per item (released, in date, minus reserved/picked) | `sales_ops.available_to_sell.get_available_to_sell`; Report `Available to Sell` | Item rows of the order form; `/sales/available` | Item read / report roles | B: test_batch_eligibility, test_sales |
| Credit limit | ERPNext credit controller (Sales Manager may submit over limit) | Server refusal on "Submit order"; a Sales Manager uses the same button | Sales Manager | B: test_sales; H: acceptance_sales_http |
| Pick list (FEFO, eligible batches only) and reservation | Pick List; `sales_order.create_pick_list`; `Pick List.create_stock_reservation_entries`; `sales_ops.controls.reallocate_pick_list` | "Create pick list", `/sales/pick-lists/:name`, "Reserve picked batches" | Stock User | E2E: "stores picks (FEFO, FG-STORES) and reserves" |
| Delivery note with transporter, LR/AWB, vehicle; packing slip | Delivery Note; `pick_list.create_delivery_note`; `delivery_note.make_packing_slip`; `validate_dispatch_details` | `/sales/deliveries/:name` | Delivery User + Stock User | E2E: "dispatch without transporter / LR is refused", "dispatch user dispatches in React" |
| Dispatch register | Report `Dispatch Register` | `/sales/dispatch-register` (last 30 days) | report roles | E2E: report sweep |
| Returns, customer master, price lists | Delivery Note (return), Customer, Item Price | **Desk** | Sales / Stock Manager | — |

## 6. Accounts — PARTIAL

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Sales invoice from the delivery note (no second stock movement) | Sales Invoice; `delivery_note.make_sales_invoice`; `validate_invoice_stock_path` | "Create invoice" on the delivery; `/accounts/invoices/:name` | Accounts User | E2E: "accounts invoices the delivery in React"; B: test_sales |
| Customer payment | Payment Entry; `payment_entry.get_payment_entry` | "Record payment" → `/accounts/payments/new` | Accounts User | E2E: "payment posted in React clears the invoice" |
| Receivables / payables ageing | Reports `Accounts Receivable`, `Accounts Payable` | `/accounts/receivables`, `/accounts/payables` | Accounts roles | E2E: report sweep |
| Purchase invoices, journal entries, GL, bank reconciliation, period close | ERPNext Accounts | **Desk** | Accounts Manager | — |
| GST | — | Invoice page states no tax is configured | — | **CONFIGURATION REQUIRED / BLOCKED** on the client's GSTIN and accountant sign-off |

## 7. Platform

| Capability | Status | Notes |
|---|---|---|
| Sign in with ERPNext account, session cookie, CSRF | IMPLEMENTED | `/api/method/login`; CSRF token from `factory_ops.api.factory_os.boot` |
| Role-based navigation and actions | IMPLEMENTED | from the boot answer (`frappe.has_permission`, `Report.is_permitted`); server permission is still the boundary (E2E: management viewer checks) |
| Global search of permitted documents | IMPLEMENTED | `frappe.desk.search.search_link` per readable DocType (Ctrl K) |
| Notifications | IMPLEMENTED (read) | the user's own `Notification Log`; opens the document in Desk |
| Command Center | IMPLEMENTED | work queues: counts via `frappe.client.get_count` and the QC Queue report, each naming its source |
| Role workspaces in Desk (Milestone 6) | IMPLEMENTED (Desk) | unchanged; Desk remains for administration |
| Master data import | IMPLEMENTED (Desk) | Master Data Import DocType (System Manager) |
| Integration Centre | IMPLEMENTED (status page) | lists every connector honestly; see §8 |

## 8. Not implemented — shown only as such

| Area | Status |
|---|---|
| Amazon, Flipkart, Myntra, Nykaa, own website order sync | NOT IMPLEMENTED (no connector code; D2C orders are entered by hand with an external order ID) |
| Courier / shipping aggregator | NOT IMPLEMENTED (LR/AWB typed on the delivery note) |
| Meta (WhatsApp, Instagram) | NOT IMPLEMENTED |
| AI features | NOT IMPLEMENTED (no provider, no keys, nothing simulated) |
| CRM, R&D, eBMR, analytics | NOT IMPLEMENTED — listed on `/planned` |
| GST e-invoice / e-way bill | CONFIGURATION REQUIRED, BLOCKED on GSTIN and accountant sign-off |

## 7. R&D and formulation — IMPLEMENTED (next phase)

| Capability | DocTypes / methods | Factory OS screen | Permission (server) | Tests |
|---|---|---|---|---|
| Formulation library, versions, % and kg | Formulation (+ ingredients), Ingredient Category, Item ingredient fields | `/research/formulations`, `/new`, `/:name`, `/:name/edit` | R&D Chemist / Manager | test_research; e2e rnd |
| Validation (total, required ingredients, inactive / non-RM materials) | Formulation.validate | form, refusal shown | server | test_research; e2e rnd (95 % refused) |
| Comparison with the previous version | client-side diff of two server documents | formulation page | read | e2e rnd |
| Approval Draft → Review → Trial → Approved / Rejected → Archived | `apply_action` | formulation page actions | roles per action | test_research; e2e rnd |
| Projects, trials, stability | Research Project, Formulation Trial (submit), Stability Study (+ readings) | `/research/projects`, `/trials`, `/stability` | R&D roles | test_research; e2e rnd |
| Approved version → BOM with traceability | `create_bom`; BOM `fo_formulation`, `fo_formulation_version` | "Create BOM" | BOM create + submit | test_research; e2e rnd |

## 8. Maintenance — IMPLEMENTED on ERPNext assets (next phase)

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Asset register | Asset (+ equipment fields); `register_asset` | `/maintenance/assets`, `/new`, `/:name` | Maintenance Manager | test_maintenance; e2e |
| Preventive schedules, checklists, assignees, reminders | Asset Maintenance, Team, Log (ERPNext) | `/maintenance/schedules`, `/tasks` | Maintenance roles | test_maintenance; e2e |
| Breakdowns, downtime, root cause, closure approval | Asset Repair (+ breakdown fields) | `/maintenance/breakdowns` | technician reports and repairs; manager closes | test_maintenance; e2e |
| Spare parts issue and cost | Asset Repair consumed items → Stock Entry (ERPNext) | breakdown page | Stock User to issue | test_maintenance; e2e |
| Dashboard | `api.maintenance.dashboard` | `/maintenance` | per section | test_maintenance; e2e |

## 9. Marketplaces — management IMPLEMENTED, connectors NOT CONNECTED (next phase)

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Channels and honest connection state | Marketplace Channel; `connectors.py` | `/marketplace`, `/channels/:name` | Marketplace Manager | test_marketplace; e2e |
| Catalogue mapping (no duplicate items) | Marketplace Listing | `/marketplace/listings` | Marketplace roles | test_marketplace; e2e |
| Stock to publish from available-to-sell, no double counting | `service.allocation` | `/marketplace/inventory` | Marketplace roles | test_marketplace; e2e |
| Orders once, → Sales Order | Marketplace Order; `make_sales_order` | `/marketplace/orders` | Marketplace roles + Sales User | test_marketplace; e2e |
| Returns into QC Hold; settlements and reconciliation | Marketplace Return, Marketplace Settlement | `/marketplace/returns`, `/settlements` | Marketplace / Accounts roles | test_marketplace |
| Sync engine, retries, idempotency, webhook | Marketplace Sync Log; `service.run_operation`; `api.marketplace.webhook` | channel page log | server | test_marketplace (mocked connector) |

## 10. Brand & marketing — IMPLEMENTED, Meta NOT CONNECTED (next phase)

| Capability | DocTypes / methods | Factory OS screen | Permission | Tests |
|---|---|---|---|---|
| Campaigns with approval | Marketing Campaign | `/marketing/campaigns` | Marketing roles | test_marketing; e2e |
| Content calendar, creatives, captions, approval | Marketing Content | `/marketing/content` | Marketing roles | test_marketing; e2e |
| Performance with source, ratios only from inputs | Campaign Performance | campaign page; `/marketing` | Marketing roles, Management read | test_marketing; e2e |
| Meta connection state | Meta Connection | `/marketing/meta` | Marketing Manager | test_marketing; e2e |

## 11. Integration Centre — states from records

`/integrations` reads `api.integrations.integrations`:
- marketplace channels and Meta from their records and logs;
- e-mail from Frappe's Email Account and Email Queue;
- WhatsApp, couriers, bank feeds and settlement feeds as **Not implemented**;
- GST as **Not configured**.
