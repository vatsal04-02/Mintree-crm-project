# Database and workflow design

This document covers:

- what standard ERPNext v16 actually does for quality inspection and rejected stock;
- the QC quarantine and release workflow `factory_ops` adds on top;
- how each of the brief's 15 rules in §6 is met;
- an audit of money and quantity precision.

Source evidence is ERPNext `v16.53.0` and Frappe `v16.55.2`. File paths below are relative
to those repositories.

## 1. Data platform

| Item | Decision |
| --- | --- |
| Database | MariaDB 11.8, the version frappe_docker's `overrides/compose.mariadb.yaml` uses, with InnoDB and utf8mb4 |
| Schema ownership | Frappe owns all DDL. DocType JSON produces the tables `tab<DocType>`, and `bench migrate` applies changes. We never hand-write `ALTER TABLE` |
| Our schema | `factory_ops` DocTypes, plus Custom Fields and Property Setters shipped as **fixtures** (JSON under version control). No edits to ERPNext JSON |
| Transactions | One HTTP request or one background job is one DB transaction. Frappe commits at the end of the request and rolls back on any exception |
| Numeric storage | `Currency`, `Float` and `Percent` are all `decimal(21,9)` (`frappe/database/mariadb/database.py` lines 179–183). Python handles them as `float`; see §5 |
| Audit | Version log (`track_changes`), Audit Trail and Activity Log DocTypes exist in Frappe core (`frappe/core/doctype/{version,audit_trail,activity_log,access_log}`) |
| Search and trace | MariaDB indexes on link fields. Trace queries go through `Serial and Batch Bundle`/`Entry` and `Stock Ledger Entry` with composite indexes added by `factory_ops` patches if load tests need them |

## 2. What standard ERPNext does for quality: verified

### 2.1 Quality Inspection (QI)

- **DocType:** `Quality Inspection` (`erpnext/stock/doctype/quality_inspection`).
- **`inspection_type`:** Incoming, Outgoing or In Process.
- **`reference_type`:** Purchase Receipt, Purchase Invoice, Subcontracting Receipt, Delivery
  Note, Sales Invoice, Stock Entry or Job Card.
- **Other links:** `batch_no`, `item_serial_no` and `inspected_by`.
- **Readings and status:** a `readings` table built from a Quality Inspection Template, and a
  `status` of Accepted, Rejected or Cancelled.

### 2.2 Where a QI is enforced

`controllers/stock_controller.py` `validate_inspection()` enforces QIs in these places:

| Document | Triggered by |
| --- | --- |
| Purchase Receipt, Purchase Invoice (with update_stock), Subcontracting Receipt | Item `inspection_required_before_purchase` |
| Delivery Note, Sales Invoice (with update_stock) | Item `inspection_required_before_delivery` |
| Stock Entry | The entry's own `inspection_required` checkbox |

For a Stock Entry, which rows need a QI depends on the purpose
(`stock_entry_row_requires_inspection`, lines 90–100):

- **Manufacture:** the finished item row.
- **Material Receipt, Repack, Receive from Customer, Subcontracting Return:** the incoming row.
- **Material Issue, Material Transfer, Transfer for Manufacture, Send to Subcontractor,
  Subcontracting Delivery, Disassemble:** the outgoing row.

On submit, the entry is blocked if the QI is not submitted
(`action_if_quality_inspection_is_not_submitted` = Stop). It is also blocked if the QI status
is anything other than Accepted (`action_if_quality_inspection_is_rejected` = Stop). Both
settings default to Stop.

### 2.3 What that means in practice

The standard QI is a **gate on posting**, not a stock status.

- With `inspection_required_before_purchase`, the Purchase Receipt **cannot be submitted** until
  its QI is accepted. Goods waiting for test therefore have **no stock ledger entry**.
- The quantity is invisible to stock reports and not traceable from the ledger. The physical
  goods sit on the dock in a state the system does not record.
- That fails the brief's §6 rule 3 ("received goods … enter a HOLD status").
- The escape hatch, `allow_to_make_quality_inspection_after_purchase_or_delivery`, turns the
  gate off completely.

