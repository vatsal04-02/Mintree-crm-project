/**
 * SAMPLE data for the Phase 0 frontend. Every name and number here is a labelled placeholder
 * (brief §2): item codes, suppliers and people carry the SAMPLE prefix. Generated from a fixed
 * seed so screenshots and tests are stable. Balances are always computed from ledger rows.
 */
import type { Uom } from "@/lib/format";
import type { Instrument, Item, LedgerRow, Lot, LotStatus, User, WorkOrder } from "./types";

/** The sample build's clock: Wednesday 4 Nov 2026, 10:30 IST. */
export const SAMPLE_NOW = new Date("2026-11-04T10:30:00+05:30");

export const CURRENT_USER: User = {
  id: "u-qc-1",
  name: "SAMPLE QC Officer",
  role: "QC officer",
  initials: "QO",
};

const PEOPLE = {
  stores: "SAMPLE Stores Lead",
  production: "SAMPLE Production Lead",
  qc1: CURRENT_USER.name,
  qc2: "SAMPLE QC Manager",
} as const;

/** Release SLA from receipt, per item type, in hours. */
export const QC_SLA_HOURS: Record<Item["type"], number> = { RM: 48, PM: 24, BULK: 8, FG: 24 };

// Deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261104);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const it = (code: string, name: string, type: Item["type"], uom: Uom, costPaise: number): Item => ({
  code: `SAMPLE-${code}`,
  name,
  type,
  uom,
  costPaise,
});

export const ITEMS: Item[] = [
  it("RM-0101", "Niacinamide", "RM", "kg", 182_000),
  it("RM-0102", "Glycerin", "RM", "kg", 14_500),
  it("RM-0103", "Sodium hyaluronate", "RM", "kg", 2_450_000),
  it("RM-0104", "Cetearyl alcohol", "RM", "kg", 21_000),
  it("RM-0105", "Xanthan gum", "RM", "kg", 64_000),
  it("RM-0106", "Phenoxyethanol", "RM", "kg", 38_000),
  it("RM-0107", "Fragrance, rose 03", "RM", "kg", 410_000),
  it("RM-0108", "Fragrance, vetiver 01", "RM", "kg", 525_000),
  it("RM-0109", "Purified water", "RM", "L", 120),
  it("RM-0110", "Squalane", "RM", "kg", 168_000),
  it("RM-0111", "Panthenol", "RM", "kg", 142_000),
  it("RM-0112", "Shea butter", "RM", "kg", 52_000),
  it("PM-0201", "Bottle 30 mL amber, glass", "PM", "pcs", 1_450),
  it("PM-0202", "Dropper cap 18 mm", "PM", "pcs", 980),
  it("PM-0203", "Jar 50 g frosted", "PM", "pcs", 2_200),
  it("PM-0204", "Pump 24/410 white", "PM", "pcs", 760),
  it("PM-0205", "Carton, serum 30 mL", "PM", "pcs", 640),
  it("PM-0206", "Label, serum front v4", "PM", "pcs", 180),
  it("PM-0207", "Shipper, 48 units", "PM", "pcs", 3_900),
  it("BK-0301", "Bulk, niacinamide serum", "BULK", "kg", 61_000),
  it("BK-0302", "Bulk, hydrating cream", "BULK", "kg", 48_000),
  it("BK-0303", "Bulk, body lotion vetiver", "BULK", "kg", 33_000),
  it("FG-0401", "Niacinamide serum 30 mL", "FG", "pcs", 9_800),
  it("FG-0402", "Hydrating cream 50 g", "FG", "pcs", 11_200),
  it("FG-0403", "Body lotion vetiver 200 mL", "FG", "pcs", 8_400),
  it("FG-0404", "Serum tester 10 mL", "FG", "pcs", 3_100),
];

