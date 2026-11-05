import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { type Doc, deskUrl, type Filters, getDoc, getList, type Row, runReport } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import { routeFor } from "@/nav";
import { type Column, DataTable } from "./DataTable";
import { DateField, LinkField, NumberField, SelectField, TextField } from "./fields";
import { type Crumb, DeskLink, docStatus, ErrorNote, PageHeader, Spinner, StatusChip } from "./ui";

/* ---------- Reading ---------- */

export function useDoc<T extends Doc = Doc>(doctype: string, name: string) {
  return useQuery({ queryKey: ["doc", doctype, name], queryFn: () => getDoc<T>(doctype, name) });
}

export function useList<T = Row>(
  doctype: string,
  args: { fields: string[]; filters?: Filters; orderBy?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ["list", doctype, JSON.stringify(args)],
    queryFn: () => getList<T>(doctype, args),
    enabled,
  });
}

export function useReport(report: string, filters: Row, enabled = true) {
  return useQuery({
    queryKey: ["report", report, JSON.stringify(filters)],
    queryFn: () => runReport(report, filters),
    enabled,
  });
}

/* ---------- Writing: every action is one server call; its refusal is shown as is ---------- */

export function useAction<A = void, R = unknown>(
  fn: (arg: A) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onDone?: (r: R) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      const msg = typeof opts.success === "function" ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      // the server changed state: everything shown may now be stale
      void qc.invalidateQueries();
      opts.onDone?.(r);
    },
  });
}

