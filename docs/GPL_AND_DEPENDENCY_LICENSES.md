# GPL and dependency licences

This is a working summary for FlowHQ and the client. **It is not legal advice.** The points
marked "lawyer to confirm" need an opinion from a lawyer who knows software licensing in India
before go-live and before FlowHQ offers `factory_ops` to a second client.

## 1. Inventory (verified from each repository's licence file, 4 Nov 2026)

| Component | Version pinned | Licence | Role | Owner |
| --- | --- | --- | --- | --- |
| Frappe Framework | v16.55.2 | **MIT** | Web framework, ORM, auth, Desk | Frappe Technologies |
| ERPNext | v16.53.0 | **GPL-3.0** | Core ERP | Frappe Technologies |
| India Compliance | `version-16` @ 53a39ca | **GPL-3.0** | GST, e-invoice, e-way bill | Resilient Tech |
| India Compliance GST API access | Account with paid credits | **Commercial service terms**, not software licence | e-invoice/e-way bill/GSTIN API calls | Resilient Tech |
| ecommerce_integrations | `version-16` @ a984a72 | **GPL-3.0** | Shopify, Amazon, Unicommerce connectors | Frappe Technologies |
| HRMS (optional) | `version-16` @ 3b7f8f2 | **GPL-3.0** | HR, attendance, payroll | Frappe Technologies |
| frappe_docker | `main` @ fbf76ed | **MIT** | Container images and compose files | Frappe Technologies |
| Frappe UI (if adopted) | `main` @ cb97437 | **MIT** | Vue 3 component library | Frappe Technologies |
| MariaDB Server | 11.8 | **GPL-2.0** | Database | MariaDB Foundation/plc |
| Redis | 8.6 (frappe_docker default image) | Redis 8 is offered under a choice of RSALv2, SSPLv1 or **AGPLv3** (to verify) | Cache and job queue | Redis Ltd |
| **Valkey (chosen, D-004)** | 8.1 | BSD-3-Clause | Cache and job queue (replaces Redis) | Linux Foundation |
| Python 3.14, Node 24 | — | PSF, MIT | Runtimes | — |
| Caddy 2 / Traefik 3 | — | Apache-2.0 / MIT | HTTPS reverse proxy | — |
| `factory_ops` | ours | **GPL-3.0 (recommended, §3)** | Mintree customisations | FlowHQ |
| `apps/web` React design reference | ours | FlowHQ's choice (no GPL code inside) | Styleguide reference | FlowHQ |

Python and npm dependencies pulled in by these apps (for example `pdfplumber`, `rapidfuzz`,
`googlemaps`, `plaid-python` in ERPNext's `pyproject.toml`) carry their own licences.

- **Licence report:** generate one from the built image in Phase 1 (`pip-licenses`,
  `license-checker`) and keep it in `docs/licenses/` for each release.
- **CI check:** fail CI if a new dependency arrives under AGPL, SSPL or a non-commercial
  licence without review.

## 2. What GPL-3.0 requires of us

GPL-3.0 obligations attach when a covered program is **conveyed** to someone else. Running it
for people over a network is not conveying under GPL-3.0. That rule is different under AGPL.

| Situation | Conveying? | Obligation |
| --- | --- | --- |
| Factory staff use ERPNext in a browser | No | None for the user interaction |
| FlowHQ installs ERPNext + `factory_ops` on a **client-owned** server | Likely yes: the client receives copies (lawyer to confirm) | Client gets the **complete corresponding source** of every GPL component, including `factory_ops` and any modifications, plus the GPL-3.0 text and no added restrictions |
| FlowHQ hosts on a FlowHQ-owned server and the client only uses it | No conveying for GPL-3.0 components | None for GPL parts. AGPL components (Redis 8 if used under AGPL) would trigger source offer for network users of **that** component only if it is modified. We do not modify it |
| FlowHQ gives `factory_ops` to a second client | Yes | That client receives it under GPL-3.0 and may share it further |

**Delivery checklist for each release to the client:**

1. A source archive or Git access to the exact tags of Frappe, ERPNext, India Compliance,
   ecommerce_integrations, HRMS (if used) and `factory_ops` that are deployed.
2. The build files that produce the running system: Dockerfile/Containerfile, `apps.json`,
   compose files, and install and upgrade scripts. GPL-3.0's "Installation Information"
   requirement applies to user products; for business software this is good practice rather
   than strictly required (lawyer to confirm).
3. LICENSE files kept intact; copyright notices not removed.
4. A `NOTICE.md` listing each component, version, licence and source URL (generated from §1).
5. No contract term that forbids the client from exercising GPL rights (copying, modifying,
   sharing) over the GPL code.

## 3. Licensing `factory_ops`

- `factory_ops` is a Frappe app. It imports ERPNext Python modules, subclasses ERPNext
  controllers, and runs in the same process. A common, conservative reading is that it forms a
  combined work with ERPNext, so **when conveyed it must be licensed under GPL-3.0 or a
  GPL-compatible licence.** The Frappe ecosystem's own apps that depend on ERPNext (India
  Compliance, HRMS, ecommerce_integrations) all use GPL-3.0. *(Lawyer to confirm.)*