### 2.4 Rejected quantity and rejected warehouses

- **Purchase Receipt Item** carries `received_qty`, `rejected_qty`, `rejected_warehouse` and a
  separate `rejected_serial_and_batch_bundle`. Rejected quantity posts to the rejected warehouse
  at receipt. This suits damage found at the dock; the receiver decides it, not a lab result.
- **Warehouse** has `is_rejected_warehouse` (checkbox). Pick List excludes these warehouses
  (`pick_list.py` `get_rejected_warehouses`). Sales Order's customer-warehouse lookup also
  excludes them.
- There is **no** built-in "quarantine" or "on hold" warehouse flag. There is also no
  stock-status dimension. Stock in any non-rejected warehouse can be issued, transferred,
  reserved or delivered.

### 2.5 Batches

- `Batch` has `expiry_date`, `manufacturing_date`, `disabled` and `supplier`.
- `validate_batch_is_usable` (`stock_controller.py` ~line 397) **blocks outward movement of a
  disabled or expired batch** on the posting date. Material Issue is allowed for expired
  batches, so they can be scrapped.
- Automatic batch selection skips expired batches (`serial_and_batch_bundle.py` ~line 3471).
- With `pick_serial_and_batch_based_on = Expiry`, batches are picked **FEFO**.

**Conclusion:** standard ERPNext gives us expiry blocking, FEFO, rejected warehouses and
QI-gated transfers. It does **not** give us a usable HOLD state with real stock. `factory_ops`
builds that from warehouses, a QI-gated transfer, and guards.

## 3. QC quarantine and release workflow

### 3.1 Warehouse model

```
Mintree Factory (Company)
└── All Warehouses (group)
    ├── Quarantine (group, warehouse_type = "QC Hold")
    │   ├── RM-QC-HOLD        incoming raw materials
    │   ├── PM-QC-HOLD        incoming packing materials
    │   ├── BULK-QC-HOLD      bulk batches after mixing
    │   ├── FG-QC-HOLD        finished batches after filling
    │   └── RETURNS-QC-HOLD   customer returns and RTO
    ├── Usable (group)
    │   ├── RM-STORES, PM-STORES, BULK-STORES, FG-STORES
    │   └── WIP-PRODUCTION
    ├── REJECTED          is_rejected_warehouse = 1
    ├── RETAINED-SAMPLES  Company sample retention warehouse
    └── JOB-WORK-<filler> supplier warehouses for subcontracting
```

The truth about a lot's status is **the warehouse it sits in**. The ledger therefore records
every status change as a normal, auditable stock movement, and stock reports show held stock
separately. A `qc_status` custom field on Batch (Hold, Released, Rejected, Partly released) is
a derived convenience for lists and labels. A hook updates it on every QC Release, and a
nightly job checks it against the warehouse balances.

### 3.2 Flows

**Incoming material (RM/PM):**

1. **Purchase Receipt.** Accepted warehouse = `RM-QC-HOLD` or `PM-QC-HOLD`. Dock damage goes
   to `rejected_qty` → `REJECTED`. A batch is created with supplier lot, mfg/expiry dates and
   the COA attached.
   - Items keep `inspection_required_before_purchase` = **0**, so the receipt posts
     immediately. Testing happens on the transfer out of hold.
   - The guard in §3.3 stops anything except QC Release from moving stock out of a QC-HOLD
     warehouse.
2. **QC queue (report).** Every batch with a positive balance in a QC Hold warehouse, oldest
   first, with SLA age.
3. **Quality Inspection.** `inspection_type` = Incoming, `reference_type` = Stock Entry, the
   batch, readings against the template. Status is Accepted or Rejected, set automatically
   from the readings or manually with a reason.
   Order of creation matters, because ERPNext validates that the QI's reference matches the
   Stock Entry row (`validate_qi_reference`):
   - "Start inspection" on the queue creates a **draft QC Release** and its **draft Stock
     Entry**.
   - It then creates the **QI** with `reference_type = Stock Entry` and `reference_name` = that
     draft, and links the QI on the Stock Entry row.
   - Inspection data is entered and the QI is submitted. The QC Release is submitted last.
   - A spike test in week 1 of Phase 1 confirms this sequence on v16 before the DocType is
     built (see the roadmap).
