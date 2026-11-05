import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { get, type Row } from "@/api/frappe";
import { useSession } from "@/api/session";
import { ErrorNote, PageHeader, StatusChip } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

const C = { label: "Setup" };
const GROUPS = ["System of record", "Marketplaces", "Marketing", "Communication", "Logistics", "Finance"];

function tone(state: string) {
  if (state === "Connected") return "released" as const;
  if (state === "Error") return "rejected" as const;
  if (state === "Synchronising") return "progress" as const;
  if (state === "Not implemented" || state === "Hidden") return "neutral" as const;
  return "hold" as const;
}

/** Every outside connection, with the state the server reads from its records. Nothing here can mark
 * a connection Connected: only a verified live test (or, for e-mail, a sent message) does. */
export function IntegrationCentre() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => get<Row[]>("factory_ops.api.integrations.integrations"),
  });
  return (
    <div className="page">
      <PageHeader
        title="Integration Centre"
        crumbs={[C]}
        meta={<span>States read from connection records and sync logs</span>}
      />
      <ErrorNote error={error} />
      {isLoading && <p className="dim">Loading…</p>}
      {GROUPS.map((g) => {
        const rows = (data ?? []).filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="panel">
            <div className="panel-head">
              <h2 className="panel-title">{g}</h2>
            </div>
            <table className="dt" aria-label={g}>
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>State</th>
                  <th>Last success</th>
                  <th>Last error / test</th>
                  <th>What this means</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const log = r.last_log as Row | null | undefined;
                  return (
                    <tr key={String(r.name)}>
                      <td>
                        {String(r.name)}
                        {r.connector ? <div className="dim">{String(r.connector)}</div> : null}
                      </td>
                      <td>
                        <StatusChip status={String(r.state)} tone={tone(String(r.state))} />
                      </td>
                      <td>
                        {r.last_success ? (
                          formatDateTime(r.last_success)
                        ) : (
                          <span className="dim">
                            {r.group === "Marketplaces" || r.name === "Meta Business" ? "never" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="wrap">
                        {r.last_error ? (
                          <span className="text-hold">{String(r.last_error).slice(0, 160)}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                        {log ? (
                          <div className="dim">
                            last: {String(log.operation)} · {String(log.status)}
                            {Number(r.failed_operations) ? ` · ${String(r.failed_operations)} failed` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="wrap">{String(r.note ?? "")}</td>
                      <td>
                        {r.configure && r.can_configure !== false ? (
                          <Link to={String(r.configure)} className="btn">
                            {r.can_configure ? "Configure" : "Open"}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="field-hint page-foot">
        States: Not implemented (no connector code), Not configured (nothing set up), Awaiting credentials
        (some set up), Access required (the provider must grant access), Connected (verified by a live test),
        Synchronising, Error. Credentials are stored encrypted on the server and never sent to the browser.
      </p>
    </div>
  );
}

const PLANNED: { group: string; name: string; note: string }[] = [
  { group: "Growth", name: "CRM and leads", note: "Customer pipeline and follow-ups." },
  {
    group: "Manufacturing",
    name: "Electronic batch manufacturing record (eBMR)",
    note: "Step-by-step batch records with sign-offs.",
  },
  { group: "Intelligence", name: "Analytics", note: "Trends across the reports already in the ERP." },
  {
    group: "Intelligence",
    name: "AI assistance",
    note: "Not started; needs a server-side provider and a review of what data may leave the factory.",
  },
  { group: "Finance", name: "GST compliance", note: "After GSTIN and accountant sign-off." },
];

export function PlannedModules() {
  useSession();
  // R&D, Maintenance, Marketplaces and Marketing are built: they have their own menus now
  return (
    <div className="page">
      <PageHeader
        title="Planned modules"
        crumbs={[C]}
        meta={<span>Not built. Listed so nobody looks for them in the menu.</span>}
      />
      <div className="panel">
        <table className="dt" aria-label="Planned modules">
          <thead>
            <tr>
              <th>Area</th>
              <th>Module</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {PLANNED.map((p) => (
              <tr key={p.name}>
                <td className="dim">{p.group}</td>
                <td>{p.name}</td>
                <td>
                  <StatusChip status="Planned" tone="neutral" />
                </td>
                <td className="wrap">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
