# Handoff notes

Context for whoever continues this work: FlowHQ, the client, or a new Claude Code session in a fresh
container. Last updated 2026-11-05: **Factory OS React front end** built on top of the Milestone 6 state
(Milestone 6 Parts E-F are still open; see below).

## Where things stand

- **Branch:** `claude/cool-shannon-dszfvp` (continues `claude/festive-feynman-8mue4s`; history kept,
  nothing rewritten). Everything is committed and pushed. No pull request has been opened.
- **Stack (pinned, verified):**
  - Frappe v16.55.2 and ERPNext v16.53.0;
  - CPython 3.14 and Node 24;
  - MariaDB 11.8;
  - Valkey 8.1 instead of Redis (DECISIONS D-004).
- **Custom app:** `apps/factory_ops` (GPL-3.0), symlinked into the bench. ERPNext core is never
  modified.
- **Done and tested:**
  - development environment;
  - QC quarantine and release engine (QC Release, QC Deviation, QC Retest, guards on every stock route);
  - purchase and inventory: SAMPLE company, approval limits, GRN supplier batch/dates/COA, Stock by QC
    Status report;
  - production: SAMPLE BOMs, two-stage Work Orders, configurable production warehouses, wastage
    write-offs, batch label (`PRODUCTION_WORKFLOW.md`);
  - sales, dispatch and accounts: channels and D2C import, credit limits, available-to-sell, FEFO
    pick and reservation, shelf-life segregation, dispatch records, invoices from deliveries,
    payments, receivables, dashboard (`SALES_DISPATCH_ACCOUNTS.md`). No GST (no GSTIN).
- **Test evidence:** `PHASE_1_TEST_RESULTS.md`.
  - 93 tests pass (77 earlier + 16 production) on the dev bench; 92 passed twice in a row on a clean,
    independent bench before the last one-test fix; a site installed from nothing has the full setup.
  - 114 tests pass (93 earlier + 21 sales) on the dev bench, on the clean independent bench, and in CI
    (commit 15f07a0: 114 OK, lint OK).
  - HTTP acceptance 16/16 (purchase/QC) and 15/15 (production); browser checks 17/17 (QC) and 14/14
    (production); workers and scheduler verified running jobs.
- **Milestone 6 (in progress, see the next section).**
- **Not started (by instruction):** R&D, marketplace integrations, courier/Meta integrations, AI,
  eBMR, GST activation, a React frontend, production deployment.

## Factory OS front end (latest work)

- `apps/web` is the React front end again (D-040..D-044). It is served by Frappe at `/factory` on the
  same origin as Desk; it uses the Frappe session and the standard REST API, plus one new read-only
  endpoint `factory_ops.api.factory_os.boot` (tests: `tests/test_factory_os_api.py`).
- All six modules work end to end in the browser as the SAMPLE role users:
  `apps/web/e2e/run.mjs`, 36/36 checks. Docs: `FACTORY_OS_ARCHITECTURE.md` (route map),
  `FACTORY_OS_FRONTEND_CAPABILITY_MAP.md`, `FACTORY_OS_API_MAPPING.md`,
  `FACTORY_OS_UI_DESIGN_SYSTEM.md`, `FACTORY_OS_IMPLEMENTATION_STATUS.md` (per-module reports).
- After a fresh container: `pnpm install` at the repo root, `cd apps/web && pnpm build`, and link
  the assets once: `ln -sfn <repo>/apps/factory_ops/factory_ops/public <bench>/sites/assets/factory_ops`
  (what `bench build --app factory_ops` does). The build output is git-ignored.
- Running `git checkout` on app files as root leaves them owned by root; Frappe's developer-mode
  test setup then cannot rewrite Number Card JSON and every test class fails in setUpClass.
  `chown -R frappe:frappe <repo>` fixes it.

## Milestone 6: state at this handoff

| Part | State | Commit |
| --- | --- | --- |
| A. Shelf-life eligibility fix | **done, tested** | `a36f213` |
| B. Master data import + quality masters | **done, tested** | `11ad141` |
| C. Role workspaces | **built, unit + browser tested** | `d586567` |
| D. Reports | **built, tested** | same commit as C |
| E. Quality gates | **partly done** (list below) | — |
| F. Documentation | **not done** (list below) | — |

**A. One eligibility rule** (`inventory/batch_eligibility.py`): `check_batch` (expired / below minimum
shelf life; exactly at the minimum is eligible; setting read on every call) and quantities built
from ERPNext v16's own primitives (ledger batches, pinned and quantity-only reservations,
picked-not-reserved). Used by Available to Sell, Sales Order reservation (ineligible pins are
re-pinned), Pick List suggestions (ineligible rows replaced), Delivery Note (rows without a batch
get eligible batches when a minimum is set), G6 and segregation (now only a safeguard). 10 new
tests; a mutation check (fix unhooked) fails 3 of them.

