# Brand & marketing (Meta)

Status:
- **Campaign, content and performance management are built and tested.**
- **Meta is not connected**: no API call exists, and nothing is fetched or published.

Backend: `factory_ops/marketing/`, `factory_ops/api/marketing.py`. Screens:
`apps/web/src/modules/marketing.tsx` (`/factory/marketing/...`).

## Records

| DocType | Holds |
| --- | --- |
| Marketing Campaign | name, platform, objective, budget, schedule, owner, team, products, target audience, brief, status, approval record, and a Meta campaign ID filled only by a verified connection |
| Marketing Content | content calendar entry: campaign, type (post, carousel, reel, story, ad creative…), platform, planned date, assignee, creative file, draft caption, review and approval, published URL |
| Campaign Performance | figures for a period: spend, impressions, reach, clicks, leads, purchases, purchase value, **and their source** |
| Meta Connection | business ID, ad account ID, app ID, encrypted app secret and system-user token, state, last test |

## Workflows

All actions are role-checked on the server. The person who sent an item for approval cannot decide
on it, a rejection needs a reason, and status changes only through these actions.

| Campaign | Draft → Awaiting Approval → Approved / Rejected → Live ⇄ Paused → Completed |
| --- | --- |
| who | Marketing User drafts, sends, marks live / paused / completed; **Marketing Manager approves or rejects** |

| Content | Idea → In Production → In Review → Approved / Rejected → Scheduled → Published |
| --- | --- |
| rules | review needs a creative or a caption; approval by a Marketing Manager; *Published* needs the URL where it was posted. Publishing is done by hand; no publishing connection exists |

## Honest figures

- Every performance row states its **source**. Today that is *Manual entry from the ad platform*
  (figures copied from Meta Ads Manager or another platform's report) or *DEMO - NOT REAL*.
- *Meta API* can only be written by a verified Meta sync, which does not exist. Saving a row with
  that source by hand is refused.
- DEMO figures can only belong to DEMO campaigns, and a DEMO campaign can only have DEMO figures.
- The overview reports each source separately and never adds DEMO and real figures together.
- Ratios are computed only when their inputs exist; otherwise they are left empty, never shown as
  zero:
  - CTR = clicks / impressions;
  - cost per click = spend / clicks;
  - cost per lead = spend / leads;
  - return on ad spend = purchase value / spend.

## Meta integration: state and what is needed

`Meta Connection` "Meta Business" is **Not configured**. As fields are filled it shows *Awaiting
credentials*, and then *Not implemented* once everything is present. **Connected** can only come
from a successful live test, and no live call has been written. A connection test is refused with
that explanation.

A live integration needs:
- a Meta app with Marketing API access approved for Mintree's business portfolio;
- a system-user token with read access to ads insights (management access only if publishing is
  ever approved);
- the ad account ID.

The exact permissions, endpoints, API version and rate limits must be checked against Meta's
current official documentation with a real, authorised account before any code calls Meta.
Campaign publishing or editing from this system is **not** offered.

## Overview (`/factory/marketing`)

- campaigns by status, and content waiting for review;
- per source: spend, impressions, clicks, leads, cost per lead (blank without leads), and a weekly
  table for the last 12 weeks;
- the content calendar from 7 days back to 21 days ahead;
- the Meta connection state.

## Roles

**Marketing Manager** (approves campaigns and content, manages the Meta connection) and
**Marketing User** (drafts, schedules, records figures). Management Viewer reads campaigns and
performance. SAMPLE users: `sample.marketingexec`, `sample.marketing`.

## Tests

- `tests/test_marketing.py`, 7 tests:
  - campaign approval by a manager who did not submit;
  - status only through actions;
  - content needs a creative to be reviewed and a URL to be published;
  - Meta API figures refused by hand, and DEMO figures refused on a real campaign;
  - ratios only with their inputs;
  - DEMO campaigns take only DEMO figures, and the overview keeps them apart;
  - the Meta connection never claims to be connected;
  - only marketing roles see the overview.
- `apps/web/e2e/modules.mjs marketing`, 9 browser checks as the executive and the manager, covering
  campaign approval, recorded figures, content through to published, and the Meta test being
  refused.
