# Phase 1 test results

## Milestone 5: sales, dispatch and accounts (2026-11-05)

Every number here comes from a run in this environment. Nothing is estimated.

### Before starting: Milestone 4 on the clean environment

The full suite on the clean, independent bench with the final production code (commit d1c8fa0),
after migrating: **Ran 93 tests in 143.5 s — OK**.

### Summary (final code)

| Layer | Where | Result |
| --- | --- | --- |
| Full automated suite | dev bench `test.localhost` | **Ran 114 tests in 222.6 s — OK** (93 earlier + 21 sales) |
| Full automated suite | clean, independent bench (own MariaDB / Valkey), migrated | **Ran 114 tests in 223.8 s — OK** |
| HTTP acceptance, sales (`acceptance_sales_http.py`) | dev site, REST, 6 SAMPLE users | **19/19** |
| HTTP acceptance, purchase/QC (`acceptance_http.py`, updated for SO → DN) | dev site | **16/16** |
| HTTP acceptance, production (`acceptance_production_http.py`) | dev site | **15/15** |
| Browser, sales / dispatch / accounts (`ui_check_sales.js`) | Playwright, sales, dispatch and accounts users | **25/25**; screenshots `docs/screenshots/sales/` |
| Browser, QC and production (`ui_check.js`, `ui_check_production.js`) | same site, after the Milestone 5 changes | **17/17**, **14/14** |
| Lint | `ruff check` / `ruff format --check` on the app | clean |

### Sales tests (`tests/test_sales.py`, 21; perpetual-inventory company)

| Area | Tests |
| --- | --- |
| Customers, channels | `test_sample_customers_groups_and_credit_limits`, `test_d2c_orders_need_a_unique_external_order_id`: number required, duplicate refused (also with spaces), other channel allowed, freed by cancellation |
| Available to sell, reservation | `test_available_to_sell_counts_only_released_in_date_unreserved_stock`, `test_reservation_never_exceeds_available_to_sell`: ERPNext reserves only what is available; a hand-made over-reservation is refused |
| QC Hold / Rejected | `test_qc_hold_and_rejected_stock_cannot_be_sold_reserved_or_dispatched`: Sales Order, reservation, Delivery Note from hold and from REJECTED all refused |
| Expired / short-dated | `test_expired_and_short_dated_batches_are_not_dispatched`, `test_short_dated_batches_are_segregated_and_never_reserved_or_picked` (refused before segregation; one transfer moves 40 short-dated + 20 expired; idempotent; FEFO then pins only good batches), `test_reserved_short_dated_stock_is_not_moved_but_cannot_be_dispatched` |
| FEFO | `test_fefo_pick_skips_expired_and_takes_earliest_expiry_first`; `test_a_pick_list_is_not_a_stock_movement` (D-031 regression) |
| Insufficient stock | `test_insufficient_stock_is_refused_and_writes_nothing`: DN stays draft, no ledger rows, no bundles |
| Credit limits | `test_credit_limit_is_enforced_and_only_a_credit_controller_may_override` (30,000 vs 25,000 refused for Sales User, submitted by Sales Manager), `test_credit_limit_counts_unpaid_invoices` |
| Stock once | `test_invoice_never_moves_stock_a_second_time`: SI from DN with stock update refused (ERPNext); stand-alone stock-updating SI and Pick List → SI refused (factory_ops); invoice moves nothing; second invoice for the same DN refused |
| Dispatch | `test_dispatch_details_are_required`; Packing Slip and Dispatch Register in `test_dashboard_and_reports` |
| Permissions | `test_permissions`: QC cannot create Sales Orders; Sales cannot record payments; Stores cannot invoice |
| Dashboard / reports | `test_dashboard_and_reports`: all 6 number cards evaluate; Dispatch Register row (transporter, LR, packages, qty, batches) |
| End to end | `test_released_stock_to_cash_with_reconciliation`, `test_order_reservation_then_delivery_without_pick_list` |
| Duplicates | `test_duplicate_submissions_change_nothing`: re-submitting SO, Pick List, DN, SI and PE through the API, re-reserving, and delivering the order again change nothing |
| Cancellations | `test_cancellations_unwind_in_order_and_reconcile`: DN refused while invoiced; PE → SI → DN cancel in order; ledger and GL fully reversed; order back to 0 % delivered; stock = GL |

