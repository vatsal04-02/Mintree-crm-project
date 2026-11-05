import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Empty } from "./ui";

export type Column<T> = {
  key: string;
  label: string;
  num?: boolean;
  render?: (row: T) => ReactNode;
  /** value used for sorting; defaults to row[key] */
  sortValue?: (row: T) => string | number;
  width?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  loading,
  empty = "Nothing here.",
  onRowClick,
  rowKey,
  label,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  label: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows ?? [];
    const col = columns.find((c) => c.key === sort.key);
    const val = (r: T) => (col?.sortValue ? col.sortValue(r) : ((r[sort.key] as string | number) ?? ""));
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, sort, columns]);

  return (
    <div className="table-wrap">
      <table className="dt" aria-label={label} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={c.num ? "num" : undefined}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                >
                  <button
                    type="button"
                    className="sort-btn"
                    data-sorted={active || undefined}
                    onClick={() =>
                      setSort(active && sort.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 })
                    }
                  >
                    {c.label}
                    {active &&
                      (sort.dir === 1 ? (
                        <ArrowUp aria-hidden size={12} />
                      ) : (
                        <ArrowDown aria-hidden size={12} />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows
              <tr key={i} className="skel-row">
                {columns.map((c) => (
                  <td key={c.key}>
                    <span className="skel" style={{ width: c.num ? 48 : 96 }} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                data-clickable={onRowClick ? true : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? "num" : undefined}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && sorted.length === 0 && <Empty>{empty}</Empty>}
    </div>
  );
}
