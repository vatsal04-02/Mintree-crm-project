# ERPNext standard feature mapping

Every requirement in sections 7.1–7.10 and 9 of the Mintree build brief, scored against the
pinned release.

- **Verified against:** ERPNext `v16.53.0` (commit `9cd11b1`), Frappe `v16.55.2` (commit `3d1284c`),
  India Compliance `version-16` (`53a39ca`), ecommerce_integrations `version-16` (`a984a72`),
  HRMS `version-16` (`3b7f8f2`). Evidence is the DocType or setting present in that source.
- **Not tested:** this mapping comes from reading the source. Each "S" item still needs a
  scenario test on a running site in Phase 1 before it is signed off.

## Status key

| Code | Meaning | Weight |
| --- | --- | --- |
| **S** | Standard: met by ERPNext/Frappe configuration, no code | 1.0 |
| **T** | Third-party Frappe app (India Compliance, ecommerce_integrations, HRMS), configuration only | 1.0 |
| **P** | Partial: a standard base exists; `factory_ops` adds fields, validation, a report or a DocType | 0.5 |
| **C** | Custom: nothing usable in standard; built in `factory_ops` or as an integration | 0.0 |

**Weighted coverage** = (S + T + 0.5 × P) ÷ items. It counts requirements equally; it does not
measure effort. One "C" (eBMR) can cost more than five "S" items.

## Summary

| Area | Items | S | T | P | C | Weighted coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 7.1 Production | 9 | 3 | 0 | 5 | 1 | 61% |
| 7.2 Purchase | 9 | 5 | 0 | 3 | 1 | 72% |
| 7.3 Dispatch | 10 | 0 | 2 | 5 | 3 | 45% |
| 7.4 R&D | 9 | 0 | 0 | 2 | 7 | 11% |
| 7.5 Quality | 9 | 1 | 0 | 6 | 2 | 44% |
| 7.6 Maintenance | 7 | 2 | 0 | 3 | 2 | 50% |
| 7.7 Accounts | 9 | 5 | 1 | 1 | 2 | 72% |
| 7.8 E-commerce | 7 | 0 | 0 | 4 | 3 | 29% |
| 7.9 Meta | 10 | 0 | 0 | 0 | 10 | 0% |
| 7.10 Supporting | 11 | 3 | 0 | 6 | 2 | 55% |
| 9 AI layer | 7 | 0 | 0 | 1 | 6 | 7% |
| **All areas** | **97** | **19** | **3** | **36** | **39** | **41%** |

### Correction to the earlier estimate

`docs/erpnext-assessment.md` claimed **60–70%** coverage. Item by item:

| Scope | Weighted coverage |
| --- | ---: |
| Ledger-heavy core: production, purchase, accounts (27 items) | **69%** |
| Core factory operations: 7.1–7.3, 7.5–7.7, 7.10 (64 items) | **57%** |
| Whole brief incl. R&D, e-commerce, Meta, AI (97 items) | **41%** |

The 60–70% figure holds **only** for the ledger-heavy core. It overstated coverage for the
brief as a whole. ERPNext's real value is that the hardest-to-get-right parts are standard:
stock ledger, batch valuation, GL postings, taxes and manufacturing costing. The cosmetics, D2C
and AI layers are mostly custom.

### Non-negotiable rules (brief section 6)

These are scored separately in `DATABASE_AND_WORKFLOW_DESIGN.md` section 4.

- **Met by standard behaviour:** 4 of 15 rules (append-only ledger, no negative stock, atomic
  actions, period lock).
- **Met with factory_ops guards on a standard base:** 9 rules.
- **Only partly achievable:** 2 rules (float-free money, gapless numbering).

## Detailed matrix

### 7.1 Production

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Weekly production plan from forecast, open orders, stock cover | **S** | Production Plan, Sales Forecast, Master Production Schedule | Stock-cover weeks view is a report (factory_ops) |
| 2 | Two-stage work orders: bulk (kg) then filling and packing (units) | **S** | Multi-level BOM (FG BOM consumes BULK item), Work Order, Production Plan sub-assemblies | — |
| 3 | Material issue by scan, FEFO lot suggestion, partial issue, return, wastage reasons | **P** | Stock Entry (Material Transfer for Manufacture), barcode field, pick_serial_and_batch_based_on = Expiry | Wastage reason codes: custom field + validation |
| 4 | Electronic batch record: step checklist, in-process readings with limits, operator, machine, deviations | **C** | Job Card and In Process Quality Inspection are a base only | Batch Record DocType |
| 5 | Yield and loss: expected vs actual, variance alert | **P** | BOM/Work Order process_loss_percentage, process_loss_qty | Variance alert on Manufacture entry |
| 6 | Output to HOLD with auto batch no., mfg/expiry dates, batch labels (ZPL/PDF) | **P** | Batch auto-naming, Item shelf_life_in_days, Work Order fg_warehouse = FG-QC-HOLD | ZPL label print format; PDF label is standard print format work |
| 7 | Line clearance checklist; machine time and downtime for OEE | **P** | Downtime Entry, Job Card time logs, Workstation | Line Clearance DocType gating Job Card start |
| 8 | Rework and reprocess orders linked to original batch | **P** | Work Order | Custom field rework_of_batch + trace |
| 9 | Job work with outside fillers as separate warehouse | **S** | Subcontracting Order / Receipt, supplier warehouse | — |

