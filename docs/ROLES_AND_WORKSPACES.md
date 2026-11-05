# Roles, permissions and workspaces

Who can do what in Mintree Factory OS, and what each person sees on the Desk. Decisions: D-019,
D-032, D-036, D-037, D-040. Code: `setup/install.py` (QC rights), `setup/workspaces.py`
(workspaces, Management Viewer), DocType permission tables in `apps/factory_ops`.

**Principle.** Access is decided by ERPNext's standard roles and permissions. factory_ops adds three
roles (QC Officer, QA Manager, Management Viewer) and a small number of extra rights listed below.
A workspace only *shows* links: every document and report still opens with the user's own rights,
so a workspace can never widen access or bypass a QC, batch, expiry or dispatch control.

## 1. Roles by job

The job → role mapping is a proposal tested with SAMPLE users. The client confirms who holds which
role (OPEN_ISSUES).

| Job | ERPNext roles | SAMPLE user (dev only) | Workspaces |
| --- | --- | --- | --- |
| Owner / senior management | Management Viewer | sample.management | Management |
| Buyer | Purchase User | sample.buyer | Procurement |
| Purchase approver | Purchase Manager, Purchase User + a Purchase Approval Limit | sample.approver (limit 5,00,000) | Procurement |
| Stores | Stock User, Stock Manager | sample.stores | Stores and Warehouse |
| Production | Manufacturing User, Manufacturing Manager, Stock User | sample.production | Production Floor, Stores and Warehouse |
| QC officer | QC Officer | sample.qc | Quality Control |
| QA manager | QC Officer, QA Manager | sample.qa | Quality Control |
| Sales | Sales User, Stock User | sample.sales | Sales and Dispatch, Stores and Warehouse |
| Sales manager / credit controller | Sales Manager, Sales User, Stock User | sample.salesmanager | Sales and Dispatch, Stores and Warehouse |
| Dispatch | Stock User, Delivery User | sample.dispatch | Sales and Dispatch, Stores and Warehouse |
| Accounts | Accounts User, Accounts Manager | sample.accounts | Factory Accounts |
| Master data | Item Manager, Purchase Master Manager, Sales Master Manager, Stock Manager, Stock User | sample.masterdata | Stores and Warehouse |
| Administrator | System Manager | Administrator | Management (and all standard workspaces) |

SAMPLE users are created only on development sites
(`bench --site factory.localhost execute factory_ops.setup.sample_users.create_sample_users`); their
passwords are written to `sites/<site>/private/sample_users.json` (mode 600), never to the repository.

## 2. Key actions and who may perform them

Server-side rules apply on top of the role: the guards refuse QC Hold, Rejected, expired and
short-dated stock on every stock route whatever the role.

| Action | Allowed roles | Enforced by |
| --- | --- | --- |
| Create Purchase Order | Purchase User, Purchase Manager | ERPNext |
| Submit (approve) Purchase Order | Purchase Manager **within their Purchase Approval Limit** | factory_ops (D-014) |
| Set approval limits | System Manager, Accounts Manager | Purchase Approval Limit DocType |
| Receive goods (GRN) into QC Hold | Stock User, Stock Manager | ERPNext + GRN batch/COA checks |
| Inspect (Quality Inspection) | QC Officer, QA Manager | Custom DocPerm |
| Release / reject batch (QC Release) | QC Officer (submit), QA Manager (submit, cancel) | QC Release DocType |
| Approve deviation (QC Deviation) | QA Manager (submit); QC Officer drafts | QC Deviation DocType |
| Send for re-test (QC Retest) | QA Manager | QC Retest DocType |
| Edit QC settings (SLA, shelf life, flags) | QA Manager, System Manager | Factory Ops Settings |
| Batch QC status (`fo_qc_status`) | nobody: set only by server code (permlevel 1, read only for every role) | factory_ops |
| Make / submit BOM | Manufacturing User, Manufacturing Manager | ERPNext |
| Work Order, manufacture entry | Manufacturing User, Manufacturing Manager | ERPNext + two-stage rule |
| Wastage reasons | Manufacturing Manager, Stock Manager (create); Manufacturing/Stock User (read) | Wastage Reason DocType |
| Sales Order (create) | Sales User, Sales Manager | ERPNext |
| Submit order over credit limit | Sales Manager (credit controller) | ERPNext credit limit (D-032) |
| Reserve, pick | Stock User, Sales User with stock rights | ERPNext + eligibility rule (D-034) |
| Delivery Note (dispatch) | Stock User + Delivery User | ERPNext + G6 + dispatch record fields |
| Sales Invoice, Payment Entry | Accounts User, Accounts Manager | ERPNext (stock only via Delivery Note, D-029) |
| Import D2C orders (Data Import) | Sales Manager | Custom DocPerm (D-032) |
| Master Data Import | Item Manager, Stock Manager, Purchase/Sales Master Manager, Manufacturing Manager, System Manager; each record type also needs that type's create right | Master Data Import + user's own rights (D-035) |
| See management figures | Management Viewer (read and report only) | Custom DocPerm (D-037) |

