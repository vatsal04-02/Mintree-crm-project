# Phase 1 test results

## Latest run

| | |
| --- | --- |
| Date | 2026-11-04 |
| Command | `bench --site test.localhost run-tests --app factory_ops` |
| Stack | Frappe v16.55.2, ERPNext v16.53.0, CPython 3.14.6, MariaDB 11.8.9, Valkey 8.1 |
| Result | **Ran 44 tests in 26.6 s — OK** (0 failures, 0 errors) |
| Lint | `ruff check` — all checks passed; `ruff format` applied |
| Clean install | New site `fresh.localhost`: `install-app erpnext` → `install-app factory_ops` → `migrate` all succeeded |

## Failures found and fixed while building (not hidden)

| Found | Root cause | Fix | Regression test |
| --- | --- | --- | --- |
| Receiving stock as a Stock User failed with PermissionError | ERPNext v16 grants Batch *create* to Item Manager only, but receipts auto-create batches | Custom DocPerm: Batch read+create for Stock User, Manufacturing User (D-007) | every test that receives as `fo-stores@example.com` |
| QC Release submit failed with PermissionError | Submitting the transfer inserts a Serial and Batch Bundle as the session user | Bundle rights for QC roles, same as Stock User (D-007) | `test_qc_release` 03, 07, 10, 13 |
| Batch QC status stayed blank after receipt | Bundle names are written during submit and are not on the in-memory document | Read batches for a voucher from the database | `test_01_receipt_lands_in_hold_and_status_is_hold` |
| Test helper returned no batch | Same cause, in test code | Reload after submit; assert a batch exists | all receiving tests |
| Conditional Release without qty rejected before role check | Default qty only for full Release | Conditional Release also defaults to the full held qty | `test_13_...` |
| "Second submit raises" assertion failed | Frappe v16 treats submit() on a submitted doc as update-after-submit; on_submit does not re-run | Test now asserts the business rule: stock moves once, one submitted transfer, a second release is refused | `test_18_repeated_submission_moves_stock_only_once` |

## Brief scenario → test mapping (Milestone 2, section 6 of the execution brief)

| # | Scenario | Test | Result |
| --- | --- | --- | --- |
| 1 | Receive 100 kg into RM-QC-HOLD | `test_01` | pass |
| 2–3 | Manual transfer to RM-STORES fails | `test_02` | pass |
| 4–7 | Valid QI, release 80 kg, 80 usable, 20 still held | `test_03` | pass |
| 8 | Reject the remaining 20 | `test_03` | pass |
| 9 | Rejected stock cannot be issued to production | `test_08` | pass |
| 10 | Receiver cannot release own batch | `test_10` | pass |
| 11 | Non-QC user cannot release | `test_12` | pass |
| 12 | Direct API requests cannot bypass | `test_14`, `test_15`, `test_16`, `test_17` | pass |

## Coverage gaps (honest list)

- Pick List, Stock Reservation Entry, Subcontracting Order and sales-return guards are tested by
  calling the hook on an unsaved document, not by saving a full document (OPEN_ISSUES #2).
- Purchase Invoice with update_stock, the Manufacture-entry output guard and Repack are not yet
  exercised end to end (OPEN_ISSUES #3).
- No end-to-end purchase → production → sale → GL test yet (Milestone 5).
- CI workflow not yet run on GitHub (OPEN_ISSUES #1).

## Test inventory

### `test_spike_qi_lifecycle.py`

- `test_s1_qi_on_draft_transfer_links_row_and_allows_submit` — pass
- `test_s2_rejected_qi_blocks_transfer` — pass
- `test_s3_draft_qi_blocks_transfer` — pass
- `test_s4_missing_qi_blocks_transfer` — pass
- `test_s5_inspection_not_required_means_no_native_check` — pass
- `test_s6_qi_cannot_be_reused_on_another_transfer` — pass
- `test_s7_partial_releases_need_one_qi_each` — pass
- `test_s8_qi_cannot_be_cancelled_while_transfer_is_submitted` — pass

### `test_qc_release.py`

- `test_01_receipt_lands_in_hold_and_status_is_hold` — pass
- `test_02_manual_transfer_out_of_hold_fails` — pass
- `test_03_partial_release_then_reject_remainder` — pass
- `test_04_release_requires_accepted_qi` — pass
- `test_05_reject_requires_rejected_qi_and_reason` — pass
- `test_06_cannot_release_more_than_held` — pass
- `test_07_full_release` — pass
- `test_08_rejected_stock_cannot_go_to_production` — pass
- `test_09_only_qa_manager_returns_rejected_stock_to_hold` — pass
- `test_10_receiver_cannot_release_own_batch` — pass
- `test_11_receiver_may_reject_own_batch` — pass
- `test_12_non_qc_user_cannot_create_or_submit_release` — pass
- `test_13_conditional_release_needs_qa_manager_and_approved_deviation` — pass
- `test_14_api_transfer_out_of_hold_is_blocked` — pass
- `test_15_draft_transfer_of_a_release_cannot_be_submitted_directly` — pass
- `test_16_release_transfer_cannot_be_cancelled_directly` — pass
- `test_17_batch_qc_status_cannot_be_set_through_api` — pass
- `test_18_repeated_submission_moves_stock_only_once` — pass

### `test_guards.py`

- `test_purchase_receipt_must_land_in_qc_hold` — pass
- `test_material_receipt_of_qc_item_into_usable_is_blocked` — pass
- `test_non_qc_item_is_not_restricted` — pass
- `test_delivery_note_from_hold_is_blocked_and_from_stores_allowed` — pass
- `test_sales_invoice_with_stock_update_from_hold_is_blocked` — pass
- `test_pick_list_from_hold_is_blocked` — pass
- `test_stock_reservation_in_hold_is_blocked` — pass
- `test_sales_return_must_come_back_into_qc_hold` — pass
- `test_minimum_shelf_life_for_dispatch` — pass
- `test_work_order_cannot_draw_from_hold` — pass
- `test_work_order_output_must_go_to_qc_hold` — pass
- `test_material_request_from_hold_is_blocked` — pass
- `test_subcontracting_supplied_items_cannot_be_reserved_in_hold` — pass
- `test_stock_reconciliation_cannot_count_held_batch_into_usable` — pass

### `test_install_and_queue.py`

- `test_setup_is_idempotent` — pass
- `test_roles_types_fields_and_doctypes_exist` — pass
- `test_warehouse_tree_and_release_map` — pass
- `test_qc_queue_lists_held_batches_only` — pass
