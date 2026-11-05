import { describe, expect, it } from "vitest";
import type { Boot, PType } from "./api/session";
import { allPages, moduleForPath, moduleHasPath, quickActions, visibleModules } from "./nav";

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

const modules = (b: Boot) => visibleModules(b).map((m) => m.key);

describe("navigation follows server permissions", () => {
  it("shows a QC officer only quality work", () => {
    const b = boot({ "QC Release": ["read", "create", "submit"], "QC Deviation": ["read", "create"] }, [
      "QC Queue",
      "Stock by QC Status",
    ]);
    expect(modules(b)).toEqual(["home", "buying", "stock", "quality", "setup"]);
    const quality = visibleModules(b).find((m) => m.key === "quality");
    expect(quality?.items.map((i) => i.label)).toEqual([
      "QC Queue",
      "QC Releases",
      "Deviations",
      "Stock by QC Status",
      "Create",
    ]);
    expect(quickActions(b).map((a) => a.label)).toEqual(["New QC Release", "New Deviation"]);
  });

  it("gives a read-only role pages but no create actions", () => {
    const b = boot({ "Sales Order": ["read"], "Purchase Order": ["read"] }, ["Available to Sell"]);
    const pages = allPages(b).map((p) => p.label);
    expect(pages).toContain("Sales Orders");
    expect(pages).toContain("Purchase Orders");
    expect(quickActions(b)).toEqual([]);
  });

  it("drops modules with nothing permitted", () => {
    expect(modules(boot({}))).toEqual(["home", "setup"]);
  });

  it("opens the module that owns a URL, and keeps a module open where it lists the page", () => {
    const b = boot({ "Delivery Note": ["read"], "Sales Invoice": ["read"] });
    const mods = visibleModules(b);
    expect(moduleForPath(mods, "/sales/deliveries/DN-1")?.key).toBe("selling");
    expect(moduleForPath(mods, "/")?.key).toBe("home");
    const accounts = mods.find((m) => m.key === "accounts");
    expect(accounts && moduleHasPath(accounts, "/sales/deliveries")).toBe(true);
  });
});

describe("next-phase modules follow server permissions", () => {
  it("an R&D chemist sees R&D and nothing of maintenance, marketplaces or marketing", () => {
    const b = boot({
      Formulation: ["read", "create"],
      "Research Project": ["read", "create"],
      "Formulation Trial": ["read", "create", "submit"],
      "Stability Study": ["read", "create"],
    });
    expect(modules(b)).toEqual(["home", "rnd", "setup"]);
    expect(allPages(b).map((p) => p.to)).toContain("/research/formulations/new");
  });

  it("a technician sees maintenance pages but cannot register equipment", () => {
    const b = boot({
      Asset: ["read"],
      "Asset Repair": ["read", "create", "write"],
      "Asset Maintenance": ["read"],
      "Asset Maintenance Log": ["read", "write", "submit"],
      Bin: ["read"],
    });
    expect(modules(b)).toContain("maintenance");
    const pages = allPages(b).map((p) => p.to);
    expect(pages).toContain("/maintenance/breakdowns/new");
    expect(pages).not.toContain("/maintenance/assets/new");
  });

  it("marketplace and marketing modules appear only for their roles", () => {
    expect(
      modules(boot({ "Marketplace Order": ["read", "create"], "Marketplace Listing": ["read"] })),
    ).toContain("marketplace");
    expect(modules(boot({ "Marketing Campaign": ["read"] }))).toContain("marketing");
    expect(modules(boot({ "Sales Order": ["read"] }))).not.toContain("marketplace");
  });

  it("deep module pages belong to their module", () => {
    const b = boot({ Asset: ["read"], "Asset Repair": ["read"] });
    expect(moduleForPath(visibleModules(b), "/maintenance/breakdowns/ACC-ASR-1")?.key).toBe("maintenance");
  });
});
