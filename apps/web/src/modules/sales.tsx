import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ClipboardList, Lock, Package, ReceiptIndianRupee, Send, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { call, docMethod, insert, mapDoc, type Row, setValues, submit } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import {
  ActionButton,
  ChildTable,
  Connections,
  childValues,
  DocFrame,
  ListPage,
  nameIn,
  RefLink,
  RowsEditor,
  useAction,
  useDoc,
  useList,
} from "@/components/doc";
import { DateField, LinkField, NumberField, SelectField, TextField } from "@/components/fields";
import { ReportView } from "@/components/ReportView";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { formatDate, formatMoney, formatPercent, formatQty, isoDate } from "@/lib/format";
import { routeFor } from "@/nav";

const C = { label: "Selling" };
const SO_API = "erpnext.selling.doctype.sales_order.sales_order";
const PL_API = "erpnext.stock.doctype.pick_list.pick_list";
const DN_API = "erpnext.stock.doctype.delivery_note.delivery_note";
const CHANNELS = ["B2B", "D2C Website", "D2C Marketplace", "D2C Other"];
const enc = encodeURIComponent;

/** Sales order -> FEFO pick list, saved and submitted (ERPNext + factory_ops choose the batches). */
async function createPickList(salesOrder: string) {
  const draft = await mapDoc(`${SO_API}.create_pick_list`, { source_name: salesOrder });
  const pl = await insert({ ...(draft as Row), doctype: "Pick List" });
  return submit("Pick List", pl.name);
}

/** Pick list -> draft delivery note (ERPNext saves it); returns its name. */
async function createDelivery(pickList: string): Promise<string> {
  const out = await call<Row | string>(`${PL_API}.create_delivery_note`, { source_name: pickList });
  if (typeof out === "string") return out;
  if (out.name && out.docstatus !== undefined && !String(out.name).startsWith("new-"))
    return String(out.name);
  const dn = await insert({ ...out, doctype: "Delivery Note" });
  return dn.name;
}

/* ======================= Sales Orders ======================= */

