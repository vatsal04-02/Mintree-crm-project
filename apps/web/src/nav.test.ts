import { describe, expect, it } from "vitest";
import type { Boot, PType } from "./api/session";
import { quickActions, visibleNav } from "./nav";

function boot(perms: Record<string, PType[]>, reports: string[] = []): Boot {
  const doctypes: Boot["doctypes"] = {};
  for (const [dt, ps] of Object.entries(perms)) {
    doctypes[dt] = { read: false, create: false, write: false, submit: false, cancel: false };
    for (const p of ps) doctypes[dt][p] = true;
  }
  return {
    user: "u",
    full_name: "U",
    roles: [],
    csrf_token: "",
    company: "SAMPLE Co",
    currency: "INR",
    doctypes,
    reports,
    desk_url: "/desk",
  };
}

const labels = (b: Boot) => visibleNav(b).flatMap((g) => g.items.map((i) => i.label));

describe("navigation follows server permissions", () => {
  it("shows a QC officer only quality work", () => {
    const b = boot({ "QC Release": ["read", "create", "submit"], "QC Deviation": ["read", "create"] }, [
      "QC Queue",
      "Stock by QC Status",
    ]);
    expect(labels(b)).toEqual([
      "Command Center",
      "Stock by QC Status",
      "QC Queue",
      "QC Releases",
      "Deviations",
      "Integration Centre",
      "Planned Modules",
    ]);
    expect(quickActions(b).map((a) => a.label)).toEqual(["New QC release", "New deviation"]);
  });

  it("gives a read-only role pages but no create actions", () => {
    const b = boot({ "Sales Order": ["read"], "Purchase Order": ["read"] }, ["Available to Sell"]);
    expect(labels(b)).toContain("Sales Orders");
    expect(labels(b)).toContain("Purchase Orders");
    expect(quickActions(b)).toEqual([]);
  });

  it("drops groups with nothing permitted", () => {
    const groups = visibleNav(boot({})).map((g) => g.label);
    expect(groups).toEqual(["Overview", "Administration"]);
  });
});