4. **QC Release** (new `factory_ops` DocType, submittable). Fields: batch, item, hold
   warehouse, quantity, decision (Release, Reject, Conditional release), QI link, deviation
   link (required for a conditional release), and remarks. On submit it creates and submits,
   **in the same transaction**:
   - **Release:** a `Stock Entry`, purpose Material Transfer, `inspection_required = 1`, from
     the hold warehouse to the usable warehouse. ERPNext's own check then refuses it unless the
     QI is submitted and Accepted.
   - **Reject:** a Material Transfer from the hold warehouse to `REJECTED`, with
     `inspection_required = 0`, because the standard check would block a Rejected QI. The
     factory_ops validation requires a submitted QI with status Rejected instead.
   - **Partial:** the same, for part of the quantity. The rest stays on hold.
   - **Conditional release:** a Release that needs a linked, approved Deviation and a QA
     Manager role.

   Cancelling the QC Release cancels its Stock Entry, which reverses the ledger rows. It is
   blocked if any of the released stock has already been consumed.
5. **Rejected stock.** Return to vendor (Purchase Return) or scrap (Material Issue with a scrap
   reason).

**Made goods (BULK/FG):**

- The bulk Work Order's `fg_warehouse` is `BULK-QC-HOLD`, and the FG Work Order's is
  `FG-QC-HOLD`. The Manufacture entry posts the output into hold with a new batch.
- From there the flow is the same QC queue → QI (In Process for bulk, Outgoing for FG) → QC
  Release.
- Filling consumes bulk only from `BULK-STORES`, so unreleased bulk cannot be filled.

**Returns:** the Sales Return posts to `RETURNS-QC-HOLD`. QC Release decides restock (to
FG-STORES), rework (to WIP via a rework Work Order) or reject.

### 3.2a Spike result (2026-11-04, ERPNext v16.53.0): the sequence that works

Verified by `apps/factory_ops/factory_ops/tests/test_spike_qi_lifecycle.py` (8 tests, all pass):

1. A draft Material Transfer (`inspection_required = 1`) from hold to destination can be saved.
2. A Quality Inspection with `reference_type = Stock Entry`, `reference_name` = that draft, the
   same item and batch can be inserted and submitted. On submit, ERPNext writes the QI onto the
   matching draft row itself (matched by item and batch).
3. Submitting the transfer is then refused when the QI is missing, still draft, or Rejected, and
   allowed when it is submitted and Accepted.
4. A QI belongs to exactly one Stock Entry. It cannot be reused on a second transfer, and it cannot
   be cancelled while its transfer is submitted.
5. With `inspection_required = 0`, ERPNext does not look at the QI at all.

**Changes to the design from the spike:**
- **One QI per QC Release.** A partial release and the later rejection of the remainder each get
  their own QI and their own transfer.
- **Reject and Conditional Release** use `inspection_required = 0`. `factory_ops` checks the QI
  itself: Rejected and submitted for Reject; submitted plus an approved QC Deviation for
  Conditional.
- **Permissions.** Batch create (Stock User, Manufacturing User) and Serial and Batch Bundle rights
  (QC roles) were missing in v16 defaults (DECISIONS D-007).
- **The draft transfer is updated in place** while the QC Release is a draft, so the row the QI
  points to is never replaced.

**As implemented:** QC Release save → draft transfer; "Create Quality Inspection" → QI on that
draft; QI submit; QC Release submit → roles, batch row lock, qty, segregation, QI, deviation →
transfer submitted under a process-local flag → batch status recomputed.

### 3.3 Guards (`factory_ops` `doc_events`, run in `validate` and `before_submit`)

