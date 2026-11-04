# Handoff notes

Context for whoever continues this work: FlowHQ, the client, or a new Claude Code session in a fresh
container. Last updated 2026-11-05, end of the validation round and Milestone 3.

## Where things stand

- **Branch:** `claude/festive-feynman-8mue4s`. Everything is committed and pushed. No pull request has
  been opened.
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
    Status report.
- **Test evidence:** `PHASE_1_TEST_RESULTS.md`.
  - 77 local tests pass; CI on GitHub Actions passes.
  - Clean-environment run passes.
  - HTTP acceptance passes 16/16; browser check passes 17/17.
- **Not started (by instruction):** R&D, marketplace integrations, AI.
- **Not yet built:**
  - production (Milestone 4);
  - sales, dispatch and accounts end to end (Milestone 5);
  - import templates, workspaces and dashboards (Milestone 6).

## Read these first

1. `IMPLEMENTATION_PROGRESS.md`: what was built per milestone.
2. `DECISIONS.md`: D-001 to D-019, the why behind every non-obvious choice.
3. `OPEN_ISSUES.md`: client inputs still needed and technical gaps.
4. `DATABASE_AND_WORKFLOW_DESIGN.md` §3: the QC workflow as implemented (spike result in §3.2a).
5. `DEPLOYMENT_RUNBOOK.md`: how to rebuild the environment and run every check.

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

## Next task (Milestone 4: production)

- **Bills of materials:** BULK BOM from RM, and FG BOM consuming BULK + PM.
- **Two-stage work orders:** bulk in kg, then fill and pack in units.
  - Consumption only from usable stock (already guarded).
  - Output into BULK-QC-HOLD / FG-QC-HOLD (already guarded).
  - Bulk and FG then go through QC Release.
- **Other production pieces:** material returns, wastage reasons, process loss.
- **Tests:** a production acceptance test that continues the Part 3 flow on the perpetual-inventory
  company, with GL checks.

## Waiting on the client (blocks real data and statutory setup)

- **Statutory:** legal entity, GSTIN and state.
- **Quality:** QC specifications and SLA hours.
- **Dispatch:** minimum shelf life for dispatch.
- **Purchase:** approval limits per user.
- **Masters:** real master data.
- **Accountant:** chart of accounts, rounding and invoice numbering.
- **Commercial and infrastructure:** lawyer review of the GPL position; FlowHQ day rate; staging and
  production VPS credentials.
