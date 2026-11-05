# R&D and formulation management

Status: **built and tested** (development, SAMPLE / DEMO data). Backend in
`apps/factory_ops/factory_ops/research/`; screens in `apps/web/src/modules/research.tsx` (route
`/factory/research/...`).

## What ERPNext already had, and what was added

ERPNext has Items and BOMs but no formulation library, versioning, trial records or approval
workflow, so a small custom module was added. Ingredients are **not** a new master: they are
ERPNext raw-material Items, with three optional fields on Item: ingredient category, INCI name and
ingredient specification.

| DocType | Purpose |
| --- | --- |
| Ingredient Category | groups ingredients (Item field `fo_ingredient_category`) |
| Formulation | one **version** of a formula: code shared by all versions, version number, link to the previous version, ingredients with % w/w, kg per batch computed by the server, required flag, status, decision record, BOM created from it |
| Formulation Ingredient | child rows of a formulation |
| Research Project | proposal → approval by an R&D Manager → in progress → completed |
| Formulation Trial | experiment or trial batch against a formulation version: procedure, observations, outcome (Pass / Fail / Inconclusive), attachments; submitted to lock it |
| Stability Study / Stability Reading | storage condition, duration, acceptance criteria written by R&D, readings per interval, result |
| BOM (custom fields) | `fo_formulation`, `fo_formulation_version`: the approved version a BOM was made from |

## Workflow

```
Draft --send for review--> Under Review --start trial--> Trial --approve--> Approved --archive--> Archived
  ^                          |   \                         \--reject--> Rejected --archive--> Archived
  +----return to draft-------+    \--reject--> Rejected
```

| Action | Who | Server checks |
| --- | --- | --- |
| send for review | R&D Chemist, R&D Manager | ingredients add up to the formula total (default 100 % ± 0.01); a version after the first describes its change |
| return to draft | R&D Chemist, R&D Manager | from Under Review only |
| start trial | R&D Manager | |
| approve | R&D Manager, **not the person who sent it for review** | at least one submitted trial of this version with outcome Pass; earlier approved versions of the same code are archived automatically |
| reject | R&D Manager, not the submitter | a reason is required |
| archive | R&D Manager | from Approved or Rejected |
| new version | R&D Chemist, R&D Manager | from any status but Draft; copies the ingredients, version + 1, linked to the previous one |
| create BOM | users who may create **and** submit BOMs (manufacturing) | Approved only; product must be a BULK item; one BOM per version; demo formulations refused outside a marked demo site |

Rules enforced on every save:
- An ingredient must exist, be active, be a stock item, and belong to the raw-material (RM) group.
- Each ingredient is listed once, with a percentage above zero.
- An ingredient marked *required* in a previous version cannot be dropped.
- **Only a Draft can be edited.** Changing the formula of a reviewed version is refused; status
  changes only through the actions above.
- Every change is recorded by Frappe's version history (track changes) and a comment per action.
- A BOM that names a formulation must point at its approved version (hook on BOM validate).

**Not invented:** there are no chemical-compatibility, safety or regulatory rules and no
specification limits. Stability acceptance criteria are written by R&D, and "within spec" is the
analyst's call.

## Demo data

The seeder marks demo projects, formulations, trials and studies `is_demo`. Their titles carry
**`DEMO - NOT REAL - NOT FOR COMMERCIAL PRODUCTION`**. A demo formulation can become a BOM only on
a site marked `fo_demo_site`, and that BOM's remarks repeat the label. No demo formula is derived
from a published ingredient list.

## Screens

- **Formulations:** in development / approved / all. The form has an ingredient editor and a live
  total. The detail page has:
  - the workflow actions this user's roles allow;
  - a decision note;
  - the formula total against its target;
  - a comparison with the previous version (per-ingredient change in percentage points);
  - New version and Create BOM;
  - connections to trials, studies and other versions.
- **Research projects:** proposal and approval.
- **Trials and experiments:** record and submit.
- **Stability studies:** readings added one interval at a time; completion with a result.

## Tests

- `factory_ops/tests/test_research.py`, 13 tests covering:
  - quantities and totals;
  - review refused until the formula adds up;
  - invalid ingredients (disabled, not a raw material, duplicate, zero %);
  - a version locked once it leaves Draft;
  - role checks, including no approval of one's own submission;
  - approval needs a passed trial, and rejection needs a reason;
  - trial outcome and observations required;
  - required ingredients kept across versions, and a change note required;
  - approving v2 archives v1;
  - an approved version becomes a traceable BOM;
  - a BOM cannot claim an unapproved formulation;
  - demo formulations never become production BOMs;
  - project approval by managers only;
  - stability completion rules.
- `apps/web/e2e/modules.mjs rnd`, 14 checks in the browser, as four users (chemist, R&D manager,
  production, master data):
  - draft and save;
  - refusal at 95 % in the server's words;
  - correction and review;
  - trial recorded;
  - approval;
  - no Create BOM for the R&D manager;
  - production creates the BOM linked to version 1;
  - new version 2 as a Draft.