const itemByCode = new Map(ITEMS.map((i) => [i.code, i]));
export function getItem(code: string): Item {
  const item = itemByCode.get(code);
  if (!item) throw new Error(`Unknown item ${code}`);
  return item;
}

const SUPPLIERS = ["SAMPLE Supplier A", "SAMPLE Supplier B", "SAMPLE Supplier C", "SAMPLE Supplier D"];
const WAREHOUSE: Record<Item["type"], string> = { RM: "RM-MAIN", PM: "PM-MAIN", BULK: "BULK-01", FG: "FG-MAIN" };

const HOUR = 3600000;
const DAY = 24 * HOUR;

function lotQtyMilli(item: Item): number {
  switch (item.uom) {
    case "kg":
    case "L":
      return between(5, 600) * 1000 + between(0, 3) * 250;
    case "pcs":
      return between(4, 60) * 500 * 1000;
    default:
      return between(100, 900) * 1000;
  }
}

let ledgerSeq = 0;
const ledger: LedgerRow[] = [];
const lots: Lot[] = [];

function addLedger(row: Omit<LedgerRow, "id">) {
  ledgerSeq += 1;
  ledger.push({ id: `SAMPLE-LG-${String(ledgerSeq).padStart(6, "0")}`, ...row });
}

function buildLots() {
  let grn = 1180;
  let wo = 310;
  let batch = 100;
  // 11 weeks of history, oldest first, about 3 lots a day.
  for (let n = 0; n < 236; n += 1) {
    const item = pick(ITEMS);
    const ageHours = Math.floor(((236 - n) / 236) * 77 * 24) + between(0, 6);
    const received = new Date(SAMPLE_NOW.getTime() - ageHours * HOUR);
    const bought = item.type === "RM" || item.type === "PM";
    const lotNo = bought
      ? `SAMPLE-L-${String(2600 + n).padStart(5, "0")}`
      : `B-${String((batch += 1)).padStart(4, "0")}`;
    const sourceDoc = bought ? `SAMPLE-GRN-${(grn += 1)}` : `SAMPLE-WO-${(wo += 1)}`;
    const shelfDays = item.type === "RM" ? between(120, 720) : item.type === "PM" ? 1460 : between(240, 900);
    const mfg = new Date(received.getTime() - between(2, 40) * DAY);
    const expiry = new Date(mfg.getTime() + shelfDays * DAY);

    let status: LotStatus;
    let decidedAt: Date | null = null;
    let firstPass: boolean | null = null;
    const slaH = QC_SLA_HOURS[item.type];
    if (ageHours < slaH * 1.8 && rand() < 0.75) {
      status = rand() < 0.68 ? "HOLD" : "IN_TEST";
    } else {
      const roll = rand();
      const hours = Math.min(ageHours - 1, between(2, slaH + 10));
      decidedAt = new Date(received.getTime() + hours * HOUR);
      if (roll < 0.06) {
        status = "REJECTED";
        firstPass = false;
      } else {
        status = "RELEASED";
        firstPass = roll > 0.14;
      }
    }
    if (status === "RELEASED" && expiry < SAMPLE_NOW) status = "EXPIRED";

    const creator = bought ? PEOPLE.stores : rand() < 0.3 ? PEOPLE.qc1 : PEOPLE.production;
    const lot: Lot = {
      lotNo,
      itemCode: item.code,
      status,
      warehouse: status === "REJECTED" ? "REJECTS" : WAREHOUSE[item.type],
      bin: `${item.type === "FG" ? "F" : item.type[0]}-${String(between(1, 24)).padStart(2, "0")}-${pick(["A", "B", "C"])}`,
      sourceDoc,
      supplier: bought ? pick(SUPPLIERS) : null,
      createdBy: creator,
      receivedAt: received.toISOString(),
      mfgDate: mfg.toISOString().slice(0, 10),
      expiryDate: expiry.toISOString().slice(0, 10),
      decidedAt: decidedAt?.toISOString() ?? null,
      firstPass,
      inspector: decidedAt ? pick([PEOPLE.qc1, PEOPLE.qc2]) : null,
    };
    lots.push(lot);

    const qty = lotQtyMilli(item);
    addLedger({
      lotNo,
      at: received.toISOString(),
      doc: bought ? "GRN" : "OUTPUT",
      docNo: sourceDoc,
      qtyMilli: qty,
      warehouse: lot.warehouse,
      bin: lot.bin,
      actor: creator,
    });
    // Only released stock is ever issued or dispatched (brief §6 rule 3).
    if (status === "RELEASED" || status === "EXPIRED") {
      let left = qty;
      const moves = between(0, 3);
      for (let m = 0; m < moves && decidedAt; m += 1) {
        const share = Math.floor((left * between(10, 45)) / 100 / 1000) * 1000;
        if (share <= 0) break;
        left -= share;
        const at = new Date(decidedAt.getTime() + between(4, 200) * HOUR);
        if (at > SAMPLE_NOW) break;
        const out = item.type === "FG" ? "DISPATCH" : "ISSUE";
        addLedger({
          lotNo,
          at: at.toISOString(),
          doc: out,
          docNo: out === "DISPATCH" ? `SAMPLE-INV-${between(4100, 4999)}` : `SAMPLE-WO-${between(300, 360)}`,
          qtyMilli: -share,
          warehouse: lot.warehouse,
          bin: lot.bin,
          actor: out === "DISPATCH" ? "SAMPLE Dispatch Lead" : PEOPLE.production,
        });
        if (out === "ISSUE" && rand() < 0.25) {
          const back = Math.floor(share / 10 / 1000) * 1000;
          if (back > 0) {
            left += back;
            addLedger({
              lotNo,
              at: new Date(at.getTime() + 6 * HOUR).toISOString(),
              doc: "RETURN",
              docNo: `SAMPLE-MRN-${between(800, 900)}`,
              qtyMilli: back,
              warehouse: lot.warehouse,
              bin: lot.bin,
              actor: PEOPLE.production,
            });
          }
        }
      }
    }
  }
}
buildLots();

