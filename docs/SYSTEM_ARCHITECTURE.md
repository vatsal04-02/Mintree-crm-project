# System architecture: Mintree Factory OS on ERPNext

**Status:** revised architecture, 4 Nov 2026; implementation through Milestone 3 (purchase and inventory) on 5 Nov 2026, see `IMPLEMENTATION_PROGRESS.md`. Supersedes the stack in brief §3, the brief's
§5 repo layout, and `docs/erpnext-assessment.md`.

**Approved decisions:**
- ERPNext as the core ERP, on MariaDB.
- All factory logic in the custom app `factory_ops`; no ERPNext core changes.
- A pinned, stable release.
- Desk first; Frappe UI evaluated later for the shop floor.
- Self-hosted Mumbai VPS.
- GPL-3.0 accepted.

## 1. Components

```
┌────────────────────────────── Production VPS (Mumbai, client-owned) ─────────────────────────────┐
│  Caddy/Traefik (HTTPS)                                                                            │
│     │                                                                                              │
│  Frappe Framework v16.55.2 (MIT) ── gunicorn · socket.io · RQ workers · scheduler                  │
│     ├── erpnext v16.53.0 (GPL-3.0)          stock, manufacturing, buying, selling, accounts, QI  │
│     ├── india_compliance version-16 (GPL-3.0)  GST, e-invoice, e-way bill  ──▶ GST APIs (paid)   │
│     ├── ecommerce_integrations version-16 (GPL-3.0)  Shopify, Amazon (Phase 7)  ──▶ marketplaces │
│     ├── hrms version-16 (GPL-3.0)           optional, Phase 10                                    │
│     └── factory_ops (GPL-3.0, FlowHQ)       QC quarantine, approvals, R&D, eBMR, channels, AI     │
│  MariaDB 11.8 · Valkey 8.1 (cache, queue; BSD, Redis-compatible)                                                           │
│  Backups ──encrypted──▶ Indian-region object storage                                              │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
Users: Desk in a browser (office PCs, shop-floor tablets) · later: Frappe UI pages for shop-floor tasks
Staging VPS: same image, one size smaller; also runs Uptime Kuma and restore drills
```

## 2. Version pins (Phase 1)

| Component | Pin | Constraint verified |
| --- | --- | --- |
| Frappe | `v16.55.2` | ERPNext and HRMS need `>=16.50.0,<17`; India Compliance and ecommerce_integrations need `>=16.0.0,<17` |
| ERPNext | `v16.53.0` | — |
| India Compliance | `version-16` commit `53a39ca` (or newest v16 tag at build time) | requires ERPNext |
| ecommerce_integrations | `version-16` commit `a984a72` (installed in Phase 7) | requires ERPNext |
| HRMS | `version-16` (Phase 10, optional) | requires ERPNext |
| Runtime | Python 3.14 (3.14.6 verified), Node 24 (24.22.2 verified), MariaDB 11.8 (11.8.9 verified), **Valkey 8.1** instead of Redis 8.6 | Frappe v16 requires Python >=3.14,<3.15 and Node >=24 (verified in source). Valkey: DECISIONS D-004 |

**Update policy:**

- **Minor releases:** take `version-16` minor tags monthly, staging first.
- **Majors:** move to v17 only when all four apps have `version-17` branches and v17 has had
  about 3 months of minor releases.
- **Never `develop`.**

## 3. Responsibilities: who owns which rule

| Concern | Owner |
| --- | --- |
| Stock ledger, valuation, batches, FEFO pick, expiry blocking, negative-stock block | ERPNext (configured) |
| GL postings, double entry, period lock, tax withholding | ERPNext (configured) |
| GST invoice fields, e-invoice IRN, e-way bill, GST returns | India Compliance |
| QC quarantine, release/reject, hold-exit guards, release segregation | `factory_ops` (see `DATABASE_AND_WORKFLOW_DESIGN.md` §3) |
| Approval limits, PO/payment segregation | Frappe Workflow + `factory_ops` validation |
| R&D formulations, eBMR, line clearance, breakdown blocking, channels, Meta, AI | `factory_ops` (see `FACTORY_OPS_CUSTOM_MODULES.md`) |
| Roles, permissions, 2FA, audit trail | Frappe (configured) + `factory_ops` fixtures |

