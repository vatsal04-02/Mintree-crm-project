# Factory OS — next phase plan

Written 2026-11-05 after inspecting the merged branch (`claude/festive-feynman-8mue4s`, which now
contains `claude/cool-shannon-dszfvp`). Development only; nothing is deployed.

## 1. What exists (inspected, not assumed)

| Area | State | Evidence |
| --- | --- | --- |
| ERPNext v16.53.0 / Frappe v16.55.2, MariaDB 11.8, Valkey 8.1 | running on the dev bench | `deploy/dev`, runbook |
| `factory_ops` backend | QC quarantine and release, guards on every stock route, purchase approval limits, GRN batch/COA rules, two-stage production, wastage, sales channels, available-to-sell, FEFO + shelf-life eligibility, dispatch rules, master data import, role workspaces, reports | 154 backend tests + 3 front-end API tests + 3 demo tests |
| React front end `apps/web` (served by Frappe at `/factory`) | Command Center, the six modules below, Integration Centre (honest statuses), Planned Modules | e2e 44/44 re-run today |
| Six priority modules in React | **all six work end to end against real ERPNext records and role permissions** | e2e run (below) |
| Website extraction `tools/website_extraction/` | extractor, mapper to ERPNext import files, image fetcher, 19 offline tests | **never run against the live site**: `vmintree.in` is blocked in this environment |
| Local demo `deploy/demo/` | `reset-demo.sh` (only a site marked `fo_demo_site`), DEMO seeder, 14-step scenario (22 checks), browser check | `DEMO_GUIDE.md` |
| R&D, Maintenance, Marketplaces, Meta | **not built** (listed as planned) | `/planned` page |

### The six priority modules, verified today

`apps/web/e2e/run.mjs` against the Frappe-served build, nine SAMPLE role users: **44/44**. It
creates and submits real documents by clicking in React and reads each outcome back from the
ERPNext API:
- **Procurement:** PO, refused self-approval, approval, GRN with lot/COA.
- **Inventory:** transfers, refused move out of QC Hold with no ledger rows.
- **Production:** work order, issue, manufacture into FG-QC-HOLD.
- **Quality:** release with inspection.
- **Sales:** order, FEFO pick, reservation, refused and then accepted delivery.
- **Accounts:** invoice from delivery, payment.

It also sweeps navigation for eight roles. Gaps listed in `FACTORY_OS_IMPLEMENTATION_STATUS.md`
(purchase invoices, returns, stock reconciliation, journal entries in Desk) remain and are recorded
in `OPEN_ISSUES.md`. They are not blockers for the daily path.

## 2. What is missing

1. **Empty and sparse screens.** List and report pages show one generic "No … in tab" line. They give
   no reason, no prerequisite and no next action. Lists have no search and stop at 100 rows.
2. **R&D / formulation management:** nothing.
3. **Maintenance and assets:** ERPNext has Asset, Asset Maintenance (schedules, tasks, assignees),
   Asset Maintenance Log and Asset Repair (failure date, downtime, stock consumption, cost).
   Missing: breakdown severity, root cause, closure approval, a factory dashboard and React screens.
4. **Marketplaces:** nothing beyond the sales-channel field and D2C import.
5. **Meta / brand marketing:** nothing.
6. **Integration Centre:** static list. It must read real configuration and sync logs.
7. **Real catalogue in the demo:** blocked on network access (see §5).

## 3. What will be developed, in order

| # | Work | Approach |
| --- | --- | --- |
| 1 | Empty / loading / error states, list search and paging, design system update | extend existing `ListPage`, `DataTable`, `ReportView`; no new visual world |
| 2 | **R&D** | new `factory_ops` module: Ingredient Category, Formulation (versioned, child rows with %), R&D Project, R&D Trial, Stability Study (+ readings). Server-side validation, role-checked state transitions Draft → Under Review → Trial → Approved / Rejected → Archived, approved version → BOM with a link back, demo formulations blocked from real BOMs. React screens. |
| 3 | **Maintenance** | reuse ERPNext Asset, Asset Maintenance, Asset Maintenance Log and Asset Repair; add only custom fields (severity, root cause, closure approval, department) and a dashboard API computed from records; spare parts through ERPNext stock. React screens. |
| 4 | **Marketplaces** | Marketplace Channel (settings and state per channel), Marketplace Listing (SKU ↔ Item, one Item for many channels), Marketplace Order (→ standard Sales Order with channel and external ID), Marketplace Sync Log, stock allocation from the central eligibility rule so published quantities never exceed available-to-sell in total; connector adapters per provider that refuse to call out without verified credentials (state `AWAITING CREDENTIALS` / `ACCESS REQUIRED`); background jobs, idempotency, retry. React screens. |
| 5 | **Meta / marketing** | Marketing Campaign, Marketing Content (calendar + approval), Campaign Performance (every figure carries its source: Manual, Meta API, or DEMO); Meta connector `NOT CONFIGURED`. React screens. |
| 6 | Integration Centre | statuses read from the channel / connector records and their sync logs; only a verified API test may set Connected. |
| 7 | Demo population | extend `factory_ops.demo` (only on `fo_demo_site`): R&D, maintenance, marketplace and marketing DEMO records, more procurement/QC/finance records, stock so Available to Sell has rows. |
| 8 | Tests and docs | backend tests per module (validation, permissions, workflow, mocked connectors), front-end unit tests, e2e additions, all Part 13 documents. |

## 4. Rules kept throughout

- ERPNext and Frappe are not modified. Everything goes through Frappe's API with server-side
  permission checks; React never writes to MariaDB.
- No fake figures, no fake connection badges, no invented formulas, suppliers or QC limits as
  Mintree data. Every synthetic record says `DEMO - NOT REAL`. Formulations also say
  `NOT FOR COMMERCIAL PRODUCTION`.
- Existing tests are kept and must stay green.

## 5. Known blockers

- **`vmintree.in` is unreachable from this environment** (proxy refusal, no DNS). The extraction must
  be run on an internet-connected machine (`DEMO_GUIDE.md` §1). Until then:
  - no real product appears in the demo;
  - the brand palette cannot be derived from the website, so the existing deep-mint palette is kept;
  - marketplace demo orders use only items that exist on the demo site.
- **Marketplace and Meta credentials** do not exist. Connectors stay in "awaiting credentials" or
  "access required" states. Official API documentation must be checked against a real account
  before any live call is written.
