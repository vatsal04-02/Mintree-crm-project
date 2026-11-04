# Building Mintree Factory OS on ERPNext

> **Superseded (2026-11-04)** by `SYSTEM_ARCHITECTURE.md` and the documents it links. Kept for history.
> Its "60–70% coverage" figure holds only for production, purchase and accounts; see
> `ERPNext_STANDARD_FEATURE_MAPPING.md` for the item-by-item result (41% for the whole brief).

Checked against `frappe/erpnext` `develop` at commit `4a0492b` (4 Nov 2026, version `17.0.0-dev`).
Claims marked **(verified)** were read in that source. Claims marked **(to verify)** come from
outside it and must be checked against the current docs before we depend on them.

## 1. What ERPNext is

- An open-source ERP built on the **Frappe Framework**: Python on the server, MariaDB as the main
  database, Redis, background workers, and a metadata-driven admin UI called "Desk". New
  ERPNext screens use **Frappe UI**, which is Vue-based. **(verified: README, `banking/`)**
- Licence: **GPL-3.0**. **(verified: `license.txt`)** Using it inside the factory is fine. If we
  hand the client a modified copy, they must also get its source. Since the client pays for the
  build, that suits us. A lawyer should still confirm this before go-live.
- Requires Python ≥ 3.14 on `develop`. **(verified: `pyproject.toml`)**
- Every business document is a **DocType**, and gets a REST API for free:
  `/api/resource/<DocType>` for records and `/api/method/<path>` for whitelisted functions.
  Login uses session cookies or API keys, and roles and permissions come built in.
- 21 modules **(verified: `modules.txt`)**: Accounts, CRM, Buying, Projects, Selling, Setup,
  Manufacturing, Stock, Support, Utilities, Assets, Portal, Maintenance, Regional, ERPNext
  Integrations, Quality Management, Communication, Telephony, Bulk Transaction, Subcontracting
  and EDI.

## 2. The brief's areas, mapped to ERPNext

