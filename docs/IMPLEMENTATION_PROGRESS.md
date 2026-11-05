# Implementation progress

## Milestone 1 — Development environment and application foundation — **done**

**Built**
- Development services: MariaDB 11.8.9 and two Valkey 8.1 instances in Docker (`deploy/dev/compose.yaml`).
- Bench 5.31.1 on CPython 3.14.6 + Node 24.22.2, Frappe `v16.55.2`, ERPNext `v16.53.0` from tags.
- Sites: `factory.localhost` (development, ERPNext + factory_ops) and `test.localhost` (automated tests).
  A third site `fresh.localhost` was built from nothing to prove a clean install (see test results).
- Desk verified: `/api/method/ping` → pong; login as Administrator succeeds; `/desk` returns 200 with boot data.
- `factory_ops` Frappe app (GPL-3.0 licence text), kept in this repo at `apps/factory_ops` and
  symlinked into the bench. Modules: Factory Ops, Quality, Inventory.
- Setup applied on install and on every migrate: roles QC Officer / QA Manager, warehouse types
  (QC Hold, Usable, Rejected, Retained Samples, Job Work), six `fo_` custom fields, custom permissions.
- Test harness on ERPNext's test bootstrap; lint (ruff) and format clean.
- CI workflow (`.github/workflows/factory-ops-ci.yml`, not yet run) and `deploy/dev/setup-dev.sh`.

**Acceptance**
| Criterion | Result |
| --- | --- |
| Dev environment starts | Yes |
| Desk accessible | Yes (HTTP-level check) |
| factory_ops installs | Yes, on 3 sites |
| App appears in the system | `bench list-apps`: frappe 16.55.2, erpnext 16.53.0, factory_ops 0.0.1 |
| A DocType can be created | QC Release, QC Deviation, Factory Ops Settings created and migrated |
| Automated tests execute | 44 tests, all pass |
| Install and migrate repeatable | migrate run repeatedly; `test_setup_is_idempotent`; clean install on `fresh.localhost` |

## Milestone 2 — QC quarantine and release engine — **core done, tests green**

**Spike first:** `tests/test_spike_qi_lifecycle.py`, 8 tests on standard ERPNext behaviour, all pass.
Result and design changes are in `DATABASE_AND_WORKFLOW_DESIGN.md` §3.2a and DECISIONS D-006.

**Built**
- Warehouse tree per company (`setup/warehouses.py`): QUARANTINE (RM/PM/BULK/FG/RETURNS-QC-HOLD),
  USABLE (RM/PM/BULK/FG-STORES, WIP-PRODUCTION), REJECTED, RETAINED-SAMPLES, JOB-WORK, with the
  default release destination on each hold warehouse.
- **QC Release** DocType (Release, Partial Release, Conditional Release, Reject): draft transfer kept in
  sync, "Create Quality Inspection" action, quantity check under a batch row lock, QI checks,
  deviation check, segregation of duties, role checks, submit and cancel of the transfer in the same
  transaction.
- **QC Deviation** DocType: QA Manager approval by submit; the author cannot approve their own.
- **Guards G1–G3, G6** on Stock Entry, Purchase Receipt, Purchase Invoice, Delivery Note, Sales Invoice,
  Pick List, Stock Reservation Entry, Work Order, Material Request, Subcontracting Order and Stock
  Reconciliation (`inventory/guards.py`). Also: QC items must be received/produced into QC Hold, and
  sales returns must come back into QC Hold.
- **G4/G5** on QC Release (`quality/doctype/qc_release/qc_release.py`).
- **Batch QC status** derived field + nightly consistency job (`quality/batch_status.py`).
- **QC Queue** script report (held batches, age, SLA, overdue, origin, open release).
- **Factory Ops Settings**: minimum shelf life for dispatch, QC SLA hours (SAMPLE values).

**Files**
```
apps/factory_ops/                         new Frappe app (GPL-3.0)
  factory_ops/hooks.py                    doc_events for 11 DocTypes, install/migrate hooks, scheduler
  factory_ops/constants.py                roles, warehouse types, tree, decisions
  factory_ops/setup/{install,custom_fields,warehouses}.py
  factory_ops/inventory/{guards,stock_queries}.py
  factory_ops/quality/batch_status.py
  factory_ops/quality/doctype/{qc_release,qc_deviation}/
  factory_ops/quality/report/qc_queue/
  factory_ops/factory_ops/doctype/factory_ops_settings/
  factory_ops/tests/{utils,test_spike_qi_lifecycle,test_qc_release,test_guards,test_install_and_queue}.py
deploy/dev/{compose.yaml,setup-dev.sh}
.github/workflows/factory-ops-ci.yml
docs/{IMPLEMENTATION_PROGRESS,PHASE_1_TEST_RESULTS,DEPLOYMENT_RUNBOOK}.md (new)
docs/DECISIONS.md, docs/OPEN_ISSUES.md (renamed from decisions.md / open-items.md and updated)
```