| Guard | Applies to | Rule |
| --- | --- | --- |
| G1 Hold exit | Stock Entry (all purposes), Delivery Note, Sales Invoice with update_stock, Pick List, Work Order source/WIP warehouses, Material Request transfers | No row may take stock **out of** a warehouse of type "QC Hold" unless the document was created by a QC Release (`custom_qc_release` link set by server code, not editable) |
| G2 Rejected exit | Same | Out of `REJECTED` only by Purchase Return, Material Issue (scrap) or a rework Work Order, with a reason |
| G3 Reservation | Stock Reservation Entry | Warehouse must not be QC Hold or rejected |
| G4 Release segregation | QC Release (Release/Conditional) | The submitting user must not be:<br>• the owner of the Purchase Receipt/Manufacture entry that created the batch;<br>• the owner of the Work Order;<br>• for bulk/FG, the user recorded as operator on the batch record (Phase 4).<br>This is checked in server code. Frappe Workflow's `allow_self_approval` only compares against the **document owner** (`frappe/model/workflow.py` line 308), which is not enough |
| G5 Role | QC Release | Release/Reject need role "QC Officer". Conditional release needs "QA Manager" |
| G6 Expiry | All outward movement | Standard `validate_batch_is_usable`. factory_ops adds a configurable "minimum remaining shelf life to dispatch" check |

Each guard has a test that tries the forbidden action through the server API, not just the
UI, and asserts it fails.

### 3.4 State diagram (batch)

```
             PR / Manufacture                QC Release: Release
  (none) ─────────────────────▶ HOLD ──────────────────────────────▶ RELEASED ──▶ consumed / sold
                                 │  ╲  QC Release: Partial             ▲
                                 │   ╲──────────────▶ PARTLY RELEASED ─┘
                                 │ QC Release: Reject
                                 ▼
                              REJECTED ──▶ returned to vendor / scrapped / rework WO ──▶ HOLD
  RELEASED ── expiry date passes ──▶ EXPIRED (blocked by standard check; Material Issue to scrap)
```

### 3.5 Send for Re-test (QC Retest), implemented 2026-11-05

Rejected stock leaves the Rejected warehouse only by scrap (Material Issue with a disposal reason), by
return to the supplier, or by a **QC Retest** submitted by a QA Manager. The QC Retest moves the
quantity back to the QC Hold warehouse it was rejected from, in one transaction, under a process-local
flag (same pattern as QC Release). The material is then ordinary held stock: a new QC Release with a
new accepted QI is required (an old QI is bound to its old transfer and ERPNext refuses to reuse it).

### 3.6 Goods receipt (Purchase Receipt), implemented 2026-11-05

```
PO (approved by limit) ──make_purchase_receipt──▶ GRN draft
  before_validate: QC item rows → warehouse = item group's QC Hold default; rejected qty → REJECTED
  validate:        mfg date not in future; expiry after mfg
  before_submit:   supplier batch no, mfg date, expiry (if tracked), COA (if group requires) mandatory
                   → Batch created from them (supplier, dates, COA, reference = GRN)
  on_submit:       ERPNext posts stock ledger (QC Hold, REJECTED) and GL; batch QC status = Hold
```

Stock-updating Purchase Invoices are refused for QC items; the invoice is made from the GRN instead.

### 3.7 Purchase approval, implemented 2026-11-05

`Purchase Approval Limit` (user, limit in company currency, optional company, enabled). Submitting a
Purchase Order is the approval: the submitter must not be its creator and must hold a limit ≥ the PO's
base grand total. Enforced in `before_submit`, so Desk, REST and imports are covered (tested via
`frappe.client.submit`).

### 3.8 Stock Settings set by factory_ops

`enable_serial_and_batch_no_for_item = 1`, `allow_negative_stock = 0`, `allow_negative_stock_for_batch = 0`,
`pick_serial_and_batch_based_on = Expiry` (FEFO), `valuation_method = Moving Average`,
`enable_stock_reservation = 1`, both QI actions = Stop.

## 4. The brief's non-negotiable rules (§6) on ERPNext v16

