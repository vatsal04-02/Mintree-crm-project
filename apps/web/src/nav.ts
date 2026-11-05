import {
  ArrowLeftRight,
  BadgeCheck,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  FlaskConical,
  Gauge,
  HandCoins,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  PackageCheck,
  PackageOpen,
  Plug,
  ReceiptIndianRupee,
  ScrollText,
  ShoppingCart,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { type Boot, can, hasReport } from "./api/session";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** shown only when the server says this user may use what is behind it */
  show: (b: Boot) => boolean;
  keywords?: string;
};
export type NavGroup = { label: string; items: NavItem[] };

const read = (dt: string) => (b: Boot) => can(b, dt, "read");
const report = (r: string) => (b: Boot) => hasReport(b, r);
const always = () => true;

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Command Center", to: "/", icon: Gauge, show: always, keywords: "home dashboard" }],
  },
  {
    label: "Supply Chain",
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
        label: "RM / PM Requirements",
        to: "/procurement/requirements",
        icon: ListChecks,
        show: report("RM PM Requirements"),
        keywords: "shortage planning",
      },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      {
        label: "Work Orders",
        to: "/production/work-orders",
        icon: Factory,
        show: read("Work Order"),
        keywords: "production manufacture",
      },
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
        label: "Wastage by Reason",
        to: "/production/wastage",
        icon: Trash2,
        show: report("Wastage by Reason"),
        keywords: "loss scrap",
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Sales Orders", to: "/sales/orders", icon: FileText, show: read("Sales Order") },
      {
        label: "Available to Sell",
        to: "/sales/available",
        icon: PackageCheck,
        show: report("Available to Sell"),
      },
      {
        label: "Deliveries",
        to: "/sales/deliveries",
        icon: Truck,
        show: read("Delivery Note"),
        keywords: "delivery note dispatch",
      },
      {
        label: "Dispatch Register",
        to: "/sales/dispatch-register",
        icon: ScrollText,
        show: report("Dispatch Register"),
      },
    ],
  },
  {
    label: "Finance",
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
      {
        label: "Receivables",
        to: "/accounts/receivables",
        icon: HandCoins,
        show: report("Accounts Receivable"),
        keywords: "outstanding debtors ageing",
      },
      {
        label: "Payables",
        to: "/accounts/payables",
        icon: HandCoins,
        show: report("Accounts Payable"),
        keywords: "creditors",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Integration Centre",
        to: "/integrations",
        icon: Plug,
        show: always,
        keywords: "marketplace connectors",
      },
      { label: "Planned Modules", to: "/planned", icon: MapIcon, show: always, keywords: "roadmap" },
    ],
  },
];

export function visibleNav(b: Boot): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.show(b)) })).filter((g) => g.items.length);
}

export type QuickAction = { label: string; to: string; doctype: string };

/** "New …" actions, offered only to roles that may create the document. */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: "New material request", to: "/procurement/material-requests/new", doctype: "Material Request" },
  { label: "New purchase order", to: "/procurement/purchase-orders/new", doctype: "Purchase Order" },
  { label: "New stock transfer", to: "/inventory/movements/new", doctype: "Stock Entry" },
  { label: "New work order", to: "/production/work-orders/new", doctype: "Work Order" },
  { label: "New QC release", to: "/quality/releases/new", doctype: "QC Release" },
  { label: "New deviation", to: "/quality/deviations/new", doctype: "QC Deviation" },
  { label: "New sales order", to: "/sales/orders/new", doctype: "Sales Order" },
];

export function quickActions(b: Boot): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => can(b, a.doctype, "create"));
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
];
