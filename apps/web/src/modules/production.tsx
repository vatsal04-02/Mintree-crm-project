import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowRightLeft, Factory, Send } from "lucide-react";
import { useState } from "react";
import { insert, mapDoc, type Row, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import {
  ActionButton,
  ChildTable,
  DocFrame,
  ListPage,
  RefLink,
  useAction,
  useDoc,
  useList,
} from "@/components/doc";
import { LinkField, NumberField } from "@/components/fields";
import { ReportView } from "@/components/ReportView";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { putDraft } from "@/lib/drafts";
import { formatDate, formatQty, isoDate } from "@/lib/format";

const C = { label: "Manufacturing" };
const WO_API = "erpnext.manufacturing.doctype.work_order.work_order";
const enc = encodeURIComponent;

export function WorkOrderList() {
  return (
    <ListPage<Row>
      title="Work Orders"
      crumbs={[C]}
      doctype="Work Order"
      fields={[
        "name",
        "production_item",
        "item_name",
        "qty",
        "produced_qty",
        "material_transferred_for_manufacturing",
        "stock_uom",
        "planned_start_date",
        "status",
        "docstatus",
      ]}
      tabs={[
        {
          label: "Active",
          filters: [
            ["docstatus", "<", 2],
            ["status", "not in", ["Completed", "Stopped", "Closed", "Cancelled"]],
          ],
        },
        { label: "Completed", filters: { status: "Completed" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/production/work-orders/${enc(String(r.name))}`}
      create="/production/work-orders/new"
      createLabel="New work order"
      columns={[
        { key: "name", label: "Work order", render: (r) => <span className="mono">{String(r.name)}</span> },
        {
          key: "production_item",
          label: "Item",
          render: (r) => (
            <span>
              {String(r.production_item)} <span className="dim">{String(r.item_name ?? "")}</span>
            </span>
          ),
        },
        { key: "qty", label: "Planned", num: true, render: (r) => formatQty(r.qty, r.stock_uom) },
        {
          key: "material_transferred_for_manufacturing",
          label: "Issued",
          num: true,
          render: (r) => formatQty(r.material_transferred_for_manufacturing),
        },
        { key: "produced_qty", label: "Produced", num: true, render: (r) => formatQty(r.produced_qty) },
        { key: "planned_start_date", label: "Start", render: (r) => formatDate(r.planned_start_date) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function WorkOrderNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [item, setItem] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const create = useAction(
    () =>
      insert({
        doctype: "Work Order",
        company: boot.company,
        production_item: item,
        qty: qty === "" ? undefined : qty,
      }),
    {
      success: (d) => `Saved ${d.name}`,
      onDone: (d) => navigate({ to: `/production/work-orders/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="New work order"
        crumbs={[C, { label: "Work Orders", to: "/production/work-orders" }]}
      />
      <Note>
        Bulk is made in kg from raw materials; finished goods are filled from released bulk. The ERP picks the
        BOM and warehouses from configuration.
      </Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="What to make">
          <div className="grid-2">
            <LinkField
              label="Item to produce"
              doctype="Item"
              filters={{ default_bom: ["is", "set"], disabled: 0 }}
              required
              value={item}
              onChange={setItem}
            />
            <NumberField label="Quantity" required value={qty} onChange={setQty} />
          </div>
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !item}>
            Save work order
          </button>
        </div>
      </form>
    </div>
  );
}

export function WorkOrderPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Work Order", name);
  const entries = useList<Row>("Stock Entry", {
    fields: ["name", "stock_entry_type", "posting_date", "fg_completed_qty", "docstatus"],
    filters: { work_order: name },
    limit: 50,
  });
  const [qty, setQty] = useState<number | "">("");
  const doSubmit = useAction(() => submit("Work Order", name), { success: `${name} submitted` });
  const prepare = useAction(
    (purpose: string) =>
      mapDoc(`${WO_API}.make_stock_entry`, {
        work_order_id: name,
        purpose,
        qty: qty === "" ? undefined : qty,
      }),
    { onDone: (d) => navigate({ to: "/inventory/movements/new", search: { draft: putDraft(d as Row) } }) },
  );
  const planned = Number(doc?.qty ?? 0);
  const issued = Number(doc?.material_transferred_for_manufacturing ?? 0);
  const produced = Number(doc?.produced_qty ?? 0);
  const mayMove = can(boot, "Stock Entry", "create");
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Work Orders", to: "/production/work-orders" }]}
      error={error ?? doSubmit.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "Work Order", "submit") && (
          <ActionButton
            primary
            label="Submit work order"
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
                ["Item", `${String(doc.production_item)} · ${String(doc.item_name ?? "")}`],
                ["BOM", <RefLink key="bom" doctype="BOM" name={doc.bom_no} />],
                ["Planned", formatQty(planned, doc.stock_uom)],
                ["Materials issued for", formatQty(issued, doc.stock_uom)],
                ["Produced", formatQty(produced, doc.stock_uom)],
                ["Work in progress", String(doc.wip_warehouse)],
                ["Output into", String(doc.fg_warehouse)],
                ["Planned start", formatDate(doc.planned_start_date)],
              ]}
            />
          </Panel>
          {doc.docstatus === 1 && mayMove && doc.status !== "Completed" && doc.status !== "Stopped" && (
            <Panel title="Record production">
              <ErrorNote error={prepare.error} />
              <div className="grid-3">
                <NumberField
                  label="Quantity"
                  value={qty}
                  onChange={setQty}
                  unit={String(doc.stock_uom ?? "")}
                  hint="Defaults to the open quantity."
                />
              </div>
              <div className="form-actions">
                <ActionButton
                  label="Issue materials to production"
                  icon={<ArrowRightLeft aria-hidden />}
                  pending={prepare.isPending && prepare.variables === "Material Transfer for Manufacture"}
                  disabled={issued >= planned}
                  onClick={() => prepare.mutate("Material Transfer for Manufacture")}
                />
                <ActionButton
                  primary
                  label="Record output"
                  icon={<Factory aria-hidden />}
                  pending={prepare.isPending && prepare.variables === "Manufacture"}
                  disabled={issued <= produced}
                  onClick={() => prepare.mutate("Manufacture")}
                />
              </div>
              <p className="field-hint">
                Output goes into QC Hold. Process loss is the difference between what the BOM expects and what
                is recorded.
              </p>
            </Panel>
          )}
          <Panel title="Required materials" flush>
            <ChildTable
              label="Required materials"
              rows={doc.required_items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "item_name", label: "Name" },
                { key: "source_warehouse", label: "From" },
                {
                  key: "required_qty",
                  label: "Required",
                  num: true,
                  render: (r) => formatQty(r.required_qty, r.stock_uom),
                },
                {
                  key: "transferred_qty",
                  label: "Issued",
                  num: true,
                  render: (r) => formatQty(r.transferred_qty),
                },
                {
                  key: "consumed_qty",
                  label: "Consumed",
                  num: true,
                  render: (r) => formatQty(r.consumed_qty),
                },
              ]}
            />
          </Panel>
          <Panel
            title="Stock entries"
            flush
            actions={
              <Link className="btn btn-sm btn-ghost" to="/procurement/requirements">
                Material requirements
              </Link>
            }
          >
            <ChildTable
              label="Stock entries for this work order"
              rows={entries.data}
              columns={[
                {
                  key: "name",
                  label: "Entry",
                  render: (r) => (
                    <Link className="link mono" to={`/inventory/movements/${enc(String(r.name))}`}>
                      {String(r.name)}
                    </Link>
                  ),
                },
                { key: "stock_entry_type", label: "Type" },
                { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
                {
                  key: "fg_completed_qty",
                  label: "For qty",
                  num: true,
                  render: (r) => formatQty(r.fg_completed_qty),
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
          </Panel>
        </>
      )}
    </DocFrame>
  );
}

export function WastageReport() {
  const boot = useSession();
  return (
    <ReportView
      report="Wastage by Reason"
      crumbs={[C]}
      filters={{ company: boot.company, from_date: isoDate(new Date(), -30), to_date: isoDate() }}
      note={<Note>Last 30 days.</Note>}
    />
  );
}

export function RequirementsReport() {
  const boot = useSession();
  return (
    <ReportView
      report="RM PM Requirements"
      title="RM / PM requirements"
      crumbs={[{ label: "Buying" }]}
      filters={{ company: boot.company }}
    />
  );
}