### End-to-end figures (test; the HTTP run gives the same results)

| Stage | Stock ledger | GL / balances |
| --- | --- | --- |
| Released FG: batch A 100 (expiry +300 d), batch B 100 (+700 d); 50 held | — | — |
| Sales Order 150 × 250.00 | none | none; credit limit 5,00,000 respected |
| Pick List | none | FEFO: A 100, then B 50; held batch never proposed |
| Reservation from the Pick List | none | available to sell −150 |
| Delivery Note + Packing Slip + LR | FG-STORES −100 (A), −50 (B), once | Stock Cr 15,000 / COGS Dr 15,000; reservation Delivered |
| Sales Invoice from DN | none | Debtors Dr 37,500 / Sales Cr 37,500; AR outstanding 37,500 |
| Payment 20,000 | none | outstanding 17,500 (AR report too) |
| Payment 17,500 | none | outstanding 0, status Paid; AR has no row |
| Reconciliation | — | customer ledger back to its opening balance; Σ stock ledger value = Σ stock-account GL |

HTTP run on the dev site: customer ledger **500.00 = open invoices 500.00** (an imported website
order shipped and left unpaid on purpose); **stock ledger 108,550.00 = stock accounts 108,550.00**.

### Failures found and fixed in Milestone 5

| Found by | Problem | Fix | Regression check |
| --- | --- | --- | --- |
| First sales run (12 of 16 failed) | ERPNext v16 refuses a Pick List for an order with reserved stock | reserve from the Pick List (D-026) | E2E, duplicate, cancellation tests |
| same | ERPNext's FEFO pins short-dated batches | shelf-life segregation (D-028) | `test_short_dated_batches_are_segregated_and_never_reserved_or_picked` |
| same | ERPNext refuses to receive an already-expired batch | tests age batches instead | expiry tests |
| same | Accounts Manager cannot submit Sales Orders | credit controller = Sales Manager (D-032) | credit-limit test, HTTP check 2–3 |
| Second run | **Pick List bundles counted as stock movements** by factory_ops balances (pre-existing since Milestone 2) | `LEDGER_BUNDLE` (D-031) | `test_a_pick_list_is_not_a_stock_movement`; 114 tests |
| same | external order ID lost on the DN (`no_copy`) | carried by a hook (D-030) | `test_order_reservation_then_delivery_without_pick_list`, HTTP check 17 |
| same | reserved batch turned short-dated: ERPNext "Serial and Batch Bundle None not found" | clear refusal at validate | `test_reserved_short_dated_stock_is_not_moved_but_cannot_be_dispatched` |
| same | own test: `rollback()` wiped the test transaction | savepoints | duplicate test |
| Migrate | reports not registered: module folder must be `sales_ops/` | package renamed | reports present on both benches |
| HTTP run | Stock User cannot select accounts → dispatch user could not create a DN | Delivery User role (D-032) | HTTP checks 8–9; tests deliver as Stock User + Delivery User |
| HTTP run | Data Import is System Manager only | granted to Sales Manager (D-032) | HTTP checks 15–16 |
| HTTP run | stores may not edit a batch's expiry (correct) | script creates batches with expiry | — |
| HTTP run | receivable reconciliation compared 0.00 with 0.00 | an unpaid order is left on purpose; check requires > 0 | HTTP check 18 |
| Browser | order numbers not in the order list; sales cannot see receivable cards | External Order ID in list view; receivables checked as accounts user | UI checks "D2C website orders listed…", "receivables cards hidden from a salesperson", "accounts see receivables on the dashboard" |
| Re-running Milestone 3 HTTP | DN without Sales Order now refused (SO → DN rule) | script follows SO → DN; shelf-life refusal still after ledger rows | `acceptance_http.py` 16/16 |

CI on GitHub Actions for this milestone: CI_M5_PENDING.

---


## Milestone 4: production (2026-11-05)

Every number here comes from a run in this session's rebuilt environment. Nothing is estimated.