export const WORK_ORDERS: WorkOrder[] = (() => {
  const held = lots.filter((l) => l.status === "HOLD" || l.status === "IN_TEST");
  const heldRm = held.filter((l) => getItem(l.itemCode).type !== "FG");
  const out: WorkOrder[] = [];
  const products = ["Niacinamide serum 30 mL", "Hydrating cream 50 g", "Body lotion vetiver 200 mL"];
  for (let i = 0; i < Math.min(5, heldRm.length); i += 1) {
    const lot = heldRm[i * 2] ?? heldRm[i];
    if (!lot) break;
    const item = getItem(lot.itemCode);
    out.push({
      woNo: `SAMPLE-WO-${361 + i}`,
      product: pick(products),
      stage: item.type === "PM" ? "Fill and pack" : "Bulk",
      plannedStart: new Date(SAMPLE_NOW.getTime() + (6 + i * 17) * HOUR).toISOString(),
      needs: [{ itemCode: item.code, qtyMilli: Math.floor(lotQtyMilli(item) / 2 / 1000) * 1000 }],
    });
  }
  return out;
})();

export const INSTRUMENTS: Instrument[] = [
  { id: "SAMPLE-INS-07", name: "pH meter", location: "QC lab", calibrationDue: "2026-11-06" },
  { id: "SAMPLE-INS-03", name: "Viscometer", location: "QC lab", calibrationDue: "2026-11-12" },
  { id: "SAMPLE-INS-11", name: "Analytical balance", location: "QC lab", calibrationDue: "2026-11-03" },
  { id: "SAMPLE-INS-14", name: "Moisture analyser", location: "RM stores", calibrationDue: "2026-12-01" },
];

/** The mutable in-memory store the sample API reads and writes. */
export const db = { lots, ledger };