**Known limitations** — see `OPEN_ISSUES.md` items 2–6.

## Validation round (2026-11-05) — **done**

| Brief item | Result |
| --- | --- |
| 1. `setup-dev.sh` on a clean environment | Run as a new OS user with an empty home from a fresh GitHub clone; found and fixed two bugs; completed and its test site passed 72/72 |
| 2. CI | Run on GitHub Actions; run 1–2 failed (two real bugs, fixed), runs 3–4 green: 72 tests OK, lint OK |
| 3. Four guard-test gaps | Replaced by full document lifecycles: Pick List from a Sales Order, Stock Reservation from a submitted SO, Subcontracting Order via ERPNext's own PO→SCO helpers, sales return via `make_sales_return`. One real bug found (Pick List) |
| 4. PI with stock, manufacturing output, repack, sales returns | Full-lifecycle tests; QC items may no longer be received by stock-updating invoice (D-012) |
| 5. Rollback | In-process: refused movements write nothing; failure after ledger rows rolls back completely. Over HTTP: same, on the dev site. One real bug found (FEFO batches after submit) |
| 6. Send for Re-test | QC Retest DocType + "Send for Re-test" button, QA Manager only |
| 7. Re-tested material | Needs a fresh accepted QI and a new QC Release; the old QI cannot be reused (tested) |
| 8. Valkey in all docs | Architecture, hosting, licences, runbook updated; remaining "Redis" mentions are bench flags or history |
| 9. Browser UI | Playwright check of the QC screens as QC officer and QA manager, 17/17, screenshots committed; a permission popup was found by looking at the screenshots and fixed |

## Milestone 3 — Purchase and inventory — **done (SAMPLE data)**

**Built (standard ERPNext where possible)**
- SAMPLE company via ERPNext's setup wizard: "SAMPLE Mintree Manufacturing" (SMM), INR, India,
  standard chart, perpetual inventory, financial years 2026-2027 and 2027-2028 (April–March).
- Item groups `Factory Items` → RM, PM, BULK, FG with factory controls (QC release required, COA
  required for RM) and per-company default warehouse = the group's QC Hold warehouse.
- UOMs Kg/Gram, Litre/Millilitre conversions; Nos whole-number. SAMPLE suppliers (2), customer (1),
  items (RM×2, PM, BULK, FG) — all labelled SAMPLE.
- Purchase chain on standard documents: Material Request (purchase requisition) → RFQ → Supplier
  Quotation → Purchase Order → Purchase Receipt → Purchase Invoice.
- **Purchase Approval Limit** DocType; PO submit requires a different user with a sufficient limit.
- **GRN**: QC items default to their QC Hold warehouse; rejected quantity defaults to REJECTED;
  supplier batch no, manufacturing date, expiry date and COA captured on the receipt row and written
  to the Batch created on submit.
- Stock Settings configured in code (batch tracking, no negative stock, FEFO, moving average,
  reservations, QI Stop actions).
- **Stock by QC Status** report; standard Stock Ledger, Stock Balance work on the data (tested).
- Sample users (one per role) for the dev site, random passwords outside the repository.

**Files (this round)**
```
apps/factory_ops/factory_ops/
  purchase/approval.py, purchase/doctype/purchase_approval_limit/
  inventory/receiving.py, inventory/items.py, inventory/report/stock_by_qc_status/
  quality/doctype/qc_retest/
  setup/sample_company.py, setup/sample_users.py (+ custom_fields, install updated)
  tests/test_qc_retest.py, test_lifecycle_routes.py, test_purchase.py, test_acceptance_e2e.py
deploy/dev/acceptance_http.py, deploy/dev/ui_check.js, deploy/dev/setup-dev.sh (fixed), compose.yaml
.github/workflows/factory-ops-ci.yml (fixed)
docs/screenshots/qc/*.png
```

## Milestone 4 — Production — **done (SAMPLE data), acceptance tests pass**

Workflow, configuration and controls: `PRODUCTION_WORKFLOW.md`. Decisions D-020 to D-025. Test
evidence: `PHASE_1_TEST_RESULTS.md` (Milestone 4 section).