- **Recommendation:** release `factory_ops` under **GPL-3.0** from day one. Put a copyright
  header "© FlowHQ" in each file, and state the licence in its `pyproject.toml` and `license.txt`.
- **What we must not claim:** that `factory_ops`, or the system as a whole, is proprietary or
  closed-source, or that the client may not modify or share it. Any client contract must say
  plainly that the software is open source under GPL-3.0.

**What FlowHQ can own and charge for:**

- implementation, configuration, data migration, training, support and hosting services;
- the FlowHQ name and brand. The Factory OS product name must **not** contain "ERPNext":
  Frappe's trademark policy forbids using the ERPNext name in a product, service, company or
  domain name. Describing a service as "built on ERPNext" is allowed;
- separate programs that do not include or link GPL code and talk to ERPNext only over HTTP.
  Examples: the React design reference, a separately distributed mobile app, documentation, AI
  evaluation sets and prompts kept outside the app. Whether a tightly coupled HTTP client is a
  separate work depends on the facts (lawyer to confirm);
- the client's data, which belongs to the client.

## 4. Separation of deliverables

| Bucket | Contents | Repository | Licence |
| --- | --- | --- | --- |
| Upstream | Frappe, ERPNext, India Compliance, ecommerce_integrations, HRMS | Their GitHub repos, pinned tags | MIT / GPL-3.0 |
| FlowHQ GPL deliverable | `factory_ops` (DocTypes, hooks, fixtures, reports, print formats, tests) | `apps/factory_ops` in this repo (or its own repo) | GPL-3.0 |
| FlowHQ deployment | Compose files, Containerfile, `apps.json`, scripts, runbooks | `deploy/` in this repo | MIT (permissive, easy to hand over) |
| FlowHQ documents | Architecture docs, SOPs, training notes | `docs/` | FlowHQ copyright, shared with client |
| Client-owned | Data, site config, credentials, server accounts, domain | Client's server and accounts | Client |

## 5. Version-compatibility risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| Major-version upgrades | ERPNext/Frappe have one major version per year (v15 → v16 → v17; `develop` is already 17.0.0-dev). Third-party apps lag behind | Stay on v16 until v17 has had about 3 months of minor releases **and** India Compliance and ecommerce_integrations have `version-17` branches. Upgrade staging first |
| App constraints | ERPNext v16.53.0 and HRMS require `frappe >=16.50.0,<17`; India Compliance and ecommerce_integrations require `frappe >=16.0.0,<17` | Pin all four by tag or commit in `apps.json`; upgrade together; run tests |
| Third-party app maintenance | India Compliance (Resilient Tech) and ecommerce_integrations are maintained separately; Amazon connector uses deprecated SigV4 auth | Track their release notes; contract tests for connectors |
| Runtime versions | v16 images: Python 3.14, Node 24, MariaDB 11.8, Redis 8.6 (frappe_docker) | Use frappe_docker's images rather than a hand-built bench |
| Postgres | Not used (MariaDB decision) | — |
| Redis licence change | Redis ≥ 7.4 is no longer BSD | **Resolved:** Valkey 8.1 (BSD-3-Clause) is used instead; verified with Frappe v16 in development (DECISIONS D-004) |
| India Compliance API service | Paid credits; terms can change | Budget line for the client; e-invoice only needed above the turnover threshold (accountant to confirm) |
