import type { EmptyProps } from "@/components/ui";

/**
 * Why a list or report can be empty, what has to exist first and where to go next.
 * Each entry names real pages only; a filtered tab says so and offers the unfiltered view.
 */
type Guide = Omit<EmptyProps, "title"> & { noun: string };

const GUIDES: Record<string, Guide> = {
  "Material Request": {
    noun: "material requests",
    reason: "A material request records what stores or production needs before anything is bought.",
    actions: [{ label: "New material request", to: "/procurement/material-requests/new", primary: true }],
  },
  "Purchase Order": {
    noun: "purchase orders",
    reason: "Purchase orders are raised by a buyer and approved by someone within their approval limit.",
    needs: ["A supplier", "Raw or packaging material items with a buying price"],
    actions: [
      { label: "New purchase order", to: "/procurement/purchase-orders/new", primary: true },
      { label: "RM / PM requirements", to: "/procurement/requirements" },
    ],
  },
  "Purchase Receipt": {
    noun: "goods receipts",
    reason: "Goods are received against an approved purchase order and go into QC Hold.",
    needs: ["A submitted purchase order with quantities still to receive"],
    actions: [
      { label: "Receive goods", to: "/procurement/receipts?start=1", primary: true },
      { label: "Purchase orders", to: "/procurement/purchase-orders" },
    ],
  },
  "Stock Entry": {
    noun: "stock movements",
    reason: "Transfers, wastage write-offs and work-order issues and output are all stock movements.",
    actions: [
      { label: "New movement", to: "/inventory/movements/new", primary: true },
      { label: "Stock by QC status", to: "/inventory/stock" },
    ],
  },
  "Work Order": {
    noun: "work orders",
    reason:
      "Production plans bulk from released raw materials, then fills finished goods from released bulk.",
    needs: ["An item with a default BOM", "Released components in the stores"],
    actions: [{ label: "New work order", to: "/production/work-orders/new", primary: true }],
  },
  "QC Release": {
    noun: "QC releases",
    reason: "Every batch received or produced waits in QC Hold until QC releases or rejects it.",
    actions: [
      { label: "QC queue", to: "/quality/queue", primary: true },
      { label: "Stock by QC status", to: "/inventory/stock" },
    ],
  },
  "QC Deviation": {
    noun: "deviations",
    reason: "A deviation records a batch accepted outside specification; QA must approve it.",
    actions: [{ label: "New deviation", to: "/quality/deviations/new", primary: true }],
  },
  "Sales Order": {
    noun: "sales orders",
    reason: "Orders are taken against customers; stock is reserved only from released, in-date batches.",
    needs: ["A customer", "Finished goods with a selling price"],
    actions: [
      { label: "New sales order", to: "/sales/orders/new", primary: true },
      { label: "Available to sell", to: "/sales/available" },
    ],
  },
  "Pick List": {
    noun: "pick lists",
    reason: "A pick list is made from a submitted sales order and picks eligible batches first-expiry-first.",
    needs: ["A submitted sales order with released stock available"],
    actions: [{ label: "Sales orders", to: "/sales/orders", primary: true }],
  },
  "Delivery Note": {
    noun: "deliveries",
    reason: "Deliveries are made from a pick list; transporter and LR / AWB are required.",
    needs: ["A submitted pick list"],
    actions: [{ label: "Start a delivery", to: "/sales/deliveries?start=1", primary: true }],
  },
  "Sales Invoice": {
    noun: "invoices",
    reason: "Invoices are made from deliveries, so stock leaves once. GST is not configured.",
    needs: ["A submitted delivery note not yet billed"],
    actions: [{ label: "Deliveries", to: "/sales/deliveries", primary: true }],
  },
  "Payment Entry": {
    noun: "payments",
    reason: "A payment is recorded against an outstanding invoice.",
    needs: ["A submitted invoice with an outstanding amount"],
    actions: [{ label: "Record payment", to: "/accounts/payments/new", primary: true }],
  },
};

const REPORT_GUIDES: Record<string, Guide> = {
  "Available to Sell": {
    noun: "stock available to sell",
    reason:
      "Only finished goods that QC has released, that sit in a usable warehouse, are not expired and meet the " +
      "minimum shelf life, and are not already reserved or picked, are available to sell.",
    needs: ["A finished-goods work order completed", "Its batch released by QC to FG-STORES"],
    actions: [
      { label: "QC queue", to: "/quality/queue", primary: true },
      { label: "Work orders", to: "/production/work-orders" },
      { label: "Stock by QC status", to: "/inventory/stock" },
    ],
  },
  "Stock by QC Status": {
    noun: "stock",
    reason: "No batch-tracked stock is on hand for these filters.",
    actions: [{ label: "Receive goods", to: "/procurement/receipts?start=1", primary: true }],
  },
  "QC Queue": {
    noun: "batches waiting for QC",
    reason: "Nothing is in QC Hold: every received or produced batch has been released or rejected.",
    actions: [{ label: "QC releases", to: "/quality/releases" }],
  },
  "Dispatch Register": {
    noun: "dispatches",
    reason: "No delivery was submitted in this period.",
    actions: [{ label: "Deliveries", to: "/sales/deliveries", primary: true }],
  },
  "RM PM Requirements": {
    noun: "material requirements",
    reason: "No open work order needs raw or packaging material, and nothing is below its reorder level.",
    actions: [{ label: "Work orders", to: "/production/work-orders" }],
  },
  "Wastage by Reason": {
    noun: "wastage",
    reason: "No wastage was written off in this period.",
    actions: [{ label: "Write off wastage", to: "/inventory/movements/new" }],
  },
};

export function emptyForList(
  doctype: string,
  title: string,
  tab: string,
  filtered: boolean,
  query: string,
): EmptyProps {
  const g = GUIDES[doctype];
  const noun = g?.noun ?? title.toLowerCase();
  if (query)
    return {
      title: `No ${noun} match “${query}”`,
      reason: "Search looks in the document number and the main name fields.",
    };
  if (filtered)
    return {
      title: `No ${noun} in “${tab}”`,
      reason: "Other tabs may have some; this one is filtered.",
      actions: g?.actions?.filter((a) => a.primary),
    };
  return { title: `No ${noun} yet`, reason: g?.reason, needs: g?.needs, actions: g?.actions };
}

export function emptyForReport(report: string, query: string): EmptyProps {
  if (query) return { title: `No rows match “${query}”` };
  const g = REPORT_GUIDES[report];
  return {
    title: g ? `No ${g.noun}` : "The report returned no rows",
    reason: g?.reason ?? "Nothing matches these filters.",
    needs: g?.needs,
    actions: g?.actions,
  };
}
