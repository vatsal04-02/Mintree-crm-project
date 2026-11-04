# factory_ops: custom modules

`factory_ops` is the one Frappe app that holds every Mintree- and FlowHQ-specific behaviour on
top of ERPNext v16. This document lists what goes in it, grouped by module. Each item traces
to a **P** or **C** line in `ERPNext_STANDARD_FEATURE_MAPPING.md`.

## 1. App rules

1. **No core edits.** We never patch, fork or monkey-patch ERPNext, Frappe, India Compliance or
   ecommerce_integrations. If an extension point is missing, we raise it upstream and work
   around it in our own DocTypes.
2. **Extension points, in order of preference:**
   - fixtures (Custom Field, Property Setter, Workflow, Role, Notification, Print Format);
   - `doc_events` hooks;
   - our own DocTypes and reports;
   - `override_whitelisted_methods`;
   - `extend_doctype_class` / `override_doctype_class`, last resort only, and recorded in
     `docs/decisions.md`.
3. **Upgrade test.** CI installs ERPNext at the pinned tag plus `factory_ops`, then runs
   `bench run-tests --app factory_ops`. A monthly job does the same against the latest
   `version-16` tag, so breaking upstream changes surface early.
4. **Server-side truth.** Every rule lives in Python validation, not in client scripts.
   Client scripts are UX only.
5. **Licence.** GPL-3.0. See `GPL_AND_DEPENDENCY_LICENSES.md`.

```
factory_ops/
  factory_ops/
    hooks.py              doc_events, scheduler, fixtures list
    quality/              QC Release, guards, QC queue report, COA, retained samples
    purchase/             approval limits, artwork versions, GRN weight check
    production/           batch record, line clearance, yield alerts, rework
    maintenance/          breakdown request, block-on-breakdown, utility/calibration logs
    rnd/                  formulations, trials, stability, restricted list
    channels/             channel interface, CSV importers, SKU map, settlements, error queue
    marketing/            Meta (later)
    compliance/           licences register, EHS (later)
    ai/                   assistant tools, prompts, evals (later)
    money.py              Decimal helpers, no float
    fixtures/             custom_field.json, property_setter.json, workflow.json, role.json …
    patches/
    tests/
```

## 2. Modules

**Size key:** S ≤ 2 days, M 3–5 days, L 6–10 days, XL > 10 days. Sizes are effort by one
developer who knows Frappe, including tests. **Phase** is the brief's phase number as revised in
`REVISED_PHASE_1_ROADMAP.md`.

### 2.1 Quality (Phase 1 core)

| Component | Type | What it does | Size | Phase |
| --- | --- | --- | --- | --- |
| QC Hold warehouse type + warehouse fixtures | Fixture | Quarantine warehouse tree (design doc §3.1) | S | 1 |
| QC Release | DocType (submittable) | Release, reject, partial or conditional release; creates the Stock Entry in the same transaction | M | 1 |
| Hold and rejected exit guards G1–G3, G6 | doc_events | Block any other movement out of hold/rejected | M | 1 |
| Release segregation G4, role checks G5 | Validation | Producer or receiver cannot release | S | 1 |
| Batch `qc_status` + nightly consistency check | Custom field + scheduler | Derived status, alert on mismatch | S | 1 |
| QC queue | Script report + workspace | HOLD lots by SLA age, "Start inspection" action | S | 1 |
| COA print format | Print format | Finished batch COA from QI readings | S | 2 |
| Retained samples register | DocType | Location, quantity, disposal date, reminders | S | 2 |
| Deviation / OOS / change control | Extend Non Conformance + DocType | Required for conditional release | M | 2 |
| Complaint and CAPA | DocType + Quality Action link | Batch/customer links, effectiveness check | M | 2 |
| Trace and recall drill | Script report + export | Batch → customers/invoices/orders and back | M | 2 |
| Quality dashboards | Reports | FPY, rejection by supplier, complaints per 10k | S | 2 |

### 2.2 Purchase

| Component | Type | Size | Phase |
| --- | --- | --- | --- |
| Approval Limit DocType + PO/Payment workflows (conditions call `factory_ops.purchase.within_limit`) | DocType + fixtures | S | 1 |
| Separate RM/PM workflows by item group | Fixtures | S | 1 |
| Approved-supplier flag and spec on Item Supplier | Custom fields + validation | S | 2 |
| GRN weight check with tolerance | Custom fields + validation | S | 2 |
| PM artwork version (DocType) + GRN warning | DocType + validation | S | 2 |

### 2.3 Production

| Component | Type | Size | Phase |
| --- | --- | --- | --- |
| Wastage reason codes on material issue/return | Custom field + validation | S | 1 |
| Batch label (PDF; ZPL template for Zebra later) | Print format | S | 1 (PDF) / 4 (ZPL) |
| Electronic batch record (steps from routing, readings with limits, operator/machine per step, deviations) | DocTypes: Batch Record, Batch Record Step, Reading | L | 4 |
| Line clearance checklist gating job card start | DocType + validation | S | 4 |
| Yield variance alert | Hook on Manufacture entry + Notification | S | 4 |
| Rework orders linked to original batch | Custom field + trace | S | 4 |