| Brief area | What ERPNext already has (DocTypes) | Fit | What we build in our own app |
| --- | --- | --- | --- |
| 1. Production | Production Plan, Master Production Schedule, Sales Forecast, Work Order, Job Card, BOM, BOM Creator, Routing, Operation, Workstation, Downtime Entry, Plant Floor, and Subcontracting Order/Receipt for job work **(verified)** | Strong | Two-stage bulk → fill-and-pack flow as linked work orders; electronic batch record (step checklist with pH, viscosity and temperature readings against limits); line clearance checklist; yield variance alert; rework orders |
| 2. Purchase (RM/PM) | Material Request, Request for Quotation, Supplier Quotation, Purchase Order, Purchase Receipt (GRN), Landed Cost Voucher, Supplier Scorecard, Item Supplier, Item Lead Time, Item Reorder **(verified)** | Strong | Separate RM and PM approval rules; approval limits per user (Frappe Workflow plus a validation hook); a warning on PM artwork version at GRN; scan-based GRN on the tablet |
| 3. Dispatch | Sales Order, Pick List, Packing Slip, Delivery Note, Shipment, Delivery Trip, Stock Reservation Entry **(verified)**. GST invoice, e-invoice (IRN) and e-way bill come from the **India Compliance** app **(to verify)** | Good | Courier aggregator connector (AWB, label, NDR, COD remittance); scan-to-verify pack station; RTO/returns inspection flow; dispatch SLA board |
| 4. R&D and formulation | Nothing dedicated. BOM versions and Item Alternative help at the edges | **Gap** | Formulation, Formulation Version (% w/w, phase, INCI, totals equal 100%), Lab Trial, Stability Study, restricted-ingredient list, cost roll-up, INCI label generator. On approval a version locks and generates the BOM and Routing |
| 5. Quality (QC/QA) | Quality Inspection with Template, Parameter and Reading. Stock Settings: "action if quality inspection is not submitted" and "action if rejected" (Stop/Warn). Item flags: inspection required before purchase or delivery. Non Conformance, Quality Action, Quality Procedure, Quality Goal, Quality Review **(verified)** | Partial | **HOLD as a lot status**, see §3. Also: COA generation and storage, retained samples, OOS/deviation, complaints linked to batch and customer, CAPA effectiveness check, recall drill export |
| 6. Maintenance | Asset, Asset Maintenance (task, log, team), Asset Repair, Maintenance Schedule and Visit **(verified)** | Good | Breakdown request in two taps with a photo; MTTR/MTBF; a block on scheduling work orders onto a machine that is broken down (a hook on Work Order/Job Card); calibration and utility logs |
| 7. Accounts | 192 accounting DocTypes: GL Entry, Journal Entry, Payment Entry, Accounting Period (period lock), Budget, Cost Center, Accounting Dimension, Bank Reconciliation Tool, Bank Statement Import, Dunning, financial reports **(verified)**. TDS (Tax Withholding) is in core. GST returns come from India Compliance **(to verify)** | Strong | Marketplace settlement reconciliation (payout lines matched to orders, unmatched lines to a queue); channel P&L; Tally XML export |
| 8. E-commerce channels | Removed from core. Shopify was deleted in v14 **(verified: `patches/v14_0/delete_shopify_doctypes.py`)**. The separate **`frappe/ecommerce_integrations`** app covers Shopify and Amazon, among others **(to verify)** | Partial | Flipkart, Myntra and Nykaa connectors (CSV import first, per brief §8); one channel interface; SKU mapping error queue; available-to-sell stock push; listing health |
| 9. Meta | Nothing | **Gap** | Ad spend pull, Conversions API, catalog sync, ROAS by SKU joined to COGS, brand asset library, content calendar, influencer tracker |
| 7.10 extras | Inventory and bins (Warehouse, Putaway Rule, Stock Reconciliation), Sales and CRM (Customer, Price List, Pricing Rule, Lead, Opportunity), Projects, Support (Issue, SLA). HR comes from the separate **`frappe/hrms`** app **(to verify)** | Strong | EHS log, compliance register with expiry reminders, role-based home queues, Hindi UI review |
| AI layer | Nothing | **Gap** | Claude assistant as whitelisted, read-only Frappe methods that run with the signed-in user's permissions; drafts saved as Draft documents. The brief's §9 hard rules still apply |

**In short:** ERPNext already covers about 60–70% of the brief's ledger-heavy core: stock,
batches, BOMs, work orders, purchase, sales and accounts. These are also the riskiest parts to
write from scratch. The gaps sit in the areas specific to cosmetics and D2C: formulation R&D,
quality hold and release, eBMR, marketplaces other than Shopify and Amazon, Meta, and the AI
assistant.

## 3. The brief's non-negotiable rules (§6), checked against ERPNext

