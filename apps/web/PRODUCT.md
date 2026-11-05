# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Mintree Manufacturing staff at one cosmetics/personal-care factory in India, each working inside one
department and acting under their ERPNext role:

- **Purchase** (buyers, purchase approvers): raise requisitions and purchase orders for raw and
  packaging materials, chase deliveries.
- **Stores / warehouse**: receive goods into QC Hold, move stock, pick and pack, count stock.
- **Production** (operators, supervisors): run bulk manufacturing in kg, then filling and packing in
  units; issue materials, record output and wastage. Often on a tablet on the shop floor.
- **QC officers and QA managers**: inspect incoming material, bulk and finished goods; release or
  reject batches; approve deviations.
- **Sales and dispatch**: enter B2B and manually collected D2C orders, pick, pack, ship.
- **Accounts**: invoice, record payments, follow receivables and payables, verify the books.
- **Management** (owners, senior managers, read-only): see what needs attention across the factory.

Desktop first (office staff, dense tables); tablet-friendly for the shop floor and stores.

## Product Purpose
Mintree Factory OS is the custom front end through which Mintree staff do their daily department
work. ERPNext v16 with the `factory_ops` app stays the system of record and enforces every rule
(QC quarantine, batch and expiry, approvals, segregation of duties, accounting). The front end only
presents data and calls the backend's own APIs; it never holds business rules of its own.

Success: a department's daily workflow can be done end to end in Factory OS, the resulting
documents are the same ERPNext documents Desk would show, and no server-side control can be
bypassed through it.

## Positioning
One purpose-built screen per department job, wired to a real ERP with factory-specific QC and
batch controls, instead of ERPNext's generic Desk. Every figure on screen comes from the ledger or a
named report; nothing is simulated.

## Operating Context
- ERPNext Desk remains available for administration, setup, master data and anything not yet in
  Factory OS (confirmed: React for daily ops, Desk for admin).
- Served on the same domain as ERPNext at `/factory` by Frappe itself (a `www` page of `factory_ops`),
  sharing the Frappe session cookie and CSRF token. Desk stays at `/desk`.
- Backend: Frappe v16.55.2, ERPNext v16.53.0, `factory_ops` custom app, MariaDB 11.8, Valkey 8.1.
- Roles are ERPNext roles (Purchase User/Manager, Stock User/Manager, Delivery User, Manufacturing
  User/Manager, QC Officer, QA Manager, Sales User/Manager, Accounts User/Manager, Management
  Viewer). Server permissions are the security boundary; the UI only mirrors them.
- Development runs on a SAMPLE company with labelled SAMPLE data and SAMPLE users.

## Capabilities and Constraints
- Backend capabilities and gaps per module: `docs/FACTORY_OS_FRONTEND_CAPABILITY_MAP.md`.
- English only (confirmed). No translation layer.
- No GST until the client's GSTIN and accountant sign-off; no marketplace, courier, Meta or AI
  connectors exist in the backend yet: their screens may only state that, never simulate them.
- The browser holds no secrets: no API keys, database or integration credentials.

## Brand Commitments
- Name: Mintree Factory OS.
- Visual world: the frame of ERPNext v16 Desk (icon rail + module panel, Inter, neutral greys),
  chosen by the client on 2026-11-05 after the first "framed sheet" build read as generic. See DESIGN.md.

## Evidence on Hand
- Real backend workflows with tests (152 automated tests) and SAMPLE data on the development site.
- No real customers, products, prices, quality limits or tax registration yet: all such data is
  SAMPLE and must be shown as such; no metric may be invented.

## Product Principles
1. The ERP decides; the screen asks. Every action is an ERPNext/Frappe call whose server-side
   validation is final; its error is shown in plain words.
2. Only what works is shown. A module, button or figure appears only when the backend behind it
   exists and the user may use it.
3. One job per screen, in the language of the department (batch, QC Hold, Work Order, LR/AWB).
4. Every number names its source and opens the records behind it.
5. The shop floor is not the office: tablet use needs large targets and short paths.