## 3. Rights factory_ops adds to standard ERPNext

Everything else is ERPNext's standard permission table.

| DocType | Role | Rights | Why |
| --- | --- | --- | --- |
| Quality Inspection | QC Officer | read, write, create, submit, print, report | inspect |
| Quality Inspection | QA Manager | as above + cancel | correct inspections |
| Quality Inspection Template | QC Officer / QA Manager | read / read, write, create | specifications |
| Batch, Item, Warehouse, Stock Entry, Company | QC Officer, QA Manager | read (Batch also report) | QC screens and reports |
| Stock Ledger Entry | QC Officer, QA Manager | read, report | Stock by QC Status, Stock Ledger |
| Serial and Batch Bundle | QC Officer, QA Manager | read, create, write, submit, cancel | a QC Release's transfer creates bundles as the user |
| Batch | Stock User, Manufacturing User | read, create | batches are created on receipt and production |
| Batch (permlevel 1: `fo_qc_status`) | QC Officer, QA Manager, Stock User, Stock Manager, Item Manager, Manufacturing User, Sales User, Management Viewer | read only | see the QC status; nobody may write it |
| Data Import | Sales Manager | read, write, create | D2C order files |
| Management documents (29 DocTypes, see `MANAGEMENT_READ`) | Management Viewer | read, report (no write, create, submit) | management figures and reports |
| Reports on the Management workspace | Management Viewer | report role added | open the reports |

## 4. Workspaces

Seven role workspaces, created and kept in step on every migrate by `setup/workspaces.py`. Each is
role-restricted and lives in its own navigation module, with its own left sidebar and a Desk home
icon shown only to its roles (D-036). A user with several roles sees several workspaces. A user
opening another role's workspace URL is refused.

Figures (number cards and charts) are computed with the viewing user's permissions. A card for a
document type the user may not read is not shown. Stock values and wastage come from the stock
ledger and GL (`setup/dashboard_data.py`).

### Management (Management Viewer, System Manager)
- **Cards:** Total Stock Value; RM, PM, BULK, FG stock value; Batches Awaiting QC; Rejected Stock
  Value; Batches Made (30 days); Open Sales Orders; Orders to Dispatch (value); Dispatches Not
  Billed; Receivables Outstanding.
- **Charts:** Sales Orders, Invoiced, Dispatches and Batches Made by week.
- **Reports:** Stock Balance, Stock by QC Status, Available to Sell, Stock and Account Value
  Comparison; Work Order Summary, Process Loss Report, Wastage by Reason; Sales Analytics, Sales
  Order Analysis, Dispatch Register; AR / AP Summary, Profit and Loss, Balance Sheet.
- Read only: no button on this workspace creates or approves anything.