| # | Rule | ERPNext behaviour | Action |
| --- | --- | --- | --- |
| 1 | Append-only stock ledger | Stock Ledger Entry rows are written by submitted documents. A submitted document cannot be edited, and cancelling it writes reversing rows | Keep. Add a DB trigger refusing UPDATE/DELETE on `tabStock Ledger Entry` only if the audit requires it |
| 2 | No negative stock | `allow_negative_stock` setting, default 0 **(verified)**. There is also a per-batch flag | Keep it off. Add a test |
| 3 | Quality gates (HOLD → pass → usable) | Quality Inspection can block a submit (Stop), but ERPNext has **no lot status**. Once received, a lot can be consumed | **Custom**: receive into a `QC-HOLD` warehouse, release by a Stock Entry transfer to the usable warehouse on QC pass, reject to `REJECTS`. Add a `qc_status` field on Batch and a validation hook so held, rejected or expired batches cannot be issued, reserved or sold |
| 4 | Segregation of duties | Frappe Workflow has "allow self approval" turned off per transition | Workflows on Purchase Order, the release Stock Entry, Formulation Version and Payment Entry, plus server-side checks |
| 5 | Approval limits | Workflow conditions can read `grand_total` | A user-limit DocType and a condition in the workflow |
| 6 | FEFO | `pick_serial_and_batch_based_on` = FIFO / LIFO / **Expiry** **(verified)** | Set it to Expiry. Overrides need a reason and a supervisor (custom) |
| 7 | Two-way traceability in under 2 s | Serial and Batch Bundle links every movement | A custom trace report with indexed queries. Test it on a 5-year data volume |
| 8 | Atomic actions | One request runs in one DB transaction and rolls back on error | Keep |
| 9 | Double entry, moving average, gapless numbering per FY | Moving average valuation and balanced GL are in core. Naming series are sequential but **not guaranteed gapless** (deleted drafts leave gaps) | Statutory invoices use India Compliance numbering **(to verify)**. Otherwise number on submit |
| 10 | Audit everything | Version log and Activity log on every document | Add an "AI-assisted" flag and logging of refused attempts |
| 11 | Idempotent integrations | Up to each connector | Idempotency keys on channel order and line ID in our app |
| 12 | Money in paise or Decimal, never float | Frappe stores Currency as DECIMAL(21,9) in the DB, but **Python code often handles amounts as `float` (`flt()`)** | Accept this as a known gap from the brief and document it. Rounding is governed by precision settings. Cover it with tests on our own code |
| 13 | Formulation lock | Not in core | Custom (R&D app) |
| 14 | Period lock | Accounting Period plus "Closed Documents" **(verified)** | Keep |
| 15 | Reservations, and bundles reserve all components or none | Stock Reservation Entry **(verified)**. Product Bundle reservation is partial | Test bundles. Add a custom check |

## 4. Where it conflicts with the brief

The brief's §3 fixes the stack and says "do not substitute": FastAPI, SQLAlchemy, PostgreSQL,
Procrastinate, React with TanStack, and our own auth. Moving to ERPNext replaces most of that
list:

- **Server:** Frappe instead of FastAPI and SQLAlchemy. Background jobs use RQ on Redis instead
  of Procrastinate.
- **Database:** MariaDB is the main supported database. Frappe has partial PostgreSQL support,
  but ERPNext on Postgres is less tested. **Choose MariaDB** for anything going to production.
- **Contract:** Frappe has no OpenAPI → Orval → Zod chain. The REST API is generic, so our own
  screens need hand-written types or a small generator built from DocType JSON.
- **UI:** Desk does not follow the brief's §4 anti-slop rules, and it cannot be fully restyled.
  We only control the design on screens we build ourselves.
- **Brief update needed:** sections 3, 5 and 10 must be revised and signed off by the client
  before this route is taken.

What we gain: years of tested stock, valuation, GL, tax-withholding and manufacturing logic, a
permission model, print formats, and an Indian partner ecosystem. That removes most of Phases 1,
2, 5 and 6 as greenfield work.

## 5. Recommended architecture

```
frappe-bench/
  apps/
    frappe                 framework (pinned version-NN branch, not develop)
    erpnext                unmodified; never fork or patch core
    india_compliance       GST, e-invoice, e-way bill (to verify)
    ecommerce_integrations Shopify and Amazon (to verify)
    hrms                   optional, HR light (to verify)
    mintree_factory        OUR app: all custom DocTypes, hooks, workflows, fixtures, API
  sites/factory.mintree.in
mintree-crm-project/       this repo
  apps/mintree_factory/    the Frappe app (Python, DocType JSON, fixtures, tests)
  apps/web/                our React PWA for shop floor and role queues, over the Frappe REST API
  deploy/                  Docker Compose (frappe_docker), Caddy, backups
  docs/
```

Rules for the custom app:

1. **Never edit ERPNext core.** Extend it with `doc_events` hooks, Custom Fields (as fixtures),
   Property Setters, Workflows, `override_doctype_class` only as a last resort, and our own
   DocTypes. That keeps yearly major upgrades possible.
