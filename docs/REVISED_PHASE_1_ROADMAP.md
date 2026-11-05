# Revised Phase 1 roadmap: a working factory on ERPNext for about ₹1 lakh

## Status against this plan (2026-11-05, after Milestone 6)

Built and tested on development benches with SAMPLE data only. Nothing is deployed; no real data,
GSTIN or VPS has been provided. Details: `IMPLEMENTATION_PROGRESS.md`, evidence:
`PHASE_1_TEST_RESULTS.md`.

| # (§2) | Capability | State |
| --- | --- | --- |
| 1 | Staging / production VPS, backups, restore drill | **Not started**: waiting for VPS credentials and approval. Runbook written for development. |
| 2 | Company, FY, CoA, GST | SAMPLE company only. **GST not configured** (no GSTIN). Real CoA waits on the accountant. |
| 3 | Precision and rounding | Audit and test design in `DATABASE_AND_WORKFLOW_DESIGN.md`; settings, property test and accountant sign-off **open**. |
| 4 | Roles, users, role workspaces | **Done (Milestone 6)**: roles and permission matrix, seven role workspaces, Management Viewer. 2FA and real users at deployment. |
| 5 | Masters import incl. opening stock with batches | **Done (Milestone 6)**: validated all-or-nothing importer, CSV/XLSX templates. Real data from the client. |
| 6 | Purchase with approval limits, GRN into QC hold | **Done (Milestone 3)**. |
| 7 | QC quarantine and release | **Done (Milestone 2, validation round)**. |
| 8 | Production | **Done (Milestone 4)**. |
| 9 | Sales and dispatch | **Done without GST (Milestone 5)**, one shelf-life eligibility rule (Milestone 6). |
| 10 | Accounts | Perpetual inventory, payments, AR/AP and statements on standard ERPNext; **bank statement import and reconciliation not yet built** (next milestone). Period lock not configured. |
| 11 | Tests | 154 automated tests (CI on GitHub Actions); HTTP acceptance and browser checks per milestone. Money-rounding property test still open. Staging scenario waits for staging. |
| 12 | Training, go-live | Not started. |

Remaining before Phase 1 is done: bank reconciliation, GST/CoA with the accountant, real masters,
staging and production deployment with backups and a restore drill, rounding property test, UAT,
training and cutover. The schedule in §7 restarts from the day the client's inputs arrive.

## 1. Goal

At the end of Phase 1 the factory runs its **physical and financial core** in one system:

> Buy RM/PM → receive into QC hold → test → release or reject → make bulk → fill and pack →
> QC-release finished goods → sell (B2B / manual entry of D2C orders) → GST invoice → collect
> payment → accounts that balance.

Every step is enforced server-side, tested, backed up, and restorable. This is the brief's
Phases 0–2 plus the minimum of 4–6, built on standard ERPNext. Only the QC quarantine and
approval limits are custom.

## 2. In scope

| # | Capability | Standard / custom |
| --- | --- | --- |
| 1 | Staging + production on Mumbai VPS, HTTPS, hardened, monitored, 6-hourly encrypted off-site backups, restore drill passed | Deploy |
| 2 | Company, Indian FY (Apr–Mar), chart of accounts (accountant-approved), cost centres, GST via India Compliance, tax templates, HSN | Configure + T |
| 3 | Precision and rounding settings from the audit (currency 2, quantity 3, 4-dp purchase rates, rounding method, Round Off monitoring) with property tests | Configure + test |
| 4 | Roles and users (about 15): Purchase, Stores, QC Officer, QA Manager, Production, Dispatch, Accounts, Management, plus 2FA for approvers; role workspaces | Configure |
| 5 | Masters: items (RM, PM, BULK, FG, bundles), UOM conversions, warehouses incl. QC Hold tree, suppliers, customers, price lists, opening stock with batches | Import |
| 6 | Purchase: Material Request → RFQ (optional) → PO with per-user **approval limits** and no self-approval → GRN into QC hold with batch, mfg/expiry, COA attachment; rejects at dock | Standard + **custom** |
| 7 | **QC quarantine and release:** QC queue, Quality Inspection templates, QC Release (release/reject/partial), hold-exit guards, release segregation | **Custom** |
| 8 | Production: BOMs for launch SKUs (bulk + FG), two-stage Work Orders, FEFO material issue, manufacture into QC hold, batch numbers and expiry, PDF batch label, process loss | Standard |
| 9 | Sales and dispatch: customer credit limits, Sales Order, Pick List (FEFO), Delivery Note, GST Sales Invoice; e-way bill/e-invoice **only if** the turnover threshold applies (accountant to confirm); returns into RETURNS-QC-HOLD | Standard + T |
| 10 | Accounts: perpetual inventory postings, payments, bank statement import and reconciliation, AP/AR ageing, trial balance, P&L, balance sheet, period lock | Standard |
| 11 | Tests: one per §6 rule in scope, a property test for money rounding, and one end-to-end scenario on staging | Custom |
| 12 | Training notes in plain language, two training sessions, go-live and one week of hypercare | Service |