export function SalesOrderList() {
  return (
    <ListPage<Row>
      title="Sales Orders"
      crumbs={[C]}
      doctype="Sales Order"
      fields={[
        "name",
        "customer",
        "fo_sales_channel",
        "transaction_date",
        "delivery_date",
        "grand_total",
        "currency",
        "per_delivered",
        "per_billed",
        "status",
        "docstatus",
      ]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        {
          label: "To deliver",
          filters: [
            ["docstatus", "=", 1],
            ["per_delivered", "<", 100],
            ["status", "not in", ["Closed", "On Hold"]],
          ],
        },
        {
          label: "To bill",
          filters: [
            ["docstatus", "=", 1],
            ["per_billed", "<", 100],
            ["per_delivered", ">", 0],
          ],
        },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/sales/orders/${enc(String(r.name))}`}
      create="/sales/orders/new"
      createLabel="New sales order"
      columns={[
        { key: "name", label: "Order", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "customer", label: "Customer" },
        { key: "fo_sales_channel", label: "Channel" },
        { key: "delivery_date", label: "Deliver by", render: (r) => formatDate(r.delivery_date) },
        {
          key: "grand_total",
          label: "Total",
          num: true,
          render: (r) => formatMoney(r.grand_total, String(r.currency)),
        },
        {
          key: "per_delivered",
          label: "Delivered",
          num: true,
          render: (r) => formatPercent(r.per_delivered),
        },
        { key: "per_billed", label: "Billed", num: true, render: (r) => formatPercent(r.per_billed) },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

/** Available to sell for one item, from factory_ops (released, in date, not reserved or picked). */
function AvailableToSell({ item, warehouse }: { item: string; warehouse?: string }) {
  const boot = useSession();
  const { data, error } = useQuery({
    queryKey: ["ats", item, warehouse],
    enabled: !!item,
    queryFn: () =>
      call<number>("factory_ops.sales_ops.available_to_sell.get_available_to_sell", {
        company: boot.company,
        item_code: item,
        warehouse: warehouse || undefined,
      }),
  });
  if (!item) return <span className="dim">—</span>;
  if (error) return <span className="dim">Not available to you</span>;
  return <span className="num">{data === undefined ? "…" : formatQty(data)}</span>;
}

export function SalesOrderNew() {
  const boot = useSession();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState("");
  const [channel, setChannel] = useState("B2B");
  const [externalId, setExternalId] = useState("");
  const [deliverBy, setDeliverBy] = useState(isoDate(new Date(), 3));
  const [warehouse, setWarehouse] = useState("");
  const [rows, setRows] = useState<Row[]>([{ item_code: "", qty: "", rate: "" }]);
  const create = useAction(
    () =>
      insert({
        doctype: "Sales Order",
        company: boot.company,
        customer,
        fo_sales_channel: channel,
        fo_external_order_id: externalId || undefined,
        delivery_date: deliverBy,
        set_warehouse: warehouse,
        items: rows.map((r) => ({
          item_code: r.item_code,
          qty: r.qty,
          rate: r.rate === "" ? undefined : r.rate,
          delivery_date: deliverBy,
          warehouse,
        })),
      }),
    {
      success: (d) => `Saved ${d.name} as draft`,
      onDone: (d) => navigate({ to: `/sales/orders/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="New sales order" crumbs={[C, { label: "Sales Orders", to: "/sales/orders" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Order">
          <div className="grid-3">
            <LinkField
              label="Customer"
              doctype="Customer"
              filters={{ disabled: 0 }}
              required
              value={customer}
              onChange={setCustomer}
            />
            <SelectField
              label="Sales channel"
              required
              options={CHANNELS}
              value={channel}
              onChange={setChannel}
            />
            <DateField label="Deliver by" required value={deliverBy} onChange={setDeliverBy} />
            <LinkField
              label="Dispatch from"
              doctype="Warehouse"
              filters={{ warehouse_type: "Usable", is_group: 0, company: boot.company }}
              required
              value={warehouse}
              onChange={setWarehouse}
              hint="Only released stock can be sold; QC Hold warehouses are not offered."
            />
            {channel !== "B2B" && (
              <TextField
                label="External order ID"
                required
                value={externalId}
                onChange={setExternalId}
                hint="The order number on the website or marketplace."
              />
            )}
          </div>
          <p className="field-hint">
            Credit limits are checked by the ERP when the order is submitted; a Sales Manager can approve an
            over-limit order.
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
                filters: { is_sales_item: 1, disabled: 0 },
                required: true,
              },
              {
                field: "ats",
                label: "Available to sell",
                type: "readonly",
                render: (r) => <AvailableToSell item={String(r.item_code ?? "")} warehouse={warehouse} />,
              },
              { field: "qty", label: "Quantity", type: "number", required: true },
              { field: "rate", label: "Rate", type: "number", unit: () => boot.currency ?? undefined },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !customer || !warehouse}
          >
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

export function SalesOrderPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Sales Order", name);
  const doSubmit = useAction(() => submit("Sales Order", name), { success: `${name} submitted` });
  const pick = useAction(() => createPickList(name), {
    success: (pl) => `Pick list ${pl.name} created (first expiry first out)`,
    onDone: (pl) => navigate({ to: `/sales/pick-lists/${enc(pl.name)}` }),
  });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Sales Orders", to: "/sales/orders" }]}
      error={error ?? doSubmit.error ?? pick.error}
      actions={
        doc && (
          <>
            {doc.docstatus === 0 && can(boot, "Sales Order", "submit") && (
              <ActionButton
                primary
                label="Submit order"
                icon={<Send aria-hidden />}
                pending={doSubmit.isPending}
                onClick={() => doSubmit.mutate()}
              />
            )}
            {doc.docstatus === 1 &&
              Number(doc.per_delivered) < 100 &&
              Number(doc.per_picked ?? 0) < 100 &&
              can(boot, "Pick List", "create") && (
                <ActionButton
                  primary
                  label="Create pick list"
                  icon={<ClipboardList aria-hidden />}
                  pending={pick.isPending}
                  onClick={() => pick.mutate()}
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
                ["Customer", <RefLink key="c" doctype="Customer" name={doc.customer} />],
                ["Channel", String(doc.fo_sales_channel ?? "—")],
                ["External order", String(doc.fo_external_order_id ?? "—")],
                ["Deliver by", formatDate(doc.delivery_date)],
                ["Total", formatMoney(doc.grand_total, String(doc.currency))],
                ["Picked", formatPercent(doc.per_picked)],
                ["Delivered", formatPercent(doc.per_delivered)],
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
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                {
                  key: "delivered_qty",
                  label: "Delivered",
                  num: true,
                  render: (r) => formatQty(r.delivered_qty),
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
                { key: "warehouse", label: "From" },
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Pick Lists",
                doctype: "Pick List",
                filters: [["Pick List Item", "sales_order", "=", name]],
                route: (n) => routeFor("Pick List", n),
              },
              {
                label: "Deliveries",
                doctype: "Delivery Note",
                filters: [["Delivery Note Item", "against_sales_order", "=", name]],
                route: (n) => routeFor("Delivery Note", n),
              },
              {
                label: "Sales Invoices",
                doctype: "Sales Invoice",
                filters: [["Sales Invoice Item", "sales_order", "=", name]],
                route: (n) => routeFor("Sales Invoice", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Pick Lists ======================= */

export function PickListList() {
  const navigate = useNavigate();
  return (
    <ListPage<Row>
      title="Pick Lists"
      crumbs={[C]}
      doctype="Pick List"
      fields={["name", "customer", "creation", "status", "docstatus"]}
      tabs={[
        {
          label: "Open",
          filters: [
            ["docstatus", "=", 1],
            ["status", "not in", ["Completed", "Cancelled"]],
          ],
        },
        { label: "Completed", filters: { status: "Completed" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/sales/pick-lists/${enc(String(r.name))}`}
      start={{
        label: "Create pick list",
        title: "Pick a sales order",
        hint: "Submitted orders not yet fully picked. The ERP picks released, in-date batches, first expiry first out.",
        doctype: "Sales Order",
        fields: ["name", "customer", "delivery_date", "per_picked", "grand_total", "currency"],
        filters: [
          ["docstatus", "=", 1],
          ["per_delivered", "<", 100],
          ["per_picked", "<", 100],
          ["status", "not in", ["Closed", "On Hold"]],
        ],
        columns: [
          { key: "name", label: "Order", render: (r) => <span className="mono">{String(r.name)}</span> },
          { key: "customer", label: "Customer" },
          { key: "delivery_date", label: "Deliver by", render: (r) => formatDate(r.delivery_date) },
          { key: "per_picked", label: "Picked", num: true, render: (r) => formatPercent(r.per_picked) },
        ],
        run: async (r) => {
          const pl = await createPickList(String(r.name));
          await navigate({ to: `/sales/pick-lists/${enc(pl.name)}` });
        },
      }}
      columns={[
        { key: "name", label: "Pick list", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "customer", label: "Customer", render: (r) => String(r.customer ?? "—") },
        {
          key: "creation",
          label: "Created",
          render: (r) => formatDate(String(r.creation ?? "").slice(0, 10)),
        },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

/* ======================= Pick List ======================= */

export function PickListPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Pick List", name);
  const reservations = useList<Row>("Stock Reservation Entry", {
    fields: ["name", "item_code", "reserved_qty", "delivered_qty", "status"],
    filters: { from_voucher_type: "Pick List", from_voucher_no: name, docstatus: 1 },
  });
  const reserve = useAction(
    () => docMethod({ doctype: "Pick List", name, docstatus: 1 }, "create_stock_reservation_entries"),
    {
      success: "Picked batches reserved",
    },
  );
  const toDN = useAction(() => createDelivery(name), {
    success: (dn) => `Delivery note ${dn} created as draft`,
    onDone: (dn) => navigate({ to: `/sales/deliveries/${enc(dn)}` }),
  });
  const reserved = (reservations.data?.length ?? 0) > 0;
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Pick Lists", to: "/sales/pick-lists" }]}
      error={error ?? reserve.error ?? toDN.error}
      actions={
        doc?.docstatus === 1 && (
          <>
            {!reserved && can(boot, "Pick List", "write") && (
              <ActionButton
                label="Reserve picked batches"
                icon={<Lock aria-hidden />}
                pending={reserve.isPending}
                onClick={() => reserve.mutate()}
              />
            )}
            {doc.status !== "Completed" && can(boot, "Delivery Note", "create") && (
              <ActionButton
                primary
                label="Create delivery note"
                icon={<Truck aria-hidden />}
                pending={toDN.isPending}
                onClick={() => toDN.mutate()}
              />
            )}
          </>
        )
      }
    >
      {doc && (
        <>
          <Note>
            Picking moves no stock. Batches were chosen by the ERP: released, in date, first expiry first out.
          </Note>
          <Panel title="Locations" flush>
            <ChildTable
              label="Pick locations"
              rows={doc.locations}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "warehouse", label: "Warehouse" },
                {
                  key: "batch_no",
                  label: "Batch",
                  render: (r) => <span className="mono">{String(r.batch_no ?? "—")}</span>,
                },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                { key: "picked_qty", label: "Picked", num: true, render: (r) => formatQty(r.picked_qty) },
                {
                  key: "sales_order",
                  label: "Sales order",
                  render: (r) => <span className="mono">{String(r.sales_order ?? "—")}</span>,
                },
              ]}
            />
          </Panel>
          <Panel title="Reservations" flush>
            <ChildTable
              label="Stock reservations"
              rows={reservations.data}
              columns={[
                {
                  key: "name",
                  label: "Reservation",
                  render: (r) => <span className="mono">{String(r.name)}</span>,
                },
                { key: "item_code", label: "Item" },
                {
                  key: "reserved_qty",
                  label: "Reserved",
                  num: true,
                  render: (r) => formatQty(r.reserved_qty),
                },
                {
                  key: "delivered_qty",
                  label: "Delivered",
                  num: true,
                  render: (r) => formatQty(r.delivered_qty),
                },
                { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Sales Orders",
                doctype: "Sales Order",
                filters: nameIn(childValues(doc.locations, "sales_order")),
                route: (n) => routeFor("Sales Order", n),
              },
              {
                label: "Deliveries",
                doctype: "Delivery Note",
                filters: { pick_list: name },
                route: (n) => routeFor("Delivery Note", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Delivery Notes ======================= */

export function DeliveryList() {
  const navigate = useNavigate();
  return (
    <ListPage<Row>
      title="Deliveries"
      crumbs={[C]}
      doctype="Delivery Note"
      fields={[
        "name",
        "customer",
        "posting_date",
        "lr_no",
        "transporter_name",
        "grand_total",
        "currency",
        "per_billed",
        "status",
        "docstatus",
      ]}
      tabs={[
        { label: "To dispatch", filters: { docstatus: 0 } },
        {
          label: "To bill",
          filters: [
            ["docstatus", "=", 1],
            ["per_billed", "<", 100],
          ],
        },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/sales/deliveries/${enc(String(r.name))}`}
      start={{
        label: "Create delivery",
        title: "Deliver a pick list",
        hint: "Submitted pick lists not yet delivered. Choose one to create its delivery note.",
        doctype: "Pick List",
        fields: ["name", "customer", "creation", "status"],
        filters: [
          ["docstatus", "=", 1],
          ["status", "not in", ["Completed", "Cancelled"]],
        ],
        columns: [
          { key: "name", label: "Pick list", render: (r) => <span className="mono">{String(r.name)}</span> },
          { key: "customer", label: "Customer", render: (r) => String(r.customer ?? "—") },
          { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
        ],
        run: async (r) => {
          const dn = await createDelivery(String(r.name));
          await navigate({ to: `/sales/deliveries/${enc(dn)}` });
        },
      }}
      columns={[
        { key: "name", label: "Delivery", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "customer", label: "Customer" },
        { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
        { key: "transporter_name", label: "Transporter", render: (r) => String(r.transporter_name ?? "—") },
        {
          key: "lr_no",
          label: "LR / AWB",
          render: (r) => <span className="mono">{String(r.lr_no ?? "—")}</span>,
        },
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

function DispatchDetails({ doc }: { doc: Row & { name: string } }) {
  const [f, setF] = useState({
    transporter_name: String(doc.transporter_name ?? ""),
    lr_no: String(doc.lr_no ?? ""),
    lr_date: String(doc.lr_date ?? isoDate()),
    vehicle_no: String(doc.vehicle_no ?? ""),
  });
  useEffect(() => {
    setF({
      transporter_name: String(doc.transporter_name ?? ""),
      lr_no: String(doc.lr_no ?? ""),
      lr_date: String(doc.lr_date ?? isoDate()),
      vehicle_no: String(doc.vehicle_no ?? ""),
    });
  }, [doc.transporter_name, doc.lr_no, doc.lr_date, doc.vehicle_no]);
  const saveIt = useAction(() => setValues("Delivery Note", doc.name, f), {
    success: "Dispatch details saved",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Panel title="Dispatch details">
      <ErrorNote error={saveIt.error} />
      <div className="grid-4">
        <TextField
          label="Transporter"
          required
          value={f.transporter_name}
          onChange={set("transporter_name")}
        />
        <TextField label="LR / AWB no." required value={f.lr_no} onChange={set("lr_no")} />
        <DateField label="LR date" value={f.lr_date} onChange={set("lr_date")} />
        <TextField label="Vehicle no." value={f.vehicle_no} onChange={set("vehicle_no")} />
      </div>
      <div className="form-actions">
        <ActionButton
          label="Save dispatch details"
          pending={saveIt.isPending}
          onClick={() => saveIt.mutate()}
        />
      </div>
    </Panel>
  );
}

function PackingSlip({ dn }: { dn: string }) {
  const slips = useList<Row>("Packing Slip", {
    fields: ["name", "docstatus", "from_case_no", "to_case_no", "net_weight_pkg", "net_weight_uom"],
    filters: { delivery_note: dn, docstatus: ["<", 2] },
  });
  const [weight, setWeight] = useState<number | "">("");
  const make = useAction(
    async () => {
      const draft = await mapDoc<Row>(`${DN_API}.make_packing_slip`, { source_name: dn });
      const items = ((draft.items as Row[]) ?? []).map((r) => ({
        ...r,
        net_weight: weight === "" ? r.net_weight : weight,
      }));
      const ps = await insert({ ...draft, doctype: "Packing Slip", items });
      return submit("Packing Slip", ps.name);
    },
    { success: (ps) => `Packing slip ${ps.name} submitted` },
  );
  const existing = slips.data?.filter((s) => s.docstatus === 1) ?? [];
  return (
    <Panel title="Packing">
      <ErrorNote error={make.error} />
      {existing.length > 0 ? (
        <div className="inline-list">
          {existing.map((s) => (
            <span key={String(s.name)} className="inline-item">
              <Package aria-hidden size={16} />
              <span className="mono">{String(s.name)}</span>
              <span className="dim">
                cases {String(s.from_case_no)}–{String(s.to_case_no ?? s.from_case_no)} ·{" "}
                {formatQty(s.net_weight_pkg, s.net_weight_uom)}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <div className="grid-4 align-end">
          <NumberField label="Net weight per unit" value={weight} onChange={setWeight} unit="kg" />
          <ActionButton
            label="Create packing slip"
            icon={<Package aria-hidden />}
            pending={make.isPending}
            onClick={() => make.mutate()}
          />
        </div>
      )}
    </Panel>
  );
}

export function DeliveryPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Delivery Note", name);
  const dispatch = useAction(() => submit("Delivery Note", name), {
    success: `${name} dispatched; stock has left the warehouse`,
  });
  const invoice = useAction(
    async () => {
      const draft = await mapDoc(`${DN_API}.make_sales_invoice`, { source_name: name });
      return insert({ ...(draft as Row), doctype: "Sales Invoice" });
    },
    {
      success: (si) => `Invoice ${si.name} created as draft`,
      onDone: (si) => navigate({ to: `/accounts/invoices/${enc(si.name)}` }),
    },
  );
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Deliveries", to: "/sales/deliveries" }]}
      error={error ?? dispatch.error ?? invoice.error}
      actions={
        doc && (
          <>
            {doc.docstatus === 0 && can(boot, "Delivery Note", "submit") && (
              <ActionButton
                primary
                label="Dispatch"
                icon={<Truck aria-hidden />}
                pending={dispatch.isPending}
                onClick={() => dispatch.mutate()}
              />
            )}
            {doc.docstatus === 1 && Number(doc.per_billed) < 100 && can(boot, "Sales Invoice", "create") && (
              <ActionButton
                primary
                label="Create invoice"
                icon={<ReceiptIndianRupee aria-hidden />}
                pending={invoice.isPending}
                onClick={() => invoice.mutate()}
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
                ["Customer", <RefLink key="c" doctype="Customer" name={doc.customer} />],
                ["Channel", String(doc.fo_sales_channel ?? "—")],
                ["Posting date", formatDate(doc.posting_date)],
                ["Value", formatMoney(doc.grand_total, String(doc.currency))],
                ["Transporter", String(doc.transporter_name ?? "—")],
                ["LR / AWB", String(doc.lr_no ?? "—")],
                ["Billed", formatPercent(doc.per_billed)],
              ]}
            />
          </Panel>
          {doc.docstatus === 0 && can(boot, "Delivery Note", "write") && <DispatchDetails doc={doc} />}
          {doc.docstatus === 0 && can(boot, "Packing Slip", "create") && <PackingSlip dn={name} />}
          <Panel title="Items" flush>
            <ChildTable
              label="Delivered items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
                { key: "warehouse", label: "From" },
                {
                  key: "batch_no",
                  label: "Batch",
                  render: (r) => (
                    <span className="mono">
                      {String(r.batch_no || (r.serial_and_batch_bundle ? "in bundle" : "—"))}
                    </span>
                  ),
                },
                {
                  key: "against_sales_order",
                  label: "Sales order",
                  render: (r) => <RefLink doctype="Sales Order" name={r.against_sales_order} />,
                },
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Sales Orders",
                doctype: "Sales Order",
                filters: nameIn(childValues(doc.items, "against_sales_order")),
                route: (n) => routeFor("Sales Order", n),
              },
              {
                label: "Pick List",
                doctype: "Pick List",
                filters: nameIn(doc.pick_list ? [String(doc.pick_list)] : []),
                route: (n) => routeFor("Pick List", n),
              },
              {
                label: "Packing Slips",
                doctype: "Packing Slip",
                filters: { delivery_note: name },
              },
              {
                label: "Sales Invoices",
                doctype: "Sales Invoice",
                filters: [["Sales Invoice Item", "delivery_note", "=", name]],
                route: (n) => routeFor("Sales Invoice", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

export function AvailableToSellReport() {
  const boot = useSession();
  return <ReportView report="Available to Sell" crumbs={[C]} filters={{ company: boot.company }} />;
}

export function DispatchRegister() {
  const boot = useSession();
  return (
    <ReportView
      report="Dispatch Register"
      crumbs={[C]}
      filters={{ company: boot.company, from_date: isoDate(new Date(), -30), to_date: isoDate() }}
      note={<Note>Last 30 days.</Note>}
    />
  );
}
