# Factory OS front end — implementation status

State on 2026-11-05. Development only: SAMPLE company, SAMPLE users, SAMPLE data. Not production
ready; nothing has been deployed to staging or production.

## Summary

| Stage | Status |
|---|---|
| A. Audit and architecture | Done: `FACTORY_OS_FRONTEND_CAPABILITY_MAP.md`, `FACTORY_OS_ARCHITECTURE.md` (incl. route map), `FACTORY_OS_API_MAPPING.md` (incl. the one API gap closed) |
| B. Foundation | Done: sign-in on the Frappe session, CSRF, app shell, role-based navigation, real API client, design system, Command Center on live counts |
| C. Six modules in React | Done for the daily path of all six (reports below) |
| D. Integration Centre | Done as an honest status page: only the ERP itself is Connected; every marketplace, courier, Meta and AI connector is Not implemented; GST Not configured |
| E. Future modules | Listed on `/planned` as not built; nothing in the menu pretends otherwise |
| F. Testing | Unit tests, end-to-end browser run, backend suite (results below) |

## Test results

| Suite | Result |
|---|---|
| Front-end unit tests (`pnpm test`): API client (CSRF on writes only, server message and title, exception fallback, markup stripped, unreachable server, submit re-reads), navigation by permission, formatting | 12 / 12 pass |
| Type check (`tsc -b`), lint (`biome check`) | clean (3 style warnings in CSS, no errors) |
| End-to-end browser run `apps/web/e2e/run.mjs`, nine SAMPLE role users, against the Frappe-served build at `/factory` | 36 / 36 pass (run MW3L74HP) |
| Backend: new `tests/test_factory_os_api.py` | 3 / 3 pass |
| Backend: full `factory_ops` suite on the dev bench (`test.localhost`) | 155 / 155 pass (152 earlier + 3 new) |
| Impeccable design detector on `apps/web/src` | 0 findings |

What the end-to-end run proves: each step is a click in the React app, and each outcome is read
back from the ERP REST API (the same records ERPNext Desk shows). Screenshots: `apps/web/e2e/out/`
(not committed).

## Per-module completion reports

### 1. Procurement

- **Backend discovered:** Material Request, Purchase Order with QC Hold warehouse defaults,
  approval limits and no self-approval (`purchase.approval`), Purchase Receipt with supplier
  batch / mfg / expiry / COA rules (`inventory.receiving`), batch creation on submit, QC guards on
  receipts and purchase invoices, RM PM Requirements report.
- **APIs reused:** REST insert/get/submit; `make_purchase_order`, `make_purchase_receipt`;
  `upload_file`; `search_link`; report run. **Created:** none.
- **Screens:** material requests (list, new, detail: submit, create PO); purchase orders (list
  with approval / receive tabs, new, detail: approve, receive goods); goods receipts (list, receive
  form with batch details and COA upload, detail); RM / PM requirements.
- **Operations working:** create MR → submit → PO from MR; create PO → approval by a second user →
  GRN with supplier lot, dates and COA → batch on RM-QC-HOLD.
- **Permissions verified:** buyer's own approval refused by the server and shown with its message;
  menus per role from the server.
- **Browser tests:** E2E checks 1–4 pass.
- **Limitations:** purchase invoices, suppliers, price lists in Desk; MR → PO mapping is exercised
  through the UI code path but the E2E run starts from a direct PO.

### 2. Inventory and warehouse

- **Backend discovered:** Stock by QC Status report (QC status, expiry, dispatch eligibility),
  QC guards G1–G6 on every stock movement, wastage entry type with reasons and account, batch
  label print format.
- **APIs reused:** REST Stock Entry insert/submit; report run; `download_pdf`. **Created:** none.
- **Screens:** stock by QC status (status filter, item filter, row filter); stock movements (list,
  transfer form, wastage write-off form, detail with posting, output batches with label PDF).
- **Operations working:** transfer between usable warehouses; wastage write-off with reason;
  posting of work-order entries.
- **Permissions verified:** a transfer out of QC Hold is refused by the server and writes no stock
  ledger rows (checked by count before and after).
- **Browser tests:** E2E checks 5–6 pass.
- **Limitations:** stock reconciliation and opening stock in Desk; no barcode scanning yet.

### 3. Production

- **Backend discovered:** two-stage work orders (bulk kg, FG from released bulk), defaulted WIP and
  output-into-QC-Hold warehouses, component sources, process loss, held bulk cannot be filled,
  wastage report.
- **APIs reused:** REST Work Order insert/submit; `work_order.make_stock_entry`. **Created:** none.
- **Screens:** work orders (list, new, detail with required materials, issue materials, record
  output, stock entries for the order); wastage by reason (last 30 days).
- **Operations working:** FG work order of 10 → submit → issue → manufacture → output batch in
  FG-QC-HOLD with label PDF.
