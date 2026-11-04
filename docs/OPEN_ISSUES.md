# Open issues

Status as of 2026-11-04, end of Milestone 2 (QC engine). Owner in brackets.

## Needs the client
- **Legal entity, GSTIN, state** [client] — company setup, India Compliance and any tax invoice wait for these.
  Until then the development site has no statutory configuration and no invoice is a valid tax invoice.
- **QC specifications** per RM/PM/BULK/FG [client QA] — Quality Inspection Templates.
- **Minimum remaining shelf life for dispatch** [client] — `Factory Ops Settings`, currently 0 (blocks expired only).
- **QC SLA hours** [client QA] — currently SAMPLE defaults 48/24/8/24 h.
- **Accountant** — chart of accounts, rounding method, invoice numbering, e-invoice threshold.
- **Lawyer** — GPL conveying and `factory_ops` licence wording (see GPL doc).
- **FlowHQ day rate** — fixes Phase 1 scope (roadmap §5).

## Technical, open
1. **CI workflow not yet run on GitHub Actions** (`.github/workflows/factory-ops-ci.yml`). It mirrors
   the local steps; first run will tell.
2. **Some guard tests call the hook function directly** instead of saving a full document: Pick List,
   Stock Reservation Entry, Subcontracting Order and the sales-return case. The hooks are registered
   for those DocTypes; full-document tests come with Milestone 5 (sales) and when subcontracting is used.
3. **Not yet tested end to end:** Purchase Invoice with update_stock, Manufacture stock entry output
   guard (the Work Order guard is tested), Repack.
4. **QA Manager re-inspection move** (Rejected → QC Hold) is allowed by the guard for QA Managers, but
   QA Manager has no Stock Entry create permission yet. Decide: grant it, or add a "Send for re-test"
   action on QC Release. Test 09 currently demonstrates the allowed path with Administrator.
5. **Workers and scheduler** were not running in the dev session; the nightly batch-status check is
   unit-tested only through `recompute`, not through the scheduler.
6. **Desk verified at HTTP level** (login, `/desk` 200 with boot data); no browser walkthrough of the
   QC Release form yet.
7. **Workspaces** (QC, Stores, Production, Purchase, Dispatch, Accounts, Management) not yet built
   (Milestone 6); `hooks.fixtures` already exports them once created.
9. **`deploy/dev/setup-dev.sh`** was written from the manual steps but not yet run end to end on a clean machine.
8. **Development site** has ERPNext installed but the setup wizard (company, FY) is not run; it waits
   for a SAMPLE company script (next task).

## Closed in this milestone
- Redis vs Valkey licence → Valkey 8.1 (DECISIONS D-004).
- QI / Stock Entry lifecycle unknown → spike passed (D-006).
- `apps/web` React frontend: preserved untouched as design reference.