| # | Rule | How it is met | Status |
| --- | --- | --- | --- |
| 1 | Append-only stock ledger | Stock Ledger Entries are written only by submitted documents. Submitted documents cannot be edited, and cancellation writes reversing rows (`is_cancelled`). Optional later: a MariaDB trigger refusing UPDATE/DELETE on `tabStock Ledger Entry` other than the `is_cancelled` flag ERPNext sets. Test before enabling | Standard |
| 2 | No negative stock | `allow_negative_stock = 0` and `allow_negative_stock_for_batch = 0` (Stock Settings). Test proves it per item × warehouse × batch | Standard |
| 3 | Quality gates | §3 above | factory_ops |
| 4 | Segregation of duties | PO: Workflow with `allow_self_approval = 0`. Batch release: guard G4. Formulation: same check in R&D app (Phase 3). Payment: Workflow on Payment Entry | factory_ops |
| 5 | Approval limits | `Approval Limit` DocType (user, document type, max amount) and a Workflow condition calling a whitelisted `factory_ops` function | factory_ops |
| 6 | FEFO | `pick_serial_and_batch_based_on = Expiry`. Override (choosing a later-expiry batch) needs a reason field and a supervisor role (validation) | Standard + factory_ops |
| 7 | Two-way traceability in under 2 s | `factory_ops` trace report over Serial and Batch Entry → voucher → BOM consumption, both directions. Load-test on 5 years of generated data in Phase 11 | factory_ops |
| 8 | Atomic actions | Request = transaction. QC Release creates its Stock Entry inside the same transaction | Standard |
| 9 | Double entry, moving average, gapless numbering | Double entry: GL validation (`accounts/general_ledger.py`). Moving average: `valuation_method`. **Gapless numbering is not guaranteed**: naming series increment on insert, so deleted drafts leave gaps. Statutory invoices: confirm India Compliance's handling (`NEEDS_ACCOUNTANT_REVIEW`). Option: name sales invoices on submit with a custom autoname hook | Partial |
| 10 | Audit everything | Enable `track_changes` on all transactional DocTypes (Property Setter fixture), Audit Trail for submitted docs, Access Log. factory_ops adds `ai_assisted` (Check) and logs refused attempts from guards | factory_ops |
| 11 | Idempotent integrations | Unique index on (channel, channel_order_id, line_id) in the Channel Order DocTypes; error queue DocType | factory_ops |
| 12 | Money as integer paise/Decimal, never float | **Not achievable inside ERPNext core**, see §5. Our own code uses `Decimal` | Partial |
| 13 | Formulation lock | Phase 3 R&D app | factory_ops |
| 14 | Period lock | Accounting Period with closed document types; Period Closing Voucher | Standard |
| 15 | Reservations; bundles all-or-none | Stock Reservation Entry. Product Bundle all-or-none needs a test and a guard | factory_ops |

## 5. Money, precision and rounding audit

### 5.1 What the code does (verified)

| Layer | Behaviour | Evidence |
| --- | --- | --- |
| Storage | Currency/Float/Percent stored as `decimal(21,9)`. No float error at rest | `frappe/database/mariadb/database.py` L179–183 |
| Arithmetic | Values are Python `float` in memory. `flt(value, precision)` converts to float, then rounds | `frappe/utils/data.py` `flt()` L1123 |
| Rounding methods | System Settings `rounding_method`: "Banker's Rounding (legacy)" (**default**), "Banker's Rounding", "Commercial Rounding". Commercial uses an epsilon correction and falls back to `Decimal` quantize with ROUND_HALF_UP for large values | `data.py` `rounded()` L1242–1335 |
| Field precision | A field's own `precision` wins. Otherwise Currency uses System Settings `currency_precision` (blank = from number format, `#,##,###.##` gives 2), and Float uses `float_precision` (fallback 3) | `frappe/model/meta.py` `get_field_precision()` L939 |
| Line rate on buying/selling docs | `rate` is a Currency field with no own precision, so it is **rounded to 2 decimals** at entry | `purchase_receipt_item.json` |
| UOM conversion | `conversion_factor` precision 9 | same |
| Stock valuation | Moving average: `stock_value = qty × valuation_rate`, rounded to currency precision. `valuation_rate = stock_value / qty` is stored unrounded (up to 9 dp in DB) | `stock/stock_ledger.py` L1205–1235 |
| Taxes and totals | Row-wise vs total-wise tax rounding (Accounts Settings `round_row_wise_tax`), `rounding_adjustment` to rounded total, `disable_rounded_total` per doc | `controllers/taxes_and_totals.py` |
| GL balance | If debit ≠ credit after rounding, the difference is posted to the company's **Round Off account** automatically when it is within an allowance: **₹0.50 per voucher** for all vouchers except Journal/Payment Entry (5 × 10⁻ᵖ there). Larger differences throw | `accounts/general_ledger.py` L474–534 |

