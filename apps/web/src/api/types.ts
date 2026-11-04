/**
 * Hand-written mirror of the planned API contract. Deleted when Orval generates
 * `src/api/` from the backend OpenAPI (docs/open-items.md).
 */
import type { Uom } from "@/lib/format";

export type ItemType = "RM" | "PM" | "BULK" | "FG";

/** Lot status. Only RELEASED stock can be consumed, reserved or sold (brief §6 rule 3). */
export type LotStatus = "HOLD" | "IN_TEST" | "RELEASED" | "REJECTED" | "EXPIRED";

export interface Item {
  code: string;
  name: string;
  type: ItemType;
  uom: Uom;
  /** Moving-average cost, integer paise per whole unit of measure. */
  costPaise: number;
}

export interface Lot {
  lotNo: string;
  itemCode: string;
  status: LotStatus;
  warehouse: string;
  bin: string;
  /** Where it came from: a GRN for bought goods, a work order for made goods. */
  sourceDoc: string;
  supplier: string | null;
  /** User who produced (FG/BULK) or received (RM/PM) the lot. */
  createdBy: string;
  receivedAt: string;
  mfgDate: string;
  expiryDate: string;
  /** When QC decided; null while HOLD or IN_TEST. */
  decidedAt: string | null;
  /** True when the lot passed at its first inspection. */
  firstPass: boolean | null;
  inspector: string | null;
}

export type LedgerDoc = "GRN" | "OUTPUT" | "ISSUE" | "RETURN" | "TRANSFER" | "DISPATCH";

/** One append-only stock movement. Balances are derived from these rows. */
export interface LedgerRow {
  id: string;
  lotNo: string;
  at: string;
  doc: LedgerDoc;
  docNo: string;
  /** Signed integer thousandths of the item's unit. */
  qtyMilli: number;
  warehouse: string;
  bin: string;
  actor: string;
}

export interface StockRow extends Lot {
  item: Item;
  balanceMilli: number;
  valuePaise: number;
  daysToExpiry: number;
}

export interface WorkOrder {
  woNo: string;
  product: string;
  stage: "Bulk" | "Fill and pack";
  plannedStart: string;
  needs: { itemCode: string; qtyMilli: number }[];
}

export interface Instrument {
  id: string;
  name: string;
  location: string;
  calibrationDue: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
  initials: string;
}
