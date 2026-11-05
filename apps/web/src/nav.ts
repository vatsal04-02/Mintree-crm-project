import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Boxes as BoxesIcon,
  Calculator,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Factory,
  FileText,
  FlaskConical,
  FolderKanban,
  Gauge,
  House,
  Landmark,
  Link2,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  Megaphone,
  Microscope,
  Package,
  PackageOpen,
  Plug,
  Plus,
  ReceiptIndianRupee,
  Settings2,
  ShoppingCart,
  Store,
  Store as StoreIcon,
  Tags,
  TestTubes,
  Thermometer,
  TriangleAlert,
  Truck,
  Undo2,
  Wallet,
  Warehouse,
  Wrench,
} from "lucide-react";
import { type Boot, can, hasReport } from "./api/session";

/** A page in a module panel. `children` makes it a collapsible section. */
export type NavItem = {
  label: string;
  to?: string;
  icon?: LucideIcon;
  /** shown only when the server says this user may use what is behind it */
  show?: (b: Boot) => boolean;
  keywords?: string;
  children?: NavItem[];
};

export type Module = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** route prefixes that belong to this module (decide the open module for a URL) */
  prefixes: string[];
  items: NavItem[];
};

const read = (dt: string) => (b: Boot) => can(b, dt, "read");
const create = (dt: string) => (b: Boot) => can(b, dt, "create");
const report = (r: string) => (b: Boot) => hasReport(b, r);
/** ERPNext's ageing reports also read Journal Entries; offer them only to roles that may. */
const ledgerReport = (r: string) => (b: Boot) => hasReport(b, r) && can(b, "Journal Entry", "read");

