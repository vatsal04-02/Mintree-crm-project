import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  ExternalLink,
  Loader2,
  PauseCircle,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { deskUrl, FrappeError } from "@/api/frappe";

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
};

const ICONS: Record<Tone, typeof CheckCircle2> = {
  released: CheckCircle2,
  hold: PauseCircle,
  rejected: XCircle,
  progress: Clock,
  neutral: CircleDashed,
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
  const Icon = ICONS[t];
  return (
    <span className={`chip chip-${t}`}>
      <Icon aria-hidden />
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
