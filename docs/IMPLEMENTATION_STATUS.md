# Mintree Factory OS — implementation status

Updated 2026-11-05. **Development and local demo only. Not production-ready, not deployed.**
SAMPLE company, SAMPLE users, DEMO records. No real Mintree data, no GSTIN, no marketplace or Meta
connection.

| Area | State | Evidence |
| --- | --- | --- |
| ERP core (ERPNext v16.53.0 / Frappe v16.55.2, factory_ops) | Built and tested: QC quarantine and release, purchase approvals, receiving, two-stage production, wastage, sales channels, available-to-sell, FEFO with shelf-life eligibility, dispatch, invoicing, payments, master data import, role workspaces, reports | `PHASE_1_TEST_RESULTS.md` |
| React front end: six priority modules | **Working against real ERPNext records and permissions**: Procurement, Inventory, Production, Quality, Sales and Dispatch, Accounts | e2e `apps/web/e2e/run.mjs` 44/44 |
| UI | contextual empty states for every list and report, search and paging, KPI strip, inline bars, R&D / maintenance / marketing tones; brand palette pending (site unreachable) | `FACTORY_OS_UI_DESIGN_SYSTEM.md` |
| R&D and formulation | **Built**: versions, validation, role-checked approval, trials, stability, approved version → BOM | `MINTREE_RND_MODULE.md`; 13 tests; e2e 14 |
| Maintenance and assets | **Built on ERPNext assets**: register, preventive schedules, breakdowns with closure approval, spare parts through stock, dashboard | `MINTREE_MAINTENANCE_MODULE.md`; 8 tests; e2e 15 |
| Marketplaces | **Management built** (channels, listings, orders → sales orders, stock allocation without double counting, returns, settlements, sync engine, webhook). **No marketplace connected**; adapters refuse to call out | `MINTREE_ECOMMERCE_MODULE.md`; 15 tests; e2e 10 |
| Meta and brand marketing | **Built**: campaigns, content calendar, approval, performance with source. **Meta not connected** | `MINTREE_META_MARKETING_MODULE.md`; 7 tests; e2e 9 |
| Integration Centre | states read from records and logs; only the ERP is Connected | `FACTORY_OS_FRONTEND_CAPABILITY_MAP.md` §11 |
| Website catalogue extraction | tool built and tested offline (19 tests); **not run**: vmintree.in is unreachable from this environment | `DEMO_GUIDE.md` §1 |
| Local demo | `deploy/demo/reset-demo.sh` builds `demo.localhost` with DEMO data for every module; 14-step scenario 22/22 | `DEMO_GUIDE.md` |

Test totals on the final code: see `PHASE_1_TEST_RESULTS.md`, "Next phase" section.

Detailed per-module front-end report (procurement through accounts): `FACTORY_OS_IMPLEMENTATION_STATUS.md`.
Plan and gaps: `FACTORY_OS_NEXT_PHASE_PLAN.md`, `OPEN_ISSUES.md`.
