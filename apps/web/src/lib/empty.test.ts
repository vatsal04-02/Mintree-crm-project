import { describe, expect, it } from "vitest";
import { emptyForList, emptyForReport } from "./empty";

describe("empty states explain and point somewhere", () => {
  it("an empty list says why and what to do first", () => {
    const e = emptyForList("Purchase Receipt", "Goods Receipts", "All", false, "");
    expect(e.title).toBe("No goods receipts yet");
    expect(e.reason).toMatch(/QC Hold/);
    expect(e.needs?.length).toBeGreaterThan(0);
    expect(e.actions?.[0]?.to).toBe("/procurement/receipts?start=1");
  });

  it("a filtered tab says it is filtered", () => {
    const e = emptyForList("Sales Order", "Sales Orders", "Drafts", true, "");
    expect(e.title).toBe("No sales orders in “Drafts”");
    expect(e.reason).toMatch(/filtered/);
  });

  it("a search names the search", () => {
    expect(emptyForList("Sales Order", "Sales Orders", "All", false, "ABC").title).toBe(
      "No sales orders match “ABC”",
    );
  });

  it("Available to Sell explains every condition and links QC", () => {
    const e = emptyForReport("Available to Sell", "");
    expect(e.reason).toMatch(/released.*usable.*expired.*shelf life.*reserved/s);
    expect(e.actions?.map((a) => a.to)).toContain("/quality/queue");
  });

  it("an unknown DocType still gets a useful title", () => {
    expect(emptyForList("Formulation", "Formulations", "All", false, "").title).toBe("No formulations yet");
  });
});
