# Open issues

Status 2026-11-05, after Milestone 6 (master data, role workspaces and reports).

## Blocking the local demo
- **Network access to `vmintree.in`.** This development environment's network policy refused the
  site, so the public catalogue has not been extracted. Allow the domain in the environment's
  network settings, or run `tools/website_extraction/extract.py` on a machine with internet access
  and commit or copy `data/mintree_website_extraction/`. Until then the demo site has DEMO materials
  only and no website products. The extraction pipeline, demo seeding and scenario were verified
  with an invented fixture catalogue (`PHASE_1_TEST_RESULTS.md`, "Local demo preparation").
- **Image rights.** Product images are the brand's content; they are used only locally for the
  demo and kept out of Git. Confirm with Mintree before using them anywhere else.

## Needs the client
- **Legal entity, GSTIN, state.** Company setup on a real site, India Compliance, any tax invoice. The
  development site uses "SAMPLE Mintree Manufacturing" with no GSTIN; nothing it produces is a valid
  tax document. India Compliance is not installed.
- **QC specifications** per RM/PM/BULK/FG (Quality Inspection Templates) and QC SLA hours (SAMPLE 48/24/8/24 h).
- **Minimum remaining shelf life for dispatch** (currently 0 = expired only).
- **Purchase approval limits per user** (SAMPLE approver has 5,00,000) and who may change them
  (currently System Manager and Accounts Manager).
- **Real master data** in the import templates (items, suppliers, UOMs, warehouses, opening stock).
- **Production:** real formulas and batch sizes (BOMs), expected process loss per product, the wastage
  reason list, which account wastage posts to, and the label size and content (SAMPLE: 100 × 60 mm).
- **Sales:** real customers and distributors, credit limits and payment terms, price lists per
  channel, the minimum remaining shelf life for dispatch (setting is 0), who approves credit-limit
  breaches (SAMPLE: Sales Manager), whether salespeople may see receivables, the dispatch record
  fields required (SAMPLE: transporter + LR/AWB).
- **Accountant:** chart of accounts, rounding method, row-wise GST rounding, invoice numbering, e-invoice threshold.
- **Lawyer:** GPL conveying and `factory_ops` licence wording.
- **FlowHQ day rate** (Phase 1 scope).
- **Staging / production VPS credentials** (nothing provisioned).
- **Milestone 6 decisions for the client:**
  - who holds Management Viewer, and who maintains master data (needs Item Manager and the master
    roles, D-040);
  - whether salespeople should see receivables and buyers QC-hold counts (both hidden now by
    standard permissions);
  - whether opening stock of QC items may go straight to Usable warehouses (allowed now) or must be
    counted into QC Hold and released;
  - real inspection parameters and limits per template (SAMPLE now), reorder levels per item;
  - review of the seven workspaces with the people who will use them.

## Technical, open
1. **ERPNext's default warehouses** (Stores, Work In Progress, Finished Goods - SMM) created by the
   setup wizard are untyped, so the guards treat them as usable. Disable them or map them before go-live.
2. **Opening stock path.** The Opening Stock import (Milestone 6) captures batches, dates and supplier
   batch numbers and allows Usable or QC Hold warehouses. Stock Entry *Material Receipt* into QC Hold
   is still allowed and captures no supplier batch data. Client to decide whether opening stock of
   QC items must go through QC Hold, and whether Material Receipt should then be closed.
3. **UI error-dialog detection** in `deploy/dev/ui_check.js` was added after a screenshot review caught
   a permission popup the text checks missed; the selector has not itself been proven against a
   deliberately broken page.
4. **Hindi UI** not reviewed (English only in Phase 1).
5. **Production, deferred by phase:** barcode/QR and ZPL on the batch label, yield variance alert,
   rework orders linked to the original batch, electronic batch record, operations and job cards,
   machine-breakdown blocking (Phase 4). Production Plan / MRP is standard ERPNext but not yet
   configured or tested.