### 7.2 Purchase

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Separate RM and PM catalogues and approval rules | **S** | Item Group, Workflow with conditions | — |
| 2 | Approved supplier list per item with specs, MOQ, lead time, last prices | **P** | Item Supplier, Item Lead Time, min_order_qty, Item Price, last purchase rate | 'Approved' status and spec per supplier-item: custom child table |
| 3 | Requisition, RFQ, quote comparison, PO draft, approval by limit, send | **P** | Material Request, RFQ, Supplier Quotation, Supplier Quotation Comparison report, PO, email | Per-user approval limit (Workflow condition + Approval Limit DocType) |
| 4 | Reorder suggestions from min/max, forecast and open work orders (MRP) | **S** | Item Reorder, Production Plan material requests | — |
| 5 | GRN by scan with supplier lot, mfg/expiry, COA upload, weight check; goods land in HOLD | **P** | Purchase Receipt, Batch fields, attachments, accepted warehouse = RM-QC-HOLD | Weight-check field and tolerance validation |
| 6 | Short, excess, damaged receipt; debit note; return to vendor | **S** | received_qty / rejected_qty / rejected_warehouse, Purchase Return, Debit Note | — |
| 7 | PM artwork version linked to item; GRN warns on wrong version | **C** | - | Artwork Version DocType + GRN validation |
| 8 | Three-way match, landed cost, payment scheduling | **S** | PR required / maintain_same_rate in Buying Settings, Landed Cost Voucher, Payment Terms | — |
| 9 | Supplier rating: OTD, rejection rate, price variance | **S** | Supplier Scorecard (configurable variables) | Variables need setting up |

### 7.3 Dispatch

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Order sources: channel, B2B, distributor, samples/testers, transfers | **P** | Sales Order, Stock Entry transfers | Channel orders arrive via connectors (7.8) |
| 2 | Availability and credit check; reserve from released stock only | **P** | Credit Limit, Stock Reservation Entry | Guard: no reservation from QC-HOLD/REJECTS warehouses |
| 3 | Wave picking with FEFO, pick by scan, pack station scan-to-verify, weight, box size | **P** | Pick List (Expiry-based batch pick), Packing Slip | Pack-verify screen and weight check (later: Frappe UI) |
| 4 | GST tax invoice: place of supply, HSN, CGST/SGST/IGST, e-invoice IRN + QR, delivery challan | **T** | India Compliance (GPL-3.0); GST API calls need an India Compliance Account (paid credits) | — |
| 5 | E-way bill generation | **T** | India Compliance | — |
| 6 | Courier aggregator: rates, AWB, label, manifest, tracking, NDR, COD remittance | **C** | Shipment DocType is a base only | Aggregator connector (client to pick aggregator) |
| 7 | Marketplace-fulfilled orders follow channel label/manifest flow | **C** | - | Per-channel flow in connectors |
| 8 | Delivery confirmation, POD, customer notification (WhatsApp/email) | **P** | Delivery Note, Notification (email) | WhatsApp provider integration |
| 9 | Returns: RTO and customer returns to RETURNS warehouse, inspect, restock/rework/scrap, credit note, channel claim | **P** | Sales Return, Credit Note, Quality Inspection | RETURNS-HOLD warehouse reuse of QC release; claim tracking |
| 10 | Dispatch dashboard: SLA, late shipments, NDR queue, RTO rate | **C** | - | Script reports / dashboard |