| Layer | Where | Result |
| --- | --- | --- |
| CI, GitHub Actions run 8 (commit e7d23e1) | ubuntu-24.04, fresh site | **Ran 93 tests in 91.9 s — OK**; lint OK |
| Full automated suite, final code (commit e7d23e1) | dev bench `test.localhost` (repeated full runs on the same site) | **Ran 93 tests in 130.5 s — OK** |
| Clean environment: `setup-dev.sh` into a second, independent bench (own MariaDB, Valkey, ports 3308/13101/11101) | `~/clean-bench` | script exit 0; **two back-to-back full runs: 92 OK (135.4 s), 92 OK (133.1 s)** |
| Clean site from nothing | `fresh.localhost` on the clean bench: new-site → ERPNext → factory_ops → `setup_dev_site` → sample users | completed; BOMs (2 % loss), Wastage type, Batch Label, Company WIP/wastage account, production sources per group, 5 wastage reasons, backflush setting all present |
| HTTP acceptance, purchase/QC (`acceptance_http.py`) | dev site, REST, SAMPLE users | **16/16** |
| HTTP acceptance, production (`acceptance_production_http.py`) | dev site, REST, SAMPLE users | **15/15** (re-run on commit e7d23e1) |
| Browser, QC screens (`ui_check.js`) | Playwright/Chromium, QC Officer + QA Manager | **17/17** |
| Browser, production screens (`ui_check_production.js`) | Playwright/Chromium, production user | **14/14**; screenshots in `docs/screenshots/production/` |
| Desk | `bench serve`, `/desk` as SAMPLE users | loads; Work Order, BOM, Batch, print view checked visually |
| Background worker | `bench worker` | enqueued job FINISHED; factory_ops nightly batch-status job FINISHED via the worker |
| Scheduler | `bench schedule`, scheduler enabled | 16 scheduled job types executed, latest within the last 4 minutes |
| Lint | `ruff check` / `ruff format --check` | clean |

The 77 earlier tests (QC engine, guards, retest, lifecycle routes, purchase, acceptance, install)
pass unchanged alongside the 16 production tests.

The clean-bench runs (92 tests) were on commit a260dc9, before the one-test fix below; on e7d23e1 the
clean bench ran the production module again: 16/16 OK.

### Production tests (`tests/test_production.py`, 16)

Controls (`_Test Company`):
- `test_sample_boms`: BULK 100 kg / 2 % loss from 5 + 95 kg; FG from 30 kg bulk + 1,000 bottles with
  the bulk BOM as sub-assembly; idempotent setup.
- `test_work_order_warehouse_defaults`: default BOM filled on the server; WIP; output into the QC Hold
  warehouse; components from RM/BULK/PM stores.
- `test_configured_source_beats_an_item_level_default_warehouse`: an item's own plain default
  warehouse does not override the configured production source (found through CI run 7).
- `test_defaults_for_three_component_groups`: one BOM drawing BULK, PM and RM, each from its own store.
- `test_warehouse_mapping_is_configuration`: group setting, item override beating the group, Company WIP,
  and the fallback to the QC release destination.
- `test_manually_entered_restricted_warehouses_are_refused`: output into usable stock; WIP, header
  source or component row in QC Hold or Rejected; a component edited to QC Hold after saving (refused
  on save); a component set to Rejected directly in the database (refused on submit).
- `test_bulk_cannot_be_exploded_into_raw_materials`: two-stage rule on save and on submit.
- `test_bom_cannot_draw_from_hold`.
- `test_wastage_write_off_needs_an_enabled_reason`: missing reason, disabled reason, valid reason.
- `test_ordinary_issue_and_consumption_need_no_reason`: an ordinary issue goes through; a reason on it
  is refused.
- `test_wastage_type_must_be_a_material_issue`.
- `test_scrap_from_rejected_uses_the_disposal_reason`.
- `test_production_permissions`: QC cannot create a Work Order; production cannot edit wastage reasons.

