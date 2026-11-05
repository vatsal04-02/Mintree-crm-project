import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { BOOT_KEY, fetchBoot } from "./api/session";
import { Shell } from "./components/Shell";
import { ErrorNote, PageHeader } from "./components/ui";
import * as acc from "./modules/accounts";
import * as admin from "./modules/admin";
import { CommandCenter, Login } from "./modules/home";
import * as inv from "./modules/inventory";
import * as mnt from "./modules/maintenance";
import * as mktg from "./modules/marketing";
import * as mkt from "./modules/marketplace";
import * as proc from "./modules/procurement";
import * as prod from "./modules/production";
import * as qc from "./modules/quality";
import * as rnd from "./modules/research";
import * as sales from "./modules/sales";

type Ctx = { queryClient: QueryClient };

const root = createRootRouteWithContext<Ctx>()({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" toastOptions={{ unstyled: true, classNames: { toast: "toast" } }} />
    </>
  ),
});

const login = createRoute({
  getParentRoute: () => root,
  path: "/login",
  component: Login,
});

/** Everything below needs a Frappe session; the boot answer is the source of who is signed in. */
const app = createRoute({
  getParentRoute: () => root,
  id: "app",
  beforeLoad: async ({ context }) => {
    const boot = await context.queryClient.ensureQueryData({ queryKey: BOOT_KEY, queryFn: fetchBoot });
    if (!boot) throw redirect({ to: "/login" });
  },
  component: Shell,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorNote error={error} title="This page could not load" />
    </div>
  ),
  notFoundComponent: () => (
    <div className="page">
      <PageHeader title="Not found" />
      <p>There is no Factory OS page at this address.</p>
    </div>
  ),
});

const page = (path: string, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => app, path, component });

const routeTree = root.addChildren([
  login,
  app.addChildren([
    page("/", CommandCenter),
    page("/procurement/material-requests", proc.MaterialRequestList),
    page("/procurement/material-requests/new", proc.MaterialRequestNew),
    page("/procurement/material-requests/$name", proc.MaterialRequestPage),
    page("/procurement/purchase-orders", proc.PurchaseOrderList),
    page("/procurement/purchase-orders/new", proc.PurchaseOrderNew),
    page("/procurement/purchase-orders/$name", proc.PurchaseOrderPage),
    page("/procurement/receipts", proc.ReceiptList),
    page("/procurement/receipts/new", proc.ReceiptNew),
    page("/procurement/receipts/$name", proc.ReceiptPage),
    page("/procurement/requirements", prod.RequirementsReport),
    page("/inventory/stock", inv.StockByQC),
    page("/inventory/movements", inv.MovementList),
    page("/inventory/movements/new", inv.MovementNew),
    page("/inventory/movements/$name", inv.MovementPage),
    page("/production/work-orders", prod.WorkOrderList),
    page("/production/work-orders/new", prod.WorkOrderNew),
    page("/production/work-orders/$name", prod.WorkOrderPage),
    page("/production/wastage", prod.WastageReport),
    page("/quality/queue", qc.QCQueue),
    page("/quality/releases", qc.ReleaseList),
    page("/quality/releases/new", qc.ReleaseNew),
    page("/quality/releases/$name", qc.ReleasePage),
    page("/quality/deviations", qc.DeviationList),
    page("/quality/deviations/new", qc.DeviationNew),
    page("/quality/deviations/$name", qc.DeviationPage),
    page("/sales/orders", sales.SalesOrderList),
    page("/sales/orders/new", sales.SalesOrderNew),
    page("/sales/orders/$name", sales.SalesOrderPage),
    page("/sales/pick-lists", sales.PickListList),
    page("/sales/pick-lists/$name", sales.PickListPage),
    page("/sales/deliveries", sales.DeliveryList),
    page("/sales/deliveries/$name", sales.DeliveryPage),
    page("/sales/available", sales.AvailableToSellReport),
    page("/sales/dispatch-register", sales.DispatchRegister),
    page("/accounts/invoices", acc.InvoiceList),
    page("/accounts/invoices/$name", acc.InvoicePage),
    page("/accounts/payments", acc.PaymentList),
    page("/accounts/payments/new", acc.PaymentNew),
    page("/accounts/payments/$name", acc.PaymentPage),
    page("/accounts/receivables", acc.Receivables),
    page("/accounts/payables", acc.Payables),
    page("/research/formulations", rnd.FormulationList),
    page("/research/formulations/new", rnd.FormulationForm),
    page("/research/formulations/$name", rnd.FormulationPage),
    page("/research/formulations/$name/edit", rnd.FormulationForm),
    page("/research/projects", rnd.ProjectList),
    page("/research/projects/new", rnd.ProjectNew),
    page("/research/projects/$name", rnd.ProjectPage),
    page("/research/trials", rnd.TrialList),
    page("/research/trials/new", rnd.TrialNew),
    page("/research/trials/$name", rnd.TrialPage),
    page("/research/stability", rnd.StabilityList),
    page("/research/stability/new", rnd.StabilityNew),
    page("/research/stability/$name", rnd.StabilityPage),
    page("/maintenance", mnt.MaintenanceDashboard),
    page("/maintenance/assets", mnt.AssetList),
    page("/maintenance/assets/new", mnt.AssetNew),
    page("/maintenance/assets/$name", mnt.AssetPage),
    page("/maintenance/breakdowns", mnt.BreakdownList),
    page("/maintenance/breakdowns/new", mnt.BreakdownNew),
    page("/maintenance/breakdowns/$name", mnt.BreakdownPage),
    page("/maintenance/schedules", mnt.ScheduleList),
    page("/maintenance/schedules/new", mnt.ScheduleNew),
    page("/maintenance/schedules/$name", mnt.SchedulePage),
    page("/maintenance/tasks", mnt.TaskList),
    page("/maintenance/tasks/$name", mnt.TaskPage),
    page("/maintenance/spares", mnt.SparesPage),
    page("/marketplace", mkt.MarketplaceOverview),
    page("/marketplace/orders", mkt.OrderList),
    page("/marketplace/orders/new", mkt.OrderNew),
    page("/marketplace/orders/$name", mkt.OrderPage),
    page("/marketplace/listings", mkt.ListingList),
    page("/marketplace/listings/new", mkt.ListingNew),
    page("/marketplace/listings/$name", mkt.ListingPage),
    page("/marketplace/inventory", mkt.InventoryAllocation),
    page("/marketplace/returns", mkt.ReturnList),
    page("/marketplace/returns/$name", mkt.ReturnPage),
    page("/marketplace/settlements", mkt.SettlementList),
    page("/marketplace/settlements/new", mkt.SettlementNew),
    page("/marketplace/settlements/$name", mkt.SettlementPage),
    page("/marketplace/channels/$name", mkt.ChannelPage),
    page("/marketing", mktg.MarketingOverview),
    page("/marketing/campaigns", mktg.CampaignList),
    page("/marketing/campaigns/new", mktg.CampaignNew),
    page("/marketing/campaigns/$name", mktg.CampaignPage),
    page("/marketing/content", mktg.ContentList),
    page("/marketing/content/new", mktg.ContentNew),
    page("/marketing/content/$name", mktg.ContentPage),
    page("/marketing/meta", mktg.MetaConnectionPage),
    page("/integrations", admin.IntegrationCentre),
    page("/planned", admin.PlannedModules),
  ]),
]);

export function makeRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, basepath: "/factory", context: { queryClient }, defaultPreload: false });
}
