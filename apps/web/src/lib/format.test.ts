import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatQty } from "./format";

describe("display formatting", () => {
  it("formats rupees with Indian grouping", () => {
    expect(formatMoney(3750000, "INR")).toBe("₹37,50,000.00");
    expect(formatMoney(-12.5, "INR")).toBe("−₹12.50");
  });
  it("keeps up to three decimals for quantities", () => {
    expect(formatQty(28.5, "Kg")).toBe("28.5 Kg");
    expect(formatQty(1234567)).toBe("12,34,567");
    expect(formatQty(0.0005)).toBe("0.001");
  });
  it("shows a dash for missing dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("2026-11-05")).toBe("05 Nov 2026");
  });
});
