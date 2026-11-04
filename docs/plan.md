# Phase 0 plan — Foundation (frontend slice)

> **Paused (2026-11-04):** the client asked to evaluate ERPNext as the base. See
> `docs/erpnext-assessment.md`. This plan resumes, revised, once that decision is made.

Source: *Mintree Factory OS — Build Prompt v2* (2026-11-05). This file covers the frontend
half of Phase 0. The backend half (FastAPI, Postgres, Alembic, auth, audit, numbering,
outbox, Procrastinate, Compose) is a separate step and is listed under "Not in this slice".

## Scope of this slice

1. `apps/web`: React 19 + TypeScript strict (`noUncheckedIndexedAccess`) + Vite, React Compiler on.
2. Design tokens (`src/styles/tokens.css`) following brief §4: IBM Plex Sans / Plex Mono, warm
   neutral greys, one deep-mint accent, status colours for meaning only, 1px borders, 6px radius,
   flat surfaces, compact (32px rows) and comfortable (44px rows) density, dark mode via tokens (off).
3. App shell: tinted L-frame (sidebar + 48px top bar) holding a white work sheet; sidebar lists the
   nine core areas and the support areas; phone layout folds the sidebar into a sheet.
4. Command palette (cmdk) on `Ctrl+K`, `/` focuses search, `J/K` row movement, `Enter` open, `E` edit.
5. `/styleguide` route: every token, type step, status chip, button, form field, table, empty state,
   skeleton, confirm step and "Draft by assistant" panel on one page.
6. `/login` screen (UI only until the auth API exists).
7. A role-based home for QC (`/`): the HOLD queue, because "each role lands on its own queue" (§7.10).
8. `/inventory/stock` list (TanStack Table + Virtual, URL search params, column picker, CSV export,
   side sheet on row click) and the batch side sheet showing ledger rows behind a balance.
9. i18n through Lingui with English and Hindi catalogues; every label goes through it.
10. All data is `SAMPLE-` placeholder data from `src/api/sample.ts`, behind TanStack Query hooks
    shaped like the future Orval hooks so the swap is mechanical.

## Tests that prove it

- Unit (Vitest + Testing Library):
  - money/quantity formatters: paise integer → `₹1,23,456.78` (Indian grouping), never float maths.
  - sample data invariants: every balance equals the sum of its ledger rows; no negative balance;
    HOLD/REJECTED lots never counted as available.
  - status chip always renders a text label and an icon (never colour alone).
  - confirm dialog restates the effect line before a dangerous action.
  - command palette opens on Ctrl+K and navigates on Enter.
  - stock table: J/K moves the active row; Enter opens the side sheet; filter is written to the URL.
  - i18n: switching to Hindi changes nav labels.
- Accessibility: axe check on `/styleguide`, `/`, `/inventory/stock` (no violations).
- Build budget: shell JS under 200 KB gzipped (checked by `scripts/check-budget.mjs`).
- Visual: inspector screenshots at 1440 / 768 / 390 reviewed.

## Not in this slice (next steps of Phase 0)

- Backend monorepo half: FastAPI app, Postgres, Alembic migrations, sessions with Argon2id, RBAC
  with row scopes, audit log, numbering, outbox + Procrastinate, Docker Compose, CI.
- Orval generation (needs the backend OpenAPI). Until then `src/api/` holds hand-written types that
  mirror the planned contract; they are deleted when Orval runs.
- Playwright e2e and MSW (added with the first real endpoint).
