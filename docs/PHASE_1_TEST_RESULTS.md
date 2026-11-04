# Phase 1 test results

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