- **Permissions verified:** QC release of output is not offered to production; the server refuses
  it (backend tests).
- **Browser tests:** E2E check 9 passes; wastage report loads (report sweep).
- **Limitations:** BOM authoring, job cards and scheduling in Desk.

### 4. Quality

- **Backend discovered:** QC Release (release / partial / conditional with approved deviation /
  reject), QI creation from the release with inspection type by item group, QC Deviation with QA
  approval, QA-only re-test, QC Queue report with SLA.
- **APIs reused:** REST insert/save/submit for QC Release, Quality Inspection, QC Deviation;
  `create_quality_inspection`; `send_for_retest`. **Created:** none.
- **Screens:** QC queue (row opens or starts the release); releases (list, new, detail with
  inspection panel: readings, outcome, remarks, submit; QA re-test); deviations (list, new, detail
  with QA approval).
- **Operations working:** held batch → release → inspection accepted → release submitted → batch
  Released and moved to RM-STORES by the server.
- **Permissions verified:** QC officer has no purchase or sales menus; re-test offered only to QA
  Manager and enforced on the server.
- **Browser tests:** E2E checks 7–8 pass; QC queue loads (report sweep).
- **Limitations:** inspection templates and parameters are maintained in Desk.

### 5. Sales and dispatch

- **Backend discovered:** sales channel and external order ID rules, available to sell from the
  central batch eligibility rules, credit limit with Sales Manager override, FEFO pick list from
  eligible batches only, reservation from the pick list, dispatch details required, packing slip,
  dispatch register, shelf-life checks.
- **APIs reused:** REST insert/submit; `create_pick_list`, `create_stock_reservation_entries`,
  `create_delivery_note`, `make_packing_slip`; `get_available_to_sell`. **Created:** none.
- **Screens:** sales orders (list, new with channel, dispatch-from warehouse and per-item available
  to sell, detail with pick lists); pick list (locations, reservations); deliveries (list, detail
  with dispatch details, packing, dispatch, create invoice); available to sell; dispatch register.
- **Operations working:** SO → pick (FG-STORES, FEFO) → reserve → DN refused without LR → LR and
  vehicle saved → packing slip → dispatched.
- **Permissions verified:** dispatch refusal comes from the server; QC Hold warehouses are not
  offered as dispatch source, and the server refuses them anyway (found by the E2E run: the item's
  default warehouse is its QC Hold store, so the order form now asks where to dispatch from).
- **Browser tests:** E2E checks 10–13 pass; both sales reports load.
- **Limitations:** sales returns, customers and price lists in Desk; credit override is the same
  submit button used by a Sales Manager (not separately exercised in the browser run).

### 6. Accounts

- **Backend discovered:** invoice only from the delivery note (no second stock movement), payment
  entry, receivables / payables ageing, GST not configured.
- **APIs reused:** `make_sales_invoice`, `get_payment_entry`, REST insert/submit, report run.
  **Created:** none.
- **Screens:** sales invoices (list with outstanding / overdue tabs, detail with submit and record
  payment, a plain statement that no tax is configured); payments (list, record form, detail);
  receivables; payables.
- **Operations working:** DN → invoice ₹1,000.00 without stock update → submitted → payment with
  UTR → invoice Paid, outstanding 0.
- **Permissions verified:** management viewer sees documents with no actions; accounts reports
  offered only to roles the server permits.
- **Browser tests:** E2E checks 14–16 pass; both ageing reports load.
- **Limitations:** purchase invoices, journal entries, GL, bank reconciliation and GST remain in
  Desk / blocked.

## Run it (development)

```bash
# backend (from the bench)
bench --site factory.localhost serve --port 8000
```

```bash
# front end with hot reload: http://localhost:5173/factory/
cd apps/web && pnpm install && pnpm dev
```

```bash
# or build it into the factory_ops app and use http://factory.localhost:8000/factory
cd apps/web && pnpm build
```

```bash
# checks
cd apps/web && pnpm test && pnpm lint && npx tsc -b
NODE_PATH=$(npm root -g) node e2e/run.mjs http://factory.localhost:8000 ~/frappe-bench/sites/factory.localhost/private/sample_users.json
```

Sign in with any SAMPLE user from `sites/factory.localhost/private/sample_users.json`.

## Next phase (proposed)

1. Run the end-to-end script in CI against the clean bench, and add the front-end build to the
   deployment image (`pnpm build` before `bench build`).
2. Sales returns, purchase invoices and stock reconciliation in React (all standard ERPNext).
3. Barcode / QR scanning for batches on the shop-floor tablets; comfortable density toggle.
4. Route-level code splitting; list paging beyond 100 rows.
5. Marketplace and courier connectors only after credentials and an approved design (Integration
   Centre changes status only when a real connection is verified).