export const MODULES: Module[] = [
  {
    key: "home",
    label: "Home",
    icon: House,
    prefixes: ["/"],
    items: [{ label: "Command Center", to: "/", icon: Gauge, keywords: "home dashboard queues" }],
  },
  {
    key: "buying",
    label: "Buying",
    icon: ShoppingCart,
    prefixes: ["/procurement"],
    items: [
      {
        label: "Material Requests",
        to: "/procurement/material-requests",
        icon: ClipboardList,
        show: read("Material Request"),
      },
      {
        label: "Purchase Orders",
        to: "/procurement/purchase-orders",
        icon: ShoppingCart,
        show: read("Purchase Order"),
      },
      {
        label: "Goods Receipts",
        to: "/procurement/receipts",
        icon: PackageOpen,
        show: read("Purchase Receipt"),
        keywords: "grn purchase receipt",
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          {
            label: "Material Request",
            to: "/procurement/material-requests/new",
            show: create("Material Request"),
          },
          { label: "Purchase Order", to: "/procurement/purchase-orders/new", show: create("Purchase Order") },
          { label: "Goods Receipt", to: "/procurement/receipts?start=1", show: create("Purchase Receipt") },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        children: [
          {
            label: "RM / PM Requirements",
            to: "/procurement/requirements",
            show: report("RM PM Requirements"),
            keywords: "shortage planning",
          },
          { label: "Stock by QC Status", to: "/inventory/stock", show: report("Stock by QC Status") },
          { label: "Payables", to: "/accounts/payables", show: ledgerReport("Accounts Payable") },
        ],
      },
    ],
  },
  {
    key: "stock",
    label: "Stock",
    icon: Warehouse,
    prefixes: ["/inventory"],
    items: [
      {
        label: "Stock by QC Status",
        to: "/inventory/stock",
        icon: Boxes,
        show: report("Stock by QC Status"),
        keywords: "inventory batches",
      },
      {
        label: "Stock Movements",
        to: "/inventory/movements",
        icon: ArrowLeftRight,
        show: read("Stock Entry"),
        keywords: "stock entry transfer",
      },
      {
        label: "Goods Receipts",
        to: "/procurement/receipts",
        icon: PackageOpen,
        show: read("Purchase Receipt"),
      },
      { label: "Pick Lists", to: "/sales/pick-lists", icon: ListChecks, show: read("Pick List") },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Stock Transfer", to: "/inventory/movements/new", show: create("Stock Entry") },
          {
            label: "Wastage Write-off",
            to: "/inventory/movements/new?type=wastage",
            show: create("Stock Entry"),
          },
        ],
      },
    ],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    icon: Factory,
    prefixes: ["/production"],
    items: [
      {
        label: "Work Orders",
        to: "/production/work-orders",
        icon: Factory,
        show: read("Work Order"),
        keywords: "production manufacture",
      },
      {
        label: "Stock Movements",
        to: "/inventory/movements",
        icon: ArrowLeftRight,
        show: read("Stock Entry"),
      },
      {
        label: "Create",
        icon: Plus,
        children: [{ label: "Work Order", to: "/production/work-orders/new", show: create("Work Order") }],
      },
      {
        label: "Reports",
        icon: BarChart3,
        children: [
          {
            label: "Wastage by Reason",
            to: "/production/wastage",
            show: report("Wastage by Reason"),
            keywords: "loss scrap",
          },
          {
            label: "RM / PM Requirements",
            to: "/procurement/requirements",
            show: report("RM PM Requirements"),
          },
        ],
      },
    ],
  },
  {
    key: "quality",
    label: "Quality",
    icon: FlaskConical,
    prefixes: ["/quality"],
    items: [
      {
        label: "QC Queue",
        to: "/quality/queue",
        icon: FlaskConical,
        show: report("QC Queue"),
        keywords: "quality hold",
      },
      { label: "QC Releases", to: "/quality/releases", icon: BadgeCheck, show: read("QC Release") },
      { label: "Deviations", to: "/quality/deviations", icon: ClipboardCheck, show: read("QC Deviation") },
      {
        label: "Stock by QC Status",
        to: "/inventory/stock",
        icon: Boxes,
        show: report("Stock by QC Status"),
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "QC Release", to: "/quality/releases/new", show: create("QC Release") },
          { label: "Deviation", to: "/quality/deviations/new", show: create("QC Deviation") },
        ],
      },
    ],
  },
  {
    key: "selling",
    label: "Selling",
    icon: Store,
    prefixes: ["/sales"],
    items: [
      { label: "Sales Orders", to: "/sales/orders", icon: FileText, show: read("Sales Order") },
      { label: "Pick Lists", to: "/sales/pick-lists", icon: ListChecks, show: read("Pick List") },
      {
        label: "Deliveries",
        to: "/sales/deliveries",
        icon: Truck,
        show: read("Delivery Note"),
        keywords: "delivery note dispatch",
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Sales Order", to: "/sales/orders/new", show: create("Sales Order") },
          { label: "Pick List", to: "/sales/pick-lists?start=1", show: create("Pick List") },
          { label: "Delivery", to: "/sales/deliveries?start=1", show: create("Delivery Note") },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        children: [
          { label: "Available to Sell", to: "/sales/available", show: report("Available to Sell") },
          { label: "Dispatch Register", to: "/sales/dispatch-register", show: report("Dispatch Register") },
          { label: "Receivables", to: "/accounts/receivables", show: ledgerReport("Accounts Receivable") },
        ],
      },
    ],
  },
  {
    key: "accounts",
    label: "Accounts",
    icon: Calculator,
    prefixes: ["/accounts"],
    items: [
      {
        label: "Sales Invoices",
        to: "/accounts/invoices",
        icon: ReceiptIndianRupee,
        show: read("Sales Invoice"),
      },
      {
        label: "Payments",
        to: "/accounts/payments",
        icon: Wallet,
        show: read("Payment Entry"),
        keywords: "payment entry receipt",
      },
      { label: "Deliveries", to: "/sales/deliveries", icon: Truck, show: read("Delivery Note") },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Sales Invoice", to: "/accounts/invoices?start=1", show: create("Sales Invoice") },
          { label: "Payment", to: "/accounts/payments?start=1", show: create("Payment Entry") },
        ],
      },
      {
        label: "Reports",
        icon: BarChart3,
        children: [
          {
            label: "Receivables",
            to: "/accounts/receivables",
            show: ledgerReport("Accounts Receivable"),
            keywords: "outstanding debtors ageing",
          },
          {
            label: "Payables",
            to: "/accounts/payables",
            show: ledgerReport("Accounts Payable"),
            keywords: "creditors",
          },
        ],
      },
    ],
  },
  {
    key: "rnd",
    label: "R&D",
    icon: Microscope,
    prefixes: ["/research"],
    items: [
      {
        label: "Formulations",
        to: "/research/formulations",
        icon: TestTubes,
        show: read("Formulation"),
        keywords: "formula recipe version",
      },
      {
        label: "Research Projects",
        to: "/research/projects",
        icon: FolderKanban,
        show: read("Research Project"),
      },
      {
        label: "Trials",
        to: "/research/trials",
        icon: Microscope,
        show: read("Formulation Trial"),
        keywords: "experiment trial batch",
      },
      {
        label: "Stability",
        to: "/research/stability",
        icon: Thermometer,
        show: read("Stability Study"),
        keywords: "stability study",
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Formulation", to: "/research/formulations/new", show: create("Formulation") },
          { label: "Research Project", to: "/research/projects/new", show: create("Research Project") },
          { label: "Trial", to: "/research/trials/new", show: create("Formulation Trial") },
          { label: "Stability Study", to: "/research/stability/new", show: create("Stability Study") },
        ],
      },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    prefixes: ["/maintenance"],
    items: [
      {
        label: "Overview",
        to: "/maintenance",
        icon: Gauge,
        show: read("Asset"),
        keywords: "maintenance dashboard downtime",
      },
      {
        label: "Equipment",
        to: "/maintenance/assets",
        icon: Cog,
        show: read("Asset"),
        keywords: "asset machine register",
      },
      {
        label: "Breakdowns",
        to: "/maintenance/breakdowns",
        icon: TriangleAlert,
        show: read("Asset Repair"),
        keywords: "repair failure",
      },
      {
        label: "Schedules",
        to: "/maintenance/schedules",
        icon: CalendarClock,
        show: read("Asset Maintenance"),
        keywords: "preventive",
      },
      { label: "Tasks", to: "/maintenance/tasks", icon: ClipboardCheck, show: read("Asset Maintenance Log") },
      { label: "Spare Parts", to: "/maintenance/spares", icon: Package, show: read("Bin") },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Breakdown report", to: "/maintenance/breakdowns/new", show: create("Asset Repair") },
          { label: "Equipment", to: "/maintenance/assets/new", show: create("Asset") },
          {
            label: "Preventive schedule",
            to: "/maintenance/schedules/new",
            show: create("Asset Maintenance"),
          },
        ],
      },
    ],
  },
  {
    key: "marketplace",
    label: "Marketplaces",
    icon: StoreIcon,
    prefixes: ["/marketplace"],
    items: [
      {
        label: "Overview",
        to: "/marketplace",
        icon: Gauge,
        show: read("Marketplace Order"),
        keywords: "amazon flipkart myntra nykaa ecommerce",
      },
      { label: "Orders", to: "/marketplace/orders", icon: ShoppingCart, show: read("Marketplace Order") },
      {
        label: "Listings",
        to: "/marketplace/listings",
        icon: Tags,
        show: read("Marketplace Listing"),
        keywords: "sku mapping",
      },
      {
        label: "Inventory to publish",
        to: "/marketplace/inventory",
        icon: BoxesIcon,
        show: read("Marketplace Listing"),
        keywords: "allocation stock sync",
      },
      { label: "Returns", to: "/marketplace/returns", icon: Undo2, show: read("Marketplace Return") },
      {
        label: "Settlements",
        to: "/marketplace/settlements",
        icon: Landmark,
        show: read("Marketplace Settlement"),
        keywords: "payout reconciliation fees",
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Marketplace order", to: "/marketplace/orders/new", show: create("Marketplace Order") },
          { label: "Listing", to: "/marketplace/listings/new", show: create("Marketplace Listing") },
          { label: "Settlement", to: "/marketplace/settlements/new", show: create("Marketplace Settlement") },
        ],
      },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    prefixes: ["/marketing"],
    items: [
      {
        label: "Overview",
        to: "/marketing",
        icon: Gauge,
        show: read("Marketing Campaign"),
        keywords: "brand meta ads performance",
      },
      { label: "Campaigns", to: "/marketing/campaigns", icon: Megaphone, show: read("Marketing Campaign") },
      {
        label: "Content Calendar",
        to: "/marketing/content",
        icon: CalendarDays,
        show: read("Marketing Content"),
        keywords: "creative posts reels approval",
      },
      {
        label: "Meta Connection",
        to: "/marketing/meta",
        icon: Link2,
        show: read("Meta Connection"),
        keywords: "facebook instagram",
      },
      {
        label: "Create",
        icon: Plus,
        children: [
          { label: "Campaign", to: "/marketing/campaigns/new", show: create("Marketing Campaign") },
          { label: "Content", to: "/marketing/content/new", show: create("Marketing Content") },
        ],
      },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    icon: Settings2,
    prefixes: ["/integrations", "/planned"],
    items: [
      { label: "Integration Centre", to: "/integrations", icon: Plug, keywords: "marketplace connectors" },
      { label: "Planned Modules", to: "/planned", icon: MapIcon, keywords: "roadmap" },
    ],
  },
];