## 3. Out of scope for Phase 1, with the phase it moves to

- **R&D formulations (Phase 3).** Approved formulas enter as BOMs by hand until then.
- **eBMR, line clearance, maintenance blocking (Phase 4).** The batch record stays on paper,
  with its scan attached to the Work Order.
- **Courier aggregator (Phase 5).**
- **Marketplace connectors and settlement reconciliation (Phase 7).** Shopify and marketplace
  orders are entered or imported as Sales Orders through Data Import templates.
- **Meta (Phase 8).**
- **AI assistant (Phase 9).**
- **HR, EHS, compliance register (Phase 10).**
- **Shop-floor Frappe UI pages:** evaluated, not built.

## 4. Effort estimate

Person-days for one developer experienced in Frappe/ERPNext. The estimate assumes the
conditions in §6.

| Work package | Days |
| --- | ---: |
| **A. Foundation** | **5.0** |
| Provision staging + production VPS, hardening checklist | 1.0 |
| Image build (frappe_docker, pinned `apps.json`), compose, HTTPS, deploy and rollback scripts | 1.5 |
| Backups to object storage, restore script, first restore drill, Uptime Kuma, alerts | 1.5 |
| `factory_ops` app skeleton, fixtures pipeline, CI running `bench run-tests` | 1.0 |
| **B. ERPNext configuration** | **6.0** |
| Company, FY, CoA with accountant, cost centres, India Compliance setup, tax templates, HSN | 1.5 |
| Precision/rounding settings + property setters | 0.5 |
| Roles, permissions, 15 users, 2FA, role workspaces | 1.0 |
| Warehouse tree, naming series, Stock Settings (FEFO, no negative stock, batches) | 0.5 |
| Quality Inspection templates for RM, PM, BULK, FG (from client's specs) | 1.0 |
| Print formats: PO, GRN, batch label (PDF), tax invoice review, basic COA | 1.5 |
| **C. Masters and opening data** | **3.0** |
| Import templates, client fills, validation and import (≤ 300 items, ≤ 50 suppliers/customers) | 1.5 |
| BOMs for launch SKUs (≤ 15 FG, with their bulks), opening stock with batches, opening balances | 1.5 |
| **D. factory_ops custom work** | **8.5** |
| Spike: QI-on-Stock-Entry sequence on v16 (design doc §3.2) | 0.5 |
| QC Release DocType creating the Stock Entry in one transaction | 2.0 |
| Guards G1–G3, G6 (hold/rejected exit, reservation, shelf life) | 2.0 |
| Guards G4–G5 (release segregation, roles) | 0.5 |
| Batch `qc_status` + nightly consistency check | 0.5 |
| QC queue report + workspace | 0.5 |
| Approval Limit DocType + PO/Payment workflows | 1.0 |
| Wastage reason codes on issue/return | 0.5 |
| Rule test suite incl. Hypothesis money/rounding property tests | 1.0 |
| **E. Validation and go-live** | **5.0** |
| End-to-end scenario on staging (purchase → QC → production → release → sale → invoice → payment → trial balance) | 1.5 |
| Client UAT (2 sessions) and fixes | 1.0 |
| Training notes + 2 sessions | 1.5 |
| Cutover and 1 week hypercare (part-time) | 1.0 |
| **Subtotal** | **27.5** |
| Contingency (10%) | 2.75 |
| **Total** | **≈ 30 days** |
| *Optional:* Frappe UI QC-queue spike on a tablet | 1.5 |
| *Optional:* Shopify connector via ecommerce_integrations (orders only, tested) | 2.0 |

## 5. Budget at about ₹1 lakh

**What the ₹1 lakh covers.** The brief says the client pays hosting and third-party fees, so
the ₹1 lakh is treated as **FlowHQ's implementation fee**. Infrastructure is a separate client
cost, about ₹4,200–7,400/month; see `HOSTING_AND_DEPLOYMENT_PLAN.md` §8.

**The day rate decides the scope.** FlowHQ's day rate is not stated anywhere in the brief:

| FlowHQ effective rate | Days ₹1,00,000 buys | Fit |
| --- | ---: | --- |
| ₹2,500/day | 40 | Full scope + contingency + both optional items + about 5 days of Phase 2 items (COA print, retained samples) |
| **₹3,300/day** | **30** | **Full scope as estimated (27.5 + 10% contingency)** |
| ₹4,000/day | 25 | Apply the whole cut list below (−5.35 days → ≈ 24.9 days); the factory still runs, with thinner support |
| ₹5,000/day | 20 | **Does not fit** without cutting protected items. Split instead: Phase 1a (A + B + D + go-live, ≈ 20 days) for ₹1 lakh, then masters, print formats and training as Phase 1b |

**Cut list** (applied in this order if the rate is higher; days saved, 5.35 in total):

1. Training: one session plus notes; FlowHQ trains a client "super user" who trains others (−0.75)
2. Print formats: use standard formats with a logo, keeping only the batch label custom (−1.0)
3. Wastage reason codes → Phase 4 (−0.5)
4. Approval limits → standard Workflow with role levels only, no per-user amount (−0.7)
5. Masters: client imports with FlowHQ templates and reviews; FlowHQ only validates (−1.0)
6. Contingency reduced to 5% (−1.4)

**Never cut:** QC quarantine and guards, the rule tests, backups and the restore drill,
precision settings, staging. These are the brief's "correctness of stock, batch traceability
and accounts first".

**Recommendation:** fix Phase 1 at **30 developer-days for ₹1,00,000 (₹3,333/day effective)**.
Bill it as three milestones of about ₹33,000:

1. Foundation and configuration live on staging.
2. QC workflow and masters complete, UAT passed.
3. Go-live and restore drill signed off.

Any change request is estimated in days against the same rate.

**Client-paid costs during Phase 1, outside the ₹1 lakh:**
- Infrastructure from week 1: about ₹10,000–15,000 for the 8 weeks for production, staging and
  backups.
- Domain.
- India Compliance API credits, if e-invoice applies.
- The accountant's time.

## 6. Assumptions (the estimate holds only if these are true)

- One company, one GSTIN, one plant, one currency (INR).
- ≤ 300 items, ≤ 15 launch FG SKUs, ≤ 50 suppliers, ≤ 100 customers at go-live.
- The client returns filled master-data templates by the end of week 2. The accountant is
  available for 2 sessions (CoA and taxes; precision and rounding sign-off).
- The client has QC specifications (parameters and limits) for each RM/PM/BULK/FG.
- The client opens the VPS, object-storage, domain and (if needed) India Compliance accounts in
  week 1.
- English UI in Phase 1. Hindi translations of ERPNext exist upstream but are not reviewed.
- Placeholder (`SAMPLE-`) data is used until real data arrives; nothing invented is presented as
  real.

## 7. Schedule (8 calendar weeks, about 4 developer-days a week)

| Week | Work | Client input |
| --- | --- | --- |
| 1 | A: VPS, image, HTTPS, backups; `factory_ops` skeleton; QI spike | Open accounts; send QC specs and master data |
| 2 | B: company, CoA, GST, roles, warehouses, settings, precision | Accountant session 1 |
| 3 | D: QC Release + guards + tests | Return filled templates |
| 4 | D: approval limits, QC queue, batch status; C: masters import | Review QI templates |
| 5 | C: BOMs, opening stock; B: print formats | Accountant session 2 (rounding sign-off) |
| 6 | E: end-to-end scenario on staging; restore drill #1 | UAT session 1 |
| 7 | E: fixes, training notes, training | UAT session 2, sign-off |
| 8 | Cutover to production, hypercare | Go-live; real transactions |

## 8. Phase 1 is done when

- [ ] An end-to-end scenario runs on staging with real masters and is repeated on production at
      go-live (purchase → GRN into hold → QI → release → production of bulk and FG → FG
      release → sales order → pick FEFO → delivery → GST invoice → payment → trial balance
      balances).
- [ ] The automated tests pass in CI:
  - stock taken from a QC Hold warehouse by any route other than QC Release fails;
  - releasing a batch you received or produced fails;
  - a PO above the creator's limit cannot be self-approved;
  - negative stock fails;
  - an expired batch cannot be delivered;
  - the GL balances on random documents (property test);
  - Round Off postings stay ≤ ₹0.50 and are reported.
- [ ] A restore drill is completed and logged, with timings.
- [ ] Monitoring alerts are tested: site down, disk full, backup missing.
- [ ] Every configuration is in fixtures and Git; production matches staging.
- [ ] `docs/phase-1.md` says what was built, what was skipped and why. The GPL source-delivery
      package (§2 of the licence doc) has been handed to the client.

## 9. After Phase 1

1. **Phase 2:** COA print, retained samples, deviations/OOS, complaints/CAPA, trace and recall
   report, approved-supplier details, GRN weight check, artwork versions.
2. **Phase 3:** R&D formulation module, about 15–20 days.
3. **Phase 4:** eBMR, line clearance, maintenance with breakdown blocking, ZPL labels, and the
   Frappe UI shop-floor pages if the spike recommends them.
4. **Phases 5 and 7:** courier aggregator and marketplace channels, per the marketplace
   assessment.
5. **Phases 8–10:** Meta, AI assistant, support modules.
