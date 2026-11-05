# Maintenance and asset management

Status: **built and tested** (development, SAMPLE data). Screens: `apps/web/src/modules/maintenance.tsx`
(`/factory/maintenance/...`). Backend: `factory_ops/maintenance/`, `factory_ops/api/maintenance.py`.

## Built on ERPNext, not beside it

| Need | ERPNext DocType reused | factory_ops adds |
| --- | --- | --- |
| Asset register | **Asset** (submitted, "Existing Asset", no depreciation booked by this module) | custom fields: equipment type, operating status (Active / Under Maintenance / Breakdown / Idle / Retired), manufacturer, model, serial number, installation date, warranty until / details (editable after submit). Location, department and category are ERPNext's own fields. `register_asset` creates the equipment Item and masters ERPNext needs. |
| Preventive schedules, checklists, technicians, reminders | **Asset Maintenance** (tasks with type, periodicity, start / end, assignee), **Asset Maintenance Team**, **Asset Maintenance Log** (one per occurrence) | the next due date of each task, computed with ERPNext's own `calculate_next_due_date` (ERPNext fills it only in the browser form). ERPNext assigns each occurrence (ToDo) to the technician, marks overdue occurrences daily, and creates the next one when a task is completed. |
| Breakdowns | **Asset Repair** (failure / completion time, description, actions performed, cost, consumed stock items) | severity, reported by, technician, root cause, downtime in hours, closure approved by / on; the asset's operating status follows its open breakdowns |
| Spare parts | ordinary stock **Items** in Item Group "Spare Parts" (not QC-controlled), bought and received like any material; reorder levels on the Item | the consumed rows' valuation from the stock ledger, so ERPNext's own repair cost and stock issue carry a value |
| Dashboard | — | `dashboard()`, computed from the records the user may read |

## Breakdown workflow

1. **Report** (Maintenance User or Manager): equipment, failure time, severity, description. The
   equipment's status becomes *Breakdown*.
2. **Repair** (technician): completion time, resolution, root cause, technician, and spare parts used
   (item, warehouse, quantity). Marking it *Completed* is refused until these are recorded.
3. **Approve closure** (Maintenance Manager only; submitting the Asset Repair):
   - ERPNext issues the spare parts from stock as a Material Issue, posted with the manager's
     rights, so negative stock is refused as usual.
   - The approver and time are recorded.
   - The equipment returns to *Active* once no other breakdown on it is open.

## Roles

ERPNext's own **Maintenance Manager** and **Maintenance User** roles are given rights on the asset
DocTypes. ERPNext grants these DocTypes only to Manufacturing and Quality roles.

| | Maintenance User (technician) | Maintenance Manager |
| --- | --- | --- |
| Asset | read | create, submit, update equipment details |
| Asset Maintenance (schedule) | read, write (ERPNext updates it when a task is completed) | create, write |
| Asset Maintenance Log (task occurrence) | write, create, submit (completing a task inserts the next one) | + cancel |
| Asset Repair (breakdown) | create, write | + submit (closure approval), cancel |
| Asset Movement | read | create, submit (registering an asset places it) |

To issue spare parts on closure, the user also needs ERPNext's stock-issue rights (Stock User). The
SAMPLE users: `sample.maintenance` (technician) and `sample.maintmanager`.

## Dashboard (`/factory/maintenance`)

Equipment by operating status, open breakdowns by severity, preventive tasks due in 14 days or
overdue, downtime hours and repair + spare-part cost per month for six months (closed breakdowns),
and spare parts at or below their reorder level. A section the user may not read is left out, not
shown as zero.

## Masters created by setup

These are generic factory terms, not client data:
- location "Factory";
- asset categories "Plant and Machinery", "Laboratory Equipment" and "Utilities", on the company's
  fixed-asset accounts;
- item groups "Factory Equipment" and "Spare Parts";
- one equipment Item per equipment type (ERPNext needs an Item behind every Asset).

## Not included

- Depreciation and asset accounting from this module.
- Calibration certificates beyond ERPNext's "certificate required" flag.
- Machine-breakdown blocking of Work Orders (Phase 4, eBMR).
- Spare-part purchase from the dashboard (standard Material Request / Purchase Order apply).

## Tests

- `tests/test_maintenance.py`, 8 tests:
  - registration as a submitted asset, refused without rights;
  - preventive tasks get due dates and logs;
  - a breakdown marks the machine;
  - *Completed* needs a root cause, and a technician cannot approve closure;
  - closure by the manager returns the machine to Active;
  - ERPNext's own refusal of a completion before the failure;
  - spare parts issued from stock with their cost;
  - dashboard counts and per-permission sections;
  - spares at or below reorder;
  - a technician completes a task and the next occurrence is created.
- `apps/web/e2e/modules.mjs maintenance`, 15 browser checks as the master-data, stores,
  maintenance manager and technician users, through to the stock movement and the overview.