**B. Master Data Import** DocType (`factory_ops/doctype/master_data_import`, engine
`master_data/importer.py`): Validate (row / column / value / reason, nothing written) -> Import
(only when clean, re-validates, all-or-nothing in one savepoint, user's own permissions). Types:
Items, Suppliers, Customers, BOMs, Opening Stock, Item Prices. XLSX/CSV templates generated from the
same spec (`master_data/templates/`, regenerate with
`bench --site <site> execute factory_ops.master_data.templates.write_templates`). SAMPLE inspection
templates per group, brand, workstations, operations. Fixed: QI type now follows the item group
(BULK In Process, FG Outgoing). 15 tests.

**C. Workspaces** (`setup/workspaces.py`, applied on every migrate): Management, Procurement,
Stores and Warehouse, Production Floor, Quality Control, Sales and Dispatch, Factory Accounts. Each
is a role-restricted Workspace page (number cards, charts, shortcuts, link cards) in **its own
custom navigation module** with a one-item v16 `Sidebar` and a role-restricted Desktop Icon. New
role **Management Viewer** (read + report only). New ledger-based cards in
`setup/dashboard_data.py`.

**D. Reports:** `Wastage by Reason` (total = GL wastage account), `RM PM Requirements` (open
Work Order need vs usable stock, QC Hold, PO, MR, reorder level), Dispatch Eligibility column in
Stock by QC Status.

**Test state at handoff:** Milestone 6 modules pass on the dev bench: batch eligibility 10/10,
sales 21/21, lifecycle 13/13, master data 15/15, workspaces 13/13. **Full suite on the dev bench at
handoff: Ran 152 tests in 554.9 s, OK.** Not yet run for Milestone 6: the clean bench and CI. Browser check `deploy/dev/ui_check_workspaces.js`: **51/51** (each of 10
SAMPLE users sees exactly their workspaces, each opens in its own shell, cards load, another role's
workspace is refused, import form and new reports load).

**Still to do for Milestone 6:**
1. Full suite on the dev bench and on the clean bench (`~/clean-bench`, migrate first); CI on the
   pushed commit.
2. Re-run the earlier HTTP acceptances (`acceptance_http.py`, `acceptance_production_http.py`,
   `acceptance_sales_http.py`) and browser checks (`ui_check*.js`) after the Milestone 6 changes;
   Part A changed Delivery Note batch choice when a minimum shelf life is set.
3. An HTTP-level import check: valid and invalid XLSX through the Master Data Import form as SAMPLE
   users (unit tests cover it in-process only).
4. Documentation (Part F): DECISIONS D-034 (eligibility), D-035 (import), D-036 (workspaces /
   navigation modules), D-037 (Management Viewer and dashboard figures), D-038 (reports);
   IMPLEMENTATION_PROGRESS (the brief calls it PROGRESS.md), REVISED_PHASE_1_ROADMAP (the brief's
   IMPLEMENTATION_PLAN.md), OPEN_ISSUES, PHASE_1_TEST_RESULTS, a master-data import guide, a role
   and permission matrix, workspace documentation.
5. Final report to the client in the brief's ten-point format; Milestone 6 is not complete until
   1-4 pass.

## Read these first

1. `IMPLEMENTATION_PROGRESS.md`: what was built per milestone.
2. `DECISIONS.md`: D-001 to D-033, the why behind every non-obvious choice (D-020 to D-025: production;
   D-026 to D-033: sales). Milestone 6 decisions are summarised in this file until D-034+ are written.
3. `OPEN_ISSUES.md`: client inputs still needed and technical gaps.
4. `DATABASE_AND_WORKFLOW_DESIGN.md` §3: the QC workflow as implemented (spike result in §3.2a).
5. `DEPLOYMENT_RUNBOOK.md`: how to rebuild the environment and run every check.
6. `PRODUCTION_WORKFLOW.md`: the production flow, its configuration and what is excluded.
7. `SALES_DISPATCH_ACCOUNTS.md`: the sales-to-cash flow, settings, controls and exclusions.

## The container is temporary

The bench, sites, database and Docker volumes from this session live only in the session's container
and disappear with it. The code and docs are safe in Git. To rebuild, as a non-root user with Docker,
`uv`, Node 24 and the apt packages listed in the runbook:

```bash
./deploy/dev/setup-dev.sh
```

```bash
bench --site factory.localhost execute factory_ops.setup.sample_company.setup_dev_site
```

```bash
bench --site factory.localhost execute factory_ops.setup.sample_users.create_sample_users
```

```bash
bench --site test.localhost run-tests --app factory_ops
```

Session-specific details you will not need elsewhere:
- In this container bench ran as user `frappe` because bench refuses root.
- The outbound proxy is reachable only from the host, which is why bench runs on the host rather
  than in the `frappe/bench` container (D-002).
- Docker Hub refused anonymous pulls (HTTP 429). The images were pulled from `mirror.gcr.io` and tagged
  with the compose names (runbook). The container also needed `dockerd` started, a `frappe` user in the
  `docker` group, `mariadb-client`/`libmariadb-dev` installed and Node 24 from `/opt/node24`.

## Lessons learned (would cost time again)

- **Bundle names after submit:** they are not on the in-memory document. Read batches for a voucher
  from `Serial and Batch Bundle` / `Serial and Batch Entry` in the database. This caused three
  separate bugs.
- **Fresh v16 site defaults:**
  - batch tracking is off;
  - only Item Manager may create Batches;
  - QC roles lack Serial and Batch Bundle, Company and Stock Ledger Entry rights.
  - `setup/install.py` and `setup/sample_company.py` handle all of these. ERPNext's test bootstrap
    hides most of them, so check on a real site (HTTP and browser scripts).
- **New Single fields:** a field added to an existing Single DocType gets no default on upgrade.
  `ensure_single_defaults` in `install.py` back-fills them.
- **Pick List timing:** locations are computed in `before_save`, after `validate`.
- **Perpetual inventory:** `_Test Company` has it off. GL tests use their own perpetual-inventory
  company.
- **Test isolation:** never call `frappe.db.commit()` inside a test. It leaks data into later tests.
- **Killing the dev server:** `pkill -f` with the server's command line also matches your own shell.
  Use `pgrep -u frappe -f "serve --port 8000"`.
- **Shell edits after formatting:** a silent `str.replace` miss after ruff reformatting hid a broken
  test fixture. Use exact edits, or `assert old in s` before replacing.
- **ERPNext's Work Order defaults fight QC:** component sources come from the item-group default (the QC
  Hold warehouse), and *Use Multi-Level BOM* defaults to on (explodes the bulk). Both are handled in
  `production/controls.py` (D-021, D-022).
