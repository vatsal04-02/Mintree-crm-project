import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Check, PlugZap, Send, X } from "lucide-react";
import { useState } from "react";
import { type Doc, docMethod, get, getDoc, insert, type Row, save } from "@/api/frappe";
import { can, useSession } from "@/api/session";
import { DataTable } from "@/components/DataTable";
import {
  ActionButton,
  Connections,
  DocFrame,
  ListPage,
  RefLink,
  useAction,
  useDoc,
  useList,
} from "@/components/doc";
import { DateField, LinkField, NumberField, SelectField, TextArea, TextField } from "@/components/fields";
import { EmptyState, ErrorNote, Facts, Note, PageHeader, Panel, StatusChip } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney, isoDate } from "@/lib/format";

const C = { label: "Marketing" };
const enc = encodeURIComponent;
const PLATFORMS = [
  "Meta (Facebook + Instagram)",
  "Facebook",
  "Instagram",
  "Google",
  "Marketplace ads",
  "Influencer",
  "Offline",
  "Other",
];
const MGR = "Marketing Manager";
const USR = "Marketing User";
const int = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN");

type Src = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchase_value: number;
  cost_per_lead: number | null;
  weeks: { week: string; spend: number; leads: number }[];
};
type Ov = {
  campaigns: Row[];
  by_campaign: Record<string, { spend: number; leads: number; cost_per_lead: number | null; source: string }>;
  by_source: Record<string, Src>;
  content: Row[];
  awaiting_approval: { campaigns: number; content: number };
  meta: Row | null;
};

function roles(boot: { roles: string[] }) {
  const r = new Set(boot.roles);
  return {
    manager: r.has(MGR) || r.has("System Manager"),
    user: r.has(USR) || r.has(MGR) || r.has("System Manager"),
  };
}

/* ---------------------------------------------------------------- Overview */