## 4. Extension rules

1. Customise only through `factory_ops`: fixtures, `doc_events`, own DocTypes, reports, print
   formats, workflows. Any class override is recorded in `docs/decisions.md` with the reason.
2. All business rules are enforced server-side, and each one has a test that calls the server
   API directly.
3. Configuration (settings, roles, workflows, naming series, custom fields, property setters)
   is exported as fixtures and versioned. **No click-only configuration in production.** What
   is set in staging is exported, committed and migrated.
4. `factory_ops` money code uses `Decimal`; see the precision decisions in the design doc §5.

## 5. Integration architecture

- **Inbound/outbound API.** Frappe REST (`/api/resource`, `/api/method`) with token auth for
  integrations, and session auth for browser pages.
- **Async work.** Marketplace sync, PDF generation and AI calls run as RQ background jobs
  enqueued from server code. `factory_ops` always passes `enqueue_after_commit=True` (it
  defaults to False in `frappe/utils/background_jobs.py`), so a rolled-back request leaves no
  orphan job.
- **Connectors.** All connectors write raw payloads to an Integration Log first, then process
  idempotently keyed by channel and external ID. Failures go to an error queue the user can fix
  and retry.
- **AI (later phase).** Whitelisted read-only methods execute as `frappe.session.user`, so
  permissions apply. Drafts are saved with `docstatus = 0` and `ai_assisted = 1`. The model name
  is held in site config. The ERP works fully with AI switched off.

## 6. User interface

| Phase | UI | Notes |
| --- | --- | --- |
| 1 | ERPNext Desk with role workspaces (QC, Stores, Production, Purchase, Sales/Dispatch, Accounts, Management) | Tablet access through the browser; comfortable density via Desk's own settings |
| End of 1 | Spike: QC queue page in **Frappe UI (Vue 3, MIT)** tested on a shop-floor tablet | Decision recorded in `docs/decisions.md` |
| 4+ | Shop-floor pages in Frappe UI if the spike wins: GRN scan, QC queue, material issue, pick/pack, breakdown | Served by Frappe on the same domain |
| — | `apps/web` (React) | **Frozen as design reference only** (tokens, density, status chips, anti-slop rules). Not deployed |

## 6a. factory_ops modules as built

| Module | Contents |
| --- | --- |
| Factory Ops | Factory Ops Settings; setup (roles, warehouse types, custom fields, permissions, SAMPLE company, sample users) |
| Quality | QC Release, QC Deviation, QC Retest, QC Queue report, derived batch QC status |
| Inventory | server-side guards on every stock route, goods-receipt logic, item-group controls, Stock by QC Status report |
| Purchase | Purchase Approval Limit and PO approval rule |

Verification layers: Frappe test suite (local + GitHub Actions CI), clean-environment run of the dev
setup script, HTTP acceptance script against the running dev site, Playwright browser check.

## 7. Repository layout (this repo)

```
apps/
  factory_ops/        the Frappe app (GPL-3.0) — created in Phase 1 week 1
  web/                frozen React design reference (not built or deployed)
deploy/
  apps.json           pinned app versions for the image build
  compose.override.yaml, .env.example, caddy/
  scripts/            backup.sh, restore.sh, deploy.sh, restore-drill.sh
docs/                 this architecture set, decisions, assumptions, open items, runbooks
```

## 8. Related documents

- `ERPNext_STANDARD_FEATURE_MAPPING.md`: feature-by-feature coverage
- `FACTORY_OPS_CUSTOM_MODULES.md`: what we build
- `DATABASE_AND_WORKFLOW_DESIGN.md`: QC workflow, §6 rules, precision audit
- `MARKETPLACE_INTEGRATION_ASSESSMENT.md`: channel access
- `HOSTING_AND_DEPLOYMENT_PLAN.md`: servers, backups, security
- `GPL_AND_DEPENDENCY_LICENSES.md`: licences and version risks
- `REVISED_PHASE_1_ROADMAP.md`: what ₹1 lakh buys
