# Handoff notes

Context for whoever continues this work: FlowHQ, the client, or a new Claude Code session in a fresh
container. Last updated 2026-11-05, end of Milestone 5 (sales, dispatch and accounts).

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
  - CI on GitHub Actions passes on commit e7d23e1 (run 8: 93 tests OK, lint OK).
  - HTTP acceptance 16/16 (purchase/QC) and 15/15 (production); browser checks 17/17 (QC) and 14/14
    (production); workers and scheduler verified running jobs.
- **Not started (by instruction):** R&D, marketplace integrations, AI.
- **Not yet built:**
  - import templates, workspaces and dashboards (Milestone 6).

## Read these first

1. `IMPLEMENTATION_PROGRESS.md`: what was built per milestone.
2. `DECISIONS.md`: D-001 to D-033, the why behind every non-obvious choice (D-020 to D-025: production;
   D-026 to D-033: sales).
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
- **`frappe.get_print` with an unknown format name** silently falls back to "Standard"; a missing format
  shows up as wrong content, not as an error.

## Next task (Milestone 6)

Milestone 5 has passed its acceptance tests. Next, per the roadmap:
- master-data import templates (items, BOMs, customers, suppliers, opening stock with batches);
- role workspaces and dashboards for each department;
- bank statement import and reconciliation;
- statutory GST only once the client provides the GSTIN and the accountant approves the setup.

## Waiting on the client (blocks real data and statutory setup)

- **Statutory:** legal entity, GSTIN and state.
- **Quality:** QC specifications and SLA hours.
- **Dispatch:** minimum shelf life for dispatch.
- **Purchase:** approval limits per user.
- **Masters:** real master data.
- **Production:** real formulas, batch sizes, process loss, wastage reasons and label content.
- **Sales:** real customers, credit limits, payment terms, channel prices, minimum shelf life for dispatch.
- **Accountant:** chart of accounts, rounding and invoice numbering.
- **Commercial and infrastructure:** lawyer review of the GPL position; FlowHQ day rate; staging and
  production VPS credentials.
