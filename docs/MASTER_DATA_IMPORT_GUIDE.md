# Master data import guide

How to load items, suppliers, customers, BOMs, opening stock and prices into Mintree Factory OS.
Design and reasons: DECISIONS D-035. Code: `apps/factory_ops/factory_ops/master_data/importer.py`.

## In one paragraph

Download the template, fill it in, attach it to a new **Master Data Import**, click **Validate**.
Every problem is listed by row, column, value and reason, and **nothing is written**. Fix the file,
attach it again, validate again. When the status is **Ready to Import**, click **Import**: every
row is created, or, if anything fails, nothing is. A file is imported once; changes to records that
already exist are made in Desk, where they are audited.

## Who can import

The importer creates records with **your own ERPNext permissions**. It never bypasses them.

| To import | You need (ERPNext role) |
| --- | --- |
| Open a Master Data Import | Item Manager, Stock Manager, Purchase Master Manager, Sales Master Manager, Manufacturing Manager or System Manager |
| Items | Item Manager |
| Suppliers | Purchase Master Manager |
| Customers | Sales Master Manager (or Sales User) |
| BOMs | Manufacturing User or Manager (create and submit BOM) |
| Opening Stock | Stock Manager |
| Item Prices | Sales Master Manager or Purchase Master Manager |

If you lack the right, Validate says "You are not permitted to create <DocType> records" and
nothing is imported. On the development site the SAMPLE user `sample.masterdata@sample.invalid`
holds these roles. Who holds them in production is the client's decision.

## Templates

`apps/factory_ops/factory_ops/master_data/templates/`, CSV and XLSX for each type. The XLSX has a Data
sheet (header and example rows: delete the examples) and an Instructions sheet with the rules. Columns ending in `*` are required. Use the column names
exactly; unknown columns are refused. Dates are `YYYY-MM-DD`; checkboxes are `1` or `0`.

The templates are generated from the same column definitions the importer checks, so they cannot
drift. To regenerate after changing a definition:

```bash
bench --site factory.localhost execute factory_ops.master_data.templates.write_templates
```

| Type | Creates | Template columns (`*` required) |
| --- | --- | --- |
| Items | Item | item_code\*, item_name\*, item_group\*, stock_uom\*, description, brand, has_expiry_date, shelf_life_in_days, purchase_uom, purchase_conversion_factor, quality_inspection_template, default_supplier, supplier_part_no, lead_time_days, reorder_level, reorder_qty, reorder_warehouse, valuation_rate, is_sales_item, is_purchase_item |
| Suppliers | Supplier | supplier_name\*, supplier_group\*, supplier_type, country, tax_id, email_id, mobile_no, default_currency, payment_terms |
| Customers | Customer | customer_name\*, customer_group\*, territory\*, customer_type, credit_limit, default_price_list, payment_terms, tax_id, email_id, mobile_no |
| BOMs | BOM (submitted, default) | bom_item\*, bom_quantity\*, process_loss_percentage, component_item\*, component_qty\* (one row per component) |
| Opening Stock | one Stock Reconciliation (Opening Stock) | item_code\*, warehouse\*, qty\*, valuation_rate\*, batch_no, manufacturing_date, expiry_date, supplier_batch_no |
| Item Prices | Item Price | item_code\*, price_list\*, rate\*, uom, valid_from |

## Rules checked before anything is written

**All types**
- Required columns present, required values filled, numbers, dates and choices valid.
- Links exist (item group, UOM, supplier group, warehouse, price list, payment terms, inspection
  template...). Groups must be leaf groups, not groups of groups.
- **No duplicates and no overwrites**: a key repeated in the file, or already in the system, is an
  error. Existing records are changed in Desk.

**Items**
- Items under RM, PM, BULK and FG get the factory controls automatically: batch tracking, QC release
  required, COA required for RM/PM. An item outside those groups is warned about: it will not be
  QC-controlled.
- `has_expiry_date = 1` needs `shelf_life_in_days > 0`.
- A purchase UOM different from the stock UOM needs a conversion factor > 0.
- `reorder_level` and `reorder_qty` go together; the reorder warehouse must be a Usable warehouse.

**Suppliers / Customers**
- Name (case-insensitive) and tax ID must be new. E-mail must be valid. Credit limit not negative.
- **Do not enter invented GSTINs.** Leave `tax_id` empty until the real one is known.

**BOMs**
- One row per component; rows with the same `bom_item` form one BOM. Quantity and process loss must
  be the same on every row of a BOM.
- `bom_item` must be BULK or FG. Two-stage production: an FG BOM consumes BULK and PM, a BULK BOM
  consumes RM (other mixes are warned about). A BULK component needs a default BOM, existing or
  earlier in the same file.
- An item that already has a default BOM is refused: make a new version in Desk.

**Opening Stock**
- Choose the company and the **posting date** on the import.
- Only **Usable** or **QC Hold** warehouses of the company. Stock counted into QC Hold waits for a
  QC Release like any received stock. Rejected and untyped warehouses are refused.
- Batch items need `batch_no`, and items with expiry need an `expiry_date`; expired batches,
  manufacturing dates after the posting date, and a batch that exists with another item or expiry
  are refused.
- Opening stock is entered once: an item that already has stock in the company is refused.

**Item Prices**
- Price list must exist and be enabled; rate > 0; a UOM other than the stock UOM needs a conversion
  on the item. A blank `valid_from` counts as today (as ERPNext does), and overlapping prices are
  refused.

## Statuses

| Status | Meaning | Next |
| --- | --- | --- |
| Draft | File attached, not yet checked (also after attaching a new file) | Validate |
| Has Errors | The Issues table lists every problem; nothing was written; Import is refused | Fix the file, attach it again |
| Ready to Import | No errors (warnings may remain) | Import |
| Imported | Every row created; the created records are listed | A finished import cannot take another file; start a new one |
| Failed | ERPNext refused a record during import; everything was rolled back; the row is reported | Fix and import again |

## Recommended order for a new site

1. Items (after Item Groups, UOMs, brands and inspection templates exist).
2. Suppliers and Customers.
3. BOMs: BULK first, then FG (or both in one file, BULK rows first).
4. Item Prices.
5. Opening Stock, last, on the cut-over date.

## Checked by

- 15 unit tests (`tests/test_master_data.py`).
- HTTP check as SAMPLE users through the same endpoints as the form
  (`deploy/dev/acceptance_import_http.py`, 19 checks): who may import, an invalid XLSX reported by
  row and column with nothing written, import refused until clean, a corrected file imported with
  the factory controls applied, a repeat import refused, a finished import locked, a supplier CSV.
