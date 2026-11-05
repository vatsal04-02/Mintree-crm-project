import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { deskUrl, FrappeError } from "@/api/frappe";
import { useSession } from "@/api/session";
import { allPages } from "@/nav";

/* ---------- Status chips: colour + icon + label, never colour alone ---------- */

type Tone = "released" | "hold" | "rejected" | "progress" | "neutral";

const TONES: Record<string, Tone> = {
  Draft: "neutral",
  Open: "progress",
  Pending: "hold",
  "Not Started": "neutral",
  "In Process": "progress",
  "To Receive and Bill": "progress",
  "To Receive": "progress",
  "To Bill": "progress",
  "To Deliver and Bill": "progress",
  "To Deliver": "progress",
  "Partly Ordered": "progress",
  Ordered: "progress",
  "Partially Received": "progress",
  "Partly Delivered": "progress",
  Transferred: "progress",
  Submitted: "released",
  Completed: "released",
  Received: "released",
  Delivered: "released",
  Paid: "released",
  Accepted: "released",
  Released: "released",
  Eligible: "released",
  Usable: "released",
  Hold: "hold",
  "QC Hold": "hold",
  Unpaid: "hold",
  "Partly Paid": "hold",
  "Short dated": "hold",
  "Short Dated": "hold",
  Overdue: "rejected",
  Rejected: "rejected",
  Expired: "rejected",
  Cancelled: "rejected",
  Stopped: "neutral",
  Closed: "neutral",
  "On Hold": "hold",
  Return: "neutral",
  // R&D
  "Under Review": "hold",
  Trial: "progress",
  Approved: "released",
  Archived: "neutral",
  Pass: "released",
  Fail: "rejected",
  Inconclusive: "hold",
  Proposed: "neutral",
  "In Progress": "progress",
  Planned: "neutral",
};

export function toneOf(status: string): Tone {
  if (TONES[status]) return TONES[status];
  if (/expired|reject|cancel|overdue/i.test(status)) return "rejected";
  if (/hold|short/i.test(status)) return "hold";
  if (/eligible|released|complete|paid/i.test(status)) return "released";
  return "neutral";
}

export function StatusChip({ status, tone }: { status: string; tone?: Tone }) {
  const t = tone ?? toneOf(status);
  return (
    <span className={`chip chip-${t}`}>
      <span className="chip-dot" aria-hidden />
      {status}
    </span>
  );
}

/** ERPNext's own status field when the document has one, else its docstatus. */
export function docStatus(doc: { docstatus?: unknown; status?: unknown }): string {
  if (typeof doc.status === "string" && doc.status) return doc.status;
  return doc.docstatus === 1 ? "Submitted" : doc.docstatus === 2 ? "Cancelled" : "Draft";
}

/* ---------- Page structure ---------- */

export type Crumb = { label: string; to?: string };

export function PageHeader({
  title,
  crumbs,
  meta,
  actions,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="crumbs">
          {crumbs.map((c, i) => (
            <span key={`${c.label}:${c.to ?? ""}`}>
              {c.to ? (
                <Link to={c.to} className="crumb">
                  {c.label}
                </Link>
              ) : (
                <span className="crumb">{c.label}</span>
              )}
              {i < crumbs.length - 1 && <span aria-hidden> / </span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-head-row">
        <h1 className="page-title">{title}</h1>
        {meta && <div className="page-meta">{meta}</div>}
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({
  title,
  meta,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2 className="panel-title">{title}</h2>}
          {meta && <span className="panel-meta">{meta}</span>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "panel-body"}>{children}</div>
    </section>
  );
}

/** Server refusals are shown in the server's own words. */
export function ErrorNote({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const message =
    error instanceof FrappeError || error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="note note-error" role="alert">
      <AlertTriangle aria-hidden />
      <div>
        <strong>
          {title ??
            (error instanceof FrappeError && error.title) ??
            (error instanceof FrappeError && error.status >= 500
              ? "The ERP reported an error"
              : error instanceof FrappeError && error.isPermission
                ? "Not permitted"
                : "Refused by the ERP")}
        </strong>
        <p className="note-text">{message}</p>
      </div>
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "hold" }) {
  return <div className={`note note-${tone}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export type EmptyAction = { label: string; to: string; primary?: boolean };
export type EmptyProps = {
  title: string;
  /** why there is nothing here */
  reason?: ReactNode;
  /** what has to exist first, in order */
  needs?: ReactNode[];
  /** where to go next; only links to pages that exist */
  actions?: EmptyAction[];
  /** in-page actions, e.g. switch to the unfiltered tab */
  buttons?: { label: string; onClick: () => void }[];
};

/** Takes the place of an empty table: says why it is empty and what to do next. */
export function EmptyState({ title, reason, needs, actions: offered, buttons }: EmptyProps) {
  const boot = useSession();
  // offer only pages this user can open (the same permission test as the navigation)
  const pages = new Set(allPages(boot).map((p) => p.to.split("?")[0]));
  const actions = offered?.filter((a) => pages.has(a.to.split("?")[0]));
  return (
    <section className="empty-state" aria-label={title}>
      <div className="empty-state-body">
        <h2 className="empty-state-title">{title}</h2>
        {reason && <p className="empty-state-reason">{reason}</p>}
        {needs && needs.length > 0 && (
          <ol className="empty-state-needs">
            {needs.map((n, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <li key={i}>{n}</li>
            ))}
          </ol>
        )}
      </div>
      {((actions && actions.length > 0) || (buttons && buttons.length > 0)) && (
        <div className="empty-state-actions">
          {buttons?.map((b) => (
            <button key={b.label} type="button" className="btn" onClick={b.onClick}>
              {b.label}
            </button>
          ))}
          {actions?.map((a) => (
            <Link key={a.to} to={a.to} className={a.primary ? "btn btn-primary" : "btn"}>
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Loader2 aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function DeskLink({
  doctype,
  name,
  children,
}: {
  doctype: string;
  name?: string;
  children?: ReactNode;
}) {
  return (
    <a className="btn btn-ghost btn-sm" href={deskUrl(doctype, name)} target="_blank" rel="noreferrer">
      <ExternalLink aria-hidden />
      {children ?? "Open in Desk"}
    </a>
  );
}

/* ---------- Key/value summary ---------- */

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([k, v]) => (
        <div key={k} className="fact">
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}