### 7.4 R&D

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Product families, project briefs, stage gates | **C** | Project/Task usable as a container only | R&D Project + stage gate |
| 2 | Formulation versions: % w/w, phase, function, INCI, supplier, grade; totals = 100% | **C** | - | Formulation, Formulation Version, Formulation Ingredient |
| 3 | Lab trials with observations, photos, pH, viscosity, notes, pass/fail | **C** | - | Lab Trial |
| 4 | Stability studies with conditions and scheduled pulls/reminders | **C** | - | Stability Study, Stability Pull + scheduler |
| 5 | Cost roll-up per kg / per unit; what-if substitutes | **P** | BOM cost (rm_cost_as_per valuation / last purchase / price list) | Roll-up from a draft formulation and what-if before a BOM exists |
| 6 | Restricted/banned ingredient checklist; allergen and fragrance flags | **C** | - | Restricted Ingredient list + validation |
| 7 | Approval by someone other than author; approved version locks and generates BOM + routing | **P** | Workflow (allow_self_approval off), BOM, Routing | Lock + BOM generation from the approved version |
| 8 | INCI ingredient label (descending order) from approved version | **C** | - | Print format / report |
| 9 | Search across past trials (e.g. niacinamide above 4%) | **C** | - | Query report over Formulation Ingredient |

### 7.5 Quality

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Specs per item and stage: parameters, methods, limits, sampling plan | **S** | Quality Inspection Template + Parameters (numeric min/max or formula) | Sampling plan is a text field unless extended |
| 2 | Inspection queue for HOLD lots; record results; auto pass/fail; release/reject/conditional release | **P** | Quality Inspection (readings auto status), QI-gated Material Transfer | QC queue + QC Release DocType (see workflow design) |
| 3 | COA generation (PDF) and supplier COA storage | **P** | QI print format, file attachments | COA print format with batch data |
| 4 | Retained samples register with location and disposal date | **P** | Item retain_sample/sample_quantity, Company sample retention warehouse | Disposal date + reminders |
| 5 | Deviations, OOS investigations, change control | **P** | Non Conformance, Quality Action | OOS and change-control fields/workflow |
| 6 | Complaints linked to batch and customer; triage, root cause, CAPA, effectiveness check | **P** | Issue, Warranty Claim, Quality Action, Quality Review | Complaint DocType with batch link; CAPA effectiveness |
| 7 | Recall drill: batch to every customer, invoice, channel order, export | **C** | Serial and Batch Bundle links make it possible | Trace report (both directions) |
| 8 | Instrument calibration schedule | **P** | Asset Maintenance tasks | Calibration Log with readings |
| 9 | Quality dashboards: FPY, rejection by supplier, complaints per 10k | **C** | - | Script reports |

### 7.6 Maintenance

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Machine register with location, make, documents, criticality | **S** | Asset, Workstation, Location | Criticality as custom field |
| 2 | Preventive maintenance by calendar or run hours; auto work orders | **P** | Asset Maintenance (periodicity) | Run-hour based triggers |
| 3 | Breakdown requests in two taps with photo; MTTR/MTBF | **P** | Asset Repair | Quick request screen + MTTR/MTBF report |
| 4 | Spare parts as stock items with min levels; issue against maintenance order | **S** | Item Reorder, Asset Repair consumed items | — |
| 5 | Calibration and utility logs (water, air, temperature/humidity) | **C** | - | Utility Log DocType |
| 6 | AMC and vendor service contracts with renewal reminders | **P** | Contract, Notification (days before) | — |
| 7 | Machine under breakdown blocks new work orders on it | **C** | - | Validation hook on Work Order / Job Card |

### 7.7 Accounts

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Indian chart of accounts, cost centres per department and channel | **S** | Chart of Accounts, Cost Center, Accounting Dimension | Accountant confirms CoA |
| 2 | Automatic postings from GRN, invoices, payments, production, sales, credit notes | **S** | Native GL postings on submit (perpetual inventory) | Channel settlement postings: see 7.8 |
| 3 | Payables/receivables ageing, payment runs, receipts, advances, TDS and certificates | **S** | AP/AR reports, Payment Entry, Payment Order, Tax Withholding Category | Form 16A/TDS returns via India Compliance or CA |
| 4 | Marketplace settlement reconciliation | **C** | - | Settlement + Settlement Line DocTypes, matching |
| 5 | Bank statement import (CSV) and reconciliation | **S** | Bank Statement Import, Bank Reconciliation Tool | — |
| 6 | GSTR-1, GSTR-3B summaries, input credit register, e-invoice status, export | **T** | India Compliance | — |
| 7 | Moving-average valuation, COGS, gross margin by SKU, channel, batch | **P** | Moving Average valuation, Gross Profit report | By-channel needs an accounting dimension |
| 8 | Trial balance, P&L, balance sheet, cash flow; month close with period lock | **S** | Financial statements, Accounting Period, Period Closing Voucher | — |
| 9 | Export to Tally (XML) | **C** | - | Tally export (scope TBD with CA) |

