# Production workflow (Milestone 4)

How Mintree makes bulk and finished goods on ERPNext v16 with the `factory_ops` controls. Everything
is standard ERPNext (BOM, Work Order, Stock Entry, Batch) except the controls listed in §4. The
quantities below are SAMPLE placeholders, not a real formula.

## 1. Two stages

```
RM-STORES ──┐                                   BULK-STORES ──┐
            ├─► WIP-PRODUCTION ─► BULK-QC-HOLD ─(QC Release)─►┤
            │   (BULK Work Order, kg)                         ├─► WIP-PRODUCTION ─► FG-QC-HOLD ─(QC Release)─► FG-STORES
                                                 PM-STORES ───┘   (FG Work Order, units)
```

| Stage | BOM (SAMPLE) | Work Order | Output |
| --- | --- | --- | --- |
| 1. Bulk | `SAMPLE-BULK-0001`, 100 kg from 5 kg RM-0001 + 95 kg RM-0002, **process loss 2 %** | quantity in kg | new bulk batch in **BULK-QC-HOLD** |
| 2. Fill and pack | `SAMPLE-FG-0001`, 1,000 units from 30 kg bulk + 1,000 bottles | quantity in units | new FG batch in **FG-QC-HOLD** |

The FG BOM lists the bulk as a component (with the bulk's own BOM as sub-assembly). The FG Work Order
consumes **released bulk** from BULK-STORES. It never consumes the bulk's raw materials (§4.2).

## 2. Step by step (who does what)

| # | Step | Role (SAMPLE user) | ERPNext document |
| --- | --- | --- | --- |
| 1 | Plan the bulk: item, quantity. BOM and warehouses fill in (§3) | Production (Manufacturing User) | Work Order, submit |
| 2 | Move components to WIP; FEFO picks the released batches | Production (Stock User) | Stock Entry *Material Transfer for Manufacture* ("Start" on the Work Order) |
| 3 | Record the batch made: 100 kg in, 2 kg process loss, **98 kg** of a new batch into BULK-QC-HOLD, with manufacturing and expiry dates | Production | Stock Entry *Manufacture* ("Finish") |
| 4 | Test and decide on the bulk | QC Officer (not the Work Order owner) | QC Release + Quality Inspection (In Process) |
| 5 | Plan the fill: FG item, quantity in units | Production | Work Order |
| 6 | Move released bulk and bottles to WIP | Production | Material Transfer for Manufacture |
| 7 | Record the units filled. A short fill (e.g. 950 of 1,000) consumes the transferred components pro rata (28.5 kg bulk, 950 bottles) | Production | Manufacture, quantity 950 |
| 8 | Close the order and return unused components (1.5 kg bulk, 50 bottles) from WIP to their stores | Production | Work Order "Close", then "Return Components" (Material Transfer for Manufacture, is return) |
| 9 | Write off damaged or spilled material with a reason | Stores / Production | Stock Entry type **Wastage** |
| 10 | Print the batch label | anyone with Batch read | Print Format **Batch Label** (PDF, 100 × 60 mm) |
| 11 | Test and decide on the FG | QC Officer | QC Release + Quality Inspection (Outgoing) |

Manufacturing Settings: *Backflush Raw Materials Based On* = **Material Transferred for Manufacture**
(consumption follows what was actually moved to WIP, less returns), overproduction 0 %.

## 3. Configuration (no warehouse names in code)

| What | Where it is set | Seeded value |
| --- | --- | --- |
| WIP warehouse of new Work Orders | **Company → Default WIP Warehouse** (`fo_wip_warehouse`) | WIP-PRODUCTION |
| Output warehouse of a made item | Item / Item Group → Item Defaults → Default Warehouse | BULK-QC-HOLD, FG-QC-HOLD |
| Where a component is drawn from | Item → Item Defaults → **Production Source Warehouse** (`fo_production_warehouse`); else the item group's; else the QC release destination of the default warehouse | RM-STORES, PM-STORES, BULK-STORES (per group) |
| QC release destination | Warehouse → QC Release Warehouse | RM-QC-HOLD → RM-STORES, etc. |
| Account wastage posts to | **Company → Wastage Expense Account** (`fo_wastage_account`) | "Production Wastage" under Stock Expenses |
| Which entry types are wastage | Stock Entry Type → **Wastage write-off** (`fo_is_wastage`) | type "Wastage" (Material Issue) |
| Wastage reason codes | **Wastage Reason** list | 5 starter codes; the client edits them |
| BOMs | BOM (default, active) | the two SAMPLE BOMs |

An item's own setting beats its group's. A source warehouse entered on the Work Order, on a
component row or on the BOM line is kept as entered (and then checked, §4.1).

## 4. Controls added by factory_ops

### 4.1 QC Hold and Rejected stock cannot be used (existing guards, now also on BOM)
- Work Order: header source, WIP and every component source may not be a QC Hold or Rejected
  warehouse; output of a QC item must be a QC Hold warehouse. Checked on save **and** submit, so a
  value changed after saving (Desk, API, import, direct database edit) is still refused at submit.
- BOM: no line may name a QC Hold or Rejected source warehouse.
- Stock Entry (all purposes): nothing leaves QC Hold except through a QC Release; Rejected only by scrap
  with a disposal reason, return to the supplier, or a QC Retest.

### 4.2 Two-stage rule
ERPNext defaults *Use Multi-Level BOM* to on, which would explode the bulk into its raw materials and
skip bulk QC. New Work Orders whose BOM contains a QC-controlled made component (the bulk) get it
switched off; switching it back on is refused on save and on submit.

### 4.3 Wastage is not an ordinary issue
| Transaction | Wastage Reason | Posts to |
| --- | --- | --- |
| Stock Entry type **Wastage** (purpose Material Issue) | required on every row, must be enabled | Company Wastage Expense Account |
| Ordinary Material Issue (e.g. to R&D, samples) | not allowed (refused if set, so wastage cannot be misfiled) | the row's expense account (Stock Adjustment) |
| Manufacture consumption, process loss | not used | consumed value goes into the batch made |
| Scrap from REJECTED | not used; a disposal reason is required (QC guard G2) | Stock Adjustment |

### 4.4 Defaults for API and import users
The Work Order's BOM is filled from the item's default BOM on the server. Desk does this in the
browser; REST and Data Import users would otherwise get a "BOM No is mandatory" error.

### 4.5 Segregation of duties
Whoever created the Work Order cannot release its output (QC Release check). The production role has
no QC rights; QC roles cannot create Work Orders.

## 5. Process loss and valuation (verified)

100 kg in (5 kg × 200 + 95 kg × 20 = **2,900.00**) → 98 kg out, valued **2,900.00** (≈ 29.59/kg). The
2 kg loss carries no value of its own; its cost is absorbed by the good output. The Manufacture entry's
net stock value change is 0 and its GL balances. The short fill and return move value between
warehouses only. A wastage write-off of 10 bottles at 5.00 credits stock and debits the Wastage
Expense Account by 50.00.

## 6. Batch label

Print Format **Batch Label** on Batch (Jinja, Chrome PDF generator): one 100 × 60 mm page with item
code and name, batch number, manufacturing and expiry dates, quantity, the Work Order that made it,
the supplier lot for bought batches, and the QC status as a band (**QC: HOLD** printed white on
black). Open a Batch → Print → *Batch Label* → PDF, or
`/api/method/frappe.utils.print_format.download_pdf?doctype=Batch&name=<batch>&format=Batch Label`.

## 7. Not included (by decision or phase)

- **Barcode or QR on the label, and ZPL for Zebra printers.** Phase 4. The label is a PDF and can be
  printed on any label printer that accepts PDF.
- **Yield variance alert** (actual vs expected beyond a tolerance). Phase 4. Process loss is recorded
  per order and visible on the Work Order and in ERPNext's *Process Loss Report*.
- **Rework orders linked to the original batch.** Phase 4.
- **Electronic batch record, line clearance, operations, job cards, routing, machine-breakdown
  blocking.** Phase 4. Work Orders run without operations; the paper batch record is attached to the
  Work Order.
- **Production Plan / MRP** is standard ERPNext and not configured or tested for Mintree yet.
- **Real formulas, batch sizes, process-loss percentages and the wastage reason list**: client input.
