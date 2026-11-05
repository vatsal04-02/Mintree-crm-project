import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { CheckCheck, ClipboardCheck, TriangleAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { call, type Doc, get, getDoc, insert, type Row, save, setValues, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import { DataTable } from "@/components/DataTable";
import {
  ActionButton,
  ChildTable,
  Connections,
  DocFrame,
  ListPage,
  RefLink,
  RowsEditor,
  useAction,
  useDoc,
  useList,
} from "@/components/doc";
import {
  DateField,
  DateTimeField,
  LinkField,
  NumberField,
  SelectField,
  TextArea,
  TextField,
} from "@/components/fields";
import { EmptyState, ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, isoDate } from "@/lib/format";

const C = { label: "Maintenance" };
const enc = encodeURIComponent;
const API = "factory_ops.api.maintenance";
const TYPES = [
  "Machine",
  "Production Line",
  "Filling Machine",
  "Packaging Equipment",
  "Weighing Equipment",
  "Laboratory Equipment",
  "Utility",
  "Other",
];
const nowLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
};
const hours = (v: unknown) => `${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} h`;

type Dash = {
  as_of: string;
  sections: string[];
  assets_by_status?: Record<string, number>;
  open_breakdowns?: Row[];
  monthly?: { month: string; downtime_hours: number; cost: number; closed: number }[];
  upcoming_maintenance?: Row[];
  upcoming_days?: number;
  spares_below_reorder?: Row[];
};

/* ---------------------------------------------------------------- Dashboard */

export function MaintenanceDashboard() {
  const boot = useSession();
  const { data, error, isLoading } = useQuery({
    queryKey: ["maintenance-dashboard", boot.company],
    queryFn: () => get<Dash>(`${API}.dashboard`, { company: boot.company }),
  });
  const statuses = data?.assets_by_status ?? {};
  const totalAssets = Object.values(statuses).reduce((a, b) => a + b, 0);
  const maxDown = Math.max(1, ...(data?.monthly ?? []).map((m) => m.downtime_hours));
  return (
    <div className="page">
      <PageHeader
        title="Maintenance"
        crumbs={[C]}
        meta={data && <span>From asset, breakdown and schedule records · {formatDate(data.as_of)}</span>}
      />
      <ErrorNote error={error} />
      {isLoading && <p className="dim">Loading…</p>}
      {data && totalAssets === 0 && data.sections.includes("assets") && (
        <EmptyState
          title="No equipment registered yet"
          reason="Machines, lines, filling and packaging equipment, balances, lab instruments and utilities are registered as ERPNext assets; schedules and breakdowns hang off them."
          actions={[{ label: "Register equipment", to: "/maintenance/assets/new", primary: true }]}
        />
      )}
      {data && totalAssets > 0 && (
        <div className="kpi-strip">
          {["Active", "Under Maintenance", "Breakdown", "Idle", "Retired"].map((s) => (
            <div key={s} className="kpi">
              <span className="kpi-label">{s}</span>
              <span className="kpi-value">{statuses[s] ?? 0}</span>
            </div>
          ))}
          <div className="kpi">
            <span className="kpi-label">Open breakdowns</span>
            <span className="kpi-value">{data.open_breakdowns?.length ?? 0}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Due in {data.upcoming_days} days</span>
            <span className="kpi-value">{data.upcoming_maintenance?.length ?? 0}</span>
          </div>
        </div>
      )}
      <div className="grid-2 align-start">
        {data?.open_breakdowns && (
          <Panel title="Open breakdowns" meta={<Link to="/maintenance/breakdowns">All breakdowns</Link>}>
            <DataTable<Row>
              label="Open breakdowns"
              rowKey={(r) => String(r.name)}
              rows={data.open_breakdowns}
              onRowClick={undefined}
              empty={{ title: "No open breakdowns", reason: "Every reported breakdown has been closed." }}
              columns={[
                {
                  key: "name",
                  label: "Breakdown",
                  render: (r) => (
                    <Link to={`/maintenance/breakdowns/${enc(String(r.name))}`} className="mono">
                      {String(r.name)}
                    </Link>
                  ),
                },
                { key: "asset_name", label: "Equipment" },
                {
                  key: "fo_severity",
                  label: "Severity",
                  render: (r) => (
                    <StatusChip status={String(r.fo_severity)} tone={severityTone(String(r.fo_severity))} />
                  ),
                },
                { key: "failure_date", label: "Since", render: (r) => formatDateTime(r.failure_date) },
              ]}
            />
          </Panel>
        )}
        {data?.upcoming_maintenance && (
          <Panel
            title={`Preventive maintenance due (next ${data.upcoming_days} days and overdue)`}
            meta={<Link to="/maintenance/tasks">All tasks</Link>}
          >
            <DataTable<Row>
              label="Upcoming maintenance"
              rowKey={(r) => String(r.name)}
              rows={data.upcoming_maintenance}
              empty={{
                title: "Nothing due",
                reason: "No planned task falls due in this window.",
                actions: [{ label: "Schedules", to: "/maintenance/schedules" }],
              }}
              columns={[
                {
                  key: "name",
                  label: "Task",
                  render: (r) => (
                    <Link to={`/maintenance/tasks/${enc(String(r.name))}`} className="mono">
                      {String(r.name)}
                    </Link>
                  ),
                },
                { key: "asset_name", label: "Equipment" },
                { key: "task_name", label: "Work" },
                { key: "due_date", label: "Due", render: (r) => formatDate(r.due_date) },
                {
                  key: "maintenance_status",
                  label: "Status",
                  render: (r) => <StatusChip status={String(r.maintenance_status)} />,
                },
              ]}
            />
          </Panel>
        )}
      </div>
      {data?.monthly && (
        <Panel
          title="Downtime and maintenance cost, last six months"
          meta={<span>closed breakdowns only</span>}
        >
          <table className="dt" aria-label="Downtime and cost by month">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Closed</th>
                <th>Downtime</th>
                <th className="num">Repair + spares cost</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td className="num">{m.closed}</td>
                  <td>
                    <span className="bar-cell">
                      <span className="bar" style={{ width: `${(m.downtime_hours / maxDown) * 100}%` }} />
                      <span className="bar-value">{hours(m.downtime_hours)}</span>
                    </span>
                  </td>
                  <td className="num">{formatMoney(m.cost, boot.currency ?? "INR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {data?.spares_below_reorder && (
        <Panel
          title="Spare parts at or below reorder level"
          meta={<Link to="/maintenance/spares">Spare parts</Link>}
        >
          <DataTable<Row>
            label="Spares below reorder"
            rowKey={(r) => `${r.item_code}-${r.warehouse}`}
            rows={data.spares_below_reorder}
            empty={{
              title: "No spare part is below its reorder level",
              reason: "Reorder levels are set per spare part and warehouse on the Item.",
            }}
            columns={[
              {
                key: "item_code",
                label: "Spare part",
                render: (r) => <span className="mono">{String(r.item_code)}</span>,
              },
              { key: "item_name", label: "Name" },
              { key: "warehouse", label: "Warehouse" },
              { key: "actual_qty", label: "In stock", num: true },
              { key: "reorder_level", label: "Reorder at", num: true },
              { key: "reorder_qty", label: "Reorder qty", num: true },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

function severityTone(s: string) {
  return s === "Critical" || s === "High"
    ? ("rejected" as const)
    : s === "Medium"
      ? ("hold" as const)
      : ("neutral" as const);
}

/* ---------------------------------------------------------------- Equipment */

export function AssetList() {
  return (
    <ListPage<Row>
      title="Equipment"
      crumbs={[C]}
      doctype="Asset"
      fields={[
        "name",
        "asset_name",
        "fo_equipment_type",
        "location",
        "department",
        "fo_operational_status",
        "fo_manufacturer",
        "fo_model",
      ]}
      searchFields={["name", "asset_name", "fo_serial_no", "fo_model"]}
      tabs={[
        {
          label: "In service",
          filters: [
            ["docstatus", "=", 1],
            ["fo_operational_status", "!=", "Retired"],
          ],
        },
        { label: "Breakdown", filters: { docstatus: 1, fo_operational_status: "Breakdown" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/maintenance/assets/${enc(String(r.name))}`}
      create="/maintenance/assets/new"
      createLabel="Register equipment"
      columns={[
        { key: "name", label: "Asset", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "asset_name", label: "Equipment" },
        { key: "fo_equipment_type", label: "Type", render: (r) => String(r.fo_equipment_type ?? "—") },
        {
          key: "fo_manufacturer",
          label: "Make / model",
          render: (r) => [r.fo_manufacturer, r.fo_model].filter(Boolean).join(" · ") || "—",
        },
        { key: "location", label: "Location" },
        {
          key: "fo_operational_status",
          label: "Status",
          render: (r) => <StatusChip status={String(r.fo_operational_status ?? "Active")} />,
        },
      ]}
    />
  );
}

export function AssetNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({
    asset_name: "",
    equipment_type: "Machine",
    location: "",
    department: "",
    manufacturer: "",
    model: "",
    serial_no: "",
    installation_date: "",
    warranty_until: "",
    warranty_details: "",
  });
  const [value, setValue] = useState<number | "">("");
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () =>
      call<string>(`${API}.register_asset`, {
        ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")),
        company: boot.company,
        purchase_amount: value === "" ? undefined : value,
      }),
    { success: (n) => `Registered ${n}`, onDone: (n) => navigate({ to: `/maintenance/assets/${enc(n)}` }) },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="Register equipment"
        crumbs={[C, { label: "Equipment", to: "/maintenance/assets" }]}
      />
      <Note>
        Registered as an ERPNext Asset (existing asset, no depreciation booked here). ERPNext needs the
        purchase value; it is not assumed.
      </Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Equipment">
          <div className="grid-2">
            <TextField label="Name" required value={f.asset_name} onChange={set("asset_name")} />
            <SelectField
              label="Type"
              value={f.equipment_type}
              onChange={set("equipment_type")}
              options={TYPES}
            />
            <TextField label="Manufacturer" value={f.manufacturer} onChange={set("manufacturer")} />
            <TextField label="Model" value={f.model} onChange={set("model")} />
            <TextField label="Serial number" value={f.serial_no} onChange={set("serial_no")} />
            <LinkField
              label="Location"
              doctype="Location"
              value={f.location}
              onChange={set("location")}
              hint="Factory if left empty"
            />
            <LinkField
              label="Department"
              doctype="Department"
              value={f.department}
              onChange={set("department")}
            />
            <DateField
              label="Installation date"
              value={f.installation_date}
              onChange={set("installation_date")}
            />
            <NumberField label="Purchase value" unit="INR" required value={value} onChange={setValue} />
            <DateField label="Warranty until" value={f.warranty_until} onChange={set("warranty_until")} />
          </div>
          <TextArea label="Warranty details" value={f.warranty_details} onChange={set("warranty_details")} />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.asset_name || value === ""}
          >
            Register equipment
          </button>
        </div>
      </form>
    </div>
  );
}

export function AssetPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Asset", name);
  const setStatus = useAction((s: string) => setValues("Asset", name, { fo_operational_status: s }), {
    success: (d) => `${name}: ${String((d as Doc).fo_operational_status)}`,
  });
  const status = String(doc?.fo_operational_status ?? "Active");
  const manager = can(boot, "Asset", "write");
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status } as Doc) : undefined}
      title={name}
      crumbs={[C, { label: "Equipment", to: "/maintenance/assets" }]}
      error={error ?? setStatus.error}
      actions={
        <>
          {can(boot, "Asset Repair", "create") && status !== "Retired" && (
            <ActionButton
              primary
              label="Report breakdown"
              icon={<TriangleAlert aria-hidden />}
              onClick={() => navigate({ to: "/maintenance/breakdowns/new", search: { asset: name } })}
            />
          )}
          {manager && status === "Active" && (
            <ActionButton
              label="Mark idle"
              onClick={() => setStatus.mutate("Idle")}
              pending={setStatus.isPending}
            />
          )}
          {manager && (status === "Idle" || status === "Under Maintenance") && (
            <ActionButton
              label="Back in service"
              onClick={() => setStatus.mutate("Active")}
              pending={setStatus.isPending}
            />
          )}
        </>
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Equipment", String(doc.asset_name)],
                ["Type", String(doc.fo_equipment_type ?? "—")],
                ["Manufacturer", String(doc.fo_manufacturer || "—")],
                ["Model", String(doc.fo_model || "—")],
                ["Serial number", String(doc.fo_serial_no || "—")],
                ["Location", String(doc.location ?? "—")],
                ["Department", String(doc.department || "—")],
                ["Installed", formatDate(doc.fo_installation_date)],
                ["Warranty until", formatDate(doc.fo_warranty_until)],
                ["Warranty", String(doc.fo_warranty_details || "—")],
                ["Category", String(doc.asset_category ?? "—")],
                ["Purchase value", formatMoney(doc.net_purchase_amount, boot.currency ?? "INR")],
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Breakdowns",
                doctype: "Asset Repair",
                filters: { asset: name },
                route: (n) => `/maintenance/breakdowns/${enc(n)}`,
              },
              {
                label: "Maintenance schedules",
                doctype: "Asset Maintenance",
                filters: { asset_name: name },
                route: (n) => `/maintenance/schedules/${enc(n)}`,
              },
              {
                label: "Maintenance tasks",
                doctype: "Asset Maintenance Log",
                filters: { asset_name: name },
                route: (n) => `/maintenance/tasks/${enc(n)}`,
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Breakdowns */

export function BreakdownList() {
  return (
    <ListPage<Row>
      title="Breakdowns"
      crumbs={[C]}
      doctype="Asset Repair"
      fields={[
        "name",
        "asset",
        "asset_name",
        "failure_date",
        "fo_severity",
        "repair_status",
        "fo_downtime_hours",
        "docstatus",
      ]}
      searchFields={["name", "asset", "asset_name"]}
      orderBy="failure_date desc"
      tabs={[
        { label: "Open", filters: { docstatus: 0 } },
        { label: "Closed", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/maintenance/breakdowns/${enc(String(r.name))}`}
      create="/maintenance/breakdowns/new"
      createLabel="Report breakdown"
      columns={[
        { key: "name", label: "Breakdown", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "asset_name", label: "Equipment" },
        { key: "failure_date", label: "Failed at", render: (r) => formatDateTime(r.failure_date) },
        {
          key: "fo_severity",
          label: "Severity",
          render: (r) => (
            <StatusChip status={String(r.fo_severity)} tone={severityTone(String(r.fo_severity))} />
          ),
        },
        {
          key: "fo_downtime_hours",
          label: "Downtime",
          num: true,
          render: (r) => (Number(r.fo_downtime_hours) ? hours(r.fo_downtime_hours) : "—"),
        },
        {
          key: "repair_status",
          label: "Status",
          render: (r) => <StatusChip status={r.docstatus === 1 ? "Closed" : String(r.repair_status)} />,
        },
      ]}
    />
  );
}

export function BreakdownNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { asset?: string };
  const [f, setF] = useState({
    asset: search.asset ?? "",
    failure_date: nowLocal(),
    fo_severity: "High",
    description: "",
    fo_technician: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () =>
      insert({
        doctype: "Asset Repair",
        company: boot.company,
        repair_status: "Pending",
        ...f,
        fo_technician: f.fo_technician || undefined,
      }),
    {
      success: (d) => `Reported ${d.name}; the equipment is marked as in breakdown`,
      onDone: (d) => navigate({ to: `/maintenance/breakdowns/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="Report breakdown"
        crumbs={[C, { label: "Breakdowns", to: "/maintenance/breakdowns" }]}
      />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Breakdown">
          <div className="grid-2">
            <LinkField
              label="Equipment"
              doctype="Asset"
              filters={{ docstatus: 1 }}
              required
              value={f.asset}
              onChange={set("asset")}
            />
            <DateTimeField label="Failed at" required value={f.failure_date} onChange={set("failure_date")} />
            <SelectField
              label="Severity"
              value={f.fo_severity}
              onChange={set("fo_severity")}
              options={["Low", "Medium", "High", "Critical"]}
            />
            <LinkField
              label="Assigned technician"
              doctype="User"
              value={f.fo_technician}
              onChange={set("fo_technician")}
            />
          </div>
          <TextArea label="What happened" required value={f.description} onChange={set("description")} />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.asset || !f.description}
          >
            Report breakdown
          </button>
        </div>
      </form>
    </div>
  );
}

type SpareRow = { item_code: string; warehouse: string; consumed_quantity: number | "" };

export function BreakdownPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Asset Repair", name);
  const [f, setF] = useState({
    completion_date: nowLocal(),
    actions_performed: "",
    fo_root_cause: "",
    fo_technician: "",
  });
  const [spares, setSpares] = useState<SpareRow[]>([]);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const repaired = useAction(
    async () => {
      const fresh = await getDoc("Asset Repair", name);
      return save({
        ...fresh,
        ...f,
        fo_technician: f.fo_technician || fresh.fo_technician || boot.user,
        repair_status: "Completed",
        stock_items: [
          ...((fresh.stock_items as Row[]) ?? []),
          ...spares
            .filter((s) => s.item_code && s.warehouse && s.consumed_quantity !== "")
            .map((s) => ({ ...s, consumed_quantity: String(s.consumed_quantity) })),
        ],
      } as Doc);
    },
    { success: "Marked repaired; a maintenance manager approves the closure", onDone: () => refetch() },
  );
  const approve = useAction(() => submit("Asset Repair", name), {
    success: `${name} closed; spare parts issued from stock`,
  });
  const open = doc?.docstatus === 0;
  const completed = doc?.repair_status === "Completed";
  const managerCanClose = can(boot, "Asset Repair", "submit");
  return (
    <DocFrame
      doc={
        doc
          ? ({ ...doc, status: doc.docstatus === 1 ? "Closed" : String(doc.repair_status) } as Doc)
          : undefined
      }
      title={name}
      crumbs={[C, { label: "Breakdowns", to: "/maintenance/breakdowns" }]}
      error={error ?? repaired.error ?? approve.error}
      actions={
        open &&
        completed &&
        managerCanClose && (
          <ActionButton
            primary
            label="Approve closure"
            icon={<CheckCheck aria-hidden />}
            pending={approve.isPending}
            onClick={() => approve.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Equipment", <RefLink key="a" doctype="Asset" name={doc.asset} />],
                [
                  "Severity",
                  <StatusChip
                    key="s"
                    status={String(doc.fo_severity)}
                    tone={severityTone(String(doc.fo_severity))}
                  />,
                ],
                ["Failed at", formatDateTime(doc.failure_date)],
                ["Completed at", formatDateTime(doc.completion_date)],
                ["Downtime", Number(doc.fo_downtime_hours) ? hours(doc.fo_downtime_hours) : "—"],
                ["Reported by", String(doc.fo_reported_by ?? "—")],
                ["Technician", String(doc.fo_technician || "—")],
                ["What happened", String(doc.description || "—")],
                ["Resolution", String(doc.actions_performed || "—")],
                ["Root cause", String(doc.fo_root_cause || "—")],
                ["Spare parts cost", formatMoney(doc.consumed_items_cost, boot.currency ?? "INR")],
                ["Closure approved by", String(doc.fo_closure_approved_by || "—")],
              ]}
            />
          </Panel>
          {((doc.stock_items as Row[]) ?? []).length > 0 && (
            <Panel title="Spare parts">
              <ChildTable
                label="Spare parts"
                rows={doc.stock_items}
                columns={[
                  {
                    key: "item_code",
                    label: "Spare part",
                    render: (r) => <span className="mono">{String(r.item_code)}</span>,
                  },
                  { key: "warehouse", label: "From" },
                  { key: "consumed_quantity", label: "Qty", num: true },
                  {
                    key: "valuation_rate",
                    label: "Rate",
                    num: true,
                    render: (r) => formatMoney(r.valuation_rate, boot.currency ?? "INR"),
                  },
                  {
                    key: "total_value",
                    label: "Value",
                    num: true,
                    render: (r) => formatMoney(r.total_value, boot.currency ?? "INR"),
                  },
                ]}
              />
            </Panel>
          )}
          {open && !completed && can(boot, "Asset Repair", "write") && (
            <Panel title="Record the repair">
              <div className="grid-2">
                <DateTimeField
                  label="Completed at"
                  required
                  value={f.completion_date}
                  onChange={set("completion_date")}
                />
                <LinkField
                  label="Technician"
                  doctype="User"
                  value={f.fo_technician}
                  onChange={set("fo_technician")}
                  hint="You, if left empty"
                />
              </div>
              <TextArea
                label="Resolution (actions performed)"
                required
                value={f.actions_performed}
                onChange={set("actions_performed")}
              />
              <TextArea label="Root cause" required value={f.fo_root_cause} onChange={set("fo_root_cause")} />
              <h3 className="sub-title">Spare parts used (issued from stock when the closure is approved)</h3>
              <RowsEditor
                rows={spares as unknown as Row[]}
                onChange={(r) => setSpares(r as unknown as SpareRow[])}
                blank={() => ({ item_code: "", warehouse: "", consumed_quantity: "" })}
                addLabel="Add spare part"
                cols={[
                  {
                    field: "item_code",
                    label: "Spare part",
                    type: "link",
                    doctype: "Item",
                    filters: { item_group: "Spare Parts", disabled: 0 },
                  },
                  {
                    field: "warehouse",
                    label: "From warehouse",
                    type: "link",
                    doctype: "Warehouse",
                    filters: { is_group: 0 },
                  },
                  { field: "consumed_quantity", label: "Qty", type: "number" },
                ]}
              />
              <div className="form-actions">
                <ActionButton
                  primary
                  label="Mark repaired"
                  icon={<Wrench aria-hidden />}
                  pending={repaired.isPending}
                  disabled={!f.actions_performed || !f.fo_root_cause}
                  onClick={() => repaired.mutate()}
                />
              </div>
            </Panel>
          )}
          {open && completed && !managerCanClose && (
            <Note>
              Repaired. A maintenance manager approves the closure; spare parts are issued from stock then.
            </Note>
          )}
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Preventive schedules */

export function ScheduleList() {
  return (
    <ListPage<Row>
      title="Preventive Schedules"
      crumbs={[C]}
      doctype="Asset Maintenance"
      fields={["name", "asset_name", "item_name", "maintenance_team", "maintenance_manager"]}
      searchFields={["name", "asset_name"]}
      tabs={[{ label: "All", filters: {} }]}
      detail={(r) => `/maintenance/schedules/${enc(String(r.name))}`}
      create="/maintenance/schedules/new"
      createLabel="New schedule"
      columns={[
        { key: "name", label: "Schedule", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "item_name", label: "Equipment type" },
        { key: "maintenance_team", label: "Team" },
      ]}
    />
  );
}

type TaskRow = {
  maintenance_task: string;
  maintenance_type: string;
  periodicity: string;
  start_date: string;
  assign_to: string;
};

export function ScheduleNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [asset, setAsset] = useState("");
  const [team, setTeam] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([
    {
      maintenance_task: "",
      maintenance_type: "Preventive Maintenance",
      periodicity: "Monthly",
      start_date: isoDate(),
      assign_to: "",
    },
  ]);
  const create = useAction(
    () =>
      insert({
        doctype: "Asset Maintenance",
        asset_name: asset,
        company: boot.company,
        maintenance_team: team,
        asset_maintenance_tasks: tasks
          .filter((t) => t.maintenance_task)
          .map((t) => ({ ...t, maintenance_status: "Planned", assign_to: t.assign_to || undefined })),
      }),
    {
      success: (d) => `Saved ${d.name}; the first tasks are scheduled`,
      onDone: (d) => navigate({ to: `/maintenance/schedules/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New preventive schedule"
        crumbs={[C, { label: "Schedules", to: "/maintenance/schedules" }]}
      />
      <Note>
        One schedule per piece of equipment. ERPNext creates each task's next occurrence, assigns it, and
        marks it overdue when the date passes.
      </Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Equipment and team">
          <div className="grid-2">
            <LinkField
              label="Equipment"
              doctype="Asset"
              filters={{ docstatus: 1 }}
              required
              value={asset}
              onChange={setAsset}
            />
            <LinkField
              label="Maintenance team"
              doctype="Asset Maintenance Team"
              required
              value={team}
              onChange={setTeam}
            />
          </div>
        </Panel>
        <Panel title="Tasks">
          <RowsEditor
            rows={tasks as unknown as Row[]}
            onChange={(r) => setTasks(r as unknown as TaskRow[])}
            blank={() => ({
              maintenance_task: "",
              maintenance_type: "Preventive Maintenance",
              periodicity: "Monthly",
              start_date: isoDate(),
              assign_to: "",
            })}
            addLabel="Add task"
            cols={[
              { field: "maintenance_task", label: "Task", type: "text", required: true },
              {
                field: "maintenance_type",
                label: "Type",
                type: "select",
                options: ["Preventive Maintenance", "Calibration"],
              },
              {
                field: "periodicity",
                label: "Every",
                type: "select",
                options: [
                  "Daily",
                  "Weekly",
                  "Monthly",
                  "Quarterly",
                  "Half-yearly",
                  "Yearly",
                  "2 Yearly",
                  "3 Yearly",
                ],
              },
              { field: "start_date", label: "Starting", type: "date" },
              { field: "assign_to", label: "Assign to", type: "link", doctype: "User" },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !asset || !team}>
            Save schedule
          </button>
        </div>
      </form>
    </div>
  );
}

export function SchedulePage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const { data: doc, error } = useDoc("Asset Maintenance", name);
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: "Scheduled" } as Doc) : undefined}
      title={name}
      crumbs={[C, { label: "Schedules", to: "/maintenance/schedules" }]}
      error={error}
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Equipment", <RefLink key="a" doctype="Asset" name={doc.asset_name} />],
                ["Team", String(doc.maintenance_team)],
                ["Manager", String(doc.maintenance_manager_name || doc.maintenance_manager || "—")],
              ]}
            />
          </Panel>
          <Panel title="Tasks">
            <ChildTable
              label="Tasks"
              rows={doc.asset_maintenance_tasks}
              columns={[
                { key: "maintenance_task", label: "Task" },
                { key: "maintenance_type", label: "Type" },
                { key: "periodicity", label: "Every" },
                { key: "next_due_date", label: "Next due", render: (r) => formatDate(r.next_due_date) },
                {
                  key: "last_completion_date",
                  label: "Last done",
                  render: (r) => formatDate(r.last_completion_date),
                },
                {
                  key: "assign_to_name",
                  label: "Assigned to",
                  render: (r) => String(r.assign_to_name || r.assign_to || "—"),
                },
                {
                  key: "maintenance_status",
                  label: "Status",
                  render: (r) => <StatusChip status={String(r.maintenance_status)} />,
                },
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Task occurrences",
                doctype: "Asset Maintenance Log",
                filters: { asset_maintenance: name },
                route: (n) => `/maintenance/tasks/${enc(n)}`,
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Task occurrences */

export function TaskList() {
  return (
    <ListPage<Row>
      title="Maintenance Tasks"
      crumbs={[C]}
      doctype="Asset Maintenance Log"
      fields={[
        "name",
        "asset_name",
        "task_name",
        "due_date",
        "maintenance_status",
        "assign_to_name",
        "docstatus",
      ]}
      searchFields={["name", "asset_name", "task_name"]}
      orderBy="due_date asc"
      tabs={[
        { label: "To do", filters: { docstatus: 0 } },
        { label: "Done", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/maintenance/tasks/${enc(String(r.name))}`}
      columns={[
        { key: "name", label: "Task", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "asset_name", label: "Equipment" },
        { key: "task_name", label: "Work" },
        { key: "due_date", label: "Due", render: (r) => formatDate(r.due_date) },
        { key: "assign_to_name", label: "Assigned to", render: (r) => String(r.assign_to_name || "—") },
        {
          key: "maintenance_status",
          label: "Status",
          render: (r) => <StatusChip status={String(r.maintenance_status)} />,
        },
      ]}
    />
  );
}

export function TaskPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Asset Maintenance Log", name);
  const [date, setDate] = useState(isoDate());
  const [actions, setActions] = useState("");
  const complete = useAction(
    async () => {
      const fresh = await getDoc("Asset Maintenance Log", name);
      await save({
        ...fresh,
        maintenance_status: "Completed",
        completion_date: date,
        actions_performed: actions,
      } as Doc);
      return submit("Asset Maintenance Log", name);
    },
    { success: `${name} completed; the next occurrence is scheduled`, onDone: () => refetch() },
  );
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Tasks", to: "/maintenance/tasks" }]}
      error={error ?? complete.error}
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Equipment", String(doc.asset_name ?? "—")],
                ["Work", String(doc.task_name ?? "—")],
                ["Type", String(doc.maintenance_type ?? "—")],
                ["Every", String(doc.periodicity ?? "—")],
                ["Due", formatDate(doc.due_date)],
                ["Assigned to", String(doc.assign_to_name || "—")],
                ["Completed", formatDate(doc.completion_date)],
                ["Done", String(doc.actions_performed || "—").replace(/<[^>]+>/g, "")],
              ]}
            />
          </Panel>
          {doc.docstatus === 0 && can(boot, "Asset Maintenance Log", "submit") && (
            <Panel title="Complete this task">
              <div className="grid-2">
                <DateField label="Completed on" required value={date} onChange={setDate} />
              </div>
              <TextArea label="Work done" required value={actions} onChange={setActions} />
              <div className="form-actions">
                <ActionButton
                  primary
                  label="Complete task"
                  icon={<ClipboardCheck aria-hidden />}
                  pending={complete.isPending}
                  disabled={!actions}
                  onClick={() => complete.mutate()}
                />
              </div>
            </Panel>
          )}
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Spare parts */

export function SparesPage() {
  const items = useList<Row>("Item", {
    fields: ["name", "item_name", "stock_uom"],
    filters: { item_group: "Spare Parts", disabled: 0 },
    limit: 500,
  });
  const codes = (items.data ?? []).map((r) => String(r.name));
  const bins = useList<Row>(
    "Bin",
    {
      fields: ["item_code", "warehouse", "actual_qty", "valuation_rate"],
      filters: [["item_code", "in", codes]],
      limit: 2000,
    },
    codes.length > 0,
  );
  const rows = (items.data ?? []).map((i) => {
    const b = (bins.data ?? []).filter((x) => x.item_code === i.name);
    return {
      ...i,
      qty: b.reduce((s, x) => s + Number(x.actual_qty ?? 0), 0),
      places: b
        .filter((x) => Number(x.actual_qty) > 0)
        .map((x) => `${x.warehouse}: ${x.actual_qty}`)
        .join(", "),
    };
  });
  return (
    <div className="page">
      <PageHeader
        title="Spare Parts"
        crumbs={[C]}
        meta={<span>Item Group “Spare Parts”, stock from the ledger</span>}
      />
      <ErrorNote error={items.error ?? bins.error} />
      <div className="panel">
        <DataTable<Row>
          label="Spare parts"
          rowKey={(r) => String(r.name)}
          rows={rows}
          loading={items.isLoading}
          empty={{
            title: "No spare parts set up",
            reason:
              "Spare parts are stock Items in the “Spare Parts” item group; they are bought and received like any material and issued when a breakdown is closed.",
          }}
          columns={[
            {
              key: "name",
              label: "Spare part",
              render: (r) => <span className="mono">{String(r.name)}</span>,
            },
            { key: "item_name", label: "Name" },
            { key: "qty", label: "In stock", num: true, render: (r) => `${r.qty} ${r.stock_uom}` },
            { key: "places", label: "Where", render: (r) => String(r.places || "—") },
          ]}
        />
      </div>
    </div>
  );
}