function visibleItems(items: NavItem[], b: Boot): NavItem[] {
  return items
    .map((i) => (i.children ? { ...i, children: visibleItems(i.children, b) } : i))
    .filter((i) => (i.children ? i.children.length > 0 : !i.show || i.show(b)));
}

/** Modules with at least one page this user may open (Home and Setup always). Home also
 * gathers every Create action the role has, so starting any document is one click from home. */
export function visibleModules(b: Boot): Module[] {
  const mods = MODULES.map((m) => ({ ...m, items: visibleItems(m.items, b) })).filter(
    (m) => m.key === "home" || m.key === "setup" || m.items.length > 0,
  );
  const creates = new Map<string, NavItem>();
  for (const m of mods)
    for (const i of m.items)
      if (i.label === "Create")
        for (const c of i.children ?? []) if (c.to && !creates.has(c.to)) creates.set(c.to, c);
  return mods.map((m) =>
    m.key === "home" && creates.size
      ? { ...m, items: [...m.items, { label: "Create", icon: Plus, children: [...creates.values()] }] }
      : m,
  );
}

/** The module whose route prefix matches the path most closely. */
export function moduleForPath(mods: Module[], path: string): Module | undefined {
  let best: Module | undefined;
  let len = -1;
  for (const m of mods) {
    for (const p of m.prefixes) {
      const hit = p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`);
      if (hit && p.length > len) {
        best = m;
        len = p.length;
      }
    }
  }
  return best;
}

/** True when a module panel lists this exact page (so it can stay open while you work there). */
export function moduleHasPath(m: Module, path: string): boolean {
  const walk = (items: NavItem[]): boolean =>
    items.some((i) => (i.children ? walk(i.children) : i.to?.split("?")[0] === path));
  return walk(m.items);
}

export type Page = { label: string; to: string; module: string; keywords?: string };

/** Every page of every visible module, once, for search. */
export function allPages(b: Boot): Page[] {
  const out = new Map<string, Page>();
  const walk = (items: NavItem[], mod: string, parent?: string) => {
    for (const i of items) {
      if (i.children) walk(i.children, mod, i.label);
      else if (i.to && !out.has(i.to))
        out.set(i.to, {
          label: parent === "Create" ? `New ${i.label}` : i.label,
          to: i.to,
          module: mod,
          keywords: i.keywords,
        });
    }
  };
  for (const m of visibleModules(b)) walk(m.items, m.label);
  return [...out.values()];
}

export type QuickAction = { label: string; to: string };

/** "New …" actions this role may perform: the Create sections of every module. */
export function quickActions(b: Boot): QuickAction[] {
  return allPages(b)
    .filter((p) => p.label.startsWith("New "))
    .map((p) => ({ label: p.label, to: p.to }));
}

/** Documents global search looks in, with the route that opens each. */
export const SEARCHABLE: { doctype: string; route: (name: string) => string }[] = [
  { doctype: "Purchase Order", route: (n) => `/procurement/purchase-orders/${encodeURIComponent(n)}` },
  { doctype: "Material Request", route: (n) => `/procurement/material-requests/${encodeURIComponent(n)}` },
  { doctype: "Purchase Receipt", route: (n) => `/procurement/receipts/${encodeURIComponent(n)}` },
  { doctype: "Stock Entry", route: (n) => `/inventory/movements/${encodeURIComponent(n)}` },
  { doctype: "Work Order", route: (n) => `/production/work-orders/${encodeURIComponent(n)}` },
  { doctype: "QC Release", route: (n) => `/quality/releases/${encodeURIComponent(n)}` },
  { doctype: "QC Deviation", route: (n) => `/quality/deviations/${encodeURIComponent(n)}` },
  { doctype: "Sales Order", route: (n) => `/sales/orders/${encodeURIComponent(n)}` },
  { doctype: "Pick List", route: (n) => `/sales/pick-lists/${encodeURIComponent(n)}` },
  { doctype: "Delivery Note", route: (n) => `/sales/deliveries/${encodeURIComponent(n)}` },
  { doctype: "Sales Invoice", route: (n) => `/accounts/invoices/${encodeURIComponent(n)}` },
  { doctype: "Payment Entry", route: (n) => `/accounts/payments/${encodeURIComponent(n)}` },
  { doctype: "Batch", route: (n) => `/inventory/stock?batch=${encodeURIComponent(n)}` },
  { doctype: "Marketplace Order", route: (n) => `/marketplace/orders/${encodeURIComponent(n)}` },
  { doctype: "Marketplace Settlement", route: (n) => `/marketplace/settlements/${encodeURIComponent(n)}` },
  { doctype: "Marketing Campaign", route: (n) => `/marketing/campaigns/${encodeURIComponent(n)}` },
  { doctype: "Marketing Content", route: (n) => `/marketing/content/${encodeURIComponent(n)}` },
  { doctype: "Asset", route: (n) => `/maintenance/assets/${encodeURIComponent(n)}` },
  { doctype: "Asset Repair", route: (n) => `/maintenance/breakdowns/${encodeURIComponent(n)}` },
  { doctype: "Asset Maintenance", route: (n) => `/maintenance/schedules/${encodeURIComponent(n)}` },
  { doctype: "Asset Maintenance Log", route: (n) => `/maintenance/tasks/${encodeURIComponent(n)}` },
  { doctype: "Formulation", route: (n) => `/research/formulations/${encodeURIComponent(n)}` },
  { doctype: "Research Project", route: (n) => `/research/projects/${encodeURIComponent(n)}` },
  { doctype: "Formulation Trial", route: (n) => `/research/trials/${encodeURIComponent(n)}` },
  { doctype: "Stability Study", route: (n) => `/research/stability/${encodeURIComponent(n)}` },
];

/** Where a document of this DocType opens in Factory OS, if it has a page here. */
export function routeFor(doctype: string, name: string): string | undefined {
  return SEARCHABLE.find((s) => s.doctype === doctype)?.route(name);
}