End to end (`_FO Perpetual Company`, perpetual inventory on):
- `test_two_stage_production_with_ledger_checks`: the full flow below.
- `test_duplicate_submission_and_rollback`: re-submitting the Work Order, transfer and Manufacture
  through the API changes nothing. A second Manufacture is refused ("Manufactured Qty (including
  Process Loss) (200.0) cannot be greater than planned quantity (100.0)") and rolled back. Cancelling
  the Manufacture entry reverses stock, batch and GL, returns the Work Order's produced qty to 0, and
  stock and GL still agree.
- `test_released_bulk_that_was_used_cannot_be_unmade`: once released bulk is in WIP for filling,
  cancelling its QC Release (as QA Manager) or its Manufacture entry (as Stock Manager) is refused by
  ERPNext's negative batch stock check, and stays submitted.

### End-to-end figures (test and HTTP run agree)

| Stage | Stock ledger | Value / GL |
| --- | --- | --- |
| RM/PM received into QC Hold, released by QC | hold → stores | balanced |
| Bulk Work Order 100 kg | none | — |
| Transfer for manufacture (FEFO) | RM-STORES −5 / −95 kg, WIP +5 / +95 kg | net value change 0, GL balanced |
| Manufacture | WIP −5, −95 kg; **BULK-QC-HOLD +98 kg** (process loss 2 kg) | input 2,900.00 = bulk value 2,900.00; net 0; GL balanced |
| Filling held bulk | refused (QC guard), nothing written | — |
| QC Release of bulk (not by the Work Order owner) | BULK-QC-HOLD −98, BULK-STORES +98 | balanced |
| FG transfer 1,000 | BULK-STORES −30 kg, PM-STORES −1,000; WIP +30 kg, +1,000 | — |
| **Short fill 950** | WIP −28.5 kg bulk, −950 bottles; **FG-QC-HOLD +950** | net 0; GL balanced |
| Close Work Order + return components | WIP −1.5 kg, −50 → BULK-STORES +1.5 kg, PM-STORES +50 | — |
| Wastage, 10 bottles, "Damaged in handling" | PM-STORES −10 | stock −50.00; **Production Wastage Dr 50.00**; balanced |
| Batch label | — | HTML contains batch, item, Work Order, "QC: HOLD"; PDF 1 page 100 × 60 mm |
| QC Release of FG | FG-QC-HOLD −950, FG-STORES +950 | balanced; label now "QC: RELEASED" |
| Company-wide | — | Σ stock value difference = Σ stock-account GL (test); HTTP: **SLE 54,800.00 = GL 54,800.00 over 143 ledger rows**, and ERPNext's *Stock and Account Value Comparison* lists no mismatching voucher |

### Failures found and fixed in Milestone 4

| Found by | Problem | Fix | Regression check |
| --- | --- | --- | --- |
| First full run (4 errors) | ERPNext defaults component sources to the item-group warehouse (QC Hold), so every Work Order was refused | configurable production source; redirect only ERPNext-filled rows (D-021) | `test_work_order_warehouse_defaults`, `test_warehouse_mapping_is_configuration`, `test_manually_entered_restricted_warehouses_are_refused` |
| Same run | own test bug: Reject without a quantity | test fixed | `test_scrap_from_rejected_uses_the_disposal_reason` |
| Module re-run | every second run on the same site failed at discovery (valuation method) | D-024 | three consecutive full runs on the dev bench, two on the clean bench |
| FG tests | multi-level BOM exploded the bulk into raw materials and skipped bulk QC | two-stage rule (D-022) | `test_bulk_cannot_be_exploded_into_raw_materials` |
| Review of the brief | wastage rule caught every Material Issue | Wastage stock entry type (D-023) | `test_ordinary_issue_and_consumption_need_no_reason` |
| Duplicate test | a refused second Manufacture left partial rows in the test transaction | the test now rolls back to a savepoint, as a failed request does | `test_duplicate_submission_and_rollback` |
| Rollback test | Manufacturing User cannot cancel Stock Entries (ERPNext permission) | cancellation done by Stock Manager / QA Manager | `test_released_bulk_that_was_used_cannot_be_unmade` |
| Short-fill test | ERPNext returns components only from a Completed or Closed order | close the Work Order first (documented) | E2E step 8 |
| HTTP acceptance | Work Order BOM filled only in the browser; REST got "BOM No is mandatory" | server-side default BOM | HTTP check 2, `test_work_order_warehouse_defaults` |
| CI run 7 (commit a260dc9): 92 run, 1 error | on a fresh site the item already had an Item Default for the test company; the test's `append` hit "Cannot set multiple Item Defaults". Reproducing it locally showed a real gap: ERPNext fills the component source from an item's own plain default warehouse, and the configured production source was ignored | test reuses the row; ERPNext-filled rows always take the configured source (D-021) | `test_configured_source_beats_an_item_level_default_warehouse`; module 16/16 with and without the row |
| HTTP acceptance (4th run) | own script compared raw ledger rows; FEFO split consumption over two batches | compare totals per item and warehouse | HTTP checks 3, 9, 10 |
| Label render | two pages, 15 mm margins; later text wrapping | `@page` in the Print Format css; layout; Chrome generator named explicitly (D-025) | HTTP check 13, screenshot `17-batch-label-pdf.png` |
| Clean-bench 2nd run (1 failure) | site migrated before the label existed, then ran newer test code | migrate then run; two clean runs both OK | — |

