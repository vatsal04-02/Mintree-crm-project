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

## Next milestones
4. Production: bulk and FG BOMs, two-stage work orders, consumption, output to hold, FG release.
5. Sales, dispatch and accounts, and the end-to-end GL-reconciling test.
6. Master-data import templates, role workspaces, reports.