- **Re-running tests on one site:** ERPNext's test bootstrap saves FIFO each run; never set another
  valuation method in test setup (D-024).
- **A refused call inside a test does not roll back by itself.** Wrap it in a savepoint (see
  `assert_refused` in `test_production.py`), as a real failed request would roll back.
- **Standard Print Formats** reload on migrate only when `modified` changes; label page size and margins
  must be in the format's `css` (`@page`).
- **ERPNext v16 Pick Lists submit batch bundles that move no stock.** Count a bundle as stock only if
  a live Stock Ledger Entry points to it (`LEDGER_BUNDLE`, D-031).
- **ERPNext v16 reservation order:** reserve from the Pick List; an order with reserved stock cannot
  be picked (D-026).
- **ERPNext's FEFO ignores a minimum shelf life:** handled by segregation, not by patching (D-028).
- **A module's files live in a folder named after the module** (`Sales Ops` → `sales_ops/`), or its
  reports never register.
- **Container restarts:** `dockerd` must be started again (`docker start` the six containers); the
  benches survive on disk.
- **Frappe v16 navigation is module-based.** `Workspace Sidebar` is an archive (editable only during
  migrate, "nothing renders it"); the live menu is `Sidebar`, keyed by module, and a workspace opens in
  its module's shell. Several role pages in one module all opened in the same shell; hence one custom
  navigation module per role workspace. A sidebar listing documents is shown to anyone who can read
  one of them, so role sidebars hold only their role-restricted page.
- **v16 naming rules:** a workspace's URL slug may not equal a DocType's ("Warehouse" is refused, but
  only outside migrate); a sidebar may not carry another module's name ("Production").
- **Desktop icons** take the module of the Workspace their link names; `get_desktop_icons` without a
  boot payload returns nothing, so verify icons in a browser. This site's home screen is the Apps
  screen, not the icon grid.
- **Number Cards:** named after their label; a Custom-method card is readable only by users who can
  read its `document_type`. `test_every_card_on_a_workspace_is_readable_by_its_users` guards this.
- **`File.get_content()`** returns text for a CSV and bytes for an XLSX.
- **ERPNext dates a blank Item Price `valid_from` as today**; duplicate checks must do the same.
- **`frappe.get_print` with an unknown format name** silently falls back to "Standard"; a missing format
  shows up as wrong content, not as an error.

## Next task

Finish Milestone 6 (the list above). Then, per the roadmap: bank statement import and
reconciliation; statutory GST only once the client provides the GSTIN and the accountant approves the
setup; staging deployment when the VPS credentials arrive.

## Waiting on the client (blocks real data and statutory setup)

- **Statutory:** legal entity, GSTIN and state.
- **Quality:** QC specifications and SLA hours.
- **Dispatch:** minimum shelf life for dispatch.
- **Purchase:** approval limits per user.
- **Masters:** real master data.
- **Production:** real formulas, batch sizes, process loss, wastage reasons and label content.
- **Sales:** real customers, credit limits, payment terms, channel prices, minimum shelf life for dispatch.
- **Milestone 6:** who holds Management Viewer; whether salespeople see receivables and buyers see
  QC-hold counts (both hidden now, by standard permissions); whether opening stock of QC items may go
  straight to Usable warehouses (allowed now) or must pass QC; real inspection parameters and limits
  (SAMPLE now); reorder levels; real master data files.
- **Accountant:** chart of accounts, rounding and invoice numbering.
- **Commercial and infrastructure:** lawyer review of the GPL position; FlowHQ day rate; staging and
  production VPS credentials.
