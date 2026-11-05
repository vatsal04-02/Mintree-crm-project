# E-commerce and marketplace management

Status:
- **The marketplace management side is built and tested:** channels, listings, order intake, sales
  orders, stock allocation, returns, settlements, sync log, signed webhook.
- **No marketplace is connected.** No adapter makes a live API call.

Backend: `factory_ops/marketplace/`, `factory_ops/api/marketplace.py`. Screens:
`apps/web/src/modules/marketplace.tsx` (`/factory/marketplace/...`).

## Status by provider

| Channel | Connector | State today | What is needed |
| --- | --- | --- | --- |
| Amazon | Amazon SP-API | **Not configured** (no credentials) | a registered SP-API developer application authorised by Mintree's seller account (LWA client ID and secret, refresh token), the seller ID and marketplace ID |
| Flipkart | Flipkart Seller API | **Not configured** | a Flipkart Seller API application (application ID and secret) approved for the seller account |
| Myntra | Myntra Partner API | **Access required** | partner API access granted by Myntra (onboarded partners only; to be confirmed with Myntra) |
| Nykaa | Nykaa Seller API | **Access required** | integration access from Nykaa (no open public seller API; to be confirmed with Nykaa) |

States are worked out on the server from what is actually configured:
- no credentials → *Not configured*;
- some credentials → *Awaiting credentials*;
- partner access not confirmed → *Access required*;
- all credentials present but no live code → *Not implemented*.

**Connected** can only come from a successful live connection test, which no adapter performs yet.
A connection test today is refused and logged with the reason.

**Before any live call is written,** each provider's current official documentation must be checked
against a real seller account: authentication, endpoints, rate limits and webhook signature
scheme. The provider descriptions above are a starting point, not a verified specification.

## Inventory: one stock, never offered twice

- The only source is ERPNext stock. For each listed item, the quantity a channel may publish is the
  **enforced available-to-sell figure** × the channel's share − its safety stock.
- Available to sell (`inventory.batch_eligibility`) counts only stock that is:
  - released by QC and in a usable store;
  - in date and at or above the minimum shelf life;
  - not reserved and not picked.

  QC Hold, Rejected, expired and short-dated stock is never included.
- The shares of all channels add up to at most 100 %; saving a share that would exceed it is
  refused. So the published total is at most the available stock, and the rest is kept back for
  B2B and the website.
- **Inventory to publish** shows this per item and channel. The quantities are stored on the
  listings; they are pushed only to Connected, sync-enabled channels (hourly job), which is none
  today.

## Catalogue mapping

A **Marketplace Listing** maps a channel's SKU (and its ASIN / FSN / style ID, price and MRP) to one
ERPNext Item:
- One item can be listed on every channel, which creates no duplicate items.
- A SKU or an item can be listed once per channel.
- The listed item must be an active sales item, not a variant template.

## Orders

- **Intake:** entered by hand, from a file, by the signed webhook, or as DEMO records.
  (channel, marketplace order ID) is unique, so a repeated order is reported, not recorded twice,
  and a webhook redelivery is harmless.
- **Sales order:** one action creates a standard ERPNext Sales Order:
  - customer = the channel's customer;
  - channel *D2C Marketplace*, with external order ID "Amazon/408-…" (kept unique by the sales rules
    too);
  - rows mapped through the listings.
  - The order ships from the channel's dispatch store, or the item's released-stock store
    (FG-QC-HOLD → FG-STORES), never QC Hold.
  - Unknown SKUs and cancelled orders make no sales order.
- From the sales order on, the existing flow applies unchanged: FEFO pick list of eligible batches,
  delivery note, invoice, payment.

## Returns and settlements

- **Marketplace Return:** type (return, refund only, replacement), reason, status, refund amount.
  Returned goods may only be received into a **QC Hold** store, never straight back into sellable
  stock.
- **Marketplace Settlement:** the statement's gross sales, commission, fees, shipping fees, refunds,
  tax withheld and net payout. **Reconcile** compares gross sales with the submitted ERPNext sales
  invoices for that channel's orders in the period, and records *Matched* or *Difference*.

## Synchronisation engine

Every call to a channel goes through `run_operation`, which writes one **Marketplace Sync Log**
with:
- an **idempotency key**: the same push is never sent twice;
- attempts, result and error;
- the exact payload, which a retry replays unchanged.

Rate-limited calls are retried by the hourly job with exponential back-off, up to 5 attempts.
Refusals for missing access are logged as *Skipped*.

**Webhook** (`factory_ops.api.marketplace.webhook?channel=…`):
- refused unless the channel has a webhook secret;
- HMAC-SHA256 of the raw body, checked in constant time;
- rate-limited to 120 per minute.

Each provider's own signature scheme replaces this when its connector is written.

Credentials (client secret, refresh token, webhook secret) are Frappe Password fields: encrypted at
rest, write-only in the screens, read on the server only.

## Roles

**Marketplace Manager** (channels, settings, listings, orders, returns, settlements) and
**Marketplace User** (listings, orders, returns). Turning an order into a sales order also needs
Sales Order create (Sales User). Accounts roles read and write settlements. SAMPLE user:
`sample.marketplace`.

## Tests

- `tests/test_marketplace.py`, 15 tests:
  - channels never claim a connection, through every state;
  - shares capped at 100 %;
  - published quantities from available-to-sell, never double counted;
  - QC Hold stock never published;
  - one item on every channel but never twice on one;
  - an order recorded once;
  - order → marketplace sales order;
  - a QC-controlled item ships from its released store;
  - unknown SKU and cancelled orders refused;
  - demo orders must say DEMO;
  - sync idempotency plus a rate-limit retry with back-off that replays the payload (a mocked
    connector);
  - webhook secret and signature, and harmless redelivery;
  - returns only into QC Hold;
  - settlement reconciliation;
  - only marketplace roles see the overview.
- `apps/web/e2e/modules.mjs marketplace`, 10 browser checks:
  - channel settings saved; the connection test refused and not shown as connected;
  - Myntra shows Access required;
  - one item listed on two channels;
  - allocation = available to sell × share;
  - an order entered, its repeat refused, and a sales order created.
