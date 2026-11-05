import { type ReactNode, useMemo, useState } from "react";
import type { ReportColumn, Row } from "@/api/frappe";
import { useSession } from "@/api/session";
import { emptyForReport } from "@/lib/empty";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { type Column, DataTable } from "./DataTable";
import { useReport } from "./doc";
import { type Crumb, type EmptyProps, ErrorNote, PageHeader, StatusChip } from "./ui";

const STATUS_FIELDS = /status|eligibility/i;
/** document numbers and codes read better in mono; names of places and parties do not */
const CODE_LINKS = new Set([
  "Batch",
  "Item",
  "Stock Entry",
  "Purchase Receipt",
  "Purchase Order",
  "Sales Order",
  "Sales Invoice",
  "Delivery Note",
  "Work Order",
  "QC Release",
  "Payment Entry",
]);

function cell(c: ReportColumn, row: Row, currency: string): ReactNode {
  const v = row[c.fieldname];
  if (v === null || v === undefined || v === "") return <span className="dim">—</span>;
  if (STATUS_FIELDS.test(c.fieldname) && typeof v === "string") return <StatusChip status={v} />;
  switch (c.fieldtype) {
    case "Currency":
      return formatMoney(v, currency);
    case "Float":
    case "Int":
      return formatQty(v);
    case "Percent":
      return `${Number(v).toFixed(1)}%`;
    case "Date":
      return formatDate(v);
    case "Datetime":
      return formatDateTime(v);
    case "Check":
      return v ? "Yes" : "No";
    case "Dynamic Link":
      return <span className="mono">{String(v)}</span>;
    case "Link":
      return CODE_LINKS.has(c.options ?? "") ? <span className="mono">{String(v)}</span> : String(v);
    default:
      return String(v);
  }
}

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);

/**
 * Shows a Frappe query report exactly as the server returns it: its columns, its rows. The page
 * names the report so every figure has a source.
 */
export function ReportView({
  report,
  filters,
  title,
  crumbs,
  hide = [],
  onRowClick,
  controls,
  rowFilter,
  note,
  empty,
}: {
  report: string;
  filters: Row;
  title?: string;
  crumbs: Crumb[];
  hide?: string[];
  onRowClick?: (r: Row) => void;
  controls?: ReactNode;
  rowFilter?: (r: Row) => boolean;
  note?: ReactNode;
  /** overrides the standard explanation shown when the report has no rows */
  empty?: EmptyProps;
}) {
  const boot = useSession();
  const { data, error, isLoading, dataUpdatedAt } = useReport(report, filters);
  const [q, setQ] = useState("");
  const currency = boot.currency ?? "INR";
  const columns: Column<Row>[] = useMemo(
    () =>
      (data?.columns ?? [])
        .filter((c) => !hide.includes(c.fieldname))
        .map((c) => ({
          key: c.fieldname,
          label: c.label,
          num: NUMERIC.has(c.fieldtype ?? ""),
          render: (r: Row) => cell(c, r, currency),
          sortValue: (r: Row) =>
            NUMERIC.has(c.fieldtype ?? "") ? Number(r[c.fieldname] ?? 0) : String(r[c.fieldname] ?? ""),
        })),
    [data, hide, currency],
  );
  const rows = useMemo(() => {
    let r = data?.result ?? [];
    if (rowFilter) r = r.filter(rowFilter);
    if (q) {
      const needle = q.toLowerCase();
      r = r.filter((x) =>
        Object.values(x).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(needle),
        ),
      );
    }
    return r;
  }, [data, q, rowFilter]);
  return (
    <div className="page">
      <PageHeader
        title={title ?? report}
        crumbs={crumbs}
        meta={
          data && (
            <span>
              {rows.length} rows · report “{report}” · {new Date(dataUpdatedAt).toLocaleTimeString("en-IN")}
            </span>
          )
        }
      />
      {note}
      <div className="toolbar">
        <div className="input-wrap toolbar-search">
          <input
            aria-label="Filter rows"
            placeholder="Filter rows"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {controls}
      </div>
      <ErrorNote error={error} />
      {!error && (
        <div className="panel">
          <DataTable<Row>
            label={title ?? report}
            columns={columns}
            rows={rows}
            loading={isLoading}
            rowKey={(r) => JSON.stringify(r)}
            onRowClick={onRowClick}
            empty={q ? emptyForReport(report, q) : (empty ?? emptyForReport(report, ""))}
          />
        </div>
      )}
    </div>
  );
}
