# Sales, dispatch and accounts (Milestone 5)

How Mintree sells, picks, ships, invoices and collects on ERPNext v16 with the `factory_ops`
controls. Everything is standard ERPNext (Customer, Sales Order, Stock Reservation Entry, Pick List,
Delivery Note, Packing Slip, Sales Invoice, Payment Entry, Accounts Receivable) except the controls
in §4. Customers, prices and credit limits below are SAMPLE placeholders. **No GST is configured:**
there is no GSTIN yet, and the development invoices are not tax documents (§7).

## 1. The flow

```
QC-released FG in FG-STORES
  └─ Sales Order (B2B, or D2C entered / imported with its external order no.)   credit limit checked
       └─ Pick List (FEFO, sellable stock only)
            └─ Reserve the picked batches (from the Pick List)                     available-to-sell drops
                 └─ Delivery Note + Packing Slip + transporter / LR-AWB            stock leaves ONCE (Dr COGS, Cr Stock)
                      └─ Sales Invoice from the Delivery Note (no stock update)    Dr Debtors, Cr Sales
                           └─ Payment Entry                                       Dr Bank, Cr Debtors
```

**ERPNext v16 note.** A Sales Order that already holds reserved stock cannot be picked. With a Pick
List, stock is reserved *from the Pick List*, which pins exactly the picked batches. Without a Pick
List (small D2C orders), stock is reserved from the Sales Order and the Delivery Note is made from
the order. Both paths are tested.

| # | Step | Who (SAMPLE user) | ERPNext |
| --- | --- | --- | --- |
| 1 | Enter the order. D2C orders need the website / marketplace order number | Sales (Sales User) | Sales Order; Data Import for a D2C file |
| 2 | Over the customer's credit limit: approve by submitting | Sales Manager (credit controller) | Sales Order submit |
| 3 | Check what can be promised | Sales | **Available to Sell** report |
| 4 | Pick: ERPNext proposes batches first-expiry-first-out from sellable stock | Stores | Pick List from the Sales Order |
| 5 | Reserve the picked stock | Stores | Pick List → Reserve |
| 6 | Pack and record the shipment: transporter, LR / AWB number, vehicle, packages | Dispatch (Stock User + Delivery User) | Delivery Note from the Pick List; Packing Slip |
| 7 | Invoice the delivery | Accounts | Sales Invoice from the Delivery Note |
| 8 | Record the money received, part or full | Accounts | Payment Entry from the invoice |
| 9 | Follow up | Accounts / management | Accounts Receivable, AR Summary, **Dispatch Register**, **Sales and Dispatch** dashboard |

## 2. Settings applied on the real site (`configure_selling_settings`)

| Setting | Value | Why |
| --- | --- | --- |
| Selling Settings → Sales Order Required | Yes | every dispatch belongs to an order |
| Selling Settings → Delivery Note Required | Yes | every invoice follows a delivery |
| Accounts Settings → Credit Controller | Sales Manager | may submit an order above the credit limit (Accounts Manager cannot submit Sales Orders in ERPNext) |
| Factory Ops Settings → Require dispatch details on Delivery Notes | on | transporter and LR / AWB number before submit |
| Factory Ops Settings → Allow stock update on Sales Invoices | off | stock leaves only through Delivery Notes |
| Factory Ops Settings → Minimum remaining shelf life for dispatch | 0 (client to set) | see §4.4 |
| Stock Settings → pick batches by Expiry; stock reservation on | (Milestone 3) | FEFO; reservations |

## 3. Masters (SAMPLE)

| Customer group | SAMPLE customer | Credit limit (per company) |
| --- | --- | --- |
| Distributors | SAMPLE Customer - Distributor | 5,00,000 |
| B2B Customers | SAMPLE Customer - Retailer | 25,000 |
| D2C Consumers | SAMPLE D2C - Website Orders (one customer for website orders) | none |

Selling price: SAMPLE-FG-0001 at 250.00 on *Standard Selling*. Roles:
- Sales User: orders.
- Sales Manager: credit approvals and D2C import.
- Stock User + **Delivery User**: dispatch. Delivery User is the standard ERPNext role that may select the accounts a Delivery Note needs; a plain Stock User cannot.
- Accounts User/Manager: invoices and payments.

## 4. Controls added by factory_ops (`sales_ops/`)

### 4.1 QC Hold and Rejected stock can never be sold, reserved, picked or dispatched
The QC guards on Sales Order, Stock Reservation Entry, Pick List, Delivery Note and Sales Invoice
(Milestone 2) apply unchanged. Default Pick List search is the USABLE group.

### 4.2 Available to sell
`Available to Sell` = sellable stock − active reservations. Sellable stock is stock that is:
- in a **Usable** warehouse;
- not expired;
- at or above the minimum shelf life.

