import { useSession } from "@/api/session";
import { PageHeader, StatusChip } from "@/components/ui";

const C = { label: "Setup" };

type Status =
  | "Connected"
  | "Not implemented"
  | "Not configured"
  | "Awaiting credentials"
  | "Syncing"
  | "Error";

type Connector = { name: string; area: string; status: Status; note: string };

/**
 * What exists in the backend today. A connector is listed as Connected only when it is part of
 * the running system; nothing here has a Connect button because no connector code exists yet.
 */
const CONNECTORS: Connector[] = [
  {
    name: "ERPNext / Frappe",
    area: "System of record",
    status: "Connected",
    note: "This app reads and writes only through the ERP's REST API in your signed-in session.",
  },
  {
    name: "Amazon Seller",
    area: "Marketplace",
    status: "Not implemented",
    note: "No connector in the backend. D2C marketplace orders are entered by hand as Sales Orders with an external order ID.",
  },
  {
    name: "Flipkart Seller",
    area: "Marketplace",
    status: "Not implemented",
    note: "No connector in the backend.",
  },
  { name: "Myntra", area: "Marketplace", status: "Not implemented", note: "No connector in the backend." },
  { name: "Nykaa", area: "Marketplace", status: "Not implemented", note: "No connector in the backend." },
  {
    name: "Own website (D2C)",
    area: "Storefront",
    status: "Not implemented",
    note: "No connector. Website orders are entered as Sales Orders on the D2C Website channel.",
  },
  {
    name: "Courier / shipping aggregator",
    area: "Logistics",
    status: "Not implemented",
    note: "No connector. Transporter, LR / AWB number and date are typed on the delivery note.",
  },
  {
    name: "Meta (WhatsApp, Instagram)",
    area: "Messaging",
    status: "Not implemented",
    note: "No connector in the backend.",
  },
  {
    name: "GST e-invoice / e-way bill",
    area: "Tax",
    status: "Not configured",
    note: "Waiting for the company's GSTIN and the accountant's sign-off; no tax is calculated until then.",
  },
  {
    name: "AI assistant",
    area: "Intelligence",
    status: "Not implemented",
    note: "No AI provider is connected and no AI features exist. Provider keys would live on the server only.",
  },
];

export function IntegrationCentre() {
  return (
    <div className="page">
      <PageHeader
        title="Integration Centre"
        crumbs={[C]}
        meta={<span>Status of every outside connection, as built today</span>}
      />
      <div className="panel">
        <table className="dt" aria-label="Integrations">
          <thead>
            <tr>
              <th>Connection</th>
              <th>Area</th>
              <th>Status</th>
              <th>What this means</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTORS.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="dim">{c.area}</td>
                <td>
                  <StatusChip
                    status={c.status}
                    tone={
                      c.status === "Connected"
                        ? "released"
                        : c.status === "Error"
                          ? "rejected"
                          : c.status === "Not configured" || c.status === "Awaiting credentials"
                            ? "hold"
                            : "neutral"
                    }
                  />
                </td>
                <td className="wrap">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint page-foot">
        Statuses used here: Not implemented (no code exists), Not configured (code exists, settings missing),
        Awaiting credentials, Connected, Syncing, Error. Secrets for any future connector are stored on the
        server, never in the browser.
      </p>
    </div>
  );
}

const PLANNED: { group: string; name: string; note: string }[] = [
  { group: "Growth", name: "CRM and leads", note: "Customer pipeline and follow-ups." },
  {
    group: "Growth",
    name: "Marketplace order sync",
    note: "Depends on marketplace connectors (see Integration Centre).",
  },
  {
    group: "Manufacturing",
    name: "Electronic batch manufacturing record (eBMR)",
    note: "Step-by-step batch records with sign-offs.",
  },
  { group: "Manufacturing", name: "R&D and formulation", note: "Trial batches and formula versions." },
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
