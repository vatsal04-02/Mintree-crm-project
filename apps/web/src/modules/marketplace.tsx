import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { PlugZap, RefreshCw, Scale, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { call, type Doc, docMethod, get, getDoc, insert, type Row, save } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import { DataTable } from "@/components/DataTable";
import {
  ActionButton,
  ChildTable,
  DocFrame,
  ListPage,
  RefLink,
  RowsEditor,
  useAction,
  useDoc,
} from "@/components/doc";
import {
  DateField,
  DateTimeField,
  LinkField,
  NumberField,
  SelectField,
  TextField,
} from "@/components/fields";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, isoDate } from "@/lib/format";

const C = { label: "Marketplaces" };
const enc = encodeURIComponent;
const API = "factory_ops.api.marketplace";
const CHANNELS = ["Amazon", "Flipkart", "Myntra", "Nykaa"];
const stateTone = (s: string) =>
  s === "Connected"
    ? ("released" as const)
    : s === "Error"
      ? ("rejected" as const)
      : s === "Synchronising"
        ? ("progress" as const)
        : ("hold" as const);

type Overview = {
  channels: Row[];
  per_channel: Record<
    string,
    { orders: number; pending: number; failed: number; cancelled: number; returned: number; sales: number }
  >;
  listings: Row[];
  returns: Row[];
  settlements: Row[] | null;
};

/* ---------------------------------------------------------------- Overview */

