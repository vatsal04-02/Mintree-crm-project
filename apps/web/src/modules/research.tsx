import { useNavigate, useParams } from "@tanstack/react-router";
import { Archive, Check, CopyPlus, Factory, FlaskConical, Send, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Doc, docMethod, getDoc, insert, type Row, save, setValues, submit } from "@/api/frappe";
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
} from "@/components/doc";
import { DateField, LinkField, NumberField, SelectField, TextArea, TextField } from "@/components/fields";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, isoDate } from "@/lib/format";

const C = { label: "R&D" };
const enc = encodeURIComponent;
const DEMO = "DEMO - NOT REAL - NOT FOR COMMERCIAL PRODUCTION";
const ROLE_CHEMIST = "R&D Chemist";
const ROLE_MANAGER = "R&D Manager";

const pct = (v: unknown) => `${Number(v ?? 0).toFixed(2)}%`;
const kg = (v: unknown) => `${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;

function DemoBanner({ doc }: { doc?: Row }) {
  return doc?.is_demo ? <Note tone="hold">{DEMO}. Synthetic data for demonstration only.</Note> : null;
}

/* ---------------------------------------------------------------- Formulations */

export function FormulationList() {
  return (
    <ListPage<Row>
      title="Formulations"
      crumbs={[C]}
      doctype="Formulation"
      fields={[
        "name",
        "formulation_name",
        "formulation_code",
        "version",
        "status",
        "total_percentage",
        "is_demo",
      ]}
      searchFields={["name", "formulation_name", "formulation_code"]}
      tabs={[
        { label: "In development", filters: [["status", "in", ["Draft", "Under Review", "Trial"]]] },
        { label: "Approved", filters: { status: "Approved" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/research/formulations/${enc(String(r.name))}`}
      create="/research/formulations/new"
      createLabel="New formulation"
      columns={[
        {
          key: "name",
          label: "Version record",
          render: (r) => <span className="mono">{String(r.name)}</span>,
        },
        {
          key: "formulation_name",
          label: "Formulation",
          render: (r) => (
            <span>
              {String(r.formulation_name)} {r.is_demo ? <span className="dim">(demo)</span> : null}
            </span>
          ),
        },
        {
          key: "formulation_code",
          label: "Code",
          render: (r) => <span className="mono">{String(r.formulation_code)}</span>,
        },
        { key: "version", label: "Version", num: true },
        { key: "total_percentage", label: "Total", num: true, render: (r) => pct(r.total_percentage) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

type IngRow = { item_code: string; percentage: number | ""; required: string; function?: string };

function toRows(doc?: Doc): IngRow[] {
  const rows = (doc?.ingredients as Row[] | undefined) ?? [];
  return rows.map((r) => ({
    item_code: String(r.item_code),
    percentage: Number(r.percentage),
    required: r.required ? "Required" : "Optional",
    function: String(r.function ?? ""),
  }));
}

/** New formulation, or edit of a Draft version. */
export function FormulationForm() {
  const { name } = useParams({ strict: false }) as { name?: string };
  const navigate = useNavigate();
  const existing = useDoc("Formulation", name ?? "");
  const doc = name ? existing.data : undefined;
  const [f, setF] = useState({
    formulation_name: "",
    formulation_code: "",
    project: "",
    product_item: "",
    batch_size_kg: 100 as number | "",
    change_note: "",
  });
  const [rows, setRows] = useState<IngRow[]>([{ item_code: "", percentage: "", required: "Optional" }]);
  useEffect(() => {
    if (!doc) return;
    setF({
      formulation_name: String(doc.formulation_name ?? "").replace(` (${DEMO})`, ""),
      formulation_code: String(doc.formulation_code ?? ""),
      project: String(doc.project ?? ""),
      product_item: String(doc.product_item ?? ""),
      batch_size_kg: Number(doc.batch_size_kg ?? 100),
      change_note: String(doc.change_note ?? ""),
    });
    setRows(toRows(doc));
  }, [doc]);
  const total = rows.reduce((s, r) => s + Number(r.percentage || 0), 0);
  const payload = () => ({
    ...f,
    batch_size_kg: f.batch_size_kg === "" ? undefined : f.batch_size_kg,
    ingredients: rows
      .filter((r) => r.item_code)
      .map((r) => ({
        item_code: r.item_code,
        percentage: r.percentage,
        required: r.required === "Required" ? 1 : 0,
        function: r.function,
      })),
  });
  const saveIt = useAction(
    () =>
      doc
        ? save({
            ...doc,
            ...payload(),
            formulation_name: doc.is_demo ? doc.formulation_name : f.formulation_name,
          } as Doc)
        : insert({ doctype: "Formulation", ...payload() }),
    {
      success: (d) => `Saved ${(d as Doc).name}`,
      onDone: (d) => navigate({ to: `/research/formulations/${enc((d as Doc).name)}` }),
    },
  );
  const set = (k: keyof typeof f) => (v: string | number | "") => setF({ ...f, [k]: v });
  if (name && doc && doc.status !== "Draft")
    return (
      <div className="page">
        <PageHeader
          title={`Edit ${name}`}
          crumbs={[C, { label: "Formulations", to: "/research/formulations" }]}
        />
        <Note tone="hold">Only a Draft can be edited. Create a new version from the formulation page.</Note>
      </div>
    );
  return (
    <div className="page page-form">
      <PageHeader
        title={name ? `Edit ${name}` : "New formulation"}
        crumbs={[C, { label: "Formulations", to: "/research/formulations" }]}
      />
      <DemoBanner doc={doc} />
      <Note>
        Ingredients are raw-material items. The server checks every row (active, raw material, listed once,
        above 0 %), computes kilograms for the batch size, and refuses review until the total meets the
        formula total.
      </Note>
      <ErrorNote error={saveIt.error ?? existing.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          saveIt.mutate();
        }}
      >
        <Panel title="Formulation">
          <div className="grid-2">
            <TextField label="Name" required value={f.formulation_name} onChange={set("formulation_name")} />
            <TextField
              label="Formulation code"
              required
              value={f.formulation_code}
              onChange={set("formulation_code")}
              hint="Shared by all versions"
            />
            <LinkField
              label="Research project"
              doctype="Research Project"
              value={f.project}
              onChange={set("project")}
            />
            <LinkField
              label="Bulk item it makes"
              doctype="Item"
              filters={{ is_stock_item: 1, disabled: 0 }}
              value={f.product_item}
              onChange={set("product_item")}
            />
            <NumberField
              label="Batch size"
              unit="kg"
              required
              value={f.batch_size_kg}
              onChange={set("batch_size_kg")}
            />
            {Number(doc?.version ?? 1) > 1 && (
              <TextArea
                label="What changed in this version"
                value={f.change_note}
                onChange={set("change_note")}
              />
            )}
          </div>
        </Panel>
        <Panel
          title="Ingredients"
          meta={
            <span className={Math.abs(total - 100) > 0.01 ? "text-hold" : "text-ok"}>
              Total {total.toFixed(4)}% of 100%
            </span>
          }
        >
          <RowsEditor
            rows={rows as unknown as Row[]}
            onChange={(r) => setRows(r as unknown as IngRow[])}
            blank={() => ({ item_code: "", percentage: "", required: "Optional" })}
            addLabel="Add ingredient"
            cols={[
              {
                field: "item_code",
                label: "Ingredient",
                type: "link",
                doctype: "Item",
                filters: { is_stock_item: 1, disabled: 0 },
                required: true,
              },
              { field: "percentage", label: "% w/w", type: "number", required: true },
              {
                field: "required",
                label: "Must stay in later versions",
                type: "select",
                options: ["Optional", "Required"],
              },
              { field: "function", label: "Function", type: "text" },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saveIt.isPending || !f.formulation_name}
          >
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

const ACTIONS: {
  action: string;
  label: string;
  from: string[];
  roles: string[];
  note?: "required" | "optional";
  icon: typeof Send;
  primary?: boolean;
  danger?: boolean;
}[] = [
  {
    action: "send_for_review",
    label: "Send for review",
    from: ["Draft"],
    roles: [ROLE_CHEMIST, ROLE_MANAGER],
    icon: Send,
    primary: true,
  },
  {
    action: "return_to_draft",
    label: "Return to draft",
    from: ["Under Review"],
    roles: [ROLE_CHEMIST, ROLE_MANAGER],
    icon: Undo2,
  },
  {
    action: "start_trial",
    label: "Start trial",
    from: ["Under Review"],
    roles: [ROLE_MANAGER],
    icon: FlaskConical,
    primary: true,
  },
  {
    action: "approve",
    label: "Approve version",
    from: ["Trial"],
    roles: [ROLE_MANAGER],
    note: "optional",
    icon: Check,
    primary: true,
  },
  {
    action: "reject",
    label: "Reject",
    from: ["Under Review", "Trial"],
    roles: [ROLE_MANAGER],
    note: "required",
    icon: X,
    danger: true,
  },
  {
    action: "archive",
    label: "Archive",
    from: ["Approved", "Rejected"],
    roles: [ROLE_MANAGER],
    icon: Archive,
  },
];

export function FormulationPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Formulation", name);
  const prevName = doc?.previous_version ? String(doc.previous_version) : "";
  const prev = useDoc("Formulation", prevName);
  const [note, setNote] = useState("");
  const roles = new Set(boot.roles);
  const isAdmin = roles.has("System Manager");
  const act = useAction(
    ({ action, n }: { action: string; n?: string }) =>
      docMethod(doc as Doc, "apply_action", { action, note: n }),
    { success: (s) => `${name}: ${String(s)}` },
  );
  const newVersion = useAction(() => docMethod<string>(doc as Doc, "new_version"), {
    success: (n) => `New draft ${n}`,
    onDone: (n) => navigate({ to: `/research/formulations/${enc(n)}/edit` }),
  });
  const makeBom = useAction(() => docMethod<string>(doc as Doc, "create_bom", { company: boot.company }), {
    success: (b) => `BOM ${b} created from this approved version`,
  });
  const status = String(doc?.status ?? "");
  const offered = ACTIONS.filter(
    (a) => a.from.includes(status) && (isAdmin || a.roles.some((r) => roles.has(r))),
  );
  const needsNote = offered.some((a) => a.note);
  const total = Number(doc?.total_percentage ?? 0);
  const target = Number(doc?.target_total ?? 100);
  const tol = Number(doc?.tolerance ?? 0.01);
  const totalOk = Math.abs(total - target) <= tol;
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Formulations", to: "/research/formulations" }]}
      error={error ?? act.error ?? newVersion.error ?? makeBom.error}
      actions={
        <>
          {status === "Draft" && can(boot, "Formulation", "write") && (
            <button
              type="button"
              className="btn"
              onClick={() => navigate({ to: `/research/formulations/${enc(name)}/edit` })}
            >
              Edit draft
            </button>
          )}
          {offered.map((a) => (
            <ActionButton
              key={a.action}
              label={a.label}
              primary={a.primary}
              danger={a.danger}
              icon={<a.icon aria-hidden />}
              pending={act.isPending}
              disabled={a.note === "required" && !note.trim()}
              onClick={() => act.mutate({ action: a.action, n: note || undefined })}
            />
          ))}
          {status !== "Draft" && (isAdmin || roles.has(ROLE_CHEMIST) || roles.has(ROLE_MANAGER)) && (
            <ActionButton
              label="New version"
              icon={<CopyPlus aria-hidden />}
              pending={newVersion.isPending}
              onClick={() => newVersion.mutate()}
            />
          )}
          {status === "Approved" && !doc?.bom && can(boot, "BOM", "create") && can(boot, "BOM", "submit") && (
            <ActionButton
              label="Create BOM"
              icon={<Factory aria-hidden />}
              pending={makeBom.isPending}
              onClick={() => makeBom.mutate()}
            />
          )}
        </>
      }
    >
      {doc && (
        <>
          <DemoBanner doc={doc} />
          {needsNote && (
            <Panel title="Decision note">
              <TextArea label="Note (required to reject)" value={note} onChange={setNote} />
            </Panel>
          )}
          <Panel>
            <Facts
              items={[
                ["Formulation", String(doc.formulation_name)],
                ["Code / version", `${String(doc.formulation_code)} · v${String(doc.version)}`],
                [
                  "Previous version",
                  prevName ? <RefLink key="p" doctype="Formulation" name={prevName} /> : "—",
                ],
                [
                  "Research project",
                  doc.project ? <RefLink key="rp" doctype="Research Project" name={doc.project} /> : "—",
                ],
                ["Makes", String(doc.product_item ?? "—")],
                ["Batch size", kg(doc.batch_size_kg)],
                [
                  "Formula total",
                  <span key="t" className={totalOk ? "text-ok" : "text-hold"}>
                    {pct(total)} of {pct(target)} {totalOk ? "" : "(not complete)"}
                  </span>,
                ],
                ["BOM", doc.bom ? <RefLink key="b" doctype="BOM" name={doc.bom} /> : "—"],
                ["Sent for review by", String(doc.submitted_by ?? "—")],
                ["Decided by", String(doc.reviewed_by ?? "—")],
                ["Decided on", formatDateTime(doc.decided_on)],
                ["Decision note", String(doc.decision_note ?? "—")],
                ["Change in this version", String(doc.change_note || "—")],
              ]}
            />
          </Panel>
          <Panel title="Ingredients">
            <ChildTable
              label="Ingredients"
              rows={doc.ingredients}
              columns={[
                {
                  key: "item_code",
                  label: "Ingredient",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "item_name", label: "Name" },
                {
                  key: "ingredient_category",
                  label: "Category",
                  render: (r) => String(r.ingredient_category ?? "—"),
                },
                { key: "function", label: "Function", render: (r) => String(r.function || "—") },
                { key: "percentage", label: "% w/w", num: true, render: (r) => pct(r.percentage) },
                { key: "quantity_kg", label: "Per batch", num: true, render: (r) => kg(r.quantity_kg) },
                { key: "required", label: "Required", render: (r) => (r.required ? "Yes" : "No") },
              ]}
            />
          </Panel>
          {prev.data && <VersionCompare current={doc} previous={prev.data} />}
          <Connections
            items={[
              {
                label: "Trials",
                doctype: "Formulation Trial",
                filters: { formulation: name },
                route: (n) => `/research/trials/${enc(n)}`,
              },
              {
                label: "Stability studies",
                doctype: "Stability Study",
                filters: { formulation: name },
                route: (n) => `/research/stability/${enc(n)}`,
              },
              {
                label: "Other versions",
                doctype: "Formulation",
                filters: { formulation_code: String(doc.formulation_code), name: ["!=", name] },
                route: (n) => `/research/formulations/${enc(n)}`,
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

function VersionCompare({ current, previous }: { current: Doc; previous: Doc }) {
  const cur = new Map(((current.ingredients as Row[]) ?? []).map((r) => [String(r.item_code), r]));
  const old = new Map(((previous.ingredients as Row[]) ?? []).map((r) => [String(r.item_code), r]));
  const codes = [...new Set([...old.keys(), ...cur.keys()])];
  const rows = codes.map((code) => {
    const a = Number(old.get(code)?.percentage ?? 0);
    const b = Number(cur.get(code)?.percentage ?? 0);
    return {
      code,
      name: String((cur.get(code) ?? old.get(code))?.item_name ?? ""),
      before: old.has(code) ? a : null,
      after: cur.has(code) ? b : null,
      change: b - a,
    };
  });
  return (
    <Panel title={`Compared with version ${String(previous.version)} (${previous.name})`}>
      <DataTable<Row>
        label="Version comparison"
        rowKey={(r) => String(r.code)}
        rows={rows as unknown as Row[]}
        columns={[
          { key: "code", label: "Ingredient", render: (r) => <span className="mono">{String(r.code)}</span> },
          { key: "name", label: "Name" },
          {
            key: "before",
            label: `v${String(previous.version)}`,
            num: true,
            render: (r) => (r.before === null ? "absent" : pct(r.before)),
          },
          {
            key: "after",
            label: `v${String(current.version)}`,
            num: true,
            render: (r) => (r.after === null ? "removed" : pct(r.after)),
          },
          {
            key: "change",
            label: "Change",
            num: true,
            render: (r) => {
              const c = Number(r.change);
              return Math.abs(c) < 1e-9 ? (
                <span className="dim">—</span>
              ) : (
                <span
                  className={c > 0 ? "text-ok" : "text-hold"}
                >{`${c > 0 ? "+" : ""}${c.toFixed(4)} pts`}</span>
              );
            },
          },
        ]}
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------- Research projects */

export function ProjectList() {
  return (
    <ListPage<Row>
      title="Research Projects"
      crumbs={[C]}
      doctype="Research Project"
      fields={["name", "title", "status", "project_lead", "target_date", "is_demo"]}
      searchFields={["name", "title"]}
      tabs={[
        { label: "Active", filters: [["status", "in", ["Proposed", "Approved", "In Progress"]]] },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/research/projects/${enc(String(r.name))}`}
      create="/research/projects/new"
      createLabel="New project"
      columns={[
        { key: "name", label: "Project", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "title", label: "Title" },
        { key: "project_lead", label: "Lead", render: (r) => String(r.project_lead ?? "—") },
        { key: "target_date", label: "Target", render: (r) => formatDate(r.target_date) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function ProjectNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "",
    objective: "",
    scope: "",
    target_product: "",
    start_date: isoDate(),
    target_date: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () => insert({ doctype: "Research Project", ...f, target_date: f.target_date || undefined }),
    {
      success: (d) => `Saved ${d.name}; an R&D Manager approves it`,
      onDone: (d) => navigate({ to: `/research/projects/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New research project"
        crumbs={[C, { label: "Research Projects", to: "/research/projects" }]}
      />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Project">
          <div className="grid-2">
            <TextField label="Title" required value={f.title} onChange={set("title")} />
            <TextField
              label="Target product / category"
              value={f.target_product}
              onChange={set("target_product")}
            />
            <DateField label="Start date" value={f.start_date} onChange={set("start_date")} />
            <DateField label="Target date" value={f.target_date} onChange={set("target_date")} />
          </div>
          <TextArea label="Objective" required value={f.objective} onChange={set("objective")} />
          <TextArea label="Scope and constraints" value={f.scope} onChange={set("scope")} />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.title || !f.objective}
          >
            Save proposal
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProjectPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("Research Project", name);
  const setStatus = useAction((status: string) => setValues("Research Project", name, { status }), {
    success: (d) => `${name}: ${String((d as Doc).status)}`,
  });
  const manager = boot.roles.includes(ROLE_MANAGER) || boot.roles.includes("System Manager");
  const status = String(doc?.status ?? "");
  const next: Record<string, string[]> = {
    Proposed: ["Approved", "Cancelled"],
    Approved: ["In Progress", "Cancelled"],
    "In Progress": ["Completed", "Cancelled"],
  };
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Research Projects", to: "/research/projects" }]}
      error={error ?? setStatus.error}
      actions={
        can(boot, "Research Project", "write") &&
        (next[status] ?? [])
          .filter((s) => s !== "Approved" || manager)
          .map((s) => (
            <ActionButton
              key={s}
              label={s === "Approved" ? "Approve project" : `Mark ${s.toLowerCase()}`}
              primary={s === "Approved"}
              pending={setStatus.isPending}
              onClick={() => setStatus.mutate(s)}
            />
          ))
      }
    >
      {doc && (
        <>
          <DemoBanner doc={doc} />
          <Panel>
            <Facts
              items={[
                ["Title", String(doc.title)],
                ["Lead", String(doc.project_lead ?? "—")],
                ["Target product", String(doc.target_product ?? "—")],
                ["Start", formatDate(doc.start_date)],
                ["Target", formatDate(doc.target_date)],
                ["Approved by", String(doc.approved_by ?? "—")],
                ["Approved on", formatDateTime(doc.approved_on)],
                ["Objective", String(doc.objective ?? "—")],
                ["Scope", String(doc.scope || "—")],
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Formulations",
                doctype: "Formulation",
                filters: { project: name },
                route: (n) => `/research/formulations/${enc(n)}`,
              },
              {
                label: "Trials",
                doctype: "Formulation Trial",
                filters: { project: name },
                route: (n) => `/research/trials/${enc(n)}`,
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Trials */

export function TrialList() {
  return (
    <ListPage<Row>
      title="Trials and Experiments"
      crumbs={[C]}
      doctype="Formulation Trial"
      fields={["name", "title", "record_type", "formulation", "trial_date", "outcome", "docstatus"]}
      searchFields={["name", "title", "formulation"]}
      tabs={[
        { label: "Open", filters: { docstatus: 0 } },
        { label: "Recorded", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/research/trials/${enc(String(r.name))}`}
      create="/research/trials/new"
      createLabel="New trial"
      columns={[
        { key: "name", label: "Trial", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "title", label: "Title" },
        { key: "record_type", label: "Type" },
        {
          key: "formulation",
          label: "Formulation",
          render: (r) => <span className="mono">{String(r.formulation)}</span>,
        },
        { key: "trial_date", label: "Date", render: (r) => formatDate(r.trial_date) },
        { key: "outcome", label: "Outcome", render: (r) => <StatusChip status={String(r.outcome)} /> },
      ]}
    />
  );
}

export function TrialNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "",
    record_type: "Trial Batch",
    formulation: "",
    trial_date: isoDate(),
    trial_batch_ref: "",
    objective: "",
    procedure: "",
    observations: "",
    outcome: "Pending",
    conclusion: "",
  });
  const [size, setSize] = useState<number | "">("");
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () => insert({ doctype: "Formulation Trial", ...f, batch_size_kg: size === "" ? undefined : size }),
    {
      success: (d) => `Saved ${d.name}`,
      onDone: (d) => navigate({ to: `/research/trials/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="New trial or experiment" crumbs={[C, { label: "Trials", to: "/research/trials" }]} />
      <Note>Trials are recorded against a formulation version that is under review or in trial.</Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Trial">
          <div className="grid-2">
            <TextField label="Title" required value={f.title} onChange={set("title")} />
            <SelectField
              label="Record type"
              value={f.record_type}
              onChange={set("record_type")}
              options={["Trial Batch", "Experiment"]}
            />
            <LinkField
              label="Formulation version"
              doctype="Formulation"
              filters={{ status: ["in", ["Under Review", "Trial"]] }}
              required
              value={f.formulation}
              onChange={set("formulation")}
            />
            <DateField label="Date" value={f.trial_date} onChange={set("trial_date")} />
            <NumberField label="Batch size" unit="kg" value={size} onChange={setSize} />
            <TextField
              label="Trial batch reference"
              value={f.trial_batch_ref}
              onChange={set("trial_batch_ref")}
            />
            <SelectField
              label="Outcome"
              value={f.outcome}
              onChange={set("outcome")}
              options={["Pending", "Pass", "Fail", "Inconclusive"]}
            />
          </div>
          <TextArea label="Objective" value={f.objective} onChange={set("objective")} />
          <TextArea label="Procedure" value={f.procedure} onChange={set("procedure")} />
          <TextArea label="Observations" value={f.observations} onChange={set("observations")} />
          <TextArea label="Conclusion" value={f.conclusion} onChange={set("conclusion")} />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.title || !f.formulation}
          >
            Save trial
          </button>
        </div>
      </form>
    </div>
  );
}

export function TrialPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("Formulation Trial", name);
  const record = useAction(() => submit("Formulation Trial", name), { success: `${name} recorded` });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Trials", to: "/research/trials" }]}
      error={error ?? record.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "Formulation Trial", "submit") && (
          <ActionButton
            primary
            label="Record trial (submit)"
            icon={<Send aria-hidden />}
            pending={record.isPending}
            onClick={() => record.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          <DemoBanner doc={doc} />
          <Panel>
            <Facts
              items={[
                ["Title", String(doc.title)],
                ["Type", String(doc.record_type)],
                ["Formulation", <RefLink key="f" doctype="Formulation" name={doc.formulation} />],
                [
                  "Project",
                  doc.project ? <RefLink key="p" doctype="Research Project" name={doc.project} /> : "—",
                ],
                ["Date", formatDate(doc.trial_date)],
                ["Batch size", doc.batch_size_kg ? kg(doc.batch_size_kg) : "—"],
                ["Trial batch", String(doc.trial_batch_ref || "—")],
                ["Outcome", <StatusChip key="o" status={String(doc.outcome)} />],
                ["Objective", String(doc.objective || "—")],
                ["Procedure", String(doc.procedure || "—")],
                ["Observations", String(doc.observations || "—")],
                ["Conclusion", String(doc.conclusion || "—")],
              ]}
            />
          </Panel>
          {doc.docstatus === 0 && (
            <Note>
              Edit outcome and observations in Desk or recreate the trial; recording it locks the record.
            </Note>
          )}
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Stability */

export function StabilityList() {
  return (
    <ListPage<Row>
      title="Stability Studies"
      crumbs={[C]}
      doctype="Stability Study"
      fields={[
        "name",
        "title",
        "formulation",
        "storage_condition",
        "start_date",
        "duration_days",
        "status",
        "result",
      ]}
      searchFields={["name", "title", "formulation"]}
      tabs={[
        { label: "Running", filters: [["status", "in", ["Planned", "In Progress"]]] },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/research/stability/${enc(String(r.name))}`}
      create="/research/stability/new"
      createLabel="New study"
      columns={[
        { key: "name", label: "Study", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "title", label: "Title" },
        {
          key: "formulation",
          label: "Formulation",
          render: (r) => <span className="mono">{String(r.formulation)}</span>,
        },
        { key: "storage_condition", label: "Condition" },
        { key: "start_date", label: "Start", render: (r) => formatDate(r.start_date) },
        { key: "duration_days", label: "Days", num: true },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
        { key: "result", label: "Result", render: (r) => <StatusChip status={String(r.result)} /> },
      ]}
    />
  );
}

export function StabilityNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: "",
    formulation: "",
    storage_condition: "25°C / 60% RH",
    start_date: isoDate(),
    acceptance_criteria: "",
  });
  const [days, setDays] = useState<number | "">(90);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () => insert({ doctype: "Stability Study", ...f, duration_days: days === "" ? undefined : days }),
    {
      success: (d) => `Saved ${d.name}`,
      onDone: (d) => navigate({ to: `/research/stability/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New stability study"
        crumbs={[C, { label: "Stability", to: "/research/stability" }]}
      />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Study">
          <div className="grid-2">
            <TextField label="Title" required value={f.title} onChange={set("title")} />
            <LinkField
              label="Formulation version"
              doctype="Formulation"
              required
              value={f.formulation}
              onChange={set("formulation")}
            />
            <SelectField
              label="Storage condition"
              value={f.storage_condition}
              onChange={set("storage_condition")}
              options={["25°C / 60% RH", "30°C / 65% RH", "40°C / 75% RH", "5°C", "Photostability", "Other"]}
            />
            <DateField label="Start date" value={f.start_date} onChange={set("start_date")} />
            <NumberField label="Planned duration" unit="days" required value={days} onChange={setDays} />
          </div>
          <TextArea
            label="Acceptance criteria (stated by R&D)"
            value={f.acceptance_criteria}
            onChange={set("acceptance_criteria")}
          />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.title || !f.formulation}
          >
            Save study
          </button>
        </div>
      </form>
    </div>
  );
}

export function StabilityPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Stability Study", name);
  const [r, setR] = useState({
    interval: "",
    reading_date: isoDate(),
    appearance: "",
    within_spec: "",
    observation: "",
  });
  const [ph, setPh] = useState<number | "">("");
  const [visc, setVisc] = useState<number | "">("");
  const [result, setResult] = useState("Pass");
  const addReading = useAction(
    async () => {
      const fresh = await getDoc("Stability Study", name);
      const readings = [
        ...((fresh.readings as Row[]) ?? []),
        { ...r, ph: ph === "" ? undefined : ph, viscosity_cp: visc === "" ? undefined : visc },
      ];
      return save({
        ...fresh,
        readings,
        status: fresh.status === "Planned" ? "In Progress" : fresh.status,
      } as Doc);
    },
    {
      success: "Reading added",
      onDone: () => {
        setR({ ...r, interval: "", appearance: "", observation: "" });
        setPh("");
        setVisc("");
        refetch();
      },
    },
  );
  const complete = useAction(() => setValues("Stability Study", name, { status: "Completed", result }), {
    success: `${name} completed`,
  });
  const writable =
    can(boot, "Stability Study", "write") && doc && !["Completed", "Cancelled"].includes(String(doc.status));
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Stability", to: "/research/stability" }]}
      error={error ?? addReading.error ?? complete.error}
    >
      {doc && (
        <>
          <DemoBanner doc={doc} />
          <Panel>
            <Facts
              items={[
                ["Formulation", <RefLink key="f" doctype="Formulation" name={doc.formulation} />],
                ["Condition", String(doc.storage_condition)],
                ["Start", formatDate(doc.start_date)],
                ["Duration", `${String(doc.duration_days)} days`],
                ["Result", <StatusChip key="r" status={String(doc.result)} />],
                ["Acceptance criteria", String(doc.acceptance_criteria || "—")],
              ]}
            />
          </Panel>
          <Panel title="Readings">
            <ChildTable
              label="Readings"
              rows={doc.readings}
              columns={[
                { key: "interval", label: "Interval" },
                { key: "reading_date", label: "Date", render: (x) => formatDate(x.reading_date) },
                { key: "appearance", label: "Appearance", render: (x) => String(x.appearance || "—") },
                { key: "ph", label: "pH", num: true, render: (x) => (x.ph ? Number(x.ph).toFixed(2) : "—") },
                {
                  key: "viscosity_cp",
                  label: "Viscosity (cP)",
                  num: true,
                  render: (x) => (x.viscosity_cp ? Number(x.viscosity_cp).toLocaleString("en-IN") : "—"),
                },
                {
                  key: "within_spec",
                  label: "Within spec",
                  render: (x) =>
                    x.within_spec ? <StatusChip status={x.within_spec === "Yes" ? "Pass" : "Fail"} /> : "—",
                },
                { key: "observation", label: "Observation", render: (x) => String(x.observation || "—") },
              ]}
            />
          </Panel>
          {writable && (
            <Panel title="Add reading">
              <div className="grid-3">
                <TextField
                  label="Interval"
                  required
                  value={r.interval}
                  onChange={(v) => setR({ ...r, interval: v })}
                  hint="e.g. Week 2"
                />
                <DateField
                  label="Date"
                  value={r.reading_date}
                  onChange={(v) => setR({ ...r, reading_date: v })}
                />
                <TextField
                  label="Appearance"
                  value={r.appearance}
                  onChange={(v) => setR({ ...r, appearance: v })}
                />
                <NumberField label="pH" value={ph} onChange={setPh} step="0.01" />
                <NumberField label="Viscosity" unit="cP" value={visc} onChange={setVisc} />
                <SelectField
                  label="Within spec"
                  value={r.within_spec}
                  onChange={(v) => setR({ ...r, within_spec: v })}
                  options={["", "Yes", "No"]}
                />
              </div>
              <TextArea
                label="Observation"
                value={r.observation}
                onChange={(v) => setR({ ...r, observation: v })}
              />
              <div className="form-actions">
                <ActionButton
                  primary
                  label="Add reading"
                  pending={addReading.isPending}
                  disabled={!r.interval}
                  onClick={() => addReading.mutate()}
                />
                <SelectField label="Result" value={result} onChange={setResult} options={["Pass", "Fail"]} />
                <ActionButton
                  label="Complete study"
                  pending={complete.isPending}
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
