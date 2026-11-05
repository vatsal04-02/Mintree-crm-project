import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { BadgeCheck, ClipboardCheck, RotateCcw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { call, type Doc, insert, type Row, save, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import { DataTable } from "@/components/DataTable";
import {
  ActionButton,
  Connections,
  DocFrame,
  ListPage,
  RefLink,
  useAction,
  useDoc,
  useReport,
} from "@/components/doc";
import { LinkField, NumberField, SelectField, TextArea } from "@/components/fields";
import { ErrorNote, Facts, Note, PageHeader, Panel, Spinner, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, formatHours, formatQty } from "@/lib/format";
import { routeFor } from "@/nav";

const C = { label: "Quality" };
const QCR_API = "factory_ops.quality.doctype.qc_release.qc_release";
const enc = encodeURIComponent;
const DECISIONS = ["Release", "Partial Release", "Conditional Release", "Reject"];

/* ======================= QC Queue (report) ======================= */

export function QCQueue() {
  const boot = useSession();
  const navigate = useNavigate();
  const { data, error, isLoading, dataUpdatedAt } = useReport("QC Queue", { company: boot.company });
  const rows = data?.result ?? [];
  const overdue = rows.filter((r) => r.overdue).length;
  return (
    <div className="page">
      <PageHeader
        title="QC Queue"
        crumbs={[C]}
        meta={
          data && (
            <span>
              {rows.length} batches on hold · {overdue} past SLA · from report “QC Queue” at{" "}
              {new Date(dataUpdatedAt).toLocaleTimeString("en-IN")}
            </span>
          )
        }
      />
      <ErrorNote error={error} />
      <div className="panel">
        <DataTable<Row>
          label="Batches awaiting QC"
          loading={isLoading}
          rows={rows}
          rowKey={(r) => `${r.batch_no}|${r.warehouse}`}
          empty="No batches are waiting for QC."
          onRowClick={
            can(boot, "QC Release", "create")
              ? (r) =>
                  r.open_release
                    ? navigate({ to: `/quality/releases/${enc(String(r.open_release))}` })
                    : navigate({
                        to: "/quality/releases/new",
                        search: {
                          item: String(r.item_code),
                          batch: String(r.batch_no),
                          warehouse: String(r.warehouse),
                          qty: String(r.qty),
                        },
                      })
              : undefined
          }
          columns={[
            {
              key: "batch_no",
              label: "Batch",
              render: (r) => <span className="mono">{String(r.batch_no)}</span>,
            },
            {
              key: "item_code",
              label: "Item",
              render: (r) => (
                <span>
                  {String(r.item_code)} <span className="dim">{String(r.item_name ?? "")}</span>
                </span>
              ),
            },
            { key: "warehouse", label: "Held in" },
            { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
            {
              key: "origin",
              label: "From",
              render: (r) => <span className="mono">{String(r.origin ?? "—")}</span>,
            },
            { key: "age_hours", label: "Waiting", num: true, render: (r) => formatHours(r.age_hours) },
            {
              key: "overdue",
              label: "SLA",
              render: (r) =>
                r.overdue ? (
                  <StatusChip status="Overdue" />
                ) : (
                  <span className="dim">{String(r.sla_hours)} h</span>
                ),
            },
            { key: "expiry_date", label: "Expiry", render: (r) => formatDate(r.expiry_date) },
            {
              key: "open_release",
              label: "Release",
              render: (r) =>
                r.open_release ? (
                  <span className="mono">{String(r.open_release)}</span>
                ) : (
                  <span className="dim">Not started</span>
                ),
            },
          ]}
        />
      </div>
      {!can(boot, "QC Release", "create") && (
        <Note>Only QC officers and QA managers can release or reject batches.</Note>
      )}
    </div>
  );
}

/* ======================= QC Releases ======================= */

export function ReleaseList() {
  return (
    <ListPage<Row>
      title="QC Releases"
      crumbs={[C]}
      doctype="QC Release"
      fields={[
        "name",
        "item_code",
        "batch_no",
        "decision",
        "qty",
        "uom",
        "source_warehouse",
        "target_warehouse",
        "docstatus",
        "modified",
      ]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        { label: "Decided", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/quality/releases/${enc(String(r.name))}`}
      create="/quality/releases/new"
      createLabel="New release"
      orderBy="modified desc"
      columns={[
        { key: "name", label: "Release", render: (r) => <span className="mono">{String(r.name)}</span> },
        {
          key: "batch_no",
          label: "Batch",
          render: (r) => <span className="mono">{String(r.batch_no)}</span>,
        },
        { key: "item_code", label: "Item" },
        {
          key: "decision",
          label: "Decision",
          render: (r) => (
            <StatusChip
              status={String(r.decision)}
              tone={r.decision === "Reject" ? "rejected" : "released"}
            />
          ),
        },
        { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
        { key: "target_warehouse", label: "To" },
        {
          key: "docstatus",
          label: "State",
          render: (r) => (
            <StatusChip
              status={r.docstatus === 1 ? "Submitted" : r.docstatus === 2 ? "Cancelled" : "Draft"}
            />
          ),
        },
      ]}
    />
  );
}

export function ReleaseNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const s = useSearch({ strict: false }) as {
    item?: string;
    batch?: string;
    warehouse?: string;
    qty?: string;
  };
  const [item, setItem] = useState(s.item ?? "");
  const [batch, setBatch] = useState(s.batch ?? "");
  const [warehouse, setWarehouse] = useState(s.warehouse ?? "");
  const [decision, setDecision] = useState("Release");
  const [qty, setQty] = useState<number | "">(s.qty ? Number(s.qty) : "");
  const [reason, setReason] = useState("");
  const [deviation, setDeviation] = useState("");
  const create = useAction(
    () =>
      insert({
        doctype: "QC Release",
        company: boot.company,
        item_code: item,
        batch_no: batch,
        source_warehouse: warehouse,
        decision,
        qty: qty === "" ? undefined : qty,
        reason: reason || undefined,
        qc_deviation: deviation || undefined,
      }),
    {
      success: (d) => `Saved ${d.name}; record the inspection next`,
      onDone: (d) => navigate({ to: `/quality/releases/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="QC release or rejection" crumbs={[C, { label: "QC Queue", to: "/quality/queue" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Batch on hold">
          <div className="grid-3">
            <LinkField label="Item" doctype="Item" required value={item} onChange={setItem} />
            <LinkField
              label="Batch"
              doctype="Batch"
              filters={item ? { item } : undefined}
              required
              value={batch}
              onChange={setBatch}
            />
            <LinkField
              label="Held in warehouse"
              doctype="Warehouse"
              filters={{ warehouse_type: "QC Hold" }}
              required
              value={warehouse}
              onChange={setWarehouse}
            />
          </div>
        </Panel>
        <Panel title="Decision">
          <div className="grid-3">
            <SelectField
              label="Decision"
              required
              options={DECISIONS}
              value={decision}
              onChange={setDecision}
            />
            <NumberField
              label="Quantity"
              required={decision !== "Release"}
              value={qty}
              onChange={setQty}
              hint="Whole quantity on hold if left as received."
            />
            {decision === "Conditional Release" && (
              <LinkField
                label="Approved deviation"
                doctype="QC Deviation"
                filters={{ docstatus: 1, batch_no: batch }}
                required
                value={deviation}
                onChange={setDeviation}
              />
            )}
          </div>
          {(decision === "Reject" || decision === "Conditional Release") && (
            <TextArea label="Reason" required={decision === "Reject"} value={reason} onChange={setReason} />
          )}
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Save and record inspection
          </button>
        </div>
      </form>
    </div>
  );
}

function InspectionPanel({ name, canSubmit }: { name: string; canSubmit: boolean }) {
  const { data: qi, error } = useDoc("Quality Inspection", name);
  const [draft, setDraft] = useState<Doc | null>(null);
  useEffect(() => {
    if (qi) setDraft(structuredClone(qi));
  }, [qi]);
  const saveQI = useAction(
    async (thenSubmit: boolean) => {
      if (!draft) return;
      const saved = await save(draft);
      if (thenSubmit) await submit("Quality Inspection", saved.name);
    },
    { success: "Inspection saved" },
  );
  if (error) return <ErrorNote error={error} />;
  if (!qi || !draft) return <Spinner />;
  const readings = (draft.readings as Row[]) ?? [];
  const editable = qi.docstatus === 0 && canSubmit;
  return (
    <Panel
      title={
        <>
          Inspection <span className="mono">{qi.name}</span>
        </>
      }
      meta={<StatusChip status={qi.docstatus === 1 ? String(qi.status) : "Draft"} />}
    >
      <ErrorNote error={saveQI.error} />
      <Facts
        items={[
          ["Type", String(qi.inspection_type)],
          ["Template", String(qi.quality_inspection_template ?? "—")],
          ["Inspected by", String(qi.inspected_by ?? "—")],
        ]}
      />
      {readings.length > 0 && (
        <div className="readings">
          <table className="dt" aria-label="Readings">
            <thead>
              <tr>
                <th>Parameter</th>
                <th className="num">Min</th>
                <th className="num">Max</th>
                <th>Reading</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r, i) => {
                const field = r.numeric ? "reading_1" : "reading_value";
                return (
                  <tr key={String(r.name ?? i)}>
                    <td>{String(r.specification)}</td>
                    <td className="num">{r.numeric ? String(r.min_value ?? "") : "—"}</td>
                    <td className="num">{r.numeric ? String(r.max_value ?? "") : "—"}</td>
                    <td>
                      {editable ? (
                        <div className="input-wrap input-cell">
                          <input
                            aria-label={`Reading for ${String(r.specification)}`}
                            value={String(r[field] ?? "")}
                            onChange={(e) => {
                              const next = readings.map((x, j) =>
                                j === i ? { ...x, [field]: e.target.value } : x,
                              );
                              setDraft({ ...draft, readings: next });
                            }}
                          />
                        </div>
                      ) : (
                        String(r[field] ?? "—")
                      )}
                    </td>
                    <td>{r.status ? <StatusChip status={String(r.status)} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <>
          <div className="grid-3">
            <SelectField
              label="Outcome"
              required
              options={["", "Accepted", "Rejected"]}
              value={draft.manual_inspection ? String(draft.status ?? "") : ""}
              onChange={(v) => setDraft({ ...draft, manual_inspection: v ? 1 : 0, status: v })}
              hint="Set by the inspector. Leave empty to let the ERP judge from the readings."
            />
          </div>
          <TextArea
            label="Remarks"
            value={String(draft.remarks ?? "")}
            onChange={(v) => setDraft({ ...draft, remarks: v })}
          />
          <div className="form-actions">
            <ActionButton
              label="Save inspection"
              pending={saveQI.isPending}
              onClick={() => saveQI.mutate(false)}
            />
            <ActionButton
              primary
              label="Submit inspection"
              icon={<ClipboardCheck aria-hidden />}
              pending={saveQI.isPending}
              onClick={() => saveQI.mutate(true)}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

export function ReleasePage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("QC Release", name);
  const [retestReason, setRetestReason] = useState("");
  const [retestQty, setRetestQty] = useState<number | "">("");
  const mkQI = useAction(() => call<string>(`${QCR_API}.create_quality_inspection`, { qc_release: name }), {
    success: (qi) => `Inspection ${qi} created`,
  });
  const doSubmit = useAction(() => submit("QC Release", name), {
    success: (d) => `${d.name}: ${String(d.decision)} recorded; stock moved by the ERP`,
  });
  const retest = useAction(
    () =>
      call<string>("factory_ops.quality.doctype.qc_retest.qc_retest.send_for_retest", {
        qc_release: name,
        reason: retestReason,
        qty: retestQty || undefined,
      }),
    { success: (r) => `Re-test ${r} submitted; material is back on QC Hold` },
  );
  const mayDecide = can(boot, "QC Release", "submit");
  const isQA = boot.roles.includes("QA Manager");
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "QC Releases", to: "/quality/releases" }]}
      error={error ?? mkQI.error ?? doSubmit.error}
      actions={
        doc &&
        doc.docstatus === 0 &&
        mayDecide && (
          <>
            {!doc.quality_inspection && (
              <ActionButton
                label="Create inspection"
                icon={<ClipboardCheck aria-hidden />}
                pending={mkQI.isPending}
                onClick={() => mkQI.mutate()}
              />
            )}
            <ActionButton
              primary
              label={doc.decision === "Reject" ? "Submit rejection" : "Submit release"}
              icon={<BadgeCheck aria-hidden />}
              pending={doSubmit.isPending}
              onClick={() => doSubmit.mutate()}
            />
          </>
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Item", `${String(doc.item_code)} · ${String(doc.item_name ?? "")}`],
                ["Batch", <RefLink key="b" doctype="Batch" name={doc.batch_no} />],
                [
                  "Decision",
                  <StatusChip
                    key="d"
                    status={String(doc.decision)}
                    tone={doc.decision === "Reject" ? "rejected" : "released"}
                  />,
                ],
                ["Quantity", formatQty(doc.qty, doc.uom)],
                ["From", String(doc.source_warehouse)],
                ["To", String(doc.target_warehouse ?? "Set by the ERP on submit")],
                ["Stock entry", <RefLink key="se" doctype="Stock Entry" name={doc.stock_entry} />],
                [
                  "Received through",
                  doc.origin_doctype ? (
                    <RefLink key="o" doctype={String(doc.origin_doctype)} name={doc.origin_document} />
                  ) : (
                    "—"
                  ),
                ],
                ["Approved by", String(doc.approved_by ?? "—")],
                ["Released on", formatDateTime(doc.released_on)],
                ["Reason", String(doc.reason ?? "—")],
              ]}
            />
          </Panel>
          {doc.quality_inspection ? (
            <InspectionPanel name={String(doc.quality_inspection)} canSubmit={mayDecide} />
          ) : (
            doc.docstatus === 0 && (
              <Note tone="hold">
                No inspection yet. The ERP will not accept the decision without a submitted inspection.
              </Note>
            )
          )}
          {doc.docstatus === 1 && doc.decision === "Reject" && isQA && (
            <Panel title="Send for re-test (QA)">
              <ErrorNote error={retest.error} />
              <div className="grid-3">
                <NumberField
                  label="Quantity"
                  value={retestQty}
                  onChange={setRetestQty}
                  hint="All rejected stock of this batch if empty."
                />
              </div>
              <TextArea label="Reason" required value={retestReason} onChange={setRetestReason} />
              <div className="form-actions">
                <ActionButton
                  label="Send for re-test"
                  icon={<RotateCcw aria-hidden />}
                  pending={retest.isPending}
                  disabled={!retestReason}
                  onClick={() => retest.mutate()}
                />
              </div>
            </Panel>
          )}
          <Connections
            items={[
              {
                label: "Other releases of this batch",
                doctype: "QC Release",
                filters: [
                  ["batch_no", "=", String(doc.batch_no)],
                  ["name", "!=", name],
                ],
                route: (n) => routeFor("QC Release", n),
              },
              {
                label: "Deviations for this batch",
                doctype: "QC Deviation",
                filters: { batch_no: String(doc.batch_no) },
                route: (n) => routeFor("QC Deviation", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Deviations ======================= */

export function DeviationList() {
  return (
    <ListPage<Row>
      title="Deviations"
      crumbs={[C]}
      doctype="QC Deviation"
      fields={["name", "item_code", "batch_no", "description", "approved_by", "docstatus"]}
      tabs={[
        { label: "Awaiting QA approval", filters: { docstatus: 0 } },
        { label: "Approved", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/quality/deviations/${enc(String(r.name))}`}
      create="/quality/deviations/new"
      createLabel="New deviation"
      columns={[
        { key: "name", label: "Deviation", render: (r) => <span className="mono">{String(r.name)}</span> },
        {
          key: "batch_no",
          label: "Batch",
          render: (r) => <span className="mono">{String(r.batch_no)}</span>,
        },
        { key: "item_code", label: "Item" },
        { key: "description", label: "Description" },
        {
          key: "docstatus",
          label: "State",
          render: (r) => (
            <StatusChip
              status={r.docstatus === 1 ? "Approved" : r.docstatus === 2 ? "Cancelled" : "Draft"}
              tone={r.docstatus === 1 ? "released" : undefined}
            />
          ),
        },
      ]}
    />
  );
}

export function DeviationNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({
    item_code: "",
    batch_no: "",
    description: "",
    impact_assessment: "",
    proposed_disposition: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(() => insert({ doctype: "QC Deviation", company: boot.company, ...f }), {
    success: (d) => `Saved ${d.name}; it needs QA approval`,
    onDone: (d) => navigate({ to: `/quality/deviations/${enc(d.name)}` }),
  });
  return (
    <div className="page page-form">
      <PageHeader title="New deviation" crumbs={[C, { label: "Deviations", to: "/quality/deviations" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Batch">
          <div className="grid-2">
            <LinkField label="Item" doctype="Item" required value={f.item_code} onChange={set("item_code")} />
            <LinkField
              label="Batch"
              doctype="Batch"
              filters={f.item_code ? { item: f.item_code } : undefined}
              required
              value={f.batch_no}
              onChange={set("batch_no")}
            />
          </div>
        </Panel>
        <Panel title="Deviation">
          <TextArea label="Description" required value={f.description} onChange={set("description")} />
          <TextArea
            label="Impact assessment"
            required
            value={f.impact_assessment}
            onChange={set("impact_assessment")}
          />
          <TextArea
            label="Proposed disposition"
            required
            value={f.proposed_disposition}
            onChange={set("proposed_disposition")}
          />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Save for QA approval
          </button>
        </div>
      </form>
    </div>
  );
}

export function DeviationPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("QC Deviation", name);
  const approve = useAction(() => submit("QC Deviation", name), { success: `${name} approved` });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Deviations", to: "/quality/deviations" }]}
      error={error ?? approve.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "QC Deviation", "submit") && (
          <ActionButton
            primary
            label="Approve deviation"
            icon={<Send aria-hidden />}
            pending={approve.isPending}
            onClick={() => approve.mutate()}
          />
        )
      }
    >
      {doc && (
        <Panel>
          <Facts
            items={[
              ["Item", String(doc.item_code)],
              ["Batch", <RefLink key="b" doctype="Batch" name={doc.batch_no} />],
              ["Description", String(doc.description)],
              ["Impact assessment", String(doc.impact_assessment)],
              ["Proposed disposition", String(doc.proposed_disposition)],
              ["Approved by", String(doc.approved_by ?? "—")],
              ["Approved on", formatDateTime(doc.approved_on)],
            ]}
          />
        </Panel>
      )}
      {doc && (
        <Connections
          items={[
            {
              label: "QC Releases using this deviation",
              doctype: "QC Release",
              filters: { qc_deviation: name },
              route: (n) => routeFor("QC Release", n),
            },
          ]}
        />
      )}
    </DocFrame>
  );
}