export function MarketplaceOverview() {
  const boot = useSession();
  const { data, error } = useQuery({
    queryKey: ["mkt-overview"],
    queryFn: () => get<Overview>(`${API}.overview`),
  });
  const cur = boot.currency ?? "INR";
  const listingBy = (ch: string, st: string) =>
    (data?.listings ?? [])
      .filter((l) => l.channel === ch && l.sync_status === st)
      .reduce((s, l) => s + Number(l.n), 0);
  const returnsBy = (ch: string) =>
    (data?.returns ?? [])
      .filter((r) => r.channel === ch && r.status !== "Rejected")
      .reduce((s, r) => s + Number(r.n), 0);
  const settleBy = (ch: string, st: string) =>
    (data?.settlements ?? [])
      .filter((r) => r.channel === ch && r.reconciliation_status === st)
      .reduce((s, r) => s + Number(r.n), 0);
  const totals = Object.values(data?.per_channel ?? {}).reduce(
    (a, p) => ({
      orders: a.orders + (p.orders ?? 0),
      pending: a.pending + (p.pending ?? 0),
      failed: a.failed + (p.failed ?? 0),
      sales: a.sales + (p.sales ?? 0),
    }),
    { orders: 0, pending: 0, failed: 0, sales: 0 },
  );
  return (
    <div className="page">
      <PageHeader
        title="Marketplaces"
        crumbs={[C]}
        meta={
          <span>
            Amazon, Flipkart, Myntra, Nykaa · from marketplace order, listing and settlement records
          </span>
        }
      />
      <ErrorNote error={error} />
      <Note tone="hold">
        No marketplace is connected. Each channel shows its real state; nothing is sent to or read from a
        marketplace until its credentials or partner access exist and a live connection test succeeds. Orders
        here are entered by hand, imported from files, or DEMO records.
      </Note>
      {data && (
        <>
          <div className="kpi-strip">
            <div className="kpi">
              <span className="kpi-label">Marketplace orders</span>
              <span className="kpi-value">{totals.orders}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Pending (new / accepted)</span>
              <span className="kpi-value">{totals.pending}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Failed imports</span>
              <span className="kpi-value">{totals.failed}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Order value (not cancelled)</span>
              <span className="kpi-value">{formatMoney(totals.sales, cur)}</span>
            </div>
          </div>
          <Panel title="Channels">
            <DataTable<Row>
              label="Channels"
              rowKey={(r) => String(r.name)}
              rows={data.channels}
              columns={[
                {
                  key: "name",
                  label: "Channel",
                  render: (r) => (
                    <Link to={`/marketplace/channels/${enc(String(r.name))}`}>{String(r.name)}</Link>
                  ),
                },
                {
                  key: "connection_state",
                  label: "Connection",
                  render: (r) => (
                    <StatusChip
                      status={String(r.connection_state)}
                      tone={stateTone(String(r.connection_state))}
                    />
                  ),
                },
                {
                  key: "allocation_percent",
                  label: "Stock share",
                  num: true,
                  render: (r) => `${Number(r.allocation_percent ?? 0)}%`,
                },
                {
                  key: "orders",
                  label: "Orders",
                  num: true,
                  render: (r) => data.per_channel[String(r.name)]?.orders ?? 0,
                  sortValue: (r) => data.per_channel[String(r.name)]?.orders ?? 0,
                },
                {
                  key: "pending",
                  label: "Pending",
                  num: true,
                  render: (r) => data.per_channel[String(r.name)]?.pending ?? 0,
                },
                {
                  key: "failed",
                  label: "Failed",
                  num: true,
                  render: (r) => data.per_channel[String(r.name)]?.failed ?? 0,
                },
                {
                  key: "cancelled",
                  label: "Cancelled",
                  num: true,
                  render: (r) => data.per_channel[String(r.name)]?.cancelled ?? 0,
                },
                { key: "returns", label: "Returns", num: true, render: (r) => returnsBy(String(r.name)) },
                {
                  key: "sales",
                  label: "Order value",
                  num: true,
                  render: (r) => formatMoney(data.per_channel[String(r.name)]?.sales ?? 0, cur),
                },
                {
                  key: "listings",
                  label: "Inventory sync (listings)",
                  render: (r) => {
                    const n = String(r.name);
                    const synced = listingBy(n, "Synced");
                    const notSent = listingBy(n, "Not sent");
                    const failed = listingBy(n, "Failed");
                    return synced + notSent + failed === 0 ? (
                      <span className="dim">no listings</span>
                    ) : (
                      `${synced} synced · ${notSent} not sent${failed ? ` · ${failed} failed` : ""}`
                    );
                  },
                },
                ...(data.settlements
                  ? [
                      {
                        key: "settle",
                        label: "Settlements",
                        render: (r: Row) => {
                          const n = String(r.name);
                          const m = settleBy(n, "Matched");
                          const d = settleBy(n, "Difference");
                          const u = settleBy(n, "Not reconciled");
                          return m + d + u === 0 ? (
                            <span className="dim">none</span>
                          ) : (
                            `${m} matched · ${d} difference · ${u} open`
                          );
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Orders */

export function OrderList() {
  return (
    <ListPage<Row>
      title="Marketplace Orders"
      crumbs={[C]}
      doctype="Marketplace Order"
      fields={[
        "name",
        "channel",
        "external_order_id",
        "order_date",
        "order_status",
        "payment_status",
        "order_total",
        "import_status",
        "sales_order",
        "is_demo",
      ]}
      searchFields={["name", "external_order_id", "customer_name"]}
      orderBy="order_date desc"
      tabs={[
        {
          label: "To process",
          filters: [
            ["order_status", "in", ["New", "Accepted"]],
            ["import_status", "!=", "Sales order created"],
          ],
        },
        { label: "Failed", filters: { import_status: "Failed" } },
        ...CHANNELS.map((c) => ({ label: c, filters: { channel: c } })),
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketplace/orders/${enc(String(r.name))}`}
      create="/marketplace/orders/new"
      createLabel="Enter order"
      columns={[
        {
          key: "external_order_id",
          label: "Order ID",
          render: (r) => <span className="mono">{String(r.external_order_id)}</span>,
        },
        { key: "channel", label: "Channel" },
        { key: "order_date", label: "Ordered", render: (r) => formatDateTime(r.order_date) },
        {
          key: "order_status",
          label: "Status",
          render: (r) => <StatusChip status={String(r.order_status)} />,
        },
        { key: "payment_status", label: "Payment" },
        { key: "order_total", label: "Total", num: true, render: (r) => formatMoney(r.order_total) },
        {
          key: "import_status",
          label: "ERPNext",
          render: (r) => (
            <StatusChip
              status={String(r.import_status)}
              tone={
                r.import_status === "Failed"
                  ? "rejected"
                  : r.import_status === "Received"
                    ? "hold"
                    : "released"
              }
            />
          ),
        },
      ]}
    />
  );
}

type OItem = { marketplace_sku: string; qty: number | ""; rate: number | "" };

export function OrderNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    channel: "Amazon",
    external_order_id: "",
    order_date: "",
    payment_status: "Prepaid",
    customer_name: "",
    ship_to_city: "",
    ship_to_state: "",
  });
  const [items, setItems] = useState<OItem[]>([{ marketplace_sku: "", qty: 1, rate: "" }]);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () =>
      insert({
        doctype: "Marketplace Order",
        ...f,
        order_date: f.order_date || undefined,
        items: items.filter((i) => i.marketplace_sku),
      }),
    {
      success: (d) => `Recorded ${d.name}`,
      onDone: (d) => navigate({ to: `/marketplace/orders/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="Enter marketplace order"
        crumbs={[C, { label: "Orders", to: "/marketplace/orders" }]}
      />
      <Note>
        For orders taken from a seller portal by hand. The same order ID on the same channel is refused, so an
        order is never entered twice.
      </Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Order">
          <div className="grid-2">
            <SelectField label="Channel" value={f.channel} onChange={set("channel")} options={CHANNELS} />
            <TextField
              label="Marketplace order ID"
              required
              value={f.external_order_id}
              onChange={set("external_order_id")}
            />
            <DateTimeField label="Ordered at" required value={f.order_date} onChange={set("order_date")} />
            <SelectField
              label="Payment"
              value={f.payment_status}
              onChange={set("payment_status")}
              options={["Prepaid", "Cash on delivery", "Pending"]}
            />
            <TextField
              label="Buyer (as shown by the channel)"
              value={f.customer_name}
              onChange={set("customer_name")}
            />
            <TextField label="Ship-to city" value={f.ship_to_city} onChange={set("ship_to_city")} />
          </div>
        </Panel>
        <Panel title="Items">
          <RowsEditor
            rows={items as unknown as Row[]}
            onChange={(r) => setItems(r as unknown as OItem[])}
            blank={() => ({ marketplace_sku: "", qty: 1, rate: "" })}
            addLabel="Add item"
            cols={[
              { field: "marketplace_sku", label: "Marketplace SKU", type: "text", required: true },
              { field: "qty", label: "Qty", type: "number", required: true },
              { field: "rate", label: "Rate", type: "number" },
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.external_order_id || !f.order_date}
          >
            Record order
          </button>
        </div>
      </form>
    </div>
  );
}

export function OrderPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Marketplace Order", name);
  const make = useAction(() => docMethod<string>(doc as Doc, "make_sales_order", { company: boot.company }), {
    success: (so) => `Sales order ${so} created (channel D2C Marketplace)`,
    onDone: () => refetch(),
  });
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: String(doc.order_status) } as Doc) : undefined}
      title={String(doc?.external_order_id ?? name)}
      crumbs={[C, { label: "Orders", to: "/marketplace/orders" }]}
      error={error ?? make.error}
      actions={
        doc &&
        !doc.sales_order &&
        doc.order_status !== "Cancelled" &&
        can(boot, "Sales Order", "create") &&
        can(boot, "Marketplace Order", "write") && (
          <ActionButton
            primary
            label="Create sales order"
            icon={<ShoppingBag aria-hidden />}
            pending={make.isPending}
            onClick={() => make.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          {doc.is_demo ? (
            <Note tone="hold">
              DEMO - NOT REAL. Synthetic order; it was never received from or sent to a marketplace.
            </Note>
          ) : null}
          <Panel>
            <Facts
              items={[
                ["Channel", String(doc.channel)],
                ["Record", name],
                ["Ordered", formatDateTime(doc.order_date)],
                ["Status", String(doc.order_status)],
                ["Fulfilment", String(doc.fulfilment_status)],
                ["Payment", String(doc.payment_status)],
                ["Buyer", String(doc.customer_name || "—")],
                ["Ship to", [doc.ship_to_city, doc.ship_to_state].filter(Boolean).join(", ") || "—"],
                ["Total", formatMoney(doc.order_total)],
                ["Source", String(doc.source)],
                [
                  "ERPNext sales order",
                  doc.sales_order ? <RefLink key="so" doctype="Sales Order" name={doc.sales_order} /> : "—",
                ],
                ["Import error", String(doc.import_error || "—")],
              ]}
            />
          </Panel>
          <Panel title="Items">
            <ChildTable
              label="Items"
              rows={doc.items}
              columns={[
                {
                  key: "marketplace_sku",
                  label: "Marketplace SKU",
                  render: (r) => <span className="mono">{String(r.marketplace_sku)}</span>,
                },
                {
                  key: "item_code",
                  label: "ERPNext item",
                  render: (r) =>
                    r.item_code ? (
                      <span className="mono">{String(r.item_code)}</span>
                    ) : (
                      <span className="text-hold">no listing</span>
                    ),
                },
                { key: "qty", label: "Qty", num: true },
                { key: "rate", label: "Rate", num: true, render: (r) => formatMoney(r.rate) },
                { key: "amount", label: "Amount", num: true, render: (r) => formatMoney(r.amount) },
              ]}
            />
          </Panel>
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Listings */

export function ListingList() {
  return (
    <ListPage<Row>
      title="Product Listings"
      crumbs={[C]}
      doctype="Marketplace Listing"
      fields={[
        "name",
        "channel",
        "item_code",
        "item_name",
        "marketplace_sku",
        "listing_id",
        "channel_price",
        "published_qty",
        "sync_status",
        "active",
      ]}
      searchFields={["marketplace_sku", "item_code", "listing_id"]}
      tabs={[
        { label: "Active", filters: { active: 1 } },
        ...CHANNELS.map((c) => ({ label: c, filters: { channel: c } })),
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketplace/listings/${enc(String(r.name))}`}
      create="/marketplace/listings/new"
      createLabel="New listing"
      note={
        <Note>
          One ERPNext item can be listed on every channel; each channel's SKU maps back to that single item,
          so no duplicate items are created.
        </Note>
      }
      columns={[
        { key: "channel", label: "Channel" },
        {
          key: "marketplace_sku",
          label: "Marketplace SKU",
          render: (r) => <span className="mono">{String(r.marketplace_sku)}</span>,
        },
        {
          key: "item_code",
          label: "ERPNext item",
          render: (r) => (
            <span>
              {String(r.item_code)} <span className="dim">{String(r.item_name ?? "")}</span>
            </span>
          ),
        },
        {
          key: "channel_price",
          label: "Channel price",
          num: true,
          render: (r) => (r.channel_price ? formatMoney(r.channel_price) : "—"),
        },
        { key: "published_qty", label: "To publish", num: true },
        {
          key: "sync_status",
          label: "Inventory sync",
          render: (r) => (
            <StatusChip
              status={String(r.sync_status)}
              tone={
                r.sync_status === "Synced" ? "released" : r.sync_status === "Failed" ? "rejected" : "neutral"
              }
            />
          ),
        },
      ]}
    />
  );
}

export function ListingNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    channel: "Amazon",
    item_code: "",
    marketplace_sku: "",
    listing_id: "",
    listing_title: "",
  });
  const [price, setPrice] = useState<number | "">("");
  const [mrp, setMrp] = useState<number | "">("");
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () =>
      insert({
        doctype: "Marketplace Listing",
        ...f,
        channel_price: price === "" ? undefined : price,
        channel_mrp: mrp === "" ? undefined : mrp,
      }),
    {
      success: (d) => `Saved listing ${d.name}`,
      onDone: () => navigate({ to: "/marketplace/listings" }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="New listing" crumbs={[C, { label: "Listings", to: "/marketplace/listings" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Listing">
          <div className="grid-2">
            <SelectField label="Channel" value={f.channel} onChange={set("channel")} options={CHANNELS} />
            <LinkField
              label="ERPNext item"
              doctype="Item"
              filters={{ is_sales_item: 1, disabled: 0, has_variants: 0 }}
              required
              value={f.item_code}
              onChange={set("item_code")}
            />
            <TextField
              label="Marketplace SKU"
              required
              value={f.marketplace_sku}
              onChange={set("marketplace_sku")}
            />
            <TextField
              label="Listing ID (ASIN / FSN / style ID)"
              value={f.listing_id}
              onChange={set("listing_id")}
            />
            <NumberField label="Channel price" unit="INR" value={price} onChange={setPrice} />
            <NumberField label="Channel MRP" unit="INR" value={mrp} onChange={setMrp} />
          </div>
          <TextField label="Title on the channel" value={f.listing_title} onChange={set("listing_title")} />
        </Panel>
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || !f.item_code || !f.marketplace_sku}
          >
            Save listing
          </button>
        </div>
      </form>
    </div>
  );
}

export function ListingPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const { data: doc, error } = useDoc("Marketplace Listing", name);
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: doc.active ? "Active" : "Inactive" } as Doc) : undefined}
      title={String(doc?.marketplace_sku ?? name)}
      crumbs={[C, { label: "Listings", to: "/marketplace/listings" }]}
      error={error}
    >
      {doc && (
        <Panel>
          <Facts
            items={[
              ["Channel", String(doc.channel)],
              ["ERPNext item", `${String(doc.item_code)} · ${String(doc.item_name ?? "")}`],
              ["Listing ID", String(doc.listing_id || "—")],
              ["Title", String(doc.listing_title || "—")],
              ["Channel price", doc.channel_price ? formatMoney(doc.channel_price) : "—"],
              ["Channel MRP", doc.channel_mrp ? formatMoney(doc.channel_mrp) : "—"],
              ["To publish", String(doc.published_qty ?? 0)],
              ["Inventory sync", String(doc.sync_status)],
              ["Last sync", formatDateTime(doc.last_inventory_sync)],
              ["Last error", String(doc.sync_error || "—")],
            ]}
          />
        </Panel>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Inventory allocation */

type AllocRow = {
  item_code: string;
  item_name: string;
  available_to_sell: number;
  published_total: number;
  kept_back: number;
  channels: { channel: string; publish_qty: number; share_percent: number }[];
};

export function InventoryAllocation() {
  const boot = useSession();
  const { data, error, refetch, isLoading } = useQuery({
    queryKey: ["mkt-alloc", boot.company],
    queryFn: () => get<AllocRow[]>(`${API}.inventory_allocation`, { company: boot.company }),
  });
  const refresh = useAction(
    () => call<number>(`${API}.refresh_published_quantities`, { company: boot.company }),
    { success: (n) => `${n} listings updated`, onDone: () => refetch() },
  );
  const rows = (data ?? []).map((r) => ({
    ...r,
    ...Object.fromEntries(r.channels.map((c) => [`ch_${c.channel}`, c.publish_qty])),
  }));
  return (
    <div className="page">
      <PageHeader
        title="Inventory to publish"
        crumbs={[C]}
        meta={<span>available to sell × channel share − safety stock</span>}
        actions={
          can(boot, "Marketplace Listing", "write") && (
            <ActionButton
              label="Store quantities on listings"
              icon={<RefreshCw aria-hidden />}
              pending={refresh.isPending}
              onClick={() => refresh.mutate()}
            />
          )
        }
      />
      <Note>
        Available to sell is the enforced figure: released by QC, in a usable store, in date, above the
        minimum shelf life, not reserved or picked. Channel shares add up to at most 100 %, so a unit is
        offered on one marketplace at most. Nothing is sent: no channel is connected.
      </Note>
      <ErrorNote error={error ?? refresh.error} />
      <div className="panel">
        <DataTable<Row>
          label="Inventory to publish"
          rowKey={(r) => String(r.item_code)}
          rows={rows as unknown as Row[]}
          loading={isLoading}
          empty={{
            title: "No active listings",
            reason:
              "List items on a channel first; their quantities are worked out from available-to-sell stock.",
            actions: [{ label: "New listing", to: "/marketplace/listings/new", primary: true }],
          }}
          columns={[
            {
              key: "item_code",
              label: "Item",
              render: (r) => (
                <span>
                  {String(r.item_code)} <span className="dim">{String(r.item_name ?? "")}</span>
                </span>
              ),
            },
            { key: "available_to_sell", label: "Available to sell", num: true },
            ...CHANNELS.map((c) => ({
              key: `ch_${c}`,
              label: c,
              num: true,
              render: (r: Row) =>
                r[`ch_${c}`] === undefined ? <span className="dim">not listed</span> : String(r[`ch_${c}`]),
            })),
            { key: "published_total", label: "Published in total", num: true },
            { key: "kept_back", label: "Kept back", num: true },
          ]}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Returns and settlements */

export function ReturnList() {
  return (
    <ListPage<Row>
      title="Marketplace Returns"
      crumbs={[C]}
      doctype="Marketplace Return"
      fields={[
        "name",
        "channel",
        "marketplace_order",
        "external_return_id",
        "return_type",
        "reason",
        "status",
        "refund_amount",
      ]}
      searchFields={["name", "external_return_id", "marketplace_order"]}
      tabs={[
        { label: "Open", filters: [["status", "in", ["Requested", "In transit", "Received"]]] },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketplace/returns/${enc(String(r.name))}`}
      columns={[
        {
          key: "external_return_id",
          label: "Return ID",
          render: (r) => <span className="mono">{String(r.external_return_id)}</span>,
        },
        { key: "channel", label: "Channel" },
        { key: "return_type", label: "Type" },
        { key: "reason", label: "Reason" },
        {
          key: "refund_amount",
          label: "Refund",
          num: true,
          render: (r) => (r.refund_amount ? formatMoney(r.refund_amount) : "—"),
        },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function ReturnPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const { data: doc, error } = useDoc("Marketplace Return", name);
  return (
    <DocFrame
      doc={doc}
      title={String(doc?.external_return_id ?? name)}
      crumbs={[C, { label: "Returns", to: "/marketplace/returns" }]}
      error={error}
    >
      {doc && (
        <Panel>
          <Facts
            items={[
              ["Channel", String(doc.channel)],
              ["Order", <RefLink key="o" doctype="Marketplace Order" name={doc.marketplace_order} />],
              ["Type", String(doc.return_type)],
              ["Reason", String(doc.reason)],
              ["Refund", doc.refund_amount ? formatMoney(doc.refund_amount) : "—"],
              ["Received into", String(doc.received_into || "—")],
              ["Notes", String(doc.notes || "—")],
            ]}
          />
        </Panel>
      )}
    </DocFrame>
  );
}

export function SettlementList() {
  return (
    <ListPage<Row>
      title="Settlements"
      crumbs={[C]}
      doctype="Marketplace Settlement"
      fields={[
        "name",
        "channel",
        "settlement_id",
        "period_from",
        "period_to",
        "gross_sales",
        "net_payout",
        "reconciliation_status",
      ]}
      searchFields={["name", "settlement_id"]}
      tabs={[
        { label: "To reconcile", filters: [["reconciliation_status", "!=", "Matched"]] },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketplace/settlements/${enc(String(r.name))}`}
      create="/marketplace/settlements/new"
      createLabel="Enter settlement"
      columns={[
        {
          key: "settlement_id",
          label: "Settlement",
          render: (r) => <span className="mono">{String(r.settlement_id)}</span>,
        },
        { key: "channel", label: "Channel" },
        {
          key: "period_from",
          label: "Period",
          render: (r) => `${formatDate(r.period_from)} – ${formatDate(r.period_to)}`,
        },
        { key: "gross_sales", label: "Gross", num: true, render: (r) => formatMoney(r.gross_sales) },
        { key: "net_payout", label: "Net payout", num: true, render: (r) => formatMoney(r.net_payout) },
        {
          key: "reconciliation_status",
          label: "Reconciliation",
          render: (r) => (
            <StatusChip
              status={String(r.reconciliation_status)}
              tone={
                r.reconciliation_status === "Matched"
                  ? "released"
                  : r.reconciliation_status === "Difference"
                    ? "rejected"
                    : "hold"
              }
            />
          ),
        },
      ]}
    />
  );
}

export function SettlementNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    channel: "Amazon",
    settlement_id: "",
    period_from: isoDate(new Date(), -14),
    period_to: isoDate(),
    payout_date: isoDate(),
  });
  const [m, setM] = useState<Record<string, number | "">>({
    gross_sales: "",
    commission: "",
    fees: "",
    shipping_fees: "",
    refunds: "",
    tax_withheld: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const setMoney = (k: string) => (v: number | "") => setM({ ...m, [k]: v });
  const create = useAction(
    () =>
      insert({
        doctype: "Marketplace Settlement",
        ...f,
        ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== "")),
      }),
    {
      success: (d) => `Saved ${d.name}`,
      onDone: (d) => navigate({ to: `/marketplace/settlements/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader
        title="Enter settlement statement"
        crumbs={[C, { label: "Settlements", to: "/marketplace/settlements" }]}
      />
      <Note>
        Figures as printed on the marketplace's settlement statement. Net payout is gross less the deductions
        when not entered.
      </Note>
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Statement">
          <div className="grid-2">
            <SelectField label="Channel" value={f.channel} onChange={set("channel")} options={CHANNELS} />
            <TextField
              label="Settlement / payout ID"
              required
              value={f.settlement_id}
              onChange={set("settlement_id")}
            />
            <DateField label="Period from" value={f.period_from} onChange={set("period_from")} />
            <DateField label="Period to" value={f.period_to} onChange={set("period_to")} />
            <DateField label="Payout date" value={f.payout_date} onChange={set("payout_date")} />
          </div>
        </Panel>
        <Panel title="Amounts">
          <div className="grid-3">
            {(
              [
                ["gross_sales", "Gross sales"],
                ["commission", "Commission"],
                ["fees", "Fixed / closing fees"],
                ["shipping_fees", "Shipping fees"],
                ["refunds", "Refunds"],
                ["tax_withheld", "Tax withheld (TCS / TDS)"],
              ] as [string, string][]
            ).map(([k, l]) => (
              <NumberField key={k} label={l} unit="INR" value={m[k] ?? ""} onChange={setMoney(k)} />
            ))}
          </div>
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !f.settlement_id}>
            Save statement
          </button>
        </div>
      </form>
    </div>
  );
}

export function SettlementPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Marketplace Settlement", name);
  const rec = useAction(() => docMethod<string>(doc as Doc, "reconcile"), {
    success: (s) => `Reconciliation: ${s}`,
    onDone: () => refetch(),
  });
  const cur = boot.currency ?? "INR";
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: String(doc.reconciliation_status) } as Doc) : undefined}
      title={String(doc?.settlement_id ?? name)}
      crumbs={[C, { label: "Settlements", to: "/marketplace/settlements" }]}
      error={error ?? rec.error}
      actions={
        can(boot, "Marketplace Settlement", "write") && (
          <ActionButton
            primary
            label="Reconcile with ERPNext"
            icon={<Scale aria-hidden />}
            pending={rec.isPending}
            onClick={() => rec.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          {doc.is_demo ? <Note tone="hold">DEMO - NOT REAL. Synthetic settlement statement.</Note> : null}
          <Panel>
            <Facts
              items={[
                ["Channel", String(doc.channel)],
                ["Period", `${formatDate(doc.period_from)} – ${formatDate(doc.period_to)}`],
                ["Payout date", formatDate(doc.payout_date)],
                ["Gross sales", formatMoney(doc.gross_sales, cur)],
                ["Commission", formatMoney(doc.commission, cur)],
                ["Fees", formatMoney(doc.fees, cur)],
                ["Shipping fees", formatMoney(doc.shipping_fees, cur)],
                ["Refunds", formatMoney(doc.refunds, cur)],
                ["Tax withheld", formatMoney(doc.tax_withheld, cur)],
                ["Net payout", formatMoney(doc.net_payout, cur)],
                ["Invoiced in ERPNext", formatMoney(doc.erp_invoiced, cur)],
                ["Difference", formatMoney(doc.difference, cur)],
                ["Reconciled at", formatDateTime(doc.reconciled_at)],
              ]}
            />
          </Panel>
          <Note>
            Reconciliation compares the statement's gross sales with submitted ERPNext sales invoices for this
            channel's orders placed in the period.
          </Note>
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Channel settings */

export function ChannelPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Marketplace Channel", name);
  const [share, setShare] = useState<number | "">("");
  const [safety, setSafety] = useState<number | "">("");
  const [customer, setCustomer] = useState("");
  const [cred, setCred] = useState({
    seller_id: "",
    marketplace_region: "",
    client_id: "",
    client_secret: "",
    refresh_token: "",
    webhook_secret: "",
  });
  const writable = can(boot, "Marketplace Channel", "write");
  const saveSettings = useAction(
    async () => {
      const fresh = await getDoc("Marketplace Channel", name);
      const credentials = Object.fromEntries(Object.entries(cred).filter(([, v]) => v !== ""));
      return save({
        ...fresh,
        ...(share !== "" ? { allocation_percent: share } : {}),
        ...(safety !== "" ? { safety_stock: safety } : {}),
        ...(customer ? { default_customer: customer } : {}),
        ...credentials,
      } as Doc);
    },
    {
      success: "Saved; the connection state is worked out by the server",
      onDone: () => {
        setCred({
          seller_id: "",
          marketplace_region: "",
          client_id: "",
          client_secret: "",
          refresh_token: "",
          webhook_secret: "",
        });
        refetch();
      },
    },
  );
  const test = useAction(() => call<Row>(`${API}.test_connection`, { channel: name }), {
    success: (r) => `Connection test: ${String(r.status)}`,
    onDone: () => refetch(),
  });
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: String(doc.connection_state) } as Doc) : undefined}
      title={name}
      crumbs={[C, { label: "Overview", to: "/marketplace" }]}
      error={error ?? saveSettings.error ?? test.error}
      actions={
        writable && (
          <ActionButton
            label="Test connection"
            icon={<PlugZap aria-hidden />}
            pending={test.isPending}
            onClick={() => test.mutate()}
          />
        )
      }
    >
      {doc && (
        <>
          <Panel>
            <Facts
              items={[
                ["Connector", String(doc.provider)],
                [
                  "Connection",
                  <StatusChip
                    key="s"
                    status={String(doc.connection_state)}
                    tone={stateTone(String(doc.connection_state))}
                  />,
                ],
                ["What access needs", String(doc.access_note || "—")],
                ["Stock share", `${Number(doc.allocation_percent ?? 0)}%`],
                ["Safety stock", String(doc.safety_stock ?? 0)],
                ["Orders' customer", String(doc.default_customer || "—")],
                ["Seller ID", String(doc.seller_id || "—")],
                ["Client ID", String(doc.client_id || "—")],
                ["Secrets stored", "never shown here"],
                ["Last test", formatDateTime(doc.last_tested_at)],
                ["Last success", formatDateTime(doc.last_success_at)],
                ["Last error", String(doc.last_error || "—")],
              ]}
            />
          </Panel>
          {test.data && (
            <Note tone={test.data.status === "Succeeded" ? "info" : "hold"}>
              {String(test.data.status)}: {String(test.data.message ?? test.data.error ?? "")}
            </Note>
          )}
          {writable && (
            <Panel title="Settings and credentials">
              <div className="grid-3">
                <NumberField
                  label="Stock share"
                  unit="%"
                  value={share}
                  onChange={setShare}
                  hint={`now ${Number(doc.allocation_percent ?? 0)}%`}
                />
                <NumberField label="Safety stock" value={safety} onChange={setSafety} />
                <LinkField
                  label="Customer for orders"
                  doctype="Customer"
                  value={customer}
                  onChange={setCustomer}
                />
                <TextField
                  label="Seller / partner ID"
                  value={cred.seller_id}
                  onChange={(v) => setCred({ ...cred, seller_id: v })}
                />
                <TextField
                  label="Marketplace / region ID"
                  value={cred.marketplace_region}
                  onChange={(v) => setCred({ ...cred, marketplace_region: v })}
                />
                <TextField
                  label="Client ID"
                  value={cred.client_id}
                  onChange={(v) => setCred({ ...cred, client_id: v })}
                />
                <TextField
                  label="Client secret (write only)"
                  value={cred.client_secret}
                  onChange={(v) => setCred({ ...cred, client_secret: v })}
                />
                <TextField
                  label="Refresh token (write only)"
                  value={cred.refresh_token}
                  onChange={(v) => setCred({ ...cred, refresh_token: v })}
                />
                <TextField
                  label="Webhook secret (write only)"
                  value={cred.webhook_secret}
                  onChange={(v) => setCred({ ...cred, webhook_secret: v })}
                />
              </div>
              <div className="form-actions">
                <ActionButton
                  primary
                  label="Save settings"
                  pending={saveSettings.isPending}
                  onClick={() => saveSettings.mutate()}
                />
              </div>
            </Panel>
          )}
          <SyncLog channel={name} />
        </>
      )}
    </DocFrame>
  );
}

function SyncLog({ channel }: { channel: string }) {
  const { data } = useQuery({
    queryKey: ["mkt-log", channel],
    queryFn: () =>
      get<Row[]>("frappe.client.get_list", {
        doctype: "Marketplace Sync Log",
        filters: JSON.stringify({ channel }),
        fields: JSON.stringify([
          "name",
          "operation",
          "status",
          "attempts",
          "finished_at",
          "message",
          "error",
        ]),
        order_by: "creation desc",
        limit_page_length: 20,
      }),
  });
  return (
    <Panel title="Synchronisation log (last 20)">
      <DataTable<Row>
        label="Sync log"
        rowKey={(r) => String(r.name)}
        rows={data}
        empty={{
          title: "Nothing has been attempted with this channel",
          reason:
            "Connection tests, inventory pushes and order downloads are logged here, including those refused for missing access.",
        }}
        columns={[
          { key: "finished_at", label: "When", render: (r) => formatDateTime(r.finished_at) },
          { key: "operation", label: "Operation" },
          {
            key: "status",
            label: "Result",
            render: (r) => (
              <StatusChip
                status={String(r.status)}
                tone={r.status === "Succeeded" ? "released" : r.status === "Failed" ? "rejected" : "hold"}
              />
            ),
          },
          { key: "attempts", label: "Attempts", num: true },
          {
            key: "message",
            label: "Detail",
            render: (r) => <span className="dim">{String(r.error || r.message || "")}</span>,
          },
        ]}
      />
    </Panel>
  );
}