export function MarketingOverview() {
  const boot = useSession();
  const { data, error, isLoading } = useQuery({
    queryKey: ["mktg-ov"],
    queryFn: () => get<Ov>("factory_ops.api.marketing.overview"),
  });
  const cur = boot.currency ?? "INR";
  const byStatus = (s: string) => (data?.campaigns ?? []).filter((c) => c.status === s).length;
  const sources = Object.entries(data?.by_source ?? {});
  return (
    <div className="page">
      <PageHeader
        title="Brand & Marketing"
        crumbs={[C]}
        meta={<span>from campaign, content and performance records</span>}
      />
      <ErrorNote error={error} />
      {data?.meta && data.meta.connection_state !== "Connected" && (
        <Note tone="hold">
          <span>
            Meta is <strong>{String(data.meta.connection_state)}</strong>. Nothing is read from or published
            to Meta. Figures below are entered by hand from the ad platform, or are DEMO figures; each table
            names its source.
          </span>
        </Note>
      )}
      {isLoading && <p className="dim">Loading…</p>}
      {data && data.campaigns.length === 0 && (
        <EmptyState
          title="No campaigns yet"
          reason="A campaign holds its objective, audience, budget, schedule and team; its content and performance figures hang off it."
          actions={[{ label: "New campaign", to: "/marketing/campaigns/new", primary: true }]}
        />
      )}
      {data && data.campaigns.length > 0 && (
        <div className="kpi-strip">
          {["Live", "Approved", "Awaiting Approval", "Draft", "Completed"].map((s) => (
            <div key={s} className="kpi">
              <span className="kpi-label">{s}</span>
              <span className="kpi-value">{byStatus(s)}</span>
            </div>
          ))}
          <div className="kpi">
            <span className="kpi-label">Content in review</span>
            <span className="kpi-value">{data.awaiting_approval.content}</span>
          </div>
        </div>
      )}
      {sources.map(([source, s]) => (
        <Panel
          key={source}
          title={`Performance · source: ${source}`}
          meta={
            source.startsWith("DEMO") ? (
              <span className="text-hold">synthetic, not Mintree results</span>
            ) : undefined
          }
        >
          <div className="kpi-strip">
            <div className="kpi">
              <span className="kpi-label">Spend</span>
              <span className="kpi-value">{formatMoney(s.spend, cur)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Impressions</span>
              <span className="kpi-value">{int(s.impressions)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Clicks</span>
              <span className="kpi-value">{int(s.clicks)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Leads</span>
              <span className="kpi-value">{int(s.leads)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Cost per lead</span>
              <span className="kpi-value">
                {s.cost_per_lead === null ? "—" : formatMoney(s.cost_per_lead, cur)}
              </span>
              {s.cost_per_lead === null && <span className="kpi-sub">no leads recorded</span>}
            </div>
          </div>
          <WeekTable weeks={s.weeks} currency={cur} />
        </Panel>
      ))}
      {data && (
        <Panel
          title="Content calendar (last 7 days to next 21)"
          meta={<Link to="/marketing/content">All content</Link>}
        >
          <DataTable<Row>
            label="Content calendar"
            rowKey={(r) => String(r.name)}
            rows={data.content}
            empty={{
              title: "Nothing planned in this window",
              reason: "Plan posts, reels, stories and ad creatives against a campaign.",
              actions: [{ label: "Plan content", to: "/marketing/content/new", primary: true }],
            }}
            columns={[
              { key: "planned_date", label: "Date", render: (r) => formatDate(r.planned_date) },
              {
                key: "title",
                label: "Content",
                render: (r) => (
                  <Link to={`/marketing/content/${enc(String(r.name))}`}>{String(r.title)}</Link>
                ),
              },
              { key: "content_type", label: "Type" },
              { key: "platform", label: "Platform" },
              { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

function WeekTable({ weeks, currency }: { weeks: Src["weeks"]; currency: string }) {
  const max = Math.max(1, ...weeks.map((w) => w.spend));
  return (
    <table className="dt" aria-label="Spend and leads by week">
      <thead>
        <tr>
          <th>Week</th>
          <th>Spend</th>
          <th className="num">Leads</th>
          <th className="num">Cost per lead</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.week}>
            <td>{w.week}</td>
            <td>
              <span className="bar-cell">
                <span className="bar" style={{ width: `${(w.spend / max) * 100}%` }} />
                <span className="bar-value">{formatMoney(w.spend, currency)}</span>
              </span>
            </td>
            <td className="num">{int(w.leads)}</td>
            <td className="num">{w.leads ? formatMoney(w.spend / w.leads, currency) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- Campaigns */

export function CampaignList() {
  return (
    <ListPage<Row>
      title="Campaigns"
      crumbs={[C]}
      doctype="Marketing Campaign"
      fields={[
        "name",
        "campaign_name",
        "platform",
        "objective",
        "status",
        "start_date",
        "end_date",
        "budget",
        "is_demo",
      ]}
      searchFields={["name", "campaign_name"]}
      orderBy="start_date desc"
      tabs={[
        { label: "Running", filters: [["status", "in", ["Approved", "Live", "Paused"]]] },
        { label: "For approval", filters: { status: "Awaiting Approval" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketing/campaigns/${enc(String(r.name))}`}
      create="/marketing/campaigns/new"
      createLabel="New campaign"
      columns={[
        { key: "campaign_name", label: "Campaign" },
        { key: "platform", label: "Platform" },
        { key: "objective", label: "Objective" },
        {
          key: "start_date",
          label: "Runs",
          render: (r) => `${formatDate(r.start_date)}${r.end_date ? ` – ${formatDate(r.end_date)}` : ""}`,
        },
        {
          key: "budget",
          label: "Budget",
          num: true,
          render: (r) => (r.budget ? formatMoney(r.budget) : "—"),
        },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function CampaignNew() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    campaign_name: "",
    platform: PLATFORMS[0] ?? "",
    objective: "Leads",
    start_date: isoDate(),
    end_date: "",
    owner_user: "",
    target_audience: "",
    brief: "",
    products: "",
    team: "",
  });
  const [budget, setBudget] = useState<number | "">("");
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () =>
      insert({
        doctype: "Marketing Campaign",
        ...f,
        end_date: f.end_date || undefined,
        owner_user: f.owner_user || undefined,
        budget: budget === "" ? undefined : budget,
      }),
    {
      success: (d) => `Saved ${d.name}`,
      onDone: (d) => navigate({ to: `/marketing/campaigns/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="New campaign" crumbs={[C, { label: "Campaigns", to: "/marketing/campaigns" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Campaign">
          <div className="grid-2">
            <TextField label="Name" required value={f.campaign_name} onChange={set("campaign_name")} />
            <SelectField label="Platform" value={f.platform} onChange={set("platform")} options={PLATFORMS} />
            <SelectField
              label="Objective"
              value={f.objective}
              onChange={set("objective")}
              options={["Awareness", "Traffic", "Engagement", "Leads", "Sales", "App promotion"]}
            />
            <NumberField label="Budget" unit="INR" value={budget} onChange={setBudget} />
            <DateField label="Start" value={f.start_date} onChange={set("start_date")} />
            <DateField label="End" value={f.end_date} onChange={set("end_date")} />
            <LinkField
              label="Campaign owner"
              doctype="User"
              value={f.owner_user}
              onChange={set("owner_user")}
            />
            <TextField label="Products promoted" value={f.products} onChange={set("products")} />
          </div>
          <TextArea label="Target audience" value={f.target_audience} onChange={set("target_audience")} />
          <TextArea label="Brief" value={f.brief} onChange={set("brief")} />
          <TextArea label="Team members" value={f.team} onChange={set("team")} />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !f.campaign_name}>
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

const CAMPAIGN_ACTIONS: {
  action: string;
  label: string;
  from: string[];
  manager?: boolean;
  note?: "required";
  primary?: boolean;
  danger?: boolean;
}[] = [
  { action: "send_for_approval", label: "Send for approval", from: ["Draft", "Rejected"], primary: true },
  { action: "approve", label: "Approve", from: ["Awaiting Approval"], manager: true, primary: true },
  {
    action: "reject",
    label: "Reject",
    from: ["Awaiting Approval"],
    manager: true,
    note: "required",
    danger: true,
  },
  { action: "mark_live", label: "Mark live", from: ["Approved", "Paused"], primary: true },
  { action: "pause", label: "Pause", from: ["Live"] },
  { action: "complete", label: "Complete", from: ["Live", "Paused", "Approved"] },
];

export function CampaignPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Marketing Campaign", name);
  const perf = useList<Row>("Campaign Performance", {
    fields: [
      "name",
      "period_start",
      "period_end",
      "source",
      "spend",
      "impressions",
      "clicks",
      "leads",
      "ctr",
      "cpc",
      "cost_per_lead",
    ],
    filters: { campaign: name },
    orderBy: "period_start desc",
    limit: 200,
  });
  const [note, setNote] = useState("");
  const r = roles(boot);
  const act = useAction(
    ({ action, n }: { action: string; n?: string }) =>
      docMethod(doc as Doc, "apply_action", { action, note: n }),
    { success: (s) => `${name}: ${String(s)}`, onDone: () => refetch() },
  );
  const status = String(doc?.status ?? "");
  const offered = CAMPAIGN_ACTIONS.filter((a) => a.from.includes(status) && (a.manager ? r.manager : r.user));
  const cur = boot.currency ?? "INR";
  return (
    <DocFrame
      doc={doc}
      title={String(doc?.campaign_name ?? name)}
      crumbs={[C, { label: "Campaigns", to: "/marketing/campaigns" }]}
      error={error ?? act.error}
      actions={offered.map((a) => (
        <ActionButton
          key={a.action}
          label={a.label}
          primary={a.primary}
          danger={a.danger}
          icon={
            a.action === "approve" ? (
              <Check aria-hidden />
            ) : a.action === "reject" ? (
              <X aria-hidden />
            ) : a.action === "send_for_approval" ? (
              <Send aria-hidden />
            ) : undefined
          }
          pending={act.isPending}
          disabled={a.note === "required" && !note.trim()}
          onClick={() => act.mutate({ action: a.action, n: note || undefined })}
        />
      ))}
    >
      {doc && (
        <>
          {doc.is_demo ? (
            <Note tone="hold">
              DEMO - NOT REAL. Synthetic campaign; its figures are not Mintree advertising results.
            </Note>
          ) : null}
          {offered.some((a) => a.note) && (
            <Panel title="Decision note">
              <TextArea label="Note (required to reject)" value={note} onChange={setNote} />
            </Panel>
          )}
          <Panel>
            <Facts
              items={[
                ["Platform", String(doc.platform)],
                ["Objective", String(doc.objective)],
                [
                  "Runs",
                  `${formatDate(doc.start_date)}${doc.end_date ? ` – ${formatDate(doc.end_date)}` : ""}`,
                ],
                ["Budget", doc.budget ? formatMoney(doc.budget, cur) : "—"],
                ["Owner", String(doc.owner_user || "—")],
                ["Products", String(doc.products || "—")],
                ["Audience", String(doc.target_audience || "—")],
                ["Brief", String(doc.brief || "—")],
                ["Team", String(doc.team || "—")],
                ["Sent by", String(doc.submitted_by || "—")],
                ["Decided by", String(doc.approved_by || "—")],
                ["Decision", String(doc.decision_note || "—")],
                ["Meta campaign ID", String(doc.external_campaign_id || "not linked (no Meta connection)")],
              ]}
            />
          </Panel>
          <Panel
            title="Performance"
            meta={<span>each row names its source; ratios only where their inputs exist</span>}
          >
            <DataTable<Row>
              label="Performance"
              rowKey={(x) => String(x.name)}
              rows={perf.data}
              loading={perf.isLoading}
              empty={{
                title: "No performance figures yet",
                reason:
                  "Enter the figures from the ad platform's report for a period; nothing is fetched or estimated.",
              }}
              columns={[
                {
                  key: "period_start",
                  label: "Period",
                  render: (x) => `${formatDate(x.period_start)} – ${formatDate(x.period_end)}`,
                },
                { key: "source", label: "Source" },
                { key: "spend", label: "Spend", num: true, render: (x) => formatMoney(x.spend, cur) },
                { key: "impressions", label: "Impr.", num: true, render: (x) => int(x.impressions) },
                { key: "clicks", label: "Clicks", num: true, render: (x) => int(x.clicks) },
                { key: "leads", label: "Leads", num: true, render: (x) => int(x.leads) },
                {
                  key: "ctr",
                  label: "CTR",
                  num: true,
                  render: (x) =>
                    x.ctr === null || x.ctr === undefined ? "—" : `${Number(x.ctr).toFixed(2)}%`,
                },
                {
                  key: "cost_per_lead",
                  label: "Cost / lead",
                  num: true,
                  render: (x) => (x.cost_per_lead ? formatMoney(x.cost_per_lead, cur) : "—"),
                },
              ]}
            />
          </Panel>
          {!doc.is_demo && can(boot, "Campaign Performance", "create") && (
            <AddPerformance campaign={name} onDone={() => perf.refetch()} />
          )}
          <Connections
            items={[
              {
                label: "Content",
                doctype: "Marketing Content",
                filters: { campaign: name },
                route: (n) => `/marketing/content/${enc(n)}`,
              },
            ]}
          />
        </>
      )}
    </DocFrame>
  );
}

function AddPerformance({ campaign, onDone }: { campaign: string; onDone: () => void }) {
  const [from, setFrom] = useState(isoDate(new Date(), -7));
  const [to, setTo] = useState(isoDate());
  const [m, setM] = useState<Record<string, number | "">>({
    spend: "",
    impressions: "",
    reach: "",
    clicks: "",
    leads: "",
    purchases: "",
    purchase_value: "",
  });
  const add = useAction(
    () =>
      insert({
        doctype: "Campaign Performance",
        campaign,
        period_start: from,
        period_end: to,
        source: "Manual entry from the ad platform",
        ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== "")),
      }),
    { success: "Figures recorded", onDone },
  );
  const labels: [string, string][] = [
    ["spend", "Spend (INR)"],
    ["impressions", "Impressions"],
    ["reach", "Reach"],
    ["clicks", "Clicks"],
    ["leads", "Leads"],
    ["purchases", "Purchases"],
    ["purchase_value", "Purchase value (INR)"],
  ];
  return (
    <Panel title="Enter figures from the ad platform's report">
      <ErrorNote error={add.error} />
      <div className="grid-3">
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
        {labels.map(([k, l]) => (
          <NumberField key={k} label={l} value={m[k] ?? ""} onChange={(v) => setM({ ...m, [k]: v })} />
        ))}
      </div>
      <div className="form-actions">
        <ActionButton primary label="Record figures" pending={add.isPending} onClick={() => add.mutate()} />
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- Content */

export function ContentList() {
  return (
    <ListPage<Row>
      title="Content Calendar"
      crumbs={[C]}
      doctype="Marketing Content"
      fields={[
        "name",
        "title",
        "campaign",
        "content_type",
        "platform",
        "planned_date",
        "status",
        "assigned_to",
      ]}
      searchFields={["name", "title"]}
      orderBy="planned_date asc"
      tabs={[
        { label: "Upcoming", filters: [["planned_date", ">=", isoDate(new Date(), -1)]] },
        { label: "In review", filters: { status: "In Review" } },
        { label: "All", filters: {} },
      ]}
      detail={(r) => `/marketing/content/${enc(String(r.name))}`}
      create="/marketing/content/new"
      createLabel="Plan content"
      columns={[
        { key: "planned_date", label: "Date", render: (r) => formatDate(r.planned_date) },
        { key: "title", label: "Content" },
        { key: "content_type", label: "Type" },
        { key: "platform", label: "Platform" },
        { key: "assigned_to", label: "Assigned", render: (r) => String(r.assigned_to || "—") },
        { key: "status", label: "Status", render: (r) => <StatusChip status={String(r.status)} /> },
      ]}
    />
  );
}

export function ContentNew() {
  const navigate = useNavigate();
  const boot = useSession();
  const [f, setF] = useState({
    title: "",
    campaign: "",
    content_type: "Image post",
    platform: "Instagram",
    planned_date: isoDate(new Date(), 3),
    assigned_to: boot.user,
    caption: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const create = useAction(
    () => insert({ doctype: "Marketing Content", ...f, campaign: f.campaign || undefined }),
    {
      success: (d) => `Planned ${d.name}`,
      onDone: (d) => navigate({ to: `/marketing/content/${enc(d.name)}` }),
    },
  );
  return (
    <div className="page page-form">
      <PageHeader title="Plan content" crumbs={[C, { label: "Content", to: "/marketing/content" }]} />
      <ErrorNote error={create.error} />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Panel title="Content">
          <div className="grid-2">
            <TextField label="Title" required value={f.title} onChange={set("title")} />
            <LinkField
              label="Campaign"
              doctype="Marketing Campaign"
              value={f.campaign}
              onChange={set("campaign")}
            />
            <SelectField
              label="Type"
              value={f.content_type}
              onChange={set("content_type")}
              options={[
                "Image post",
                "Carousel",
                "Reel / video",
                "Story",
                "Ad creative",
                "Blog / article",
                "Email",
                "Other",
              ]}
            />
            <SelectField label="Platform" value={f.platform} onChange={set("platform")} options={PLATFORMS} />
            <DateField label="Planned for" value={f.planned_date} onChange={set("planned_date")} />
            <LinkField
              label="Assigned to"
              doctype="User"
              value={f.assigned_to}
              onChange={set("assigned_to")}
            />
          </div>
          <TextArea label="Draft caption" value={f.caption} onChange={set("caption")} />
        </Panel>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !f.title}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

const CONTENT_ACTIONS: {
  action: string;
  label: string;
  from: string[];
  manager?: boolean;
  note?: "required";
  primary?: boolean;
  danger?: boolean;
}[] = [
  { action: "start_production", label: "Start production", from: ["Idea", "Rejected"] },
  { action: "send_for_review", label: "Send for review", from: ["Idea", "In Production"], primary: true },
  { action: "approve", label: "Approve", from: ["In Review"], manager: true, primary: true },
  { action: "reject", label: "Reject", from: ["In Review"], manager: true, note: "required", danger: true },
  { action: "schedule", label: "Mark scheduled", from: ["Approved"], primary: true },
  { action: "mark_published", label: "Mark published", from: ["Scheduled", "Approved"] },
];

export function ContentPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Marketing Content", name);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const r = roles(boot);
  const act = useAction(
    async ({ action, n }: { action: string; n?: string }) => {
      if (action === "mark_published" && url) {
        const fresh = await getDoc("Marketing Content", name);
        await save({ ...fresh, published_url: url } as Doc);
      }
      const fresh = await getDoc("Marketing Content", name);
      return docMethod(fresh, "apply_action", { action, note: n });
    },
    { success: (s) => `${name}: ${String(s)}`, onDone: () => refetch() },
  );
  const saveCaption = useAction(
    async () => save({ ...(await getDoc("Marketing Content", name)), caption } as Doc),
    {
      success: "Caption saved",
      onDone: () => {
        setCaption(null);
        refetch();
      },
    },
  );
  const status = String(doc?.status ?? "");
  const offered = CONTENT_ACTIONS.filter((a) => a.from.includes(status) && (a.manager ? r.manager : r.user));
  return (
    <DocFrame
      doc={doc}
      title={String(doc?.title ?? name)}
      crumbs={[C, { label: "Content", to: "/marketing/content" }]}
      error={error ?? act.error ?? saveCaption.error}
      actions={offered.map((a) => (
        <ActionButton
          key={a.action}
          label={a.label}
          primary={a.primary}
          danger={a.danger}
          pending={act.isPending}
          disabled={a.note === "required" && !note.trim()}
          onClick={() => act.mutate({ action: a.action, n: note || undefined })}
        />
      ))}
    >
      {doc && (
        <>
          {doc.is_demo ? <Note tone="hold">DEMO - NOT REAL. Synthetic content record.</Note> : null}
          <Panel>
            <Facts
              items={[
                [
                  "Campaign",
                  doc.campaign ? <RefLink key="c" doctype="Marketing Campaign" name={doc.campaign} /> : "—",
                ],
                ["Type", String(doc.content_type)],
                ["Platform", String(doc.platform)],
                ["Planned for", formatDate(doc.planned_date)],
                ["Assigned to", String(doc.assigned_to || "—")],
                [
                  "Creative",
                  doc.creative ? (
                    <a key="f" href={String(doc.creative)} target="_blank" rel="noreferrer">
                      open file
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                ["Approved by", String(doc.approved_by || "—")],
                ["Review note", String(doc.review_note || "—")],
                [
                  "Published at",
                  doc.published_url ? (
                    <a key="u" href={String(doc.published_url)} target="_blank" rel="noreferrer">
                      {String(doc.published_url)}
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                ["Publishing", "by hand: no publishing connection exists"],
              ]}
            />
          </Panel>
          <Panel title="Draft caption">
            {caption === null ? (
              <>
                <p className="prewrap">{String(doc.caption || "—")}</p>
                {["Idea", "In Production", "Rejected"].includes(status) && (
                  <button type="button" className="btn" onClick={() => setCaption(String(doc.caption ?? ""))}>
                    Edit caption
                  </button>
                )}
              </>
            ) : (
              <>
                <TextArea label="Caption" value={caption} onChange={setCaption} />
                <div className="form-actions">
                  <ActionButton
                    primary
                    label="Save caption"
                    pending={saveCaption.isPending}
                    onClick={() => saveCaption.mutate()}
                  />
                </div>
              </>
            )}
          </Panel>
          {offered.some((a) => a.note) && (
            <Panel title="Review note">
              <TextArea label="Note (required to reject)" value={note} onChange={setNote} />
            </Panel>
          )}
          {offered.some((a) => a.action === "mark_published") && !doc.published_url && (
            <Panel title="Where it was published">
              <TextField label="URL" value={url} onChange={setUrl} hint="Needed to mark it published" />
            </Panel>
          )}
        </>
      )}
    </DocFrame>
  );
}

/* ---------------------------------------------------------------- Meta connection */

export function MetaConnectionPage() {
  const boot = useSession();
  const { data: doc, error, refetch } = useDoc("Meta Connection", "Meta Business");
  const [c, setC] = useState({
    business_id: "",
    ad_account_id: "",
    app_id: "",
    app_secret: "",
    system_user_token: "",
  });
  const writable = can(boot, "Meta Connection", "write");
  const saveIt = useAction(
    async () =>
      save({
        ...(await getDoc("Meta Connection", "Meta Business")),
        ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)),
      } as Doc),
    {
      success: "Saved; the state is worked out by the server",
      onDone: () => {
        setC({ business_id: "", ad_account_id: "", app_id: "", app_secret: "", system_user_token: "" });
        refetch();
      },
    },
  );
  const test = useAction(() => docMethod<Row>(doc as Doc, "test_connection"), { onDone: () => refetch() });
  return (
    <DocFrame
      doc={doc ? ({ ...doc, status: String(doc.connection_state) } as Doc) : undefined}
      title="Meta Business"
      crumbs={[C]}
      error={error ?? saveIt.error ?? test.error}
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
                [
                  "State",
                  <StatusChip
                    key="s"
                    status={String(doc.connection_state)}
                    tone={doc.connection_state === "Connected" ? "released" : "hold"}
                  />,
                ],
                ["What access needs", String(doc.access_note || "—")],
                ["Business ID", String(doc.business_id || "—")],
                ["Ad account", String(doc.ad_account_id || "—")],
                ["App ID", String(doc.app_id || "—")],
                ["Secrets", "stored encrypted on the server; never shown"],
                ["Last test", formatDateTime(doc.last_tested_at)],
                ["Last result", String(doc.last_error || "—")],
              ]}
            />
          </Panel>
          {test.data && (
            <Note tone="hold">
              {String(test.data.status)}: {String(test.data.message)}
            </Note>
          )}
          {writable && (
            <Panel title="Credentials">
              <div className="grid-2">
                <TextField
                  label="Business portfolio ID"
                  value={c.business_id}
                  onChange={(v) => setC({ ...c, business_id: v })}
                />
                <TextField
                  label="Ad account ID (act_…)"
                  value={c.ad_account_id}
                  onChange={(v) => setC({ ...c, ad_account_id: v })}
                />
                <TextField label="App ID" value={c.app_id} onChange={(v) => setC({ ...c, app_id: v })} />
                <TextField
                  label="App secret (write only)"
                  value={c.app_secret}
                  onChange={(v) => setC({ ...c, app_secret: v })}
                />
                <TextField
                  label="System user token (write only)"
                  value={c.system_user_token}
                  onChange={(v) => setC({ ...c, system_user_token: v })}
                />
              </div>
              <div className="form-actions">
                <ActionButton
                  primary
                  label="Save credentials"
                  pending={saveIt.isPending}
                  onClick={() => saveIt.mutate()}
                />
              </div>
            </Panel>
          )}
        </>
      )}
    </DocFrame>
  );
}
