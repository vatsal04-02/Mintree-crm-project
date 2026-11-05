# Handoff notes

Context for whoever continues this work: FlowHQ, the client, or a new Claude Code session in a fresh
container. Last updated 2026-11-05: **after Milestone 6, the Factory OS React front end and the
local demo tooling** (branches `claude/cool-shannon-dszfvp` and `claude/festive-feynman-8mue4s` merged).

## Where things stand

- **Branch:** `claude/festive-feynman-8mue4s` (history kept, nothing rewritten; Milestone 6 started
  on `claude/cool-shannon-dszfvp` and continues here). Everything is committed and pushed. No pull
  request has been opened.
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
    pick and reservation, dispatch records, invoices from deliveries, payments, receivables
    (`SALES_DISPATCH_ACCOUNTS.md`). No GST (no GSTIN);
  - Milestone 6: one shelf-life eligibility rule (D-034); validated all-or-nothing Master Data
    Import with templates (`MASTER_DATA_IMPORT_GUIDE.md`); seven role workspaces and the read-only
    Management Viewer role (`ROLES_AND_WORKSPACES.md`); Wastage by Reason and RM PM Requirements
    reports.
- **Test evidence (`PHASE_1_TEST_RESULTS.md`), final Milestone 6 code (4709bfe):**
  - 154 tests OK on the dev bench, on the clean independent bench, and in CI (run 14, lint OK);
  - HTTP: purchase/QC 16/16, production 15/15, sales 20/20, master data import 19/19;
  - browser: QC 17/17, production 14/14, sales 25/25, workspaces 55/55.
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


## Local demo (after Milestone 6)

- `docs/DEMO_GUIDE.md`: extract the public catalogue, build `demo.localhost` with
  `deploy/demo/reset-demo.sh`, run `deploy/demo/demo_scenario_http.py` (14 steps, 22 checks), and
  the walkthrough for Mintree.
- **Not done yet: the extraction itself.** `vmintree.in` is blocked by this environment's network
  policy. Everything else was verified with an invented fixture catalogue, and the demo site was
  rebuilt without it.
- Synthetic data lives only in `factory_ops/demo/data.py` (`DEMO-` codes, "(NOT REAL)" names). The
  seeder runs only on a site marked `fo_demo_site`.



1. `IMPLEMENTATION_PROGRESS.md`: what was built per milestone.
2. `DECISIONS.md`: D-001 to D-046, the why behind every non-obvious choice (D-020 to D-025: production;
   D-026 to D-033: sales; D-034 to D-039 and D-046: master data, workspaces, reports; D-040 to D-045: Factory OS front end).
3. `OPEN_ISSUES.md`: client inputs still needed and technical gaps.
4. `DATABASE_AND_WORKFLOW_DESIGN.md` §3: the QC workflow as implemented (spike result in §3.2a).
5. `DEPLOYMENT_RUNBOOK.md`: how to rebuild the environment and run every check.
6. `PRODUCTION_WORKFLOW.md`: the production flow, its configuration and what is excluded.
7. `SALES_DISPATCH_ACCOUNTS.md`: the sales-to-cash flow, settings, controls and exclusions.
8. `MASTER_DATA_IMPORT_GUIDE.md` and `ROLES_AND_WORKSPACES.md`: importing, roles, permissions, workspaces.

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
  read its `document_type`. A card's figure is computed with the user's permissions **including
  permlevel**: a filter on a level-1 field fails for a user without level-1 read.
  `test_every_card_on_a_workspace_computes_for_its_users` guards both.
- **Frappe Timespan "last month"** is the previous calendar month; use "last 30 days" for a rolling
  window.
- **Developer mode hides failures.** Frappe v16 lets an app's Sidebar be saved only in developer mode
  or during install/migrate. Keep developer mode off on the test site (CI and production have it off),
  and never re-save unchanged setup documents.
- **The importer uses the importing user's rights**: a SAMPLE user needs Item Manager etc. to import.
- **`File.get_content()`** returns text for a CSV and bytes for an XLSX.
- **ERPNext dates a blank Item Price `valid_from` as today**; duplicate checks must do the same.
- **`frappe.get_print` with an unknown format name** silently falls back to "Standard"; a missing format
  shows up as wrong content, not as an error.

## Next task

Per the roadmap: bank statement import and reconciliation; client review of workspaces and roles
with real users; statutory GST only once the client provides the GSTIN and the accountant approves
the setup; staging deployment when the VPS credentials arrive.

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