### 5.2 Risks for Mintree

1. **Cheap packing items lose precision at entry.** A label bought at ₹0.175 is stored as a
   rate of ₹0.18, a 2.9% error on every unit. On 50,000 labels that is ₹250, and it flows into
   valuation and COGS.
2. **Silent round-off up to ₹0.50 per voucher.** This is correct accounting practice for
   rounding, but it can hide a real calculation error under 50 paise.
3. **Banker's rounding default.** Ties round to even (₹2.345 → 2.34). Indian invoices are
   usually expected to round half up. `NEEDS_ACCOUNTANT_REVIEW`.
4. **Float drift in long chains.** Moving-average recalculation over thousands of entries
   (repost) uses floats. Stored stock_value is re-rounded at each step, so drift is bounded,
   but `valuation_rate` can show long tails.

### 5.3 Decisions (to confirm with the accountant)

| Setting | Value | Why |
| --- | --- | --- |
| `currency_precision` | 2 | Paise |
| `float_precision` | 3 | Grams in kg, mL in L |
| `rounding_method` | Commercial Rounding | Half away from zero. `NEEDS_ACCOUNTANT_REVIEW` |
| Property Setter: `precision = 4` on `rate`, `price_list_rate`, `base_rate`, `net_rate` of Material Request/RFQ/Supplier Quotation/PO/PR/PI Item, Item Price `price_list_rate` | 4 | Sub-paisa PM prices. Amounts stay at 2 |
| Alternative for very cheap PM | Buy in "Per 1000" UOM | Keeps the price in rupees per thousand |
| `round_row_wise_tax` | per accountant | GST practice. `NEEDS_ACCOUNTANT_REVIEW` |
| Round Off account | Dedicated account + monthly report of postings | Detects hidden errors |

### 5.4 Tests (Phase 1)

- Property test (Hypothesis): random PO/PR/PI quantities and 4-dp rates. Check:
  - GL debit equals credit;
  - stock_value_difference sums to stock account GL;
  - |Round Off posting| ≤ ₹0.50 and is logged.
- Valuation test: 1,000 receipts and issues of a ₹0.175 item. The final stock_value must stay
  within ₹0.01 × entries of exact Decimal maths.
- `factory_ops` code: money as `Decimal` (quantized to 0.01, ROUND_HALF_UP) or integer paise,
  converted only at the ERPNext boundary. A lint rule bans `float(` in `factory_ops/money`.

## 6. Numbering

| Document | Naming series | Notes |
| --- | --- | --- |
| Purchase Order | `PO-.YY.-.#####` | FY reset is configured per series. The Indian FY runs April–March, and FY variables need checking in v16 |
| Purchase Receipt (GRN) | `GRN-.YY.-.#####` | |
| Batch (RM/PM) | Supplier lot kept in `custom_supplier_lot`. Our batch ID `L-.YY.-.#####` | |
| Batch (BULK/FG) | `B-.####` per brief examples | |
| QC Release | `QCR-.YY.-.#####` | |
| Sales Invoice | Per GST series, confirmed with the accountant | Gapless risk, see §4 rule 9 |
