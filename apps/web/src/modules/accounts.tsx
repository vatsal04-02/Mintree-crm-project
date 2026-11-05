import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Send, Wallet } from "lucide-react";
import { useState } from "react";
import { type Doc, insert, mapDoc, type Row, submit } from "@/api/frappe";
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
  useAction,
  useDoc,
} from "@/components/doc";
import { DateField, LinkField, NumberField, TextField } from "@/components/fields";
import { ReportView } from "@/components/ReportView";
import { ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { putDraft, takeDraft } from "@/lib/drafts";
import { formatDate, formatMoney, formatQty, isoDate } from "@/lib/format";
import { routeFor } from "@/nav";

const C = { label: "Accounts" };
const PE_API = "erpnext.accounts.doctype.payment_entry.payment_entry";
const enc = encodeURIComponent;
const DN_API = "erpnext.stock.doctype.delivery_note.delivery_note";

/* ======================= Sales Invoices ======================= */

export function InvoiceList() {
  const navigate = useNavigate();
  return (
    <ListPage<Row>
      title="Sales Invoices"
      crumbs={[C]}
      doctype="Sales Invoice"
      fields={[
        "name",
        "customer",
        "posting_date",
        "due_date",
        "grand_total",
        "outstanding_amount",
        "currency",
        "status",
        "docstatus",
      ]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        {
          label: "Outstanding",
          filters: [
            ["docstatus", "=", 1],
            ["outstanding_amount", ">", 0],
          ],
        },
        {
          label: "Overdue",
          filters: [
            ["docstatus", "=", 1],
            ["outstanding_amount", ">", 0],
            ["due_date", "<", isoDate()],
          ],
        },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/accounts/invoices/${enc(String(r.name))}`}
      start={{
        label: "Create invoice",
        title: "Invoice a delivery",
        hint: "Dispatched deliveries not yet fully billed. Invoices start from the delivery, so stock leaves only once.",
        doctype: "Delivery Note",
        fields: ["name", "customer", "posting_date", "grand_total", "currency", "per_billed"],
        filters: [
          ["docstatus", "=", 1],
          ["per_billed", "<", 100],
          ["status", "!=", "Closed"],
        ],
        columns: [
          { key: "name", label: "Delivery", render: (r) => <span className="mono">{String(r.name)}</span> },
          { key: "customer", label: "Customer" },
          { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
          {
            key: "grand_total",
            label: "Value",
            num: true,
            render: (r) => formatMoney(r.grand_total, String(r.currency)),
          },
        ],
        run: async (r) => {
          const draft = await mapDoc(`${DN_API}.make_sales_invoice`, { source_name: r.name });
          const si = await insert({ ...(draft as Row), doctype: "Sales Invoice" });
          await navigate({ to: `/accounts/invoices/${enc(si.name)}` });
        },
      }}
      columns={[
        { key: "name", label: "Invoice", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "customer", label: "Customer" },
        { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
        { key: "due_date", label: "Due", render: (r) => formatDate(r.due_date) },
        {
          key: "grand_total",
          label: "Total",
          num: true,
          render: (r) => formatMoney(r.grand_total, String(r.currency)),
        },
        {
          key: "outstanding_amount",
          label: "Outstanding",
          num: true,
          render: (r) => formatMoney(r.outstanding_amount, String(r.currency)),
        },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function InvoicePage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const navigate = useNavigate();
  const { data: doc, error } = useDoc("Sales Invoice", name);
  const doSubmit = useAction(() => submit("Sales Invoice", name), {
    success: `${name} submitted to the ledger`,
  });
  const pay = useAction(() => mapDoc(`${PE_API}.get_payment_entry`, { dt: "Sales Invoice", dn: name }), {
    onDone: (d) => navigate({ to: "/accounts/payments/new", search: { draft: putDraft(d as Row) } }),
  });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Sales Invoices", to: "/accounts/invoices" }]}
      error={error ?? doSubmit.error ?? pay.error}
      actions={
        doc && (
          <>
            {doc.docstatus === 0 && can(boot, "Sales Invoice", "submit") && (
              <ActionButton
                primary
                label="Submit invoice"
                icon={<Send aria-hidden />}
                pending={doSubmit.isPending}
                onClick={() => doSubmit.mutate()}
              />
            )}
            {doc.docstatus === 1 &&
              Number(doc.outstanding_amount) > 0 &&
              can(boot, "Payment Entry", "create") && (
                <ActionButton
                  primary
                  label="Record payment"
                  icon={<Wallet aria-hidden />}
                  pending={pay.isPending}
                  onClick={() => pay.mutate()}
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
                ["Due", formatDate(doc.due_date)],
                ["Net total", formatMoney(doc.net_total, String(doc.currency))],
                ["Taxes", formatMoney(doc.total_taxes_and_charges, String(doc.currency))],
                ["Grand total", formatMoney(doc.grand_total, String(doc.currency))],
                ["Outstanding", formatMoney(doc.outstanding_amount, String(doc.currency))],
                ["Updates stock", doc.update_stock ? "Yes" : "No (stock left with the delivery note)"],
              ]}
            />
          </Panel>
          {Number(doc.total_taxes_and_charges ?? 0) === 0 && (
            <Note>
              No tax lines. GST is not configured until the company's GSTIN and the accountant's sign-off are
              in place.
            </Note>
          )}
          <Panel title="Items" flush>
            <ChildTable
              label="Invoice items"
              rows={doc.items}
              columns={[
                {
                  key: "item_code",
                  label: "Item",
                  render: (r) => <span className="mono">{String(r.item_code)}</span>,
                },
                { key: "qty", label: "Qty", num: true, render: (r) => formatQty(r.qty, r.uom) },
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
                {
                  key: "delivery_note",
                  label: "Delivery note",
                  render: (r) => <RefLink doctype="Delivery Note" name={r.delivery_note} />,
                },
              ]}
            />
          </Panel>
          <Connections
            items={[
              {
                label: "Sales Orders",
                doctype: "Sales Order",
                filters: nameIn(childValues(doc.items, "sales_order")),
                route: (n) => routeFor("Sales Order", n),
              },
              {
                label: "Deliveries",
                doctype: "Delivery Note",
                filters: nameIn(childValues(doc.items, "delivery_note")),
                route: (n) => routeFor("Delivery Note", n),
              },
              {
                label: "Payments",
                doctype: "Payment Entry",
                filters: [["Payment Entry Reference", "reference_name", "=", name]],
                route: (n) => routeFor("Payment Entry", n),
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Payments ======================= */

export function PaymentList() {
  const navigate = useNavigate();
  return (
    <ListPage<Row>
      title="Payments"
      crumbs={[C]}
      doctype="Payment Entry"
      fields={[
        "name",
        "payment_type",
        "party",
        "posting_date",
        "paid_amount",
        "paid_from_account_currency",
        "reference_no",
        "mode_of_payment",
        "docstatus",
      ]}
      tabs={[
        { label: "Drafts", filters: { docstatus: 0 } },
        { label: "Posted", filters: { docstatus: 1 } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/accounts/payments/${enc(String(r.name))}`}
      start={{
        label: "Record payment",
        title: "Receive payment against an invoice",
        hint: "Submitted invoices with an outstanding amount, oldest due first.",
        doctype: "Sales Invoice",
        fields: ["name", "customer", "due_date", "outstanding_amount", "currency"],
        filters: [
          ["docstatus", "=", 1],
          ["outstanding_amount", ">", 0],
        ],
        columns: [
          { key: "name", label: "Invoice", render: (r) => <span className="mono">{String(r.name)}</span> },
          { key: "customer", label: "Customer" },
          { key: "due_date", label: "Due", render: (r) => formatDate(r.due_date) },
          {
            key: "outstanding_amount",
            label: "Outstanding",
            num: true,
            render: (r) => formatMoney(r.outstanding_amount, String(r.currency)),
          },
        ],
        run: async (r) => {
          const d = await mapDoc(`${PE_API}.get_payment_entry`, { dt: "Sales Invoice", dn: r.name });
          await navigate({ to: "/accounts/payments/new", search: { draft: putDraft(d as Row) } });
        },
      }}
      columns={[
        { key: "name", label: "Payment", render: (r) => <span className="mono">{String(r.name)}</span> },
        { key: "payment_type", label: "Type" },
        { key: "party", label: "Party" },
        { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
        {
          key: "paid_amount",
          label: "Amount",
          num: true,
          render: (r) => formatMoney(r.paid_amount, String(r.paid_from_account_currency || "INR")),
        },
        {
          key: "reference_no",
          label: "Reference",
          render: (r) => <span className="mono">{String(r.reference_no ?? "—")}</span>,
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

export function PaymentNew() {
  const navigate = useNavigate();
  const s = useSearch({ strict: false }) as { draft?: string };
  const draft = takeDraft(s.draft);
  const [amount, setAmount] = useState<number | "">(draft ? Number(draft.paid_amount ?? 0) : "");
  const [mode, setMode] = useState(String(draft?.mode_of_payment ?? ""));
  const [ref, setRef] = useState("");
  const [refDate, setRefDate] = useState(isoDate());
  const post = useAction(
    async () => {
      const refs = ((draft?.references as Row[]) ?? []).map((r) => ({
        ...r,
        allocated_amount:
          amount === ""
            ? r.allocated_amount
            : Math.min(Number(amount), Number(r.outstanding_amount ?? amount)),
      }));
      const pe = await insert<Doc>({
        ...(draft ?? {}),
        doctype: "Payment Entry",
        paid_amount: amount,
        received_amount: amount,
        mode_of_payment: mode || undefined,
        reference_no: ref,
        reference_date: refDate,
        references: refs,
      });
      try {
        return await submit("Payment Entry", pe.name);
      } catch (e) {
        navigate({ to: `/accounts/payments/${enc(pe.name)}` });
        throw e;
      }
    },
    {
      success: (pe) => `${pe.name} posted`,
      onDone: (pe) => navigate({ to: `/accounts/payments/${enc(pe.name)}` }),
    },
  );
  if (!draft) {
    return (
      <div className="page">
        <PageHeader title="Record payment" crumbs={[C, { label: "Payments", to: "/accounts/payments" }]} />
        <Note>Open an outstanding invoice and choose “Record payment”.</Note>
      </div>
    );
  }
  const against = ((draft.references as Row[]) ?? []).map((r) => String(r.reference_name)).join(", ");
  return (
    <div className="page page-form">
      <PageHeader
        title="Record payment"
        crumbs={[C, { label: "Payments", to: "/accounts/payments" }]}
        meta={
          <span>
            {String(draft.party)} · against {against}
          </span>
        }
      />
      <ErrorNote error={post.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          post.mutate();
        }}
      >
        <Panel title="Payment received">
          <div className="grid-3">
            <NumberField
              label="Amount"
              required
              value={amount}
              onChange={setAmount}
              unit={String(draft.paid_to_account_currency ?? "INR")}
            />
            <LinkField label="Mode of payment" doctype="Mode of Payment" value={mode} onChange={setMode} />
            <TextField label="Bank reference / UTR" required value={ref} onChange={setRef} />
            <DateField label="Reference date" required value={refDate} onChange={setRefDate} />
          </div>
          <Facts
            items={[
              ["Paid to", String(draft.paid_to ?? "—")],
              [
                "Outstanding",
                formatMoney(
                  (draft.references as Row[])?.[0]?.outstanding_amount,
                  String(draft.paid_to_account_currency ?? "INR"),
                ),
              ],
            ]}
          />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={post.isPending || !ref}>
            Post payment
          </button>
        </div>
      </form>
    </div>
  );
}

export function PaymentPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error } = useDoc("Payment Entry", name);
  const post = useAction(() => submit("Payment Entry", name), { success: `${name} posted` });
  return (
    <DocFrame
      doc={doc}
      title={name}
      crumbs={[C, { label: "Payments", to: "/accounts/payments" }]}
      error={error ?? post.error}
      actions={
        doc?.docstatus === 0 &&
        can(boot, "Payment Entry", "submit") && (
          <ActionButton
            primary
            label="Post payment"
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
                ["Type", String(doc.payment_type)],
                [
                  "Party",
                  <RefLink key="p" doctype={String(doc.party_type ?? "Customer")} name={doc.party} />,
                ],
                ["Posting date", formatDate(doc.posting_date)],
                ["Amount", formatMoney(doc.paid_amount, String(doc.paid_to_account_currency ?? "INR"))],
                ["Mode", String(doc.mode_of_payment ?? "—")],
                ["Reference", String(doc.reference_no ?? "—")],
                ["Paid to", String(doc.paid_to ?? "—")],
              ]}
            />
          </Panel>
          <Panel title="Allocated to" flush>
            <ChildTable
              label="Payment references"
              rows={doc.references}
              columns={[
                { key: "reference_doctype", label: "Type" },
                {
                  key: "reference_name",
                  label: "Document",
                  render: (r) => <RefLink doctype={String(r.reference_doctype)} name={r.reference_name} />,
                },
                {
                  key: "allocated_amount",
                  label: "Allocated",
                  num: true,
                  render: (r) =>
                    formatMoney(r.allocated_amount, String(doc.paid_to_account_currency ?? "INR")),
                },
              ]}
            />
          </Panel>
        </>
      )}
    </DocFrame>
  );
}

/* ======================= Reports ======================= */

export function Receivables() {
  const boot = useSession();
  return (
    <ReportView
      report="Accounts Receivable"
      title="Receivables"
      crumbs={[C]}
      filters={{
        company: boot.company,
        report_date: isoDate(),
        party_type: "Customer",
        range: "30, 60, 90, 120",
      }}
    />
  );
}

export function Payables() {
  const boot = useSession();
  return (
    <ReportView
      report="Accounts Payable"
      title="Payables"
      crumbs={[C]}
      filters={{
        company: boot.company,
        report_date: isoDate(),
        party_type: "Supplier",
        range: "30, 60, 90, 120",
      }}
    />
  );
}