### Procurement (Purchase User, Purchase Manager)
- **Cards:** Material Requests to Order; Purchase Orders Awaiting Approval; Purchase Orders to Receive.
- **Chart:** Purchase Orders by week (value).
- **Links:** Material Request, RFQ, Supplier Quotation, Purchase Order, Purchase Receipt; Supplier,
  Supplier Group, Purchase Approval Limit; RM / PM Requirements, Purchase Order Analysis,
  Procurement Tracker, Item-wise Purchase History, Supplier Quotation Comparison.

### Stores and Warehouse (Stock User, Stock Manager)
- **Cards:** Total Stock Value; Batches Awaiting QC; Rejected Stock Value; Dispatches Not Billed.
- **Links:** Stock Balance, Stock Ledger, Stock by QC Status, Available to Sell, warehouse balance
  age; Batch, Batch-Wise Balance History, Batch Item Expiry Status, Stock Ageing; Stock Entry, Stock
  Reservation Entry, Pick List, Delivery Note; Warehouse, Item, **Master Data Import**, Stock
  Reconciliation.

### Production Floor (Manufacturing User, Manufacturing Manager)
- **Cards:** Work Orders In Progress; Batches Made (30 days); Wastage Written Off (30 days);
  Batches Awaiting QC.
- **Chart:** Batches Made by week.
- **Links:** Work Order, BOM, Material Request, Stock Entry; Work Order Summary, Production
  Analytics, Process Loss Report, Work Order Stock Report, Wastage by Reason, RM / PM Requirements;
  Wastage Reason, Workstation, Operation.

### Quality Control (QC Officer, QA Manager)
- **Cards:** Batches Awaiting QC; QC Decisions Pending; Deviations Awaiting Approval; Rejected Batches.
- **Chart:** QC decisions by week.
- **Links:** QC Queue, QC Release, Quality Inspection, QC Deviation, QC Retest; Stock by QC Status,
  Batch, Quality Inspection Summary; Quality Inspection Template, Factory Ops Settings.

### Sales and Dispatch (Sales User, Sales Manager, Delivery User)
- **Cards:** Open Sales Orders; Orders to Dispatch (value); Pick Lists Open; Dispatches Not Billed.
- **Charts:** Sales Orders and Dispatches by week.
- **Links:** Customer, Sales Order, Available to Sell, Sales Order Analysis; Pick List, Delivery
  Note, Packing Slip, Dispatch Register, Delivery Note Trends; Sales Invoice, Accounts Receivable.
- Salespeople do not see receivables figures unless they hold an Accounts role (client to confirm).

### Factory Accounts (Accounts User, Accounts Manager)
- **Cards:** Receivables Outstanding; Overdue Invoices; Payables Outstanding.
- **Charts:** Invoiced and Payments Received by week.
- **Links:** Sales / Purchase Invoice, Payment Entry, Journal Entry; AR, AR Summary, AP, AP Summary;
  General Ledger, Trial Balance, Profit and Loss, Balance Sheet; Stock and Account Value Comparison,
  Sales Register, Purchase Register.

### Changing a workspace

Edit `WORKSPACES`, `CARDS` or `CHARTS` in `setup/workspaces.py` and run `bench migrate`. Changes made
by hand in the Desk workspace editor are overwritten on the next migrate. Do not save the Sidebars
in the UI: Frappe v16 allows that only in developer mode.

## 5. How this is checked

- `tests/test_workspaces.py` (15 tests, including the Milestone 6 reports): every link, card and
  chart exists; each role sees its own workspaces and icons; every card on a workspace **computes**
  as every user expected to see it (not just "is visible"); rolling 30-day cards include today;
  Management Viewer reads but never changes; no screen lets anyone move held stock; stock-value and
  wastage cards agree with the reports and the ledger; re-running setup is idempotent.
- `deploy/dev/ui_check_workspaces.js` (55 browser checks): each of 11 SAMPLE users sees exactly the
  workspaces in the table in §1, each opens in its own sidebar with cards loaded, another role's
  workspace is refused, and the import form and new reports load. Screenshots in
  `docs/screenshots/`.
