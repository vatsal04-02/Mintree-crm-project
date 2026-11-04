# Marketplace integration assessment

This assessment covers each channel in the brief: what exists in the Frappe ecosystem, what
API access each marketplace grants, and how Mintree gets it.

Sources were checked on 4 Nov 2026. Marketplace onboarding rules change often, so every
"access" line must be re-confirmed with the marketplace's seller support **before** any
connector work is estimated as fixed. The brief's rule stands: CSV/portal-export import is
built first for every channel and kept as the fallback.

## 1. What exists in the Frappe ecosystem

`frappe/ecommerce_integrations`, `version-16` branch (commit `a984a72`, GPL-3.0, requires
ERPNext) contains four integrations: **Shopify, Amazon, Unicommerce, Zenoti**. Verified from
its source tree and README.

| Integration | What the v16 code does | What it does not do |
| --- | --- | --- |
| Shopify | Settings, warehouse mapping, tax account mapping, webhooks; orders → Sales Orders; inventory sync | Not reviewed in depth; test in Phase 7 |
| Amazon (SP-API) | Settings for India marketplace (`IN` → `A21TJRUUN4KGV` in `amazon_sp_api.py`); pulls orders → creates Customer, Address, Item if missing, **Sales Order**; pulls charges and fees per order from the Finances API; catalog item lookup | No inventory push, no returns, no settlement reconciliation, no FBA inventory |
| Unicommerce | Channels, warehouses, shipment manifests, shipping providers/methods, package types; orders and inventory between ERPNext and Unicommerce | Requires a paid Unicommerce subscription |
| Zenoti | Salon/spa software | Not relevant |

**Amazon credential fields are outdated.** The Amazon settings DocType still asks for an IAM
ARN plus AWS access and secret keys, and signs requests with AWS SigV4. Amazon's changelog
says SP-API **no longer requires AWS IAM or SigV4 since 2 October 2023**, uses Login with
Amazon tokens only, and ignores SigV4 signatures. The integration probably still works, but
this needs a test. Treat it as a maintenance risk.

## 2. Channel by channel

| Channel | Seller API | How Mintree gets access | Ecosystem option | Recommendation |
| --- | --- | --- | --- | --- |
| **Shopify** (vmintree.in) | Admin API + webhooks | Custom app in the client's own Shopify admin; token held by the client | ecommerce_integrations Shopify | **Use the existing app** (Phase 7, first channel). Test order, refund and fulfilment sync |
| **Amazon.in** | Selling Partner API (orders, finances, reports, FBA inventory, notifications) | Register as a **private (self-authorised) developer** for the seller's own account in Seller Central (menu path to confirm). Expect a developer-profile review; restricted roles (buyer PII such as address and phone) need extra approval. Auth = LWA refresh token (verified in the changelog); the registration steps are from prior knowledge and **must be confirmed** | ecommerce_integrations Amazon (orders + fees only) | Start with ecommerce_integrations for orders. Add settlement reports and returns in `factory_ops`. **Confirm PII role approval early**: without it, invoices for MFN orders lack buyer address |
| **Flipkart** | Marketplace Seller APIs v3 (`api.flipkart.net/sellers`): listings, orders, shipments, returns; OAuth2 | Seller Dashboard → Manage Profile → Developer Access → **create a self-access application** (client-credentials flow). A seller login alone grants no API access. Sandbox needs a ticket. Self-access credentials are for the seller's own use and must not be shared with third-party aggregators | None in Frappe ecosystem | Phase 7: CSV import first; then a `factory_ops` connector using a self-access app owned by the client |
| **Myntra** | Partner APIs for **PPMP** (seller-fulfilled marketplace): catalog, discounts, inventory push per facility, orders (API v4) | Not self-service. API enabling goes through the Myntra account manager/partner team, which issues a Merchant ID. Integrators report that **no SKU pull API** exists for PPMP | Via Unicommerce, Vinculum, Ginesys, EasyEcom or similar aggregators (all paid) | CSV/portal export first. Ask Myntra whether a direct partner API is offered to a brand of Mintree's size; otherwise use an aggregator |
| **Nykaa** | Seller-panel API exists but is not publicly documented | Credentials (username, password, seller ID) are **issued by the Nykaa team**. Aggregators connect Nykaa.com and Nykaa Fashion channels with those credentials | Unicommerce, EasyEcom (paid) | CSV/portal export first. Ask Nykaa seller support for direct API terms; otherwise use an aggregator |

## 3. Two strategies

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| **A. Direct connectors** | Shopify and Amazon via ecommerce_integrations; Flipkart via our own connector; Myntra/Nykaa via CSV until direct access is granted | No subscription; data model fully ours | Most build effort; Myntra/Nykaa may never grant direct API access |
| **B. One aggregator** | Unicommerce (connector already in ecommerce_integrations) or another OMS connects all marketplaces; ERPNext talks to one system | One integration to maintain; marketplaces' onboarding handled by the aggregator | Monthly fee paid by the client; a second system of record for orders and inventory; less control over settlement detail |

**Recommendation:** decide at the start of Phase 7, based on order volume.

- **At low volume (the first months):** Option A with CSV imports. Daily CSV import of orders,
  returns and settlements for Flipkart, Myntra and Nykaa is reliable, costs nothing and meets the
  brief's "built first, kept as fallback" rule.
- **At high volume (hundreds of marketplace orders a day across 3+ channels):** price Option B.
  If chosen, test the Unicommerce connector in ecommerce_integrations v16 before committing.

## 4. Access checklist (client actions)

| # | Action | Owner | Needed by |
| --- | --- | --- | --- |
| 1 | Shopify: create custom app, scopes for orders/products/inventory/fulfilments | Client | Phase 7 |
| 2 | Amazon: register as private developer in Seller Central; request roles incl. restricted PII if invoicing MFN orders | Client | Phase 7 start (approval can take weeks) |
| 3 | Flipkart: create self-access application; request sandbox via ticket | Client | Phase 7 |
| 4 | Myntra: ask account manager about PPMP API enablement and Merchant ID | Client | Phase 7 |
| 5 | Nykaa: ask seller support about API credentials for direct integration | Client | Phase 7 |
| 6 | For each channel: export one month of orders, returns and settlements to build CSV importers | Client | Phase 7 |

All credentials are stored in the site's encrypted Password fields, never in the repository.

## Sources

- [Amazon SP-API changelog: no longer requires AWS IAM or SigV4](https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4)
- [Flipkart Marketplace Seller APIs v3 documentation](https://seller.flipkart.com/api-docs/FMSAPI.html)
- [Flipkart Seller API FAQ](https://seller.flipkart.com/api-docs/FAQ.html)
- [Flipkart seller API Java SDK](https://github.com/Flipkart/flipkart-seller-api-java-sdk)
- [Myntra PPMP API v4 documentation](https://mmip.myntrainfo.com/documentation/myntra-ppmp-api-v4)
- [Unicommerce: Myntra PPMP integration](https://support.unicommerce.com/index.php/knowledge-base/myntra-ppmp-integration/)
- [Vinculum: Myntra PPMP integration](https://docs.vineretail.com/myntra-integration/)
- [Unicommerce: Nykaa.com / Nykaa Fashion B2C integration](https://support.unicommerce.com/index.php/knowledge-base/integration-with-nykaa-design-nykaa-com-or-nykaa-fashion-b2c/)
- [EasyEcom: integrating Nykaa](https://support.easyecom.io/portal/en/kb/articles/integrating-nykaa-with-easyecom)
- `frappe/ecommerce_integrations` `version-16` source (`a984a72`)