export function ActionButton({
  label,
  onClick,
  pending,
  primary,
  danger,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn ${primary ? "btn-primary" : ""} ${danger ? "btn-danger" : ""}`}
      onClick={onClick}
      disabled={pending || disabled}
    >
      {pending ? <Spinner /> : icon}
      {label}
    </button>
  );
}

/* ---------- Generic list page ---------- */

export type ListTab = { label: string; filters: Filters };

export function ListPage<T extends Row>({
  title,
  crumbs,
  doctype,
  fields,
  columns,
  tabs,
  detail,
  create,
  createLabel,
  orderBy,
  note,
  start,
}: {
  title: string;
  crumbs: Crumb[];
  doctype: string;
  fields: string[];
  columns: Column<T>[];
  tabs: ListTab[];
  detail: (row: T) => string;
  create?: string;
  createLabel?: string;
  orderBy?: string;
  note?: ReactNode;
  /** a document of this list is made from another one: pick the source first */
  start?: StartFrom;
}) {
  const boot = useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { start?: string | number };
  // the router parses ?start=1 as the number 1
  const startRequested = String(search.start ?? "") === "1";
  const [picking, setPicking] = useState(startRequested);
  useEffect(() => {
    if (startRequested) setPicking(true);
  }, [startRequested]);
  const [tab, setTab] = useState(0);
  const current = tabs[tab] ?? tabs[0];
  const list = useList<T>(doctype, { fields, filters: current?.filters, orderBy, limit: 100 });
  return (
    <div className="page">
      <PageHeader
        title={title}
        crumbs={crumbs}
        actions={
          <>
            <DeskLink doctype={doctype} />
            {start && can(boot, doctype, "create") && (
              <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
                <Plus aria-hidden />
                {start.label}
              </button>
            )}
            {create && can(boot, doctype, "create") && (
              <button type="button" className="btn btn-primary" onClick={() => navigate({ to: create })}>
                <Plus aria-hidden />
                {createLabel ?? "New"}
              </button>
            )}
          </>
        }
      />
      {note}
      <div className="tabs" role="tablist" aria-label={`${title} filter`}>
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            className="tab"
            onClick={() => setTab(i)}
          >
            {t.label}
          </button>
        ))}
        <span className="tab-meta">
          {list.data ? `${list.data.length}${list.data.length === 100 ? "+" : ""} shown, newest first` : ""}
        </span>
      </div>
      <ErrorNote error={list.error} />
      <div className="panel">
        <DataTable<T>
          label={title}
          columns={columns}
          rows={list.data}
          loading={list.isLoading}
          rowKey={(r) => String(r.name)}
          onRowClick={(r) => navigate({ to: detail(r) })}
          empty={`No ${title.toLowerCase()} in “${current?.label}”.`}
        />
      </div>
      {start && (
        <SourcePicker
          start={start}
          open={picking}
          onOpenChange={(o) => {
            setPicking(o);
            if (!o && search.start) navigate({ to: ".", search: {} });
          }}
        />
      )}
    </div>
  );
}

/* ---------- Start a document from its source document ---------- */

export type StartFrom = {
  /** button label, e.g. "Receive goods" */
  label: string;
  /** dialog title, e.g. "Receive against a purchase order" */
  title: string;
  hint?: string;
  doctype: string;
  fields: string[];
  filters: Filters;
  columns: Column<Row>[];
  /** run the ERPNext mapping for the chosen source and go to the result */
  run: (row: Row) => Promise<void>;
};

export function SourcePicker({
  start,
  open,
  onOpenChange,
}: {
  start: StartFrom;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const list = useList<Row>(start.doctype, { fields: start.fields, filters: start.filters, limit: 50 }, open);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="side-sheet picker" aria-describedby={undefined}>
          <div className="picker-head">
            <Dialog.Title className="picker-title">{start.title}</Dialog.Title>
            <Dialog.Close className="btn btn-ghost btn-icon" aria-label="Close">
              <X aria-hidden />
            </Dialog.Close>
          </div>
          {start.hint && <p className="picker-hint">{start.hint}</p>}
          <ErrorNote error={error ?? list.error} />
          <div className="picker-body">
            <DataTable<Row>
              label={start.title}
              columns={start.columns}
              rows={list.data}
              loading={list.isLoading}
              rowKey={(r) => String(r.name)}
              empty={`No ${start.doctype.toLowerCase()} is ready for this.`}
              onRowClick={async (r) => {
                if (busy) return;
                setBusy(String(r.name));
                setError(null);
                try {
                  await start.run(r);
                  onOpenChange(false);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(null);
                }
              }}
            />
          </div>
          {busy && (
            <p className="picker-hint">
              <Spinner /> Preparing from {busy}…
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Connections: documents linked to this one, like Desk's Connections ---------- */

export type Connection = {
  label: string;
  doctype: string;
  filters: Filters;
  /** route of a linked document in Factory OS; Desk when absent */
  route?: (name: string) => string | undefined;
};

export function Connections({ items }: { items: Connection[] }) {
  const boot = useSession();
  const visible = items.filter((c) => can(boot, c.doctype, "read"));
  const results = useQueries({
    queries: visible.map((c) => ({
      queryKey: ["connections", c.doctype, JSON.stringify(c.filters)],
      queryFn: () =>
        getList<{ name: string; docstatus: number }>(c.doctype, {
          fields: ["name", "docstatus"],
          filters: c.filters,
          limit: 20,
        }),
    })),
  });
  if (visible.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Connections</h2>
      </div>
      <div className="panel-body connections">
        {visible.map((c, i) => {
          const r = results[i];
          const rows = r?.data ?? [];
          return (
            <div key={c.label} className="conn">
              <div className="conn-label">
                {c.label}
                <span className="conn-count">{r?.isLoading ? "…" : rows.length}</span>
              </div>
              <div className="conn-links">
                {rows.length === 0 && !r?.isLoading && <span className="dim">None</span>}
                {rows.map((d) => {
                  const to = c.route?.(d.name);
                  const cls = `conn-link mono${d.docstatus === 2 ? " conn-cancelled" : ""}`;
                  return to ? (
                    <Link key={d.name} to={to} className={cls}>
                      {d.name}
                    </Link>
                  ) : (
                    <a
                      key={d.name}
                      className={cls}
                      href={deskUrl(c.doctype, d.name)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.name}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A value that opens its own record: in Factory OS when it has a page here, else in Desk. */
export function RefLink({ doctype, name }: { doctype: string; name: unknown }) {
  if (!name) return <span className="dim">—</span>;
  const n = String(name);
  const to = routeFor(doctype, n);
  if (to) {
    const [path, q] = to.split("?");
    return (
      <Link
        className="link"
        to={path ?? to}
        search={q ? Object.fromEntries(new URLSearchParams(q)) : undefined}
      >
        {n}
      </Link>
    );
  }
  return (
    <a className="link" href={deskUrl(doctype, n)} target="_blank" rel="noreferrer">
      {n}
    </a>
  );
}

/* ---------- Document page frame ---------- */

export function DocFrame({
  doc,
  title,
  crumbs,
  actions,
  children,
  error,
}: {
  doc: Doc | undefined;
  title: string;
  crumbs: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
  error?: unknown;
}) {
  return (
    <div className="page">
      <PageHeader
        title={
          <>
            <span className="mono">{title}</span>
            {doc && <StatusChip status={docStatus(doc)} />}
          </>
        }
        crumbs={crumbs}
        actions={
          <>
            {doc && <DeskLink doctype={doc.doctype} name={doc.name} />}
            {actions}
          </>
        }
      />
      <ErrorNote error={error} />
      {doc ? children : !error && <Spinner />}
    </div>
  );
}

/* ---------- Child rows ---------- */

export type EditCol =
  | {
      field: string;
      label: string;
      type: "link";
      doctype: string;
      filters?: Filters;
      required?: boolean;
      onPick?: (row: Row, value: string) => Row | Promise<Row>;
    }
  | {
      field: string;
      label: string;
      type: "number";
      unit?: (row: Row) => string | undefined;
      required?: boolean;
    }
  | { field: string; label: string; type: "date"; required?: boolean }
  | { field: string; label: string; type: "text"; required?: boolean }
  | { field: string; label: string; type: "select"; options: string[]; required?: boolean }
  | { field: string; label: string; type: "readonly"; render?: (row: Row) => ReactNode };

/** Edits the item rows of an unsaved document. Values are sent as typed; the server validates. */
export function RowsEditor({
  rows,
  onChange,
  cols,
  blank,
  addLabel = "Add row",
  fixed,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  cols: EditCol[];
  blank?: () => Row;
  addLabel?: string;
  fixed?: boolean;
}) {
  function set(i: number, patch: Row) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  return (
    <div className="rows-editor">
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows of an unsaved document have no name yet
        <div className="row-edit" key={i}>
          <span className="row-idx mono">{i + 1}</span>
          {cols.map((c) => {
            const v = row[c.field];
            switch (c.type) {
              case "link":
                return (
                  <LinkField
                    key={c.field}
                    label={c.label}
                    doctype={c.doctype}
                    filters={c.filters}
                    required={c.required}
                    value={String(v ?? "")}
                    onChange={async (val) => {
                      const next = c.onPick && val ? await c.onPick({ ...row, [c.field]: val }, val) : {};
                      set(i, { [c.field]: val, ...next });
                    }}
                  />
                );
              case "number":
                return (
                  <NumberField
                    key={c.field}
                    label={c.label}
                    required={c.required}
                    unit={c.unit?.(row)}
                    value={v === undefined || v === null || v === "" ? "" : Number(v)}
                    onChange={(val) => set(i, { [c.field]: val })}
                  />
                );
              case "date":
                return (
                  <DateField
                    key={c.field}
                    label={c.label}
                    required={c.required}
                    value={String(v ?? "")}
                    onChange={(val) => set(i, { [c.field]: val })}
                  />
                );
              case "select":
                return (
                  <SelectField
                    key={c.field}
                    label={c.label}
                    required={c.required}
                    options={["", ...c.options]}
                    value={String(v ?? "")}
                    onChange={(val) => set(i, { [c.field]: val })}
                  />
                );
              case "readonly":
                return (
                  <div className="field" key={c.field}>
                    <span className="field-label">{c.label}</span>
                    <div className="readonly">{c.render ? c.render(row) : String(v ?? "—")}</div>
                  </div>
                );
              default:
                return (
                  <TextField
                    key={c.field}
                    label={c.label}
                    required={c.required}
                    value={String(v ?? "")}
                    onChange={(val) => set(i, { [c.field]: val })}
                  />
                );
            }
          })}
          {!fixed && (
            <button
              type="button"
              className="btn btn-ghost btn-icon row-remove"
              aria-label={`Remove row ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden />
            </button>
          )}
        </div>
      ))}
      {!fixed && blank && (
        <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, blank()])}>
          <Plus aria-hidden />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** Read-only child table. */
export function ChildTable({
  rows,
  columns,
  label,
}: {
  rows: unknown;
  columns: Column<Row>[];
  label: string;
}) {
  const data = Array.isArray(rows) ? (rows as Row[]) : [];
  return (
    <DataTable<Row>
      label={label}
      columns={columns}
      rows={data}
      rowKey={(r) => String(r.name ?? r.idx)}
      empty="No rows."
    />
  );
}

/** Distinct values of a field across a document's child rows (e.g. the orders behind a receipt). */
export function childValues(rows: unknown, field: string): string[] {
  const list = Array.isArray(rows) ? (rows as Row[]) : [];
  return [
    ...new Set(list.map((r) => r[field]).filter((v): v is string => typeof v === "string" && v !== "")),
  ];
}

/** Filter "name in […]" that matches nothing when the list is empty. */
export function nameIn(names: string[]): Filters {
  return { name: ["in", names.length ? names : ["__none__"]] };
}