Stock in QC Hold, Rejected, short-dated, expired and reserved quantities are shown in separate
columns. The same function enforces reservations, so what the report shows is what can be reserved:
- ERPNext's own reservation never exceeds it;
- a hand-made reservation beyond it is refused;
- a reservation that pins an expired or short-dated batch is refused.

### 4.3 One stock path
Stock leaves only through a **Delivery Note**:
- ERPNext refuses a stock-updating invoice made from a Delivery Note;
- factory_ops refuses any other stock-updating Sales Invoice, including the Pick List → Sales Invoice route, unless Factory Ops Settings allows it (off);
- returns are unaffected.

So every unit is deducted exactly once, and the invoice posts only revenue and the receivable.

### 4.4 Expiry and minimum shelf life
- **Expired** batches are never proposed by ERPNext's FEFO. Choosing one by hand is refused (ERPNext and G6).
- **Minimum shelf life:** ERPNext's FEFO does not know about it, so it would propose a batch with too
  little life left and the dispatch guard would refuse the whole document. A **daily job**
  (`sales_ops/shelf_life.py`, also on demand: `segregate_now`) moves batches of sales items that
  are expired or below the minimum from sellable warehouses to **NOT-FOR-DISPATCH**. It uses an
  ordinary, auditable stock transfer, so FEFO only ever sees dispatchable batches.
- Stock already reserved for an order is not moved. If such a batch becomes short-dated, the
  Delivery Note is refused with a clear message (cancel and re-reserve).

### 4.5 Channels and D2C orders
Sales Order fields **Sales Channel** (B2B, D2C Website, D2C Marketplace, D2C Other) and **External
Order ID**:
- A D2C order needs the external order ID.
- The same ID cannot be entered twice on one channel, so re-importing a file creates nothing; a cancelled order frees its number.
- Both fields are carried to the Delivery Note and Sales Invoice, and shown in the Dispatch Register.

Marketplace orders (Amazon, Flipkart, Myntra, Nykaa) are entered or imported by hand as
"D2C Marketplace". There are no connectors in this phase.

**Import:** `docs/templates/d2c_sales_orders_import.csv`, through Data Import → Sales Order →
"Insert New Records", "Submit after import". Sales Managers may use Data Import (granted by
factory_ops; ERPNext allows only System Managers by default).

### 4.6 Dispatch record
A Delivery Note carries:
- transporter, LR / AWB number and date, vehicle (standard ERPNext fields, required when the setting is on);
- one or more **Packing Slips** (packages, weights);
- the batches shipped (bundle).

The **Dispatch Register** report lists all of this with the order channel and billing status.

## 5. Reports and dashboard

| Report | Source |
| --- | --- |
| Available to Sell | factory_ops |
| Dispatch Register | factory_ops |
| Accounts Receivable, Accounts Receivable Summary, General Ledger, Sales Register | ERPNext |
| Stock and Account Value Comparison | ERPNext |

**Sales and Dispatch** dashboard (standard Number Cards and Dashboard Charts, created on migrate):

| Cards | Charts (weekly, last quarter) |
| --- | --- |
| Open Sales Orders, Orders to Dispatch (value), Pick Lists Open, Dispatches Not Billed, Receivables Outstanding, Overdue Invoices | Sales Orders, Dispatches, Invoiced, Payments Received |

Each user sees the cards for documents they may read. A salesperson does not see receivables; the
client should confirm whether they should.

## 6. Accounting (verified)

For 150 units sold at 250.00 from stock valued at 100.00:

| Document | Stock ledger | GL |
| --- | --- | --- |
| Sales Order, Pick List, reservation | none | none |
| Delivery Note | FG-STORES −150 | Stock in hand Cr 15,000 / Cost of goods sold Dr 15,000 |
| Sales Invoice | none | Debtors Dr 37,500 / Sales Cr 37,500 |
| Payment Entry 20,000 + 17,500 | none | Bank Dr / Debtors Cr; invoice Paid |

Reconciliation is checked by tests and over HTTP:
- the customer's ledger balance equals open invoice outstanding;
- the Accounts Receivable report matches;
- the stock ledger value equals the stock accounts.

## 7. Not included (by instruction, phase or missing client input)

- **GST / India Compliance, e-invoice, e-way bill:** no GSTIN, no invented one. Configure after the
  client's registration and the accountant's approval: tax templates, HSN, place of supply,
  rounding, invoice numbering.
- **Marketplace connectors** (Amazon, Flipkart, Myntra, Nykaa), **courier / shipping APIs**, settlement
  reconciliation: Phase 5/7. Orders are entered or imported by hand; AWB numbers are typed.
- **AI features:** not in scope.
- **Price lists per channel, schemes and discounts, sales returns workflow UI, delivery trips:**
  standard ERPNext, not yet configured for Mintree.
- **Bank statement import and reconciliation:** Milestone 6 / accounts setup.
- **Real customers, credit limits, payment terms, minimum shelf life:** client input.
