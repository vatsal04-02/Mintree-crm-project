/**
 * Sample API. Shaped like the endpoints Phase 1–2 will expose, so swapping in the Orval
 * client changes imports, not screens. Sorting, filtering and paging happen here ("server
 * side"), never in the table component.
 */
import { CURRENT_USER, db, getItem, INSTRUMENTS, ITEMS, QC_SLA_HOURS, SAMPLE_NOW, WORK_ORDERS } from "./sample";
import type { Item, LedgerRow, Lot, LotStatus, StockRow, WorkOrder } from "./types";

const LATENCY = import.meta.env.MODE === "test" ? 0 : 280;
const wait = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(
    public code: "NOT_FOUND" | "SEGREGATION_OF_DUTIES" | "INVALID_STATE",
    message: string,
  ) {
    super(message);
  }
}

export function balanceOf(lotNo: string): number {
  let sum = 0;
  for (const r of db.ledger) if (r.lotNo === lotNo) sum += r.qtyMilli;
  return sum;
}

function toStockRow(lot: Lot): StockRow {
  const item = getItem(lot.itemCode);
  const balanceMilli = balanceOf(lot.lotNo);
  return {
    ...lot,
    item,
    balanceMilli,
    valuePaise: Math.round((item.costPaise * balanceMilli) / 1000),
    daysToExpiry: Math.floor((new Date(`${lot.expiryDate}T00:00:00+05:30`).getTime() - SAMPLE_NOW.getTime()) / 86400000),
  };
}