**Built (standard ERPNext manufacturing + factory_ops controls)**
- SAMPLE BOMs: BULK 100 kg from two RMs with 2 % process loss; FG 1,000 units from 30 kg bulk +
  1,000 bottles (bulk as a sub-assembly). Manufacturing Settings: backflush on material transferred,
  no overproduction.
- Work Order defaults from configuration: default BOM (for API/import users), WIP from the Company,
  output into the item's QC Hold warehouse, each component from its *Production Source Warehouse*
  (Item Default, item before group) or the QC release destination. Only rows ERPNext filled are
  redirected; anything entered by a user is kept and guarded.
- Two-stage rule: a QC-controlled sub-assembly (bulk) is never exploded into its raw materials.
- BOM guard: no QC Hold / Rejected source warehouse on a BOM line.
- Wastage: **Wastage Reason** DocType, Stock Entry Type "Wastage" (flag *Wastage write-off*), reason
  required on every row, posting to the Company's *Wastage Expense Account*. Ordinary issues and
  manufacturing consumption need no reason; a reason on them is refused.
- **Batch Label** print format: 100 × 60 mm PDF with batch, item, dates, quantity, Work Order and QC status.
- SAMPLE production user (Manufacturing User/Manager + Stock User).

**Found and fixed while validating (not just written)**
| Problem | Effect | Fix |
| --- | --- | --- |
| ERPNext fills component sources from the item-group default, i.e. the QC Hold warehouse | every new Work Order was refused by the guard | configurable production source warehouse; only ERPNext-filled rows redirected (D-021) |
| *Use Multi-Level BOM* defaults to on | the FG order consumed RM directly, skipping bulk QC | two-stage rule (D-022) |
| First wastage rule applied to every Material Issue | ordinary issues would be mislabelled as wastage | wastage is a flagged Stock Entry Type with its own account (D-023) |
| Work Order BOM filled only in the browser | REST / import users got "BOM No is mandatory" | server-side default BOM |
| Test setup set Moving Average, ERPNext's bootstrap saves FIFO | every second test run on the same site failed at discovery (pre-existing; CI never saw it) | tests keep ERPNext's test valuation method (D-024) |
| Label rendered over two pages with 15 mm margins | unusable label | page size and margins in the Print Format's `@page` css (D-025) |

**Files**
```
apps/factory_ops/factory_ops/
  production/controls.py                              Work Order defaults, two-stage rule, BOM guard, wastage
  production/doctype/wastage_reason/                  Wastage Reason DocType
  production/print_format/batch_label/                Batch Label print format
  hooks.py, modules.txt                               Work Order, BOM, Stock Entry, Stock Entry Type hooks; Production module
  setup/custom_fields.py                              Item Default, Company, Stock Entry Type, Stock Entry Detail fields
  setup/install.py                                    Wastage stock entry type
  setup/sample_company.py, setup/warehouses.py        BOMs, wastage reasons/account, production sources, WIP, Manufacturing Settings
  setup/sample_users.py                               SAMPLE production user
  tests/test_production.py                            16 tests (13 controls, 3 end-to-end on a perpetual-inventory company)
  tests/utils.py                                      valuation-method fix (D-024)
deploy/dev/acceptance_production_http.py              HTTP production acceptance (15 checks)
deploy/dev/ui_check_production.js                     browser check of production screens (14 checks)
docs/PRODUCTION_WORKFLOW.md (new), DECISIONS.md, OPEN_ISSUES.md, PHASE_1_TEST_RESULTS.md, HANDOFF_NOTES.md,
DEPLOYMENT_RUNBOOK.md, docs/screenshots/production/*.png
```

**Not included** (`PRODUCTION_WORKFLOW.md` §7): barcode/QR and ZPL label, yield variance alert,
rework orders, electronic batch record, operations/job cards, Production Plan/MRP configuration,
real formulas.

## Milestone 5 — Sales, dispatch and accounts — **done (SAMPLE data, no GST), acceptance tests pass**

Workflow, settings and controls: `SALES_DISPATCH_ACCOUNTS.md`. Decisions D-026 to D-033. Test evidence:
`PHASE_1_TEST_RESULTS.md` (Milestone 5 section).

**Built (standard ERPNext selling + factory_ops controls)**
- Customers and distributors: customer groups Distributors / B2B Customers / D2C Consumers, SAMPLE
  customers with per-company credit limits, a SAMPLE selling price.
- Sales Orders with **sales channel** and **external order number**. D2C orders need the number, and
  a duplicate on the same channel is refused. Both carry to the DN and invoice. D2C import template
  (`docs/templates/d2c_sales_orders_import.csv`) through standard Data Import.