### 7.8 E-commerce

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | One channel interface per platform: orders, returns, settlements, stock, tracking, listings | **P** | ecommerce_integrations: Shopify (orders, inventory sync), Amazon (orders, fees) | Flipkart, Myntra, Nykaa; returns/settlements everywhere |
| 2 | SKU mapping (ASIN/FSN/style id) with unmapped-SKU error queue | **P** | Ecommerce Item mapping (Shopify/Amazon) | Unified mapping + error queue |
| 3 | Central available-to-sell stock push with safety buffer | **P** | Shopify inventory sync | ATS calc + push for other channels |
| 4 | Listing health: price, MRP, stock per channel; flag mismatches | **C** | - | Report |
| 5 | Channel P&L per SKU | **C** | - | Report joining settlement fees + COGS |
| 6 | Unified order view with status, SLA, tracking | **P** | Sales Order list + custom fields | Channel/SLA fields and list view |
| 7 | CSV and portal-export import for every channel (built first) | **C** | Generic Data Import exists | Per-channel CSV parsers with idempotency |

### 7.9 Meta

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Connect Meta Business account | **C** | - | — |
| 2 | Pull campaigns, ad sets, ads, daily spend and results | **C** | - | — |
| 3 | Conversions API purchase events with consent and dedup | **C** | - | — |
| 4 | Product catalog sync from ERP | **C** | - | — |
| 5 | ROAS and contribution margin by campaign and SKU with real COGS | **C** | - | — |
| 6 | Budget pacing and alerts | **C** | - | — |
| 7 | Brand asset library linked to creatives and claims | **C** | - | — |
| 8 | Content calendar with approval | **C** | - | — |
| 9 | Influencer/UGC tracker with stock issue and attributed sales | **C** | - | — |
| 10 | Human approval before any ad or post is published | **C** | - | — |

### 7.10 Supporting

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Inventory: bins, barcode labels, cycle counts with variance approval, transfers, expiry alerts, scrap register | **S** | Warehouse tree, Item Barcode, Stock Reconciliation + Workflow, Stock Entry, Notification (days before expiry) | ZPL labels (see 7.1) |
| 2 | Planning and MRP from forecast and orders, exploded through BOMs | **S** | Production Plan, Master Production Schedule, Sales Forecast | — |
| 3 | Standard and actual cost per batch and SKU | **P** | BOM cost, Work Order actual cost, Stock Entry valuation | Standard vs actual variance report |
| 4 | Sales and CRM: price lists, schemes, credit limits, beat plans, customer 360, refill reminders | **P** | Price List, Pricing Rule, Credit Limit, Lead/Opportunity | Beat plans, refill reminders |
| 5 | HR light: staff, shifts, attendance import, training records gating steps | **P** | HRMS app (GPL-3.0): Employee, Shift, Attendance | Training-gated permissions |
| 6 | EHS: incidents, safety checklists, MSDS library, waste records | **C** | - | — |
| 7 | Document control: SOPs, specs, artwork versions, read-and-understood sign-off | **P** | Quality Procedure, file versioning | Read-and-understood sign-off |
| 8 | Compliance register: licences, renewals, notifications, expiry reminders | **C** | Notification (days before) helps | Compliance Licence DocType |
| 9 | Notifications centre: in-app, email, WhatsApp, daily digest | **P** | Notification, Email Digest | WhatsApp |
| 10 | Role-based home queues | **P** | Workspaces, saved list filters | Queue workspaces per role |
| 11 | Reports builder with saved filters and scheduled CSV/PDF email | **S** | Report Builder, Auto Email Report | — |

### 9 AI layer

| # | Requirement | Status | ERPNext v16 / app evidence | factory_ops work |
| --- | --- | --- | --- | --- |
| 1 | Ask the ERP in plain English/Hindi with read-only tools | **C** | - | — |
| 2 | Auto-drafted documents saved as drafts | **C** | - | — |
| 3 | Complaint triage and CAPA proposals | **C** | - | — |
| 4 | R&D helper | **C** | - | — |
| 5 | Forecasting and alerts | **P** | Sales Forecast (v16) exists | Seasonal models + alert rules |
| 6 | AI-CRM customer 360 and refill prediction | **C** | - | — |
| 7 | Document reading (supplier invoices, COAs) into drafts | **C** | - | — |

## How to use this matrix

- Phase 1 only takes items that are **S**, plus the **P/C** items the factory cannot run
  without: QC hold and release, and approval limits. See `REVISED_PHASE_1_ROADMAP.md`.
- The custom work for every **P** and **C** item is grouped by module in
  `FACTORY_OPS_CUSTOM_MODULES.md`.
