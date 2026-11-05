/** Display formatting only. Every figure comes from the server as ERPNext stored it. */

const money = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: unknown, currency = "INR"): string {
  const n = Number(value ?? 0);
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 });
    money.set(currency, f);
  }
  return f.format(Number.isFinite(n) ? n : 0).replace("-", "−");
}

const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function formatQty(value: unknown, uom?: unknown): string {
  const n = Number(value ?? 0);
  const s = qtyFmt.format(Number.isFinite(n) ? n : 0).replace("-", "−");
  return uom ? `${s} ${String(uom)}` : s;
}

export function formatPercent(value: unknown): string {
  const n = Number(value ?? 0);
  return `${Math.round(Number.isFinite(n) ? n : 0)}%`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function parse(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: unknown): string {
  const d = parse(value);
  return d ? dateFmt.format(d) : "—";
}

export function formatDateTime(value: unknown): string {
  const d = parse(value);
  return d ? dateTimeFmt.format(d) : "—";
}

/** yyyy-mm-dd in local time, as Frappe date fields expect. */
export function isoDate(d = new Date(), addDays = 0): string {
  const x = new Date(d);
  x.setDate(x.getDate() + addDays);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

/** Hours as "2 d 4 h" or "5 h". */
export function formatHours(hours: unknown): string {
  const h = Math.max(0, Math.round(Number(hours ?? 0)));
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`;
}
