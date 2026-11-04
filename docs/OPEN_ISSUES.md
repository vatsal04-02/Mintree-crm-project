# Open issues

Status 2026-11-05, after the validation round and Milestone 3 (purchase and inventory).

## Needs the client
- **Legal entity, GSTIN, state.** Company setup on a real site, India Compliance, any tax invoice. The
  development site uses "SAMPLE Mintree Manufacturing" with no GSTIN; nothing it produces is a valid
  tax document. India Compliance is not installed.
- **QC specifications** per RM/PM/BULK/FG (Quality Inspection Templates) and QC SLA hours (SAMPLE 48/24/8/24 h).
- **Minimum remaining shelf life for dispatch** (currently 0 = expired only).
- **Purchase approval limits per user** (SAMPLE approver has 5,00,000) and who may change them
  (currently System Manager and Accounts Manager).
- **Real master data** in the import templates (items, suppliers, UOMs, warehouses, opening stock).
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
6. **Workers and scheduler** were not run as services in development; the nightly batch-status job is
   covered only through its function.
7. **Hindi UI** not reviewed (English only in Phase 1).

## Closed in this round
- `setup-dev.sh` verified on a clean user from a fresh clone (two real bugs fixed: `apps.txt`
  newline, non-idempotent bench install).
- CI runs on GitHub Actions and passes (run 4: 72 tests OK, lint OK).
- Guard tests now use real document lifecycles; Purchase Invoice, manufacture output, repack and sales
  returns covered; rollback verified in-process and over HTTP.
- "Send for Re-test" implemented (QC Retest).
- Valkey decision applied consistently across docs.
- Browser check of QC screens (17/17).