### 2.4 Maintenance

| Component | Type | Size | Phase |
| --- | --- | --- | --- |
| Breakdown request (quick form, photo) → Asset Repair | DocType or web form | S | 4 |
| Machine under breakdown blocks work orders/job cards | Validation | S | 4 |
| Run-hour-based PM triggers | Scheduler | S | 4 |
| Calibration and utility logs | DocTypes | S | 4 |
| MTTR/MTBF report | Report | S | 4 |

### 2.5 R&D: the formulation module (Phase 3)

Everything in brief §7.4 needs custom development except BOM costing, Workflow approval and
Project as a container. The mapping matrix scores R&D at 11%. Item by item:

| Brief requirement | Standard help | Custom build | Size |
| --- | --- | --- | --- |
| Product families, briefs, stage gates (idea → lab → pilot → approved → launched) | Project, Task | `RnD Project` DocType: target claims, price point, benchmarks, `stage` with a Workflow per gate | S |
| Formulation versions: ingredients with % w/w, phase, function, INCI name, supplier and grade; totals = 100% | None | `Formulation` (family, product), `Formulation Version` (submittable, version no., status Draft/In trial/Approved/Superseded), child `Formulation Ingredient` (item, INCI, phase, function, % w/w as Decimal with 4 dp, supplier, grade). Validation: Σ % = 100.0000 exactly, computed in `Decimal` | M |
| Lab trials (observations, photos, pH, viscosity, fragrance notes, pass/fail) | Attachments | `Lab Trial` linked to version; readings child table; images | S |
| Stability studies (25 °C, 40 °C, freeze-thaw) with scheduled pulls and reminders | Notification | `Stability Study` + `Stability Pull` (condition, due date, result); scheduler creates ToDos | M |
| Cost roll-up per kg and per unit; what-if substitutes | BOM costing after a BOM exists | Roll-up from the draft version using Item valuation/last purchase rate; what-if copies the version with substitutes from Item Alternative | M |
| Restricted/banned ingredient checklist; allergen and fragrance flags | None | `Restricted Ingredient` list (placeholder until the regulatory consultant confirms), max % per category; validation warns or blocks; flags on Item | S |
| Approval by someone other than the author; approved version locks and generates BOM + routing | Workflow `allow_self_approval = 0`; BOM; Routing | On approval: lock (submit), create BULK BOM scaled to the batch size from % w/w, and attach the default routing. A change creates a new version; old batches keep their BOM link | M |
| INCI label in descending order | None | Print format/report from the approved version (ties ordered by INCI rules, confirmed by the regulatory consultant) | S |
| Search past trials ("niacinamide above 4%") | Report Builder can filter child tables only crudely | Query report over Formulation Ingredient joined to version and trial | S |

**R&D total:** about 15–20 developer days. That is Phase 3, not Phase 1. Until then, R&D keeps
its current spreadsheets and approved formulations are entered as BOMs by hand.

### 2.6 Channels (Phase 7)

The approach comes from `MARKETPLACE_INTEGRATION_ASSESSMENT.md`.

| Component | Type | Size |
| --- | --- | --- |
| Channel, Channel SKU Map (channel SKU / ASIN / FSN / style id → Item or Product Bundle) | DocTypes | S |
| Channel Order + Lines with unique (channel, order id, line id) → Sales Order / Sales Invoice | DocTypes + service | M |
| CSV importers per channel (orders, returns, settlements), idempotent | Data import + parsers | M |
| Integration Error queue with fix-and-retry | DocType + UI | S |
| Settlement + Settlement Line reconciliation → JE / Payment Entry | DocTypes + matching | L |
| Available-to-sell calculation + push (Shopify via ecommerce_integrations; others via aggregator or API) | Service + scheduler | M |
| Channel P&L, listing health | Reports | M |

### 2.7 Later modules

| Module | Brief | Size |
| --- | --- | --- |
| Courier aggregator connector (AWB, label, manifest, tracking webhooks, NDR, COD) | 7.3 | L |
| Meta: ad spend, CAPI, catalog, ROAS, assets, calendar, influencers | 7.9 | XL |
| AI assistant (read-only tools, drafts, evals) | 9 | XL |
| Compliance register, EHS, document control sign-off | 7.10 | M |
| Shop-floor UI (Frappe UI, Vue 3) for GRN scan, QC queue, issue, pick/pack, breakdowns | 4, 7.x | L (evaluation in Phase 1, build later) |

## 3. Shop-floor interface

The decision: Desk first, then evaluate Frappe UI.

- **Phase 1:** everything runs in Desk with role workspaces (QC, Stores, Production,
  Purchase, Accounts), and mobile/tablet browser access to Desk. The React styleguide work in
  `apps/web` stays as the **design reference** (tokens, density, status chips) and is not
  developed further.
- **Evaluation:** at the end of Phase 1, a 1–2 day spike builds the QC queue as a Frappe UI
  page (MIT licence, Vue 3). It is judged against Desk on a real tablet:
  - taps per task;
  - legibility with gloves;
  - barcode-scanner input.
- The spike is written up in `docs/decisions.md`.
