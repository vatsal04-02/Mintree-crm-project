import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Printer, Send } from "lucide-react";
import { useState } from "react";
import { type Doc, getDoc, insert, pdfUrl, type Row, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
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
import { LinkField } from "@/components/fields";
import { ReportView } from "@/components/ReportView";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { takeDraft } from "@/lib/drafts";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { routeFor } from "@/nav";

const C = { label: "Stock" };
const enc = encodeURIComponent;

/* ======================= Stock by QC Status ======================= */

const QC_TABS = ["All", "Hold", "Released", "Rejected"];

export function StockByQC() {
  const boot = useSession();
  const s = useSearch({ strict: false }) as { batch?: string };
  const [status, setStatus] = useState("All");
  const [item, setItem] = useState("");
  return (
    <ReportView
      title="Stock by QC Status"
      report="Stock by QC Status"
      crumbs={[C]}
      hide={["item_group", "warehouse_type"]}
      filters={{ company: boot.company, item_code: item || undefined, batch_no: s.batch || undefined }}
      rowFilter={status === "All" ? undefined : (r) => String(r.qc_status) === status}
      note={
        s.batch ? (
          <Note>
            Showing batch <span className="mono">{s.batch}</span>.
          </Note>
        ) : undefined
      }
      controls={
        <>
          <fieldset className="seg">
            <legend className="sr-only">QC status</legend>
            {QC_TABS.map((t) => (
              <button
                key={t}
                type="button"
                className="seg-btn"
                aria-pressed={status === t}
                onClick={() => setStatus(t)}
              >
                {t}
              </button>
            ))}
          </fieldset>
          <div className="toolbar-field">
            <LinkField label="Item" doctype="Item" value={item} onChange={setItem} placeholder="All items" />
          </div>
        </>
      }
    />
  );
}

/* ======================= Stock movements (Stock Entry) ======================= */

export function MovementList() {
  const boot = useSession();
  const navigate = useNavigate();
  return (
    <ListPage<Row>
      title="Stock Movements"
      crumbs={[C]}
      doctype="Stock Entry"
      fields={[
        "name",
        "stock_entry_type",
        "purpose",
        "posting_date",
        "work_order",
        "total_outgoing_value",
        "total_incoming_value",
        "docstatus",
      ]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        { label: "Posted", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/inventory/movements/${enc(String(r.name))}`}
      create="/inventory/movements/new"
      createLabel="New transfer"
      note={
        can(boot, "Stock Entry", "create") && (
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => navigate({ to: "/inventory/movements/new", search: { type: "wastage" } })}
            >
              Write off wastage
            </button>
          </div>
        )
      }
      columns={[
        { key: "name", label: "Entry", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "stock_entry_type", label: "Type" },
        { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
        {
          key: "work_order",
          label: "Work order",
          render: (r) => (r.work_order ? <span className="mono">{String(r.work_order)}</span> : "—"),
        },
        {
          key: "total_outgoing_value",
          label: "Value out",
          num: true,
          render: (r) => formatMoney(r.total_outgoing_value, boot.currency ?? "INR"),
        },
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

type Mode = "draft" | "transfer" | "wastage";

/**
 * One form for every stock movement the front end offers: a draft mapped by ERPNext (work order
 * transfer or manufacture), a plain transfer between usable warehouses, or a wastage write-off.
 * QC Hold rules are the server's: a movement out of hold is refused there, not here.
 */
export function MovementNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const s = useSearch({ strict: false }) as { draft?: string; type?: string };
  const draft = takeDraft(s.draft);
  const mode: Mode = draft ? "draft" : s.type === "wastage" ? "wastage" : "transfer";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>(
    (draft?.items as Row[] | undefined) ?? [{ item_code: "", batch_no: "", qty: "" }],
  );

  const post = useAction(
    async (thenSubmit: boolean) => {
      const items = rows.map((r) => ({
        ...r,
        s_warehouse: mode === "draft" ? r.s_warehouse : from,
        t_warehouse: mode === "transfer" ? to : mode === "wastage" ? undefined : r.t_warehouse,
        ...(r.batch_no ? { use_serial_batch_fields: 1 } : {}),
      }));
      const base =
        mode === "draft"
          ? { ...draft }
          : mode === "wastage"
            ? { purpose: "Material Issue", stock_entry_type: "Wastage" }
            : { purpose: "Material Transfer", stock_entry_type: "Material Transfer" };
      const doc = await insert<Doc>({ ...base, doctype: "Stock Entry", company: boot.company, items });
      if (!thenSubmit) return doc;
      try {
        return await submit("Stock Entry", doc.name);
      } catch (e) {
        navigate({ to: `/inventory/movements/${enc(doc.name)}` });
        throw e;
      }
    },
    {
      success: (d) => (d.docstatus === 1 ? `${d.name} posted` : `Saved ${d.name} as draft`),
      onDone: (d) =>
        navigate({
          to: draft?.work_order
            ? `/production/work-orders/${enc(String(draft.work_order))}`
            : `/inventory/movements/${enc(d.name)}`,
        }),
    },
  );

  const title =
    mode === "wastage"
      ? "Write off wastage"
      : mode === "draft"
        ? String(draft?.stock_entry_type ?? draft?.purpose ?? "Stock entry")
        : "Stock transfer";

  return (
    <div className="page page-form">
      <PageHeader
        title={title}
        crumbs={[C, { label: "Stock Movements", to: "/inventory/movements" }]}
        meta={
          draft?.work_order ? (
            <span>
              For work order <span className="mono">{String(draft.work_order)}</span>
            </span>
          ) : undefined
        }
      />
      {mode === "transfer" && (
        <Note>
          Transfers move released stock between usable warehouses. Stock on QC Hold moves only through a QC
          Release.
        </Note>
      )}
      {mode === "draft" && (
        <Note>
          Prepared by the ERP from the work order. Leave the batch empty to let the ERP pick it (first expiry
          first out).
        </Note>
      )}
      <ErrorNote error={post.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          post.mutate(true);
        }}
      >
        {mode !== "draft" && (
          <Panel title="Warehouses">
            <div className="grid-2">
              <LinkField
                label="From warehouse"
                doctype="Warehouse"
                filters={{ is_group: 0, company: boot.company }}
                required
                value={from}
                onChange={setFrom}
              />
              {mode === "transfer" && (
                <LinkField
                  label="To warehouse"
                  doctype="Warehouse"
                  filters={{ is_group: 0, company: boot.company }}
                  required
                  value={to}
                  onChange={setTo}
                />
              )}
            </div>
          </Panel>
        )}
        <Panel title="Items">
          <RowsEditor
            rows={rows}
            onChange={setRows}
            fixed={mode === "draft"}
            blank={() => ({ item_code: "", batch_no: "", qty: "" })}
            addLabel="Add item"
            cols={[
              mode === "draft"
                ? {
                    field: "item_code",
                    label: "Item",
                    type: "readonly",
                    render: (r) => <span className="mono">{String(r.item_code)}</span>,
                  }
                : {
                    field: "item_code",
                    label: "Item",
                    type: "link",
                    doctype: "Item",
                    filters: { is_stock_item: 1 },
                    required: true,
                  },
              ...(mode === "draft"
                ? [
                    { field: "s_warehouse", label: "From", type: "readonly" as const },
                    { field: "t_warehouse", label: "To", type: "readonly" as const },
                  ]
                : []),
              { field: "batch_no", label: "Batch", type: "link", doctype: "Batch" },
              {
                field: "qty",
                label: "Quantity",
                type: "number",
                required: true,
                unit: (r) => (r.uom ? String(r.uom) : undefined),
              },
              ...(mode === "wastage"
                ? [
                    {
                      field: "fo_wastage_reason",
                      label: "Wastage reason",
                      type: "link" as const,
                      doctype: "Wastage Reason",
                      filters: { enabled: 1 },
                      required: true,
                    },
                  ]
                : []),
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button type="button" className="btn" disabled={post.isPending} onClick={() => post.mutate(false)}>
            Save draft
          </button>
          <button type="submit" className="btn btn-primary" disabled={post.isPending}>
            Post movement
          </button>
        </div>
      </form>
    </div>
  );
}

export function MovementPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("Stock Entry", name);
  const post = useAction(() => submit("Stock Entry", name), { success: `${name} posted` });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Stock Movements", to: "/inventory/movements" }]}
      error={error ?? post.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "Stock Entry", "submit") && (
          <ActionButton
            primary
            label="Post movement"
            icon={<Send aria-hidden />}
            pending={post.isPending}
            onClick={() => post.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Type", String(doc.stock_entry_type)],
                ["Posting date", formatDate(doc.posting_date)],
                ["Work order", <RefLink key="wo" doctype="Work Order" name={doc.work_order} />],
                ["Process loss", doc.process_loss_qty ? formatQty(doc.process_loss_qty) : "—"],
                [
                  "Value",
                  formatMoney(doc.total_outgoing_value || doc.total_incoming_value, boot.currency ?? "INR"),
                ],
              ]}
            />
          </Panel>
          <Panel title="Items" flush>
            <ChildTable
              label="Movement items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "s_warehouse", label: "From", render: (r) => String(r.s_warehouse ?? "—") },
                { key: "t_warehouse", label: "To", render: (r) => String(r.t_warehouse ?? "—") },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                {
                  key: "batch_no",
                  label: "Batch",
                  render: (r) =>
                    r.batch_no ? (
                      <RefLink doctype="Batch" name={r.batch_no} />
                    ) : (
                      <span className="dim">{r.serial_and_batch_bundle ? "in bundle" : "—"}</span>
                    ),
                },
                {
                  key: "fo_wastage_reason",
                  label: "Wastage reason",
                  render: (r) => String(r.fo_wastage_reason ?? "—"),
                },
              ]}
            />
          </Panel>
          {doc.docstatus === 1 && doc.purpose === "Manufacture" && <OutputBatches doc={doc} />}
          <Connections
            items={[
              ...(doc.work_order
                ? [
                    {
                      label: "Work Order",
                      doctype: "Work Order",
                      filters: { name: String(doc.work_order) },
                      route: (n: string) => routeFor("Work Order", n),
                    },
                  ]
                : []),
              {
                label: "QC Releases",
                doctype: "QC Release",
                filters: { stock_entry: name },
                route: (n) => routeFor("QC Release", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/** Output batches of a manufacture entry, read back from the server, with their label PDF. */
function OutputBatches({ doc }: { doc: Doc }) {
  const out = ((doc.items as Row[]) ?? []).filter((r) => r.t_warehouse && r.serial_and_batch_bundle);
  const { data } = useQuery({
    queryKey: ["bundles", doc.name],
    enabled: out.length > 0,
    queryFn: () =>
      Promise.all(
        out.map(async (r) => {
          const b = await getDoc("Serial and Batch Bundle", String(r.serial_and_batch_bundle));
          return ((b.entries as Row[]) ?? []).map((e) => ({
            batch: String(e.batch_no),
            warehouse: String(r.t_warehouse),
          }));
        }),
      ).then((x) => x.flat()),
  });
  if (!data?.length) return null;
  return (
    <Panel title="Output batches">
      <div className="inline-list">
        {data.map((b) => (
          <span key={b.batch} className="inline-item">
            <RefLink doctype="Batch" name={b.batch} />
            <span className="dim">in {b.warehouse}</span>
            <a
              className="btn btn-sm"
              href={pdfUrl("Batch", b.batch, "Batch Label")}
              target="_blank"
              rel="noreferrer"
            >
              <Printer aria-hidden /> Batch label (PDF)
            </a>
          </span>
        ))}
      </div>
    </Panel>
  );
}