export type StockSort = "lotNo" | "item" | "status" | "qty" | "expiry" | "value";
export interface StockQuery {
  q?: string;
  status?: LotStatus | "ALL";
  type?: Item["type"] | "ALL";
  sort?: StockSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface StockPage {
  rows: StockRow[];
  total: number;
  counts: Record<LotStatus | "ALL", number>;
  page: number;
  pageSize: number;
}

function matches(row: StockRow, q: string): boolean {
  if (!q) return true;
  const hay = `${row.lotNo} ${row.item.code} ${row.item.name} ${row.sourceDoc} ${row.supplier ?? ""} ${row.bin}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

const STATUS_ORDER: Record<LotStatus, number> = { HOLD: 0, IN_TEST: 1, RELEASED: 2, REJECTED: 3, EXPIRED: 4 };

export function queryStock(query: StockQuery): StockPage {
  const { q = "", status = "ALL", type = "ALL", sort = "expiry", dir = "asc", page = 1, pageSize = 200 } = query;
  const base = db.lots
    .map(toStockRow)
    .filter((r) => r.balanceMilli > 0 && (type === "ALL" || r.item.type === type) && matches(r, q));
  const counts: StockPage["counts"] = { ALL: base.length, HOLD: 0, IN_TEST: 0, RELEASED: 0, REJECTED: 0, EXPIRED: 0 };
  for (const r of base) counts[r.status] += 1;
  const filtered = status === "ALL" ? base : base.filter((r) => r.status === status);
  const key: Record<StockSort, (r: StockRow) => string | number> = {
    lotNo: (r) => r.lotNo,
    item: (r) => r.item.name,
    status: (r) => STATUS_ORDER[r.status],
    qty: (r) => r.balanceMilli,
    expiry: (r) => r.expiryDate,
    value: (r) => r.valuePaise,
  };
  const k = key[sort];
  filtered.sort((a, b) => {
    const x = k(a);
    const y = k(b);
    const c = x < y ? -1 : x > y ? 1 : a.lotNo.localeCompare(b.lotNo);
    return dir === "asc" ? c : -c;
  });
  const start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, counts, page, pageSize };
}

export async function fetchStock(query: StockQuery): Promise<StockPage> {
  await wait();
  return queryStock(query);
}

export interface LotDetail {
  row: StockRow;
  ledger: LedgerRow[];
}

export async function fetchLot(lotNo: string): Promise<LotDetail> {
  await wait(160);
  const lot = db.lots.find((l) => l.lotNo === lotNo);
  if (!lot) throw new ApiError("NOT_FOUND", `Lot ${lotNo} was not found.`);
  return {
    row: toStockRow(lot),
    ledger: db.ledger.filter((r) => r.lotNo === lotNo).sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export interface BlockedOrder {
  wo: WorkOrder;
  itemCode: string;
  itemName: string;
  shortMilli: number;
  waitingLot: StockRow;
}

export interface QcHome {
  queue: StockRow[];
  counts: { waiting: number; inTest: number; overdue: number; releasedToday: number; rejectedToday: number };
  blocked: BlockedOrder[];
  fpy: { week: string; passed: number; decided: number }[];
  instruments: typeof INSTRUMENTS;
}

export function slaMs(row: Pick<StockRow, "item">): number {
  return QC_SLA_HOURS[row.item.type] * 3600000;
}
export function waitedMs(row: Pick<Lot, "receivedAt">): number {
  return SAMPLE_NOW.getTime() - new Date(row.receivedAt).getTime();
}

function weekStart(d: Date): Date {
  const ist = new Date(d.getTime() + 330 * 60000);
  const day = (ist.getUTCDay() + 6) % 7;
  const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - day);
  return new Date(monday - 330 * 60000);
}

export function buildQcHome(): QcHome {
  const rows = db.lots.map(toStockRow);
  const queue = rows
    .filter((r) => r.status === "HOLD" || r.status === "IN_TEST")
    .sort((a, b) => waitedMs(b) / slaMs(b) - waitedMs(a) / slaMs(a));
  const istMidnight = new Date(
    `${new Date(SAMPLE_NOW.getTime() + 330 * 60000).toISOString().slice(0, 10)}T00:00:00+05:30`,
  ).getTime();
  const decidedToday = rows.filter((r) => r.decidedAt && new Date(r.decidedAt).getTime() >= istMidnight);

  const released = new Map<string, number>();
  for (const r of rows) if (r.status === "RELEASED") released.set(r.itemCode, (released.get(r.itemCode) ?? 0) + r.balanceMilli);
  const blocked: BlockedOrder[] = [];
  for (const wo of WORK_ORDERS) {
    for (const need of wo.needs) {
      const have = released.get(need.itemCode) ?? 0;
      const short = need.qtyMilli - have;
      const waitingLot = queue.find((q) => q.itemCode === need.itemCode);
      if (short > 0 && waitingLot) {
        blocked.push({ wo, itemCode: need.itemCode, itemName: getItem(need.itemCode).name, shortMilli: short, waitingLot });
      }
    }
  }
  blocked.sort((a, b) => a.wo.plannedStart.localeCompare(b.wo.plannedStart));

  const thisWeek = weekStart(SAMPLE_NOW).getTime();
  const fpy: QcHome["fpy"] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const from = thisWeek - w * 7 * 86400000;
    const to = from + 7 * 86400000;
    const inWeek = rows.filter((r) => r.decidedAt && +new Date(r.decidedAt) >= from && +new Date(r.decidedAt) < to);
    const label = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(
      new Date(from),
    );
    fpy.push({ week: label, passed: inWeek.filter((r) => r.firstPass).length, decided: inWeek.length });
  }

  return {
    queue,
    counts: {
      waiting: queue.filter((r) => r.status === "HOLD").length,
      inTest: queue.filter((r) => r.status === "IN_TEST").length,
      overdue: queue.filter((r) => waitedMs(r) > slaMs(r)).length,
      releasedToday: decidedToday.filter((r) => r.status === "RELEASED").length,
      rejectedToday: decidedToday.filter((r) => r.status === "REJECTED").length,
    },
    blocked,
    fpy,
    instruments: [...INSTRUMENTS].sort((a, b) => a.calibrationDue.localeCompare(b.calibrationDue)),
  };
}

export async function fetchQcHome(): Promise<QcHome> {
  await wait();
  return buildQcHome();
}

export type Decision = "RELEASED" | "REJECTED";

/**
 * Release or reject a held lot. Enforced here, not only in the UI: the lot must be in
 * HOLD or IN_TEST, and whoever produced a batch cannot release it (brief §6 rules 3–4).
 */
export function decideLotNow(lotNo: string, decision: Decision, actor = CURRENT_USER.name): Lot {
  const lot = db.lots.find((l) => l.lotNo === lotNo);
  if (!lot) throw new ApiError("NOT_FOUND", `Lot ${lotNo} was not found.`);
  if (lot.status !== "HOLD" && lot.status !== "IN_TEST") {
    throw new ApiError("INVALID_STATE", `Lot ${lotNo} is ${lot.status.toLowerCase()}, not waiting for QC.`);
  }
  if (decision === "RELEASED" && lot.createdBy === actor) {
    throw new ApiError("SEGREGATION_OF_DUTIES", "You produced this batch, so another QC officer must release it.");
  }
  lot.status = decision;
  lot.decidedAt = new Date(SAMPLE_NOW.getTime() + 60000).toISOString();
  lot.firstPass = decision === "RELEASED";
  lot.inspector = actor;
  if (decision === "REJECTED") lot.warehouse = "REJECTS";
  return lot;
}

export async function decideLot(lotNo: string, decision: Decision): Promise<Lot> {
  await wait(450);
  return decideLotNow(lotNo, decision);
}

export interface SearchHit {
  kind: "lot" | "item" | "wo";
  id: string;
  label: string;
  sub: string;
}

export function searchAll(term: string, limit = 8): SearchHit[] {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const l of db.lots) {
    const item = getItem(l.itemCode);
    if (`${l.lotNo} ${item.name}`.toLowerCase().includes(q))
      hits.push({ kind: "lot", id: l.lotNo, label: l.lotNo, sub: item.name });
    if (hits.length >= limit) break;
  }
  for (const i of ITEMS)
    if (`${i.code} ${i.name}`.toLowerCase().includes(q)) hits.push({ kind: "item", id: i.code, label: i.name, sub: i.code });
  for (const w of WORK_ORDERS)
    if (`${w.woNo} ${w.product}`.toLowerCase().includes(q)) hits.push({ kind: "wo", id: w.woNo, label: w.woNo, sub: w.product });
  return hits.slice(0, limit * 2);
}