- **Credit limits:** ERPNext's check, credit controller = Sales Manager.
- **Available to Sell** (report + enforcement on reservation): Usable, in date, at or above the
  minimum shelf life, minus reservations.
- **Reservation** only of released, sellable stock; FEFO **Pick Lists**; reservation of picked batches.
- **Shelf-life segregation** (daily + on demand) into a new NOT-FOR-DISPATCH warehouse, so FEFO never
  proposes short-dated stock; reserved stock that turns short-dated is refused at dispatch with a clear message.
- **Dispatch:** Delivery Note with transporter / LR-AWB / vehicle (required by setting), Packing
  Slips, **Dispatch Register** report.
- **One stock path:** Sales Invoices from Delivery Notes only, no stock update; Selling Settings require
  SO → DN → SI.
- **Payment Entries**, standard Accounts Receivable / Summary.
- **Sales and Dispatch** dashboard (6 number cards, 4 weekly charts).
- SAMPLE users: dispatch (Stock User + Delivery User), sales manager; Data Import for Sales Manager.

**Found and fixed while validating**

| Problem | Effect | Fix |
| --- | --- | --- |
| ERPNext v16 Pick Lists submit batch bundles that move no stock; factory_ops balance queries counted them | picked stock looked already gone (150 picked of 200 → 50 sellable); affected QC Release, QC Queue, Stock by QC Status since Milestone 2 | balances count only bundles with a live stock-ledger row (D-031) |
| v16 refuses a Pick List for an order with reserved stock | planned "reserve then pick" impossible | reserve from the Pick List (D-026) |
| FEFO ignores minimum shelf life (reservation, Pick List, DN) | short-dated batch picked first, whole document refused | daily shelf-life segregation (D-028) |
| Reserved batch becomes short-dated | ERPNext failed inside its reservation update with "Serial and Batch Bundle None not found" | refused at validate with a clear message |
| External order ID is `no_copy` | lost on the DN made from the order | carried by a hook (D-030) |
| Accounts Manager cannot submit Sales Orders | could not act as credit controller | Sales Manager (D-032) |
| Stock User cannot select accounts | dispatch user could not create a DN (HTTP check) | standard Delivery User role (D-032) |
| Data Import is System Manager only | sales could not import D2C orders | granted to Sales Manager (D-032) |
| Module folder must match module name | reports not registered | package `sales_ops/` |
| Milestone 3 HTTP script made a DN without a Sales Order | refused under the new SO → DN rule | script follows SO → DN, still tests rollback after ledger rows |

**Files**
```
apps/factory_ops/factory_ops/
  sales_ops/controls.py               channel / duplicate orders, sellable reservation, one stock path, dispatch details,
                                      channel carried to DN/SI, reserved-batch dispatch check
  sales_ops/available_to_sell.py      sellable / reserved / available per item and warehouse
  sales_ops/shelf_life.py             segregation to NOT-FOR-DISPATCH (daily, on demand)
  sales_ops/report/available_to_sell/, sales_ops/report/dispatch_register/
  setup/dashboards.py                 Sales and Dispatch dashboard
  setup/{custom_fields,install,sample_company,sample_users}.py, constants.py, hooks.py, modules.txt
  inventory/stock_queries.py (+ qc_queue, stock_by_qc_status)   LEDGER_BUNDLE fix (D-031)
  factory_ops/doctype/factory_ops_settings/   dispatch details, invoice stock update settings
  tests/test_sales.py                 21 tests; tests/utils.py users
deploy/dev/acceptance_sales_http.py   HTTP acceptance (19 checks); acceptance_http.py updated
deploy/dev/ui_check_sales.js          browser check (25 checks)
docs/SALES_DISPATCH_ACCOUNTS.md, docs/templates/d2c_sales_orders_import.csv, docs/screenshots/sales/
```

**Not included:** GST / India Compliance / e-invoice / e-way bill (no GSTIN); marketplace and courier
integrations; AI; channel price lists, schemes, delivery trips; bank reconciliation (Milestone 6).

## Milestone 6 — Master data, role workspaces and reports — **done (SAMPLE data)**

Decisions D-034 to D-040. Guides: `MASTER_DATA_IMPORT_GUIDE.md`, `ROLES_AND_WORKSPACES.md`. Test
evidence: `PHASE_1_TEST_RESULTS.md` (Milestone 6 section).

