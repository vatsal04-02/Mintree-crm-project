import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { PackageOpen, Send, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { type Doc, insert, mapDoc, type Row, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import {
  ActionButton,
  ChildTable,
  DocFrame,
  ListPage,
  RowsEditor,
  useAction,
  useDoc,
} from "@/components/doc";
import { DateField, FileField, LinkField, TextArea } from "@/components/fields";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { putDraft, takeDraft } from "@/lib/drafts";
import { formatDate, formatMoney, formatPercent, formatQty, isoDate } from "@/lib/format";

const C = { label: "Supply Chain" };
const PO_API = "erpnext.buying.doctype.purchase_order.purchase_order";
const MR_API = "erpnext.stock.doctype.material_request.material_request";
const enc = encodeURIComponent;

/* ======================= Material Requests ======================= */

export function MaterialRequestList() {
  return (
    <ListPage<Row>
      title="Material Requests"
      crumbs={[C]}
      doctype="Material Request"
      fields={[
        "name",
        "material_request_type",
        "transaction_date",
        "schedule_date",
        "status",
        "per_ordered",
        "docstatus",
      ]}
      tabs={[
        {
          label: "Open",
          filters: [
            ["docstatus", "<", 2],
            ["status", "not in", ["Ordered", "Stopped", "Cancelled", "Received", "Transferred", "Issued"]],
          ],
        },
        { label: "Ordered", filters: { status: "Ordered" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/procurement/material-requests/${enc(String(r.name))}`}
      create="/procurement/material-requests/new"
      createLabel="New request"
      columns={[
        { key: "name", label: "Request", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "material_request_type", label: "Type" },
        { key: "transaction_date", label: "Date", render: (r) => formatDate(r.transaction_date) },
        { key: "schedule_date", label: "Required by", render: (r) => formatDate(r.schedule_date) },
        { key: "per_ordered", label: "Ordered", num: true, render: (r) => formatPercent(r.per_ordered) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function MaterialRequestNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [requiredBy, setRequiredBy] = useState(isoDate(new Date(), 7));
  const [rows, setRows] = useState<Row[]>([{ item_code: "", qty: "" }]);
  const save = useAction(
    () =>
      insert({
        doctype: "Material Request",
        company: boot.company,
        material_request_type: "Purchase",
        schedule_date: requiredBy,
        items: rows.map((r) => ({ item_code: r.item_code, qty: r.qty, schedule_date: requiredBy })),
      }),
    {
      success: (d) => `Saved ${d.name} as draft`,
      onDone: (d) => navigate({ to: `/procurement/material-requests/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New material request"
        crumbs={[C, { label: "Material Requests", to: "/procurement/material-requests" }]}
      />
      <ErrorNote error={save.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Panel title="Request">
          <div className="grid-2">
            <DateField label="Required by" required value={requiredBy} onChange={setRequiredBy} />
          </div>
        </Panel>
        <Panel title="Items">
          <RowsEditor
            rows={rows}
            onChange={setRows}
            blank={() => ({ item_code: "", qty: "" })}
            addLabel="Add item"
            cols={[
              {
                field: "item_code",
                label: "Item",
                type: "link",
                doctype: "Item",
                filters: { is_purchase_item: 1, disabled: 0 },
                required: true,
              },
              { field: "qty", label: "Quantity", type: "number", required: true },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

export function MaterialRequestPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Material Request", name);
  const doSubmit = useAction(() => submit("Material Request", name), { success: `${name} submitted` });
  const toPO = useAction(() => mapDoc(`${MR_API}.make_purchase_order`, { source_name: name }), {
    onDone: (d) =>
      navigate({ to: "/procurement/purchase-orders/new", search: { draft: putDraft(d as Row) } }),
  });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Material Requests", to: "/procurement/material-requests" }]}
      error={error ?? doSubmit.error ?? toPO.error}
      actions={
        doc && (
          <>
            {doc.docstatus === 0 && can(boot, "Material Request", "submit") && (
              <ActionButton
                primary
                label="Submit request"
                icon={<Send aria-hidden />}
                pending={doSubmit.isPending}
                onClick={() => doSubmit.mutate()}
              />
            )}
            {doc.docstatus === 1 &&
              Number(doc.per_ordered) < 100 &&
              doc.material_request_type === "Purchase" &&
              can(boot, "Purchase Order", "create") && (
                <ActionButton
                  primary
                  label="Create purchase order"
                  icon={<ShoppingCart aria-hidden />}
                  pending={toPO.isPending}
                  onClick={() => toPO.mutate()}
                />
              )}
          </>
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Type", String(doc.material_request_type)],
                ["Date", formatDate(doc.transaction_date)],
                ["Required by", formatDate(doc.schedule_date)],
                ["Ordered", formatPercent(doc.per_ordered)],
                ["Raised by", String(doc.owner)],
              ]}
            />
          </Panel>
          <Panel title="Items" flush>
            <ChildTable
              label="Requested items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "item_name", label: "Name" },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                { key: "ordered_qty", label: "Ordered", num: true, render: (r) => formatQty(r.ordered_qty) },
                { key: "warehouse", label: "Warehouse" },
              ]}
            />
          </Panel>
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Purchase Orders ======================= */

export function PurchaseOrderList() {
  return (
    <ListPage<Row>
      title="Purchase Orders"
      crumbs={[C]}
      doctype="Purchase Order"
      fields={[
        "name",
        "supplier",
        "transaction_date",
        "schedule_date",
        "grand_total",
        "currency",
        "per_received",
        "status",
        "docstatus",
      ]}
      tabs={[
        { label: "Awaiting approval", filters: { docstatus: 0 } },
        {
          label: "To receive",
          filters: [
            ["docstatus", "=", 1],
            ["per_received", "<", 100],
            ["status", "not in", ["Closed", "On Hold"]],
          ],
        },
        {
          label: "Received",
          filters: [
            ["docstatus", "=", 1],
            ["per_received", ">=", 100],
          ],
        },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/procurement/purchase-orders/${enc(String(r.name))}`}
      create="/procurement/purchase-orders/new"
      createLabel="New purchase order"
      columns={[
        { key: "name", label: "Order", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "supplier", label: "Supplier" },
        { key: "transaction_date", label: "Date", render: (r) => formatDate(r.transaction_date) },
        { key: "schedule_date", label: "Required by", render: (r) => formatDate(r.schedule_date) },
        {
          key: "grand_total",
          label: "Total",
          num: true,
          render: (r) => formatMoney(r.grand_total, String(r.currency)),
        },
        { key: "per_received", label: "Received", num: true, render: (r) => formatPercent(r.per_received) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function PurchaseOrderNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { draft?: string };
  const draft = takeDraft(search.draft);
  const [supplier, setSupplier] = useState(String(draft?.supplier ?? ""));
  const [requiredBy, setRequiredBy] = useState(String(draft?.schedule_date ?? isoDate(new Date(), 7)));
  const [rows, setRows] = useState<Row[]>(
    (draft?.items as Row[] | undefined) ?? [{ item_code: "", qty: "", rate: "" }],
  );
  const save = useAction(
    () =>
      insert({
        ...(draft ?? {}),
        doctype: "Purchase Order",
        company: boot.company,
        supplier,
        schedule_date: requiredBy,
        items: rows.map((r) => ({ ...r, schedule_date: r.schedule_date ?? requiredBy })),
      }),
    {
      success: (d) => `Saved ${d.name}; it now needs approval`,
      onDone: (d) => navigate({ to: `/procurement/purchase-orders/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New purchase order"
        crumbs={[C, { label: "Purchase Orders", to: "/procurement/purchase-orders" }]}
      />
      {draft && (
        <Note>
          Prefilled from material request {String((draft.items as Row[])?.[0]?.material_request ?? "")}.
        </Note>
      )}
      <ErrorNote error={save.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Panel title="Order">
          <div className="grid-2">
            <LinkField
              label="Supplier"
              doctype="Supplier"
              filters={{ disabled: 0 }}
              required
              value={supplier}
              onChange={setSupplier}
            />
            <DateField label="Required by" required value={requiredBy} onChange={setRequiredBy} />
          </div>
          <p className="field-hint">
            Goods are ordered into the QC Hold warehouse of their item group; the ERP sets it.
          </p>
        </Panel>
        <Panel title="Items">
          <RowsEditor
            rows={rows}
            onChange={setRows}
            blank={() => ({ item_code: "", qty: "", rate: "" })}
            addLabel="Add item"
            cols={[
              {
                field: "item_code",
                label: "Item",
                type: "link",
                doctype: "Item",
                filters: { is_purchase_item: 1, disabled: 0 },
                required: true,
              },
              {
                field: "qty",
                label: "Quantity",
                type: "number",
                required: true,
                unit: (r) => (r.uom ? String(r.uom) : undefined),
              },
              {
                field: "rate",
                label: "Rate",
                type: "number",
                required: true,
                unit: () => boot.currency ?? undefined,
              },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !supplier}>
            Save for approval
          </button>
        </div>
      </form>
    </div>
  );
}

export function PurchaseOrderPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Purchase Order", name);
  const approve = useAction(() => submit("Purchase Order", name), { success: `${name} approved` });
  const receive = useAction(() => mapDoc(`${PO_API}.make_purchase_receipt`, { source_name: name }), {
    onDone: (d) => navigate({ to: "/procurement/receipts/new", search: { draft: putDraft(d as Row) } }),
  });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Purchase Orders", to: "/procurement/purchase-orders" }]}
      error={error ?? approve.error ?? receive.error}
      actions={
        doc && (
          <>
            {doc.docstatus === 0 && can(boot, "Purchase Order", "submit") && (
              <ActionButton
                primary
                label="Approve and submit"
                icon={<Send aria-hidden />}
                pending={approve.isPending}
                onClick={() => approve.mutate()}
              />
            )}
            {doc.docstatus === 1 &&
              Number(doc.per_received) < 100 &&
              can(boot, "Purchase Receipt", "create") && (
                <ActionButton
                  primary
                  label="Receive goods"
                  icon={<PackageOpen aria-hidden />}
                  pending={receive.isPending}
                  onClick={() => receive.mutate()}
                />
              )}
          </>
        )
      }
    >
      {doc && (
        <>
          {doc.docstatus === 0 && (
            <Note tone="hold">
              Draft. Approval limits per role are enforced by the ERP when it is submitted.
            </Note>
          )}
          <Panel>
            <Facts
              items={[
                ["Supplier", String(doc.supplier)],
                ["Date", formatDate(doc.transaction_date)],
                ["Required by", formatDate(doc.schedule_date)],
                ["Total", formatMoney(doc.grand_total, String(doc.currency))],
                ["Received", formatPercent(doc.per_received)],
                ["Billed", formatPercent(doc.per_billed)],
              ]}
            />
          </Panel>
          <Panel title="Items" flush>
            <ChildTable
              label="Order items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "item_name", label: "Name" },
                { key: "qty", label: "Ordered", num: true, render: (r) => formatQty(r.qty, r.uom) },
                {
                  key: "received_qty",
                  label: "Received",
                  num: true,
                  render: (r) => formatQty(r.received_qty),
                },
                {
                  key: "rate",
                  label: "Rate",
                  num: true,
                  render: (r) => formatMoney(r.rate, String(doc.currency)),
                },
                {
                  key: "amount",
                  label: "Amount",
                  num: true,
                  render: (r) => formatMoney(r.amount, String(doc.currency)),
                },
                { key: "warehouse", label: "Into" },
              ]}
            />
          </Panel>
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Goods Receipts (Purchase Receipt) ======================= */

export function ReceiptList() {
  return (
    <ListPage<Row>
      title="Goods Receipts"
      crumbs={[C]}
      doctype="Purchase Receipt"
      fields={["name", "supplier", "posting_date", "grand_total", "currency", "status", "docstatus"]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        { label: "Received", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/procurement/receipts/${enc(String(r.name))}`}
      note={
        <Note>
          Goods receipts start from an approved purchase order: open the order and choose “Receive goods”.
        </Note>
      }
      columns={[
        { key: "name", label: "Receipt", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "supplier", label: "Supplier" },
        { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
        {
          key: "grand_total",
          label: "Value",
          num: true,
          render: (r) => formatMoney(r.grand_total, String(r.currency)),
        },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function ReceiptNew() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { draft?: string };
  const draft = takeDraft(search.draft);
  const [rows, setRows] = useState<Row[]>((draft?.items as Row[] | undefined) ?? []);
  const [remarks, setRemarks] = useState("");
  const save = useAction(
    async (thenSubmit: boolean) => {
      const doc = await insert<Doc>({
        ...(draft ?? {}),
        doctype: "Purchase Receipt",
        items: rows,
        remarks: remarks || undefined,
      });
      if (!thenSubmit) return doc;
      try {
        return await submit("Purchase Receipt", doc.name);
      } catch (e) {
        // saved but refused on submit: open the draft so the refusal can be fixed there
        navigate({ to: `/procurement/receipts/${enc(doc.name)}` });
        throw e;
      }
    },
    {
      success: (d) => (d.docstatus === 1 ? `${d.name} received into QC Hold` : `Saved ${d.name} as draft`),
      onDone: (d) => navigate({ to: `/procurement/receipts/${enc(d.name)}` }),
    },
  );
  if (!draft) {
    return (
      <div className="page">
        <PageHeader
          title="New goods receipt"
          crumbs={[C, { label: "Goods Receipts", to: "/procurement/receipts" }]}
        />
        <Note>Open an approved purchase order and choose “Receive goods” to start a receipt.</Note>
      </div>
    );
  }
  return (
    <div className="page page-form">
      <PageHeader
        title="Receive goods"
        crumbs={[C, { label: "Goods Receipts", to: "/procurement/receipts" }]}
        meta={
          <span>
            From {String((draft.items as Row[])?.[0]?.purchase_order ?? "")} · {String(draft.supplier)}
          </span>
        }
      />
      <Note tone="hold">
        Received stock goes into QC Hold and cannot be used until QC releases the batch.
      </Note>
      <ErrorNote error={save.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(true);
        }}
      >
        <Panel title="Received items">
          <RowsEditor
            rows={rows}
            onChange={setRows}
            fixed
            cols={[
              {
                field: "item_code",
                label: "Item",
                type: "readonly",
                render: (r) => (
                  <span className="mono">
                    {String(r.item_code)} · {String(r.item_name ?? "")}
                  </span>
                ),
              },
              { field: "warehouse", label: "Into", type: "readonly" },
              {
                field: "qty",
                label: "Received qty",
                type: "number",
                required: true,
                unit: (r) => String(r.uom ?? ""),
              },
              { field: "fo_supplier_batch_no", label: "Supplier batch no.", type: "text" },
              { field: "fo_mfg_date", label: "Mfg date", type: "date" },
              { field: "fo_expiry_date", label: "Expiry date", type: "date" },
            ]}
          />
          {rows.map((r, i) => (
            <FileField
              // biome-ignore lint/suspicious/noArrayIndexKey: rows of an unsaved document
              key={i}
              label={`Certificate of analysis, row ${i + 1} (${String(r.item_code)})`}
              value={String(r.fo_coa ?? "")}
              onChange={(url) => setRows(rows.map((x, j) => (j === i ? { ...x, fo_coa: url } : x)))}
            />
          ))}
        </Panel>
        <Panel title="Notes">
          <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
        </Panel>
        <div className="form-actions">
          <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate(false)}>
            Save draft
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Submit receipt
          </button>
        </div>
      </form>
    </div>
  );
}

export function ReceiptPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("Purchase Receipt", name);
  const doSubmit = useAction(() => submit("Purchase Receipt", name), {
    success: `${name} received into QC Hold`,
  });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Goods Receipts", to: "/procurement/receipts" }]}
      error={error ?? doSubmit.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "Purchase Receipt", "submit") && (
          <ActionButton
            primary
            label="Submit receipt"
            icon={<Send aria-hidden />}
            pending={doSubmit.isPending}
            onClick={() => doSubmit.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Supplier", String(doc.supplier)],
                ["Posting date", formatDate(doc.posting_date)],
                ["Value", formatMoney(doc.grand_total, String(doc.currency))],
                ["Received by", String(doc.owner)],
              ]}
            />
          </Panel>
          <Panel title="Items and batches" flush>
            <ChildTable
              label="Received items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                {
                  key: "batch_no",
                  label: "Batch",
                  render: (r) => <span className="mono">{String(r.batch_no ?? "—")}</span>,
                },
                { key: "fo_supplier_batch_no", label: "Supplier batch" },
                { key: "fo_expiry_date", label: "Expiry", render: (r) => formatDate(r.fo_expiry_date) },
                { key: "warehouse", label: "Into" },
                {
                  key: "fo_coa",
                  label: "COA",
                  render: (r) =>
                    r.fo_coa ? (
                      <a className="link" href={String(r.fo_coa)} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </Panel>
        </>
      )}
    </DocFrame>
  );
}
