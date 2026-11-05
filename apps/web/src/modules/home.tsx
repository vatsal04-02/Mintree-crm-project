import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type Filters, getCount, getList, login, runReport } from "@/api/frappe";
import { BOOT_KEY, type Boot, can, fetchBoot, hasReport, isSampleCompany, useSession } from "@/api/session";
import { ErrorNote, PageHeader, StatusChip } from "@/components/ui";
import { formatMoney, isoDate } from "@/lib/format";

/* ======================= Command Center ======================= */

type Queue = {
  key: string;
  label: string;
  to: string;
  source: string;
  show: (b: Boot) => boolean;
  /** count and an optional detail line, straight from the ERP */
  load: (b: Boot) => Promise<{ count: number; detail?: string; alert?: boolean }>;
};

const count = (doctype: string, filters: Filters) => async () => ({
  count: await getCount(doctype, filters),
});

const QUEUES: Queue[] = [
  {
    key: "qc",
    label: "Batches waiting for QC",
    to: "/quality/queue",
    source: "Report: QC Queue",
    show: (b) => hasReport(b, "QC Queue"),
    load: async (b) => {
      const r = await runReport("QC Queue", { company: b.company });
      const overdue = r.result.filter((x) => x.overdue).length;
      return {
        count: r.result.length,
        detail: overdue ? `${overdue} past SLA` : "none past SLA",
        alert: overdue > 0,
      };
    },
  },
  {
    key: "dev",
    label: "Deviations awaiting QA approval",
    to: "/quality/deviations",
    source: "QC Deviation, draft",
    show: (b) => can(b, "QC Deviation", "read"),
    load: count("QC Deviation", { docstatus: 0 }),
  },
  {
    key: "mr",
    label: "Material requests not yet ordered",
    to: "/procurement/material-requests",
    source: "Material Request, submitted, ordered < 100%",
    show: (b) => can(b, "Material Request", "read"),
    load: count("Material Request", [
      ["docstatus", "=", 1],
      ["per_ordered", "<", 100],
      ["status", "not in", ["Stopped", "Cancelled"]],
    ]),
  },
  {
    key: "po-approve",
    label: "Purchase orders awaiting approval",
    to: "/procurement/purchase-orders",
    source: "Purchase Order, draft",
    show: (b) => can(b, "Purchase Order", "read"),
    load: count("Purchase Order", { docstatus: 0 }),
  },
  {
    key: "po-receive",
    label: "Purchase orders to receive",
    to: "/procurement/purchase-orders",
    source: "Purchase Order, submitted, received < 100%",
    show: (b) => can(b, "Purchase Order", "read"),
    load: count("Purchase Order", [
      ["docstatus", "=", 1],
      ["per_received", "<", 100],
      ["status", "not in", ["Closed", "On Hold"]],
    ]),
  },
  {
    key: "wo",
    label: "Work orders open",
    to: "/production/work-orders",
    source: "Work Order, submitted, not completed",
    show: (b) => can(b, "Work Order", "read"),
    load: count("Work Order", [
      ["docstatus", "=", 1],
      ["status", "in", ["Not Started", "In Process"]],
    ]),
  },
  {
    key: "so",
    label: "Sales orders to deliver",
    to: "/sales/orders",
    source: "Sales Order, submitted, delivered < 100%",
    show: (b) => can(b, "Sales Order", "read"),
    load: count("Sales Order", [
      ["docstatus", "=", 1],
      ["per_delivered", "<", 100],
      ["status", "not in", ["Closed", "On Hold"]],
    ]),
  },
  {
    key: "dn",
    label: "Deliveries waiting to dispatch",
    to: "/sales/deliveries",
    source: "Delivery Note, draft",
    show: (b) => can(b, "Delivery Note", "read"),
    load: count("Delivery Note", { docstatus: 0 }),
  },
  {
    key: "bill",
    label: "Dispatched, not invoiced",
    to: "/sales/deliveries",
    source: "Delivery Note, submitted, billed < 100%",
    show: (b) => can(b, "Delivery Note", "read"),
    load: count("Delivery Note", [
      ["docstatus", "=", 1],
      ["per_billed", "<", 100],
      ["status", "!=", "Closed"],
    ]),
  },
  {
    key: "overdue",
    label: "Invoices overdue",
    to: "/accounts/invoices",
    source: "Sales Invoice, submitted, outstanding, past due date",
    show: (b) => can(b, "Sales Invoice", "read"),
    load: async (b) => {
      const filters = [
        ["docstatus", "=", 1],
        ["outstanding_amount", ">", 0],
        ["due_date", "<", isoDate()],
      ];
      const [n, rows] = await Promise.all([
        getCount("Sales Invoice", filters),
        getList<{ outstanding_amount: number }>("Sales Invoice", {
          fields: ["outstanding_amount"],
          filters,
          limit: 0,
        }),
      ]);
      const total = rows.reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0);
      return {
        count: n,
        detail: n ? `${formatMoney(total, b.currency ?? "INR")} outstanding` : undefined,
        alert: n > 0,
      };
    },
  },
];