CI on GitHub Actions: run 6 (WIP commit d48358c) failed, as expected for untested code; run 7
(a260dc9) failed 1 of 92 (the Item Default case above); **run 8 (e7d23e1): success — Ran 93 tests in 91.9 s, OK; lint OK** (ubuntu-24.04, MariaDB 11.8.9,
Valkey 8.1).
https://github.com/vatsal04-02/Mintree-crm-project/actions/runs/41929122791

---

# Earlier results (Milestones 1–3)

Updated 2026-11-05 (validation round + Milestone 3). Every result below was produced by running it;
nothing is estimated.

## Summary

| Layer | Where | Result |
| --- | --- | --- |
| Automated suite (Frappe test runner) | dev bench, `test.localhost` | **Ran 77 tests in 76.3 s — OK** |
| CI (GitHub Actions, run #4, commit 812fc92) | ubuntu-24.04, MariaDB 11.8.9, Valkey 8.1.11, Python 3.14.10 | **Ran 72 tests in 61.0 s — OK**; lint OK |
| Clean environment (`deploy/dev/setup-dev.sh`) | new OS user, empty home, fresh clone of commit 812fc92 | script completed; **Ran 72 tests in 62.5 s — OK** |
| HTTP acceptance (`deploy/dev/acceptance_http.py`) | dev site `factory.localhost`, SAMPLE users, REST API | **16/16 checks passed** |
| Browser check (`deploy/dev/ui_check.js`, Playwright/Chromium) | dev site, QC Officer and QA Manager | **17/17 checks passed**; screenshots in `docs/screenshots/qc/` |
| Lint | `ruff check` | all checks passed |

The 5 tests added after commit 812fc92 (acceptance E2E ×4, QC screen permissions ×1) ran locally;
CI will run them on the next push.

## Failures found and fixed in this round

| Found by | Problem | Root cause | Fix | Regression check |
| --- | --- | --- | --- | --- |
| Clean-env run + CI | `No module named 'erpnextfactory_ops'` | bench writes `apps.txt` with no trailing newline; `echo >>` glued names | add newline before appending (script and CI) | clean run + CI green |
| Clean-env re-run | `Executable already exists: bench` | script not idempotent | install bench only when the pinned version is missing (`--force`) | clean run |
| CI run 1 | bench could not `get-app` a repo subdirectory | bench git-clones get-app sources | link + `uv pip install -e` | CI green |
| Full-lifecycle Pick List test | ERPNext suggested QC Hold stock; guard ran too early | locations are computed in `before_save`, after `validate` | default USABLE parent warehouse; guard also in `before_save` | `test_pick_list_from_sales_order_picks_only_usable_stock`, `test_manual_pick_list_from_hold_is_refused_on_save` |
| Rollback test | shelf-life check missed FEFO-picked batches after submit | bundle names not on in-memory rows | read batches of the voucher from the database | `test_failure_after_ledger_rows_rolls_back_completely`, HTTP check 13–16 |
| Purchase tests | approval limits not enforced on the test site | new field on an existing Single gets no default | back-fill Single defaults on migrate (D-015) | `test_approval_limits_are_per_user` |
| HTTP acceptance | GRN failed: batch tracking switched off | fresh v16 site has "Activate Serial and Batch No" off | `configure_stock_settings` (D-016) | HTTP check 4 |
| HTTP acceptance | QC officer could not open Stock by QC Status | no report right on Stock Ledger Entry | read/report for QC roles (D-017) | `test_qc_roles_can_run_their_reports` |
| Browser screenshot | permission popup on QC Queue | QC roles could not read Company | Company read for QC roles (D-017) | same test + UI check |
| Acceptance test | receipt posted no GL | `_Test Company` has perpetual inventory off | acceptance runs on a perpetual-inventory company (D-018) | `test_full_flow_with_ledger_checks` |
| Own test bug | committed data leaked between tests | `frappe.db.commit()` inside a test | removed; test site reinstalled | — |

## Part 3 acceptance (one SAMPLE supplier, one SAMPLE raw material)

`test_acceptance_e2e.test_full_flow_with_ledger_checks`, verified at every stage:

| Stage | Stock ledger | Batch balance | GL |
| --- | --- | --- | --- |
| PO (buyer creates, approver submits) | none | — | — |
| GRN 100 kg | +100 RM-QC-HOLD | hold 100 | Dr stock = Cr SRBNB = 5,000 |
| Manual transfer attempt | refused, nothing written | hold 100 | — |
| QI accepted + QC Release 60 | −60 hold, +60 RM-STORES | hold 40, stores 60 | balanced |
| QI rejected + QC Release reject 40 | −40 hold, +40 REJECTED | stores 60, rejected 40 | balanced |
| Purchase Invoice from GRN | none | — | balanced; GRN 100% billed |
| Report | — | Usable 60, Rejected 40 | — |

Also: partial acceptance at the dock (85 accepted / 15 rejected), duplicate submissions of PO, GRN and
QC Release (nothing moves twice), and permissions (buyer cannot approve own PO; QC cannot approve POs
or receive goods; stores cannot decide on QC; a purchase approver cannot release QC stock).

## HTTP acceptance (16 checks, dev site, separate SAMPLE users)

PO by buyer into QC Hold · buyer cannot approve own PO · approver approves · GRN with uploaded COA into
QC Hold · one ledger row · manual transfer refused (HTTP 417) · refused request wrote nothing · stores
cannot submit QC Release · partial release 60/40 · reject 40 · QC officer cannot send for re-test · QA
re-test 10 back to hold · dispatch below minimum shelf life refused (failure raised after ERPNext wrote
ledger rows) · Delivery Note stays draft · no ledger rows · no batch bundles left.

## Browser check (17 checks)

QC officer: login, QC Release list, draft QC Release with "Create Quality Inspection", QC Queue,
Stock by QC Status (hold/usable/rejected), Batch with QC status and supplier batch, no error dialog on
any screen, no JavaScript errors. QA Manager sees "Send for Re-test" on a rejection; QC officer does not.

## Coverage gaps (honest list)

- Production beyond the guards (BOMs, two-stage work orders, FG QC, costing) is Milestone 4.
- Sales/dispatch/accounts end to end (SO → DN → SI → payment → trial balance) is Milestone 5.
- Import templates, workspaces and dashboards are Milestone 6.
- Background workers/scheduler not run as services in development.

## Test inventory (77 tests)

### `test_spike_qi_lifecycle.py` (8)

- `test_s1_qi_on_draft_transfer_links_row_and_allows_submit`
- `test_s2_rejected_qi_blocks_transfer`
- `test_s3_draft_qi_blocks_transfer`
- `test_s4_missing_qi_blocks_transfer`
- `test_s5_inspection_not_required_means_no_native_check`
- `test_s6_qi_cannot_be_reused_on_another_transfer`
- `test_s7_partial_releases_need_one_qi_each`
- `test_s8_qi_cannot_be_cancelled_while_transfer_is_submitted`

### `test_qc_release.py` (18)

- `test_01_receipt_lands_in_hold_and_status_is_hold`
- `test_02_manual_transfer_out_of_hold_fails`
- `test_03_partial_release_then_reject_remainder`
- `test_04_release_requires_accepted_qi`
- `test_05_reject_requires_rejected_qi_and_reason`
- `test_06_cannot_release_more_than_held`
- `test_07_full_release`
- `test_08_rejected_stock_cannot_go_to_production`
- `test_09_rejected_stock_cannot_be_moved_back_to_hold_by_a_plain_transfer`
- `test_10_receiver_cannot_release_own_batch`
- `test_11_receiver_may_reject_own_batch`
- `test_12_non_qc_user_cannot_create_or_submit_release`
- `test_13_conditional_release_needs_qa_manager_and_approved_deviation`
- `test_14_api_transfer_out_of_hold_is_blocked`
- `test_15_draft_transfer_of_a_release_cannot_be_submitted_directly`
- `test_16_release_transfer_cannot_be_cancelled_directly`
- `test_17_batch_qc_status_cannot_be_set_through_api`
- `test_18_repeated_submission_moves_stock_only_once`

### `test_qc_retest.py` (5)

- `test_only_qa_manager_can_send_for_retest`
- `test_retest_moves_rejected_stock_back_to_original_hold`
- `test_partial_retest_and_quantity_limit`
- `test_retested_material_needs_fresh_accepted_qi_and_release`
- `test_retest_transfer_cannot_be_submitted_or_cancelled_directly`

### `test_guards.py` (10)

- `test_purchase_receipt_must_land_in_qc_hold`
- `test_material_receipt_of_qc_item_into_usable_is_blocked`
- `test_non_qc_item_is_not_restricted`
- `test_delivery_note_from_hold_is_blocked_and_from_stores_allowed`
- `test_sales_invoice_with_stock_update_from_hold_is_blocked`
- `test_minimum_shelf_life_for_dispatch`
- `test_work_order_cannot_draw_from_hold`
- `test_work_order_output_must_go_to_qc_hold`
- `test_material_request_from_hold_is_blocked`
- `test_stock_reconciliation_cannot_count_held_batch_into_usable`

### `test_lifecycle_routes.py` (13)

- `test_sales_order_cannot_target_qc_hold`
- `test_pick_list_from_sales_order_picks_only_usable_stock`
- `test_manual_pick_list_from_hold_is_refused_on_save`
- `test_stock_reservation_from_hold_is_refused`
- `test_sales_return_must_come_back_into_qc_hold`
- `test_purchase_invoice_with_stock_update`
- `test_manufacture_output_must_land_in_qc_hold`
- `test_production_cannot_consume_held_material`
- `test_repack`
- `test_subcontracting_order_cannot_reserve_supplied_items_in_hold`
- `test_refused_movement_writes_nothing`
- `test_failure_after_ledger_rows_rolls_back_completely`
- `test_failed_qc_release_leaves_release_draft_and_stock_in_hold`

### `test_purchase.py` (14)

- `test_requisition_rfq_quotation_purchase_order`
- `test_creator_cannot_approve_own_purchase_order`
- `test_approval_limits_are_per_user`
- `test_approval_cannot_be_bypassed_through_the_api`
- `test_receipt_defaults_to_qc_hold_and_needs_supplier_data`
- `test_receipt_date_checks`
- `test_rm_needs_coa_pm_does_not`
- `test_supplier_batch_created_with_supplier_details`
- `test_accepted_and_rejected_quantities`
- `test_purchase_invoice_from_receipt`
- `test_duplicate_receipt_submission_moves_stock_once`
- `test_item_group_controls`
- `test_sample_masters_exist`
- `test_stock_reports`

### `test_acceptance_e2e.py` (4)

- `test_full_flow_with_ledger_checks`
- `test_partial_acceptance_at_the_dock`
- `test_duplicate_submissions_change_nothing`
- `test_permission_restrictions_along_the_flow`

### `test_install_and_queue.py` (5)

- `test_setup_is_idempotent`
- `test_roles_types_fields_and_doctypes_exist`
- `test_warehouse_tree_and_release_map`
- `test_qc_queue_lists_held_batches_only`
- `test_qc_roles_can_run_their_reports`