6. **Batch label PDF needs the Chrome PDF generator.** Frappe v16 drives a headless Chromium; the
   staging image must include it (or the label falls back to whatever generator Print Settings name).
   wkhtmltopdf is not installed in development and is not needed.
7. **ERPNext's own default warehouses for manufacturing** (Manufacturing Settings default WIP / FG
   warehouses) are left empty; factory_ops fills Work Orders from the Company and Item Defaults instead.
   Anyone setting them in Manufacturing Settings would not bypass the guards, but would make defaults
   inconsistent; document in training.
8. **A closed Work Order's leftovers.** ERPNext returns components only from a Completed or Closed
    order, so a short fill must be closed before its leftovers can go back to stores (tested).
9. **Docker Hub rate limit.** Pulling `mariadb` / `valkey` anonymously can fail with HTTP 429; the
    runbook gives the mirror workaround (development only).
10. **GST not configured** (no GSTIN, none invented). Development invoices are not tax documents.
    India Compliance, tax templates, HSN codes, e-invoice / e-way bill only after registration
    and the accountant's sign-off.
11. **Marketplace and courier integrations** are not built (Phase 5/7). Orders are entered or imported
    by hand; AWB numbers are typed.
12. **Shelf-life segregation runs daily**, but is now only a safeguard: reservation, Pick List and
    Delivery Note apply the minimum shelf life themselves on every call (D-034). Short-dated stock
    stays in Usable warehouses until the next run or `segregate_now`; it is not sold meanwhile.
13. **Pre-existing lint warnings** in `deploy/dev/acceptance_http.py` (semicolons; dev script, not in CI lint).
14. **Bank statement import and reconciliation** not built (moved from Milestone 6 to the next
    milestone).
15. **Workspaces are rebuilt from code on every migrate.** Edits made in the Desk workspace editor
    are overwritten; change `setup/workspaces.py` instead. App Sidebars cannot be saved from the UI
    outside developer mode (Frappe v16).
16. **Master data import does not update existing records** (by design, D-035). Bulk corrections
    after go-live need Desk edits or a separate, reviewed update path.

## Closed in Milestone 6
- Master-data import templates and a validated, all-or-nothing importer (D-035,
  `MASTER_DATA_IMPORT_GUIDE.md`).
- Role workspaces and dashboards for management, purchase, stores, production, QC, sales/dispatch and
  accounts (D-036, D-037, `ROLES_AND_WORKSPACES.md`).
- Minimum shelf life now enforced by one rule in reservation, picking and dispatch, not only by the
  daily segregation (D-034); issue "segregation runs daily" is now only a safeguard.
- CI red since the workspace commit (Sidebar save outside developer mode), fixed; the test site now
  runs with developer mode off (D-039).

## Closed in Milestone 5
- Sales, dispatch and accounts on standard ERPNext with factory_ops controls (`SALES_DISPATCH_ACCOUNTS.md`).
- Pick List batch bundles were counted as stock movements by factory_ops balance queries (D-031),
  fixed with a regression test.

## Closed in Milestone 4
- Workers and scheduler run as processes in development: a job enqueued to the worker finished, the
  factory_ops nightly batch-status job ran through the worker, and the scheduler executed 16 job types.
- Production module with configurable warehouses, two-stage rule, wastage type and batch label (see
  `PRODUCTION_WORKFLOW.md`).
- Repeated test runs on the same site no longer fail (D-024).

## Closed in the validation round
- `setup-dev.sh` verified on a clean user from a fresh clone (two real bugs fixed: `apps.txt`
  newline, non-idempotent bench install).
- CI runs on GitHub Actions and passes (run 4: 72 tests OK, lint OK).
- Guard tests now use real document lifecycles; Purchase Invoice, manufacture output, repack and sales
  returns covered; rollback verified in-process and over HTTP.
- "Send for Re-test" implemented (QC Retest).
- Valkey decision applied consistently across docs.
- Browser check of QC screens (17/17).
