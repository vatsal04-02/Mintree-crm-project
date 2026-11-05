# Factory OS front end — architecture

Decision record: D-040 to D-044 in `DECISIONS.md`. Capability coverage:
`FACTORY_OS_FRONTEND_CAPABILITY_MAP.md`. Every backend call: `FACTORY_OS_API_MAPPING.md`.

## 1. Shape

```
Browser ── same origin ──► Frappe web server (bench / gunicorn behind Caddy)
  │                          ├─ /factory, /factory/*   → www/factory.html (built React app)
  │                          ├─ /assets/factory_ops/factory/*  → JS, CSS, fonts
  │                          ├─ /api/resource/*, /api/method/*  → Frappe REST + ERPNext methods
  │                          └─ /desk/*                → ERPNext Desk (administration, setup)
  └─ session cookie (sid) + X-Frappe-CSRF-Token on every write
                             │
                         ERPNext v16 + factory_ops (all validation, permissions, posting)
                             │
                         MariaDB 11.8 (the only transaction database)
```

- **One system of record.** React holds no business rule and no copy of business data beyond the
  TanStack Query cache of what the server returned. Every write is an ERPNext insert / save /
  submit / mapped-document call; server-side validation (QC guards, approval limits, credit
  limits, shelf life, dispatch details, stock path) runs exactly as it does for Desk.
- **Same origin, no extra service.** The build is served by Frappe itself through a `www` page and
  a `website_route_rules` entry in `factory_ops/hooks.py`. No new container, no Node server in
  production, no Caddy change, no CORS. The browser holds only the Frappe session cookie; no API
  keys, database or integration credentials exist in the front end.
- **Permissions.** The server is the boundary. The front end asks the server what this user may do
  (`factory_ops.api.factory_os.boot`) only to decide what to show. Hidden buttons are a courtesy;
  a forged request meets the same Frappe permission check and `factory_ops` hooks (checked in the
  E2E run: the buyer's own approval is refused with the server's message).
- **Desk stays.** Administration, setup, master data and the remaining Accounts work stay in Desk
  at `/desk`; each Factory OS document page links to the same document in Desk.

## 2. Front-end stack (`apps/web`)

| Concern | Choice |
|---|---|
| Language / build | TypeScript 7, React 19, Vite 8 (builds into `factory_ops/public/factory` and `www/factory.html`) |
| Routing | TanStack Router, code-defined routes under base path `/factory` (`src/router.tsx`) |
| Server state | TanStack Query; every mutation invalidates the cache, so screens re-read the ERP after a change |
| API client | `src/api/frappe.ts`: `fetch` with `credentials: same-origin`, CSRF header on writes, server messages surfaced verbatim (`FrappeError` with message, title, status) |
| Session | `src/api/session.ts`: boot query, `can(doctype, ptype)`, `hasReport` |
| UI | own components on the incumbent token set (`src/styles/tokens.css`), radix-ui primitives (dialog, dropdown, popover), cmdk palette, lucide icons, sonner toasts |
| Quality | Biome lint/format, Vitest (unit), Playwright end-to-end script against a running site |
| Removed from the incumbent | Lingui (English only, D-043), the in-memory sample API, recharts, zustand store |

Source layout:

```
apps/web/
  src/api/        frappe.ts (REST client), session.ts (boot, permissions)
  src/components/ Shell, DataTable, ReportView, fields (Link/Number/Date/Select/File), doc helpers, ui
  src/modules/    home (Command Center, sign-in), procurement, inventory, production, quality,
                  sales, accounts, admin (Integration Centre, planned modules)
  src/nav.ts      navigation groups, quick actions, global-search sources — each gated by permission
  src/router.tsx  route table
  e2e/run.mjs     browser end-to-end run of all six modules as the SAMPLE role users
```

## 3. Data flow for a write

1. The user fills a form; values stay in component state (unsaved documents produced by an
   ERPNext mapper, such as Purchase Order → Purchase Receipt, are handed to the form through an
   in-memory draft store, `src/lib/drafts.ts`).
2. Insert: `POST /api/resource/<DocType>`; ERPNext runs `validate` and the `factory_ops` hooks.
3. Submit: the client re-reads the saved document and calls `frappe.client.submit`; ERPNext runs
   `before_submit` / `on_submit`, posts the ledger, and rolls back completely on any refusal.