**Built**
- **A. One shelf-life eligibility rule** (`inventory/batch_eligibility.py`, D-034) used by Available
  to Sell, reservation (ineligible pins re-pinned), Pick List suggestions (ineligible rows replaced),
  Delivery Note (eligible batches chosen when a minimum is set), the dispatch guard G6 and
  segregation (now a safeguard only). Exactly the minimum is eligible; the setting is read on every
  call. Picked stock leaves Available to Sell when picked, and is not subtracted again when reserved.
- **B. Master Data Import** (D-035): Items, Suppliers, Customers, BOMs, Opening Stock, Item Prices.
  Validate (row / column / value / reason, nothing written) → Import (only a clean file, all or
  nothing, the user's own permissions). CSV/XLSX templates generated from the same column
  definitions. SAMPLE quality masters: inspection templates per item group, brand, workstations,
  operations; the inspection type now follows the item group (BULK In Process, FG Outgoing).
- **C. Seven role workspaces** (D-036): Management, Procurement, Stores and Warehouse, Production
  Floor, Quality Control, Sales and Dispatch, Factory Accounts; each in its own navigation module
  with its own sidebar and role-restricted home icon. New read-only role **Management Viewer**
  (D-037). Stock-value and wastage figures from the ledger.
- **D. Reports** (D-038): Wastage by Reason (ties to the wastage GL account), RM PM Requirements
  (need vs usable stock, QC Hold, open POs and MRs, reorder level), Dispatch Eligibility column in
  Stock by QC Status.
- **E. Quality gates:** full suite on the development bench, on an independent clean bench and in
  CI; all earlier HTTP acceptances and browser checks re-run; new HTTP import check and workspace
  browser check.
- **F. Documentation:** this section, D-034 to D-040, the import guide, the role / permission matrix
  and workspace documentation, test results, open issues, roadmap.

**Found and fixed while validating Milestone 6**

| Problem | Effect | Fix |
| --- | --- | --- |
| Setup re-saved every Sidebar on each run; Frappe v16 allows that only in developer mode or migrate | CI red (tests call setup); hidden locally because the test site had developer mode on | unchanged documents are not re-saved; test site runs with developer mode off (D-036, D-039) |
| "Batches Awaiting QC" filters on permlevel-1 `fo_qc_status`; Management Viewer had only level 0 | Management workspace opened with a Permission Error (browser check) | level-1 read for Management Viewer; new test computes every card as every user (D-037) |
| "Batches Made (30 days)" used Timespan "last month" (= previous calendar month) | this month's batches never counted | "last 30 days"; test on every rolling card |
| No SAMPLE user held Item Manager | nobody could import items over HTTP | SAMPLE Master Data user (D-040) |
| Re-saving unchanged Number Cards in developer mode | timestamp-only diffs re-exported into the app folder | unchanged documents skipped |
| Sales HTTP check expected picked stock to stay available | failed after Part A | assertions updated to the stricter rule: down by the picked quantity at picking, not again at reservation |
| Workspace screenshots taken before charts loaded | empty charts in evidence | browser check waits for the network to settle |

**Files**
```
apps/factory_ops/factory_ops/
  inventory/batch_eligibility.py        the eligibility rule (A)
  master_data/importer.py, templates.py, templates/*.csv|xlsx      import engine and templates (B)
  factory_ops/doctype/master_data_import/                         the import form (B)
  setup/sample_company.py                SAMPLE inspection templates, brand, workstations, operations
  setup/workspaces.py, setup/dashboard_data.py                     workspaces, cards, Management Viewer (C)
  production/report/wastage_by_reason/, purchase/report/rm_pm_requirements/   reports (D)
  tests/test_batch_eligibility.py (10), test_master_data.py (15), test_workspaces.py (15)
deploy/dev/acceptance_import_http.py     HTTP import check (19 checks)
deploy/dev/ui_check_workspaces.js        browser check of workspaces (55 checks)
deploy/dev/setup-dev.sh                  developer mode only on the development site
docs/MASTER_DATA_IMPORT_GUIDE.md, docs/ROLES_AND_WORKSPACES.md, docs/screenshots/workspaces/
```

**Not included / moved:** bank statement import and reconciliation (listed after Milestone 5 as a
Milestone 6 candidate; not in the Milestone 6 brief, moved to the next milestone). Real master data,
real inspection limits and reorder levels wait on the client. Workspaces are Desk pages; no React or
Frappe UI frontend.

## Next milestones
7. Bank statement import and reconciliation; client review of workspaces and roles with real users.
8. Statutory setup once the client provides GSTIN and accountant-approved details; staging deployment
   once the VPS credentials arrive.
