/**
 * Formatting for money and quantities. Money arrives as integer paise and quantities as
 * integer thousandths of their unit, so nothing on screen is ever produced by float maths
 * (brief §6 rule 12).
 */

export type Uom = "kg" | "g" | "L" | "mL" | "pcs";

const groupIN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Decimal places shown per unit of measure. */
export const UOM_DECIMALS: Record<Uom, number> = { kg: 3, g: 0, L: 3, mL: 0, pcs: 0 };

function assertInteger(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be a safe integer, got ${n}`);
}

/** 12345678 paise → "₹1,23,456.78" (Indian digit grouping). */
export function formatPaise(paise: number, opts: { sign?: boolean } = {}): string {
  assertInteger(paise, "paise");
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const rest = abs % 100;
  const sign = neg ? "−" : opts.sign && paise > 0 ? "+" : "";
  return `${sign}₹${groupIN.format(rupees)}.${String(rest).padStart(2, "0")}`;
}

/** Integer thousandths of a unit → decimal string, e.g. 480250 → "480.250". */
export function milliToDecimal(milli: number): string {
  assertInteger(milli, "quantity");
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const whole = Math.trunc(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** 480250 kg-milli → "480.250"; pcs drop the fraction; Indian grouping on the whole part. */
export function formatQty(milli: number, uom: Uom, opts: { sign?: boolean } = {}): string {
  assertInteger(milli, "quantity");
  const decimals = UOM_DECIMALS[uom];
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const whole = Math.trunc(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0").slice(0, decimals);
  const sign = neg ? "−" : opts.sign && milli > 0 ? "+" : "";
  return `${sign}${groupIN.format(whole)}${decimals > 0 ? `.${frac}` : ""}`;
}

/** Hours as "2 d 4 h" or "5 h 20 m". */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

/** ISO date "2026-11-04" from a Date, in IST. */
export function isoDate(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60000);
  return ist.toISOString().slice(0, 10);
}

/** "04 Nov, 09:12" in IST. */
export function shortDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}
