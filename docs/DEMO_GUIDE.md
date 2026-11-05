# Local demo: Mintree Factory OS on the public catalogue

A local demonstration that runs on a developer machine. Nothing is deployed to any server.

## What the demo contains, and what it is not

| Data | Source | Label |
| --- | --- | --- |
| Product names, pack sizes, categories, selling price, MRP (compare-at price), images, page URLs | Mintree's **public website**, read by `tools/website_extraction/extract.py` | Each item keeps its source URL and the time it was read. A code starting `WEB-` was generated because the site publishes no SKU |
| Raw and packaging materials, suppliers, buying prices, BOMs, QC parameters and limits, opening stock, customer, shelf life of finished goods | **Invented** (`apps/factory_ops/factory_ops/demo/data.py`) | `DEMO-` codes, `(NOT REAL)` in names, "DEMO - NOT REAL" in descriptions and BOM remarks |
| Company, warehouses, roles, sample users | The development setup | `SAMPLE` |

- Website data is public storefront information, **not** Mintree's internal ERP data.
- Storefront availability is **not** factory stock.
- The DEMO BOMs are **not** Mintree formulas. They were not derived from any published ingredient
  list.
- No invoice is a tax document: GST is not configured.

## 1. Extract the public catalogue (needs network access to vmintree.in)

Run these from the repository root:

```bash
python3 tools/website_extraction/extract.py https://vmintree.in/ data/mintree_website_extraction
```

```bash
python3 tools/website_extraction/to_erpnext.py data/mintree_website_extraction
```

The next command is optional: it downloads the product images for offline use. They stay local
and git-ignored.

```bash
python3 tools/website_extraction/fetch_images.py data/mintree_website_extraction
```

Check `extraction_summary.md`, `extraction_errors.csv` and `erpnext/mapping_review.csv` before
the demo. Category rules can be edited in `tools/website_extraction/category_rules.csv`.

The extractor obeys robots.txt and waits 1.5 s between requests. It caches every response, so a
re-run makes no new requests unless you pass `--refresh`.

## 2. Build (or rebuild) the demo site

Run as the bench user, with the development services up (`deploy/dev/compose.yaml`):

```bash
deploy/demo/reset-demo.sh data/mintree_website_extraction
```

This creates `demo.localhost` from nothing:
- the SAMPLE company, warehouses and roles;
- sample users, whose passwords go to `sites/demo.localhost/private/sample_users.json`;
- the website catalogue, loaded through **Master Data Import**;
- the DEMO materials, suppliers, BOMs, QC templates and opening stock.

Running it again drops and rebuilds **only** `demo.localhost`. It refuses to drop any site that is
not marked `fo_demo_site`, and it never touches application code, `factory.localhost` or
`test.localhost`.

## 3. Serve it and run the scenario

```bash
cd ~/frappe-bench/sites && ../env/bin/python -m frappe.utils.bench_helper frappe --site demo.localhost serve --port 8001 --noreload
```

```bash
~/frappe-bench/env/bin/python deploy/demo/demo_scenario_http.py http://127.0.0.1:8001 demo.localhost ~/frappe-bench/sites/demo.localhost/private/sample_users.json
```

The scenario runs the full purchase → QC → production → QC → sales → cash flow as the sample users
(22 checks). It prints every document it created and saves the list to
`sites/demo.localhost/private/demo_documents.json`. Run it before the meeting, so the screens have
data. It can be run again; each run adds one more complete cycle.

Open http://demo.localhost:8001 in a browser. `*.localhost` resolves to the machine itself.

## 4. Walkthrough for Mintree (about 30 minutes)

Log in as the user named in each step (passwords in `sample_users.json`). Use the document numbers
the scenario printed.

1. **Product master** (Administrator or `sample.masterdata`):
   - Item list, grouped by Item Group (Skin Care, Hair Care, Bath & Body…). Show one product:
     public name, pack size, image, and the *Public website catalogue* section with source URL,
     published SKU (or generated `WEB-` code) and the time it was read.
   - Price lists: *Standard Selling* holds the website price and *MRP* holds the compare-at price,
     kept apart.
   - *Master Data Import* list: the catalogue arrived through the validated import, row by row.
2. **Purchase** (`sample.buyer`, then `sample.approver`):
   - The buyer's Purchase Order for DEMO materials.
   - The buyer cannot submit it. The approver approves it within their limit.
3. **Goods receipt** (`sample.stores`): the Purchase Receipt into *RM-QC-HOLD* with supplier lot,
   dates and COA. Try moving held stock by a Stock Entry: it is refused.
4. **QC** (`sample.qc`): the *Quality Control* workspace and QC Queue, a Quality Inspection, and
   the QC Release that moves the batch to RM-STORES.
5. **Production** (`sample.production`):
   - The *Production Floor* workspace.
   - The bulk Work Order (DEMO BOM, 2 % process loss) and its issue and manufacture entries. The
     bulk lands in BULK-QC-HOLD and is released by QC.
   - The Work Order for the **website product**, with output in FG-QC-HOLD.
6. **Finished goods QC** (`sample.qc`): the FG inspection and release. The batch status on the
   Batch form reads *Released*.
7. **Sales and dispatch** (`sample.sales`, `sample.dispatch`):
   - The Sales Order, priced from the website selling price.
   - The FEFO Pick List of released, unexpired batches, and the reservation.
   - The Delivery Note with transporter and LR number.
8. **Accounts** (`sample.accounts`):
   - The Sales Invoice made from the Delivery Note, and the Payment Entry.
   - The General Ledger for the Delivery Note, which books cost of goods sold.
   - The *Factory Accounts* workspace.
9. **Management** (`sample.management`): the read-only *Management* workspace, with stock value by
   RM / PM / BULK / FG, batches awaiting QC, batches made, orders, dispatches and receivables.
10. **Department workspaces:** log in as each sample user to show that everyone sees only their own
    workspace.

## 5. If something goes wrong

- **"Too many queued background jobs"**: the bench has no running workers. `reset-demo.sh` drains
  the queue with `bench worker --burst` between steps; during a live demo run `bench start` so
  workers, scheduler and the web server all run.
- **A rebuild stopped half way** leaves `sites/demo.localhost` without the `fo_demo_site` marker, and
  the script then refuses to touch it. Check that it is the demo site, then remove it once by hand:

  ```bash
  bench drop-site demo.localhost --force --no-backup --db-root-username root --db-root-password "$DEV_DB_ROOT_PASSWORD"
  ```

- **No website product**: the scenario stops with "No website product on this demo site" until the
  extraction has been run and the site rebuilt with it. It never substitutes an invented product.

## 6. Checks done on this build

See `PHASE_1_TEST_RESULTS.md`, "Local demo" section.
