# Open issues

Status 2026-11-05, after Milestone 4 (production).

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
- **Accountant:** chart of accounts, rounding method, row-wise GST rounding, invoice numbering, e-invoice threshold.
- **Lawyer:** GPL conveying and `factory_ops` licence wording.
- **FlowHQ day rate** (Phase 1 scope).
- **Staging / production VPS credentials** (nothing provisioned).

## Technical, open
1. **Master-data import templates** (Items, Suppliers, Customers, Warehouses, UOMs, BOMs, opening
   stock, batches) not yet produced; the SAMPLE masters are created in code. Milestone 6.
2. **Role workspaces and dashboards** (Purchase, Stores, QC, Production, Dispatch, Accounts,
   Management) not yet built; screens are reached through ERPNext's standard workspaces. Milestone 6.
3. **ERPNext's default warehouses** (Stores, Work In Progress, Finished Goods - SMM) created by the
   setup wizard are untyped, so the guards treat them as usable. Disable them or map them before go-live.
4. **Opening stock path.** Stock Entry *Material Receipt* of QC items into QC Hold is allowed (opening
   balances, migration); it does not capture supplier batch data. Decide whether opening stock must
   go through an import template instead.
5. **UI error-dialog detection** in `deploy/dev/ui_check.js` was added after a screenshot review caught
   a permission popup the text checks missed; the selector has not itself been proven against a
   deliberately broken page.
6. **Hindi UI** not reviewed (English only in Phase 1).
7. **Production, deferred by phase:** barcode/QR and ZPL on the batch label, yield variance alert,
   rework orders linked to the original batch, electronic batch record, operations and job cards,
   machine-breakdown blocking (Phase 4). Production Plan / MRP is standard ERPNext but not yet
   configured or tested.
8. **Batch label PDF needs the Chrome PDF generator.** Frappe v16 drives a headless Chromium; the
   staging image must include it (or the label falls back to whatever generator Print Settings name).
   wkhtmltopdf is not installed in development and is not needed.
9. **ERPNext's own default warehouses for manufacturing** (Manufacturing Settings default WIP / FG
   warehouses) are left empty; factory_ops fills Work Orders from the Company and Item Defaults instead.
   Anyone setting them in Manufacturing Settings would not bypass the guards, but would make defaults
   inconsistent; document in training.
10. **A closed Work Order's leftovers.** ERPNext returns components only from a Completed or Closed
    order, so a short fill must be closed before its leftovers can go back to stores (tested).
11. **Docker Hub rate limit.** Pulling `mariadb` / `valkey` anonymously can fail with HTTP 429; the
    runbook gives the mirror workaround (development only).

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