4. A refusal is shown with the server's own title and message (for example "Approval required —
   You created Purchase Order …, so another approver must submit it.").
5. On success the query cache is invalidated and the page re-reads the document.

## 4. UI route map

All routes are under `/factory`. "Gate" is what the server must allow for the route to appear in
the menu (from the boot answer); the page itself still works only if the server permits the reads.

| Group | Route | Screen | Gate |
|---|---|---|---|
| — | `/login` | Sign in (ERPNext account) | — |
| Overview | `/` | Command Center: work queues with counts and sources | signed in |
| Supply Chain | `/procurement/material-requests` · `/new` · `/:name` | Material requests; submit; create PO | Material Request read |
| | `/procurement/purchase-orders` · `/new` · `/:name` | Purchase orders; approve; receive goods | Purchase Order read |
| | `/procurement/receipts` · `/new` · `/:name` | Goods receipts (from a PO) | Purchase Receipt read |
| | `/procurement/requirements` | RM / PM requirements report | report |
| | `/inventory/stock` | Stock by QC status | report |
| | `/inventory/movements` · `/new` (`?type=wastage`, `?draft=`) · `/:name` | Stock entries: transfer, wastage, work-order entries | Stock Entry read |
| Manufacturing | `/production/work-orders` · `/new` · `/:name` | Work orders; issue materials; record output | Work Order read |
| | `/production/wastage` | Wastage by reason (30 days) | report |
| | `/quality/queue` | QC queue | report |
| | `/quality/releases` · `/new` · `/:name` | QC release with inspection; QA re-test | QC Release read |
| | `/quality/deviations` · `/new` · `/:name` | Deviations; QA approval | QC Deviation read |
| Commerce | `/sales/orders` · `/new` · `/:name` | Sales orders; create pick list | Sales Order read |
| | `/sales/pick-lists/:name` | Pick list; reserve; create delivery note | (opened from an order) |
| | `/sales/deliveries` · `/:name` | Delivery notes; dispatch details; packing slip; dispatch; invoice | Delivery Note read |
| | `/sales/available`, `/sales/dispatch-register` | Reports | report |
| Finance | `/accounts/invoices` · `/:name` | Sales invoices; record payment | Sales Invoice read |
| | `/accounts/payments` · `/new` · `/:name` | Payment entries | Payment Entry read |
| | `/accounts/receivables`, `/accounts/payables` | Ageing reports | report |
| Administration | `/integrations` | Integration Centre (honest statuses) | signed in |
| | `/planned` | Planned modules (not built) | signed in |

Top bar: search (Ctrl K or `/`) across permitted documents and pages; "New" menu of create
actions the role may perform; company indicator; notifications; account menu (roles, open Desk,
sign out).

## 5. Development and deployment

Development (two processes, same origin through the Vite proxy):

```bash
bench --site factory.localhost serve --port 8000          # the ERP
cd apps/web && pnpm install && pnpm dev                   # http://localhost:5173/factory/
```

The Vite dev server proxies `/api`, `/files`, `/private`, `/desk`, `/assets` and `/printview` to
the site (`FACTORY_BACKEND`, default `http://127.0.0.1:8000`; `FACTORY_SITE`, default
`factory.localhost`), so cookies and CSRF behave as in production.

Build and serve from Frappe (staging / production):

```bash
cd apps/web && pnpm install --frozen-lockfile && pnpm build   # writes factory_ops/public/factory + www/factory.html
bench build --app factory_ops                                 # links /assets/factory_ops
```

The build output is not committed (`.gitignore`); the deployment image must run `pnpm build`
before `bench build`. Until it does, `/factory` returns 404 and Desk is unaffected.

## 6. Gaps and limits (known)

- Unsaved mapped drafts live in memory: reloading `/procurement/receipts/new?draft=…` loses the
  draft and the page says to start again from the order.
- Lists show the newest 100 documents per tab; older ones are reachable by search or in Desk.
- No offline mode; the shop floor needs network to the ERP.
- One JavaScript bundle (≈180 kB gzip); route-level code splitting is a later optimisation.
- Returns, purchase invoices, journal entries, stock reconciliation, BOM authoring and all
  masters remain in Desk (capability map).