export function CommandCenter() {
  const boot = useSession();
  const navigate = useNavigate();
  const queues = QUEUES.filter((q) => q.show(boot));
  const results = useQueries({
    queries: queues.map((q) => ({
      queryKey: ["queue", q.key],
      queryFn: () => q.load(boot),
      refetchInterval: 60_000,
    })),
  });
  return (
    <div className="page">
      <PageHeader
        title="Command Center"
        meta={
          <span>
            {boot.full_name} ·{" "}
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            {isSampleCompany(boot) && " · SAMPLE company: development data, not real"}
          </span>
        }
      />
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">What needs attention</h2>
          <span className="panel-meta">
            Counts from the ERP, refreshed every minute. Only queues your role can open.
          </span>
        </div>
        {queues.length === 0 ? (
          <p className="empty">Your role has no work queues in Factory OS yet. Use ERPNext Desk.</p>
        ) : (
          <table className="dt worklist" aria-label="Work queues">
            <thead>
              <tr>
                <th>Queue</th>
                <th className="num">Count</th>
                <th>Detail</th>
                <th>Source</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {queues.map((q, i) => {
                const r = results[i];
                return (
                  <tr key={q.key} data-clickable onClick={() => navigate({ to: q.to })}>
                    <td>
                      <Link to={q.to} className="worklist-label" onClick={(e) => e.stopPropagation()}>
                        {q.label}
                      </Link>
                    </td>
                    <td className="num worklist-count">
                      {r?.isLoading ? (
                        <span className="skel" style={{ width: 24 }} />
                      ) : r?.error ? (
                        "—"
                      ) : (
                        r?.data?.count
                      )}
                    </td>
                    <td>
                      {r?.error ? (
                        <span className="dim">Could not load: {(r.error as Error).message}</span>
                      ) : r?.data?.detail ? (
                        r.data.alert ? (
                          <StatusChip status={r.data.detail} tone="rejected" />
                        ) : (
                          <span className="dim">{r.data.detail}</span>
                        )
                      ) : null}
                    </td>
                    <td className="dim">{q.source}</td>
                    <td className="num">
                      <ArrowRight aria-hidden size={14} className="dim" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ======================= Sign in ======================= */

export function Login() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(usr, pwd);
      const boot = await fetchBoot();
      qc.setQueryData(BOOT_KEY, boot);
      navigate({ to: "/" });
    } catch (x) {
      setError(x);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width={24} height={24} />
          <span className="brand-name">Mintree Factory OS</span>
        </div>
        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">Use your ERPNext account. What you can see and do follows your ERP role.</p>
        <ErrorNote error={error} title="Could not sign in" />
        <div className="field">
          <label className="field-label" htmlFor="usr">
            Email or username
          </label>
          <div className="input-wrap">
            <input
              id="usr"
              autoComplete="username"
              required
              value={usr}
              onChange={(e) => setUsr(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pwd">
            Password
          </label>
          <div className="input-wrap">
            <input
              id="pwd"
              type="password"
              autoComplete="current-password"
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