2. **Pin to a stable branch** (`version-16` or whichever is current at start), not `develop`.
   The source checked here is `develop` / v17-dev.
3. **Two UIs, split by job.**
   - Desk handles back-office work: accounts, purchase, masters and reports. It is good enough
     there.
   - The `apps/web` PWA handles shop-floor and role queues: GRN by scan, QC hold queue, material
     issue, pick and pack, breakdown request. It carries the brief's design system.
   - The PWA calls `/api/method/mintree_factory.api.*` with the Frappe session cookie, served from
     the same domain.
   - ERPNext's own convention would be Vue with Frappe UI. Staying on React keeps the design
     tokens and tests already started.
4. Custom DocTypes in `mintree_factory`:
   - R&D: Formulation, Formulation Version, Formulation Ingredient, Lab Trial, Stability Study,
     Stability Pull, Restricted Ingredient.
   - Quality: Batch QC Status (custom fields), Retained Sample, Deviation, OOS Investigation,
     Complaint, CAPA, COA.
   - Production: Batch Record, Batch Record Step, Line Clearance.
   - Maintenance: Breakdown Request, Calibration Log.
   - Channels: Sales Channel, Channel SKU Map, Channel Order, Channel Settlement, Settlement Line,
     Integration Error.
   - Meta: Ad Campaign Spend, Creative, Influencer.
   - Compliance: Compliance Licence, Approval Limit.
5. **AI.** Whitelisted, read-only methods that call Claude with tool use. They run as
   `frappe.session.user`, so permissions apply automatically. Drafts are saved as documents with
   `docstatus = 0` and an `ai_generated` flag.

## 6. Revised phase plan (if adopted)

| Phase | Scope on ERPNext |
| --- | --- |
| 0 | Bench in Docker (frappe_docker), pinned versions, `mintree_factory` app skeleton, roles, CI running `bench run-tests`, PWA shell and design tokens talking to Frappe login |
| 1 | Masters via Data Import (items RM/PM/BULK/FG, UOM conversions, warehouses incl. QC-HOLD/REJECTS, batches), negative stock off, FEFO on |
| 2 | Purchase workflows and limits, GRN into HOLD, QC release/reject flow, PWA QC queue and scan GRN |
| 3 | R&D app (formulations → BOM and Routing) |
| 4 | Work orders bulk → fill, eBMR, Asset Maintenance plus breakdown block |
| 5 | India Compliance setup, pick/pack PWA, courier aggregator |
| 6 | Accounts configuration with the CA, settlement reconciliation |
| 7 | ecommerce_integrations (Shopify, Amazon), CSV importers for Flipkart, Myntra and Nykaa |
| 8 | Meta and CRM |
| 9 | AI layer |
| 10–11 | Support modules, load test with 5 years of data, restore drill |

Phases 1, 2, 5 and 6 become mostly **configuration plus tests** instead of new code. This is
the main saving.

## 7. Risks

- **Upgrades.** A major version arrives about once a year, and every customisation must survive
  it. Mitigation: hooks and fixtures only, and a test suite in CI against the pinned version.
- **The float rule.** It cannot be met inside ERPNext core, only in our own code.
- **Desk UX for non-technical staff on tablets.** The PWA must cover every shop-floor task.
- **MariaDB instead of Postgres.** Backups, WAL-G and the pg_trgm search plans change.
  MariaDB backups use `bench backup` or mariabackup.
- **India Compliance and ecommerce_integrations** are third-party or separately maintained apps.
  Check their versions against the pinned ERPNext.

## 8. Decisions needed from the client

1. Approve replacing the brief's §3 stack with Frappe/ERPNext (and MariaDB).
2. Back office in Desk and shop floor in our PWA: React (as briefed) or Vue/Frappe UI?
3. Hosting: self-hosted Docker on a Mumbai VPS (as briefed) or Frappe Cloud.
4. Accept the GPL-3.0 obligations for the custom app.
