/**
 * End-to-end check of the next-phase modules (R&D, Maintenance, Marketplaces, Marketing) through the
 * built React app at /factory, as separate SAMPLE role users. Each step is a click in React; each
 * outcome is read back from the ERP REST API (what ERPNext Desk shows).
 *
 * Usage (development only):
 *   NODE_PATH=$(npm root -g) node e2e/modules.mjs http://factory.localhost:8000 \
 *     ~/frappe-bench/sites/factory.localhost/private/sample_users.json [rnd,maintenance,marketplace,marketing]
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [BASE = "http://factory.localhost:8000", CREDS_FILE, ONLY = "rnd,maintenance,marketplace,marketing"] = process.argv.slice(2);
const CREDS = JSON.parse(readFileSync(CREDS_FILE, "utf8"));
const HOST = new URL(BASE).hostname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const RUN = Date.now().toString(36).toUpperCase();
const SECTIONS = new Set(ONLY.split(","));
const results = [];
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, "--no-proxy-server"] });

function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`check failed: ${name}`);
}

async function as(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(`${BASE}/factory/login`);
  await page.fill("#usr", user);
  await page.fill("#pwd", CREDS[user]);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/factory/`);
  const doc = (doctype, name) =>
    page.evaluate(
      async ([dt, n]) => (await (await fetch(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(n)}`)).json()).data,
      [doctype, name],
    );
  const list = (doctype, filters, fields = ["name"]) =>
    page.evaluate(
      async ([dt, f, fl]) =>
        (await (await fetch(`/api/resource/${encodeURIComponent(dt)}?filters=${encodeURIComponent(JSON.stringify(f))}&fields=${encodeURIComponent(JSON.stringify(fl))}&limit_page_length=0`)).json()).data,
      [doctype, filters, fields],
    );
  const insert = (d) =>
    page.evaluate(async (body) => {
      const boot = await (await fetch("/api/method/factory_ops.api.factory_os.boot")).json();
      const r = await fetch(`/api/resource/${encodeURIComponent(body.doctype)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": boot.message.csrf_token },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    }, d);
  return { ctx, page, doc, list, insert, user };
}

const go = (s, path) => s.page.goto(`${BASE}/factory${path}`);
const shot = (s, name) => s.page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });

async function link(page, name, value, nth = 0) {
  const box = page.getByRole("combobox", { name: new RegExp(`^${name}`) }).nth(nth);
  await box.click();
  await box.fill(value);
  // match from the start of the option text ("Stores - SMM" must not pick "BULK-STORES - SMM")
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opt = page.getByRole("option").filter({ hasText: new RegExp(`^\\s*${esc}`) }).first();
  await opt.waitFor({ timeout: 10_000 });
  await opt.click();
}
const numberField = (page, name, value, nth = 0) =>
  page.getByRole("spinbutton", { name: new RegExp(`^${name}`) }).nth(nth).fill(String(value));
const textField = (page, name, value, nth = 0) =>
  page.getByRole("textbox", { name: new RegExp(`^${name}`) }).nth(nth).fill(String(value));
const select = (page, name, value, nth = 0) =>
  page.getByRole("combobox", { name: new RegExp(`^${name}`) }).nth(nth).selectOption(value);
const click = (page, name) => page.getByRole("button", { name, exact: true }).click();

async function docName(page, prefix) {
  await page.waitForURL(new RegExp(`/factory${prefix}/(?!new)[^/?]+$`), { timeout: 20_000 });
  return decodeURIComponent(page.url().split("/").pop());
}
async function waitFor(fn, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
async function refusal(page) {
  const note = page.locator(".note-error").first();
  await note.waitFor({ timeout: 15_000 });
  return note.innerText();
}

try {
  if (SECTIONS.has("rnd")) {
    /* ============ R&D: draft -> review -> trial -> approval -> BOM ============ */
    // its own bulk item, so the approved formula's BOM never replaces a BOM other checks rely on
    const BULK_E2E = "SAMPLE-BULK-RND-E2E";
    const md = await as("sample.masterdata@sample.invalid");
    if (!(await md.list("Item", { name: BULK_E2E })).length) {
      const r = await md.insert({
        doctype: "Item", item_code: BULK_E2E, item_name: "SAMPLE bulk for the R&D end-to-end test", item_group: "BULK",
        stock_uom: "Kg", is_stock_item: 1, has_expiry_date: 1, shelf_life_in_days: 365,
      });
      check("master data user creates the test bulk item", r.status === 200, BULK_E2E);
    }
    await md.ctx.close();
    const chemist = await as("sample.rnd@sample.invalid");
    await go(chemist, "/research/formulations/new");
    await textField(chemist.page, "Name", `E2E gel ${RUN}`);
    await textField(chemist.page, "Formulation code", `E2E-${RUN}`);
    await link(chemist.page, "Bulk item it makes", BULK_E2E);
    await numberField(chemist.page, "Batch size", 50);
    await link(chemist.page, "Ingredient", "SAMPLE-RM-0002");
    await numberField(chemist.page, "% w/w", 90);
    await click(chemist.page, "Add ingredient");
    await link(chemist.page, "Ingredient", "SAMPLE-RM-0001", 1);
    await numberField(chemist.page, "% w/w", 5, 1);
    await click(chemist.page, "Save draft");
    const frm = await docName(chemist.page, "/research/formulations");
    let f = await chemist.doc("Formulation", frm);
    check("R&D chemist saves a formulation draft in React; kg computed by the server", f.status === "Draft" && f.total_percentage === 95 && f.ingredients[0].quantity_kg === 45, frm);
    await click(chemist.page, "Send for review");
    const msg = await refusal(chemist.page);
    check("review refused while the formula adds up to 95 %, in the server's words", /95/.test(msg), msg.split("\n")[0]);
    await go(chemist, `/research/formulations/${frm}/edit`);
    await numberField(chemist.page, "% w/w", 10, 1);
    await click(chemist.page, "Save draft");
    await docName(chemist.page, "/research/formulations");
    await chemist.page.getByText("Total", { exact: false }).first().waitFor();
    await click(chemist.page, "Send for review");
    await waitFor(async () => (await chemist.doc("Formulation", frm)).status === "Under Review", "review");
    check("corrected to 100 % and sent for review", true);
    check("chemist is not offered Start trial", (await chemist.page.getByRole("button", { name: "Start trial" }).count()) === 0);

    const manager = await as("sample.rndmanager@sample.invalid");
    await go(manager, `/research/formulations/${frm}`);
    await click(manager.page, "Start trial");
    await waitFor(async () => (await manager.doc("Formulation", frm)).status === "Trial", "trial");
    check("R&D manager starts the trial", true);

    await go(chemist, "/research/trials/new");
    await textField(chemist.page, "Title", `E2E trial ${RUN}`);
    await link(chemist.page, "Formulation version", frm);
    await select(chemist.page, "Outcome", "Pass");
    await chemist.page.getByRole("textbox", { name: /^Observations/ }).fill("Smooth gel, no separation after 24 h (e2e).");
    await click(chemist.page, "Save trial");
    const trial = await docName(chemist.page, "/research/trials");
    await click(chemist.page, "Record trial (submit)");
    await waitFor(async () => (await chemist.doc("Formulation Trial", trial)).docstatus === 1, "trial submit");
    check("chemist records a passed trial (submitted)", true, trial);

    await go(manager, `/research/formulations/${frm}`);
    await click(manager.page, "Approve version");
    f = await waitFor(async () => {
      const d = await manager.doc("Formulation", frm);
      return d.status === "Approved" && d;
    }, "approval");
    check("manager approves; decision recorded on the server", f.reviewed_by === "sample.rndmanager@sample.invalid");
    check("R&D manager has no BOM rights, so is not offered Create BOM", (await manager.page.getByRole("button", { name: "Create BOM" }).count()) === 0);
    await shot(manager, "rnd-formulation-approved");

    const production = await as("sample.production@sample.invalid");
    await go(production, `/research/formulations/${frm}`);
    await click(production.page, "Create BOM");
    f = await waitFor(async () => {
      const d = await production.doc("Formulation", frm);
      return d.bom && d;
    }, "BOM");
    const bom = await production.doc("BOM", f.bom);
    check(
      "production turns the approved version into a submitted BOM linked to it",
      bom.docstatus === 1 && bom.fo_formulation === frm && bom.fo_formulation_version === 1 && bom.quantity === 50,
      f.bom,
    );

    await go(chemist, `/research/formulations/${frm}`);
    await click(chemist.page, "New version");
    const v2 = await waitFor(async () => {
      const m = chemist.page.url().match(/formulations\/([^/]+)\/edit$/);
      return m && decodeURIComponent(m[1]);
    }, "new version");
    const v2doc = await chemist.doc("Formulation", v2);
    check("a new version is a Draft linked to the approved one", v2doc.version === 2 && v2doc.previous_version === frm && v2doc.status === "Draft", v2);
    for (const c of [chemist, manager, production]) check(`no JavaScript errors (${c.user})`, c.page.errors.length === 0, c.page.errors.join("; "));
  }
  if (SECTIONS.has("maintenance")) {
    /* ============ Maintenance: register -> schedule -> breakdown -> repair with spares -> closure ============ */
    const SPARE = "SAMPLE-SPARE-VBELT";
    const SPARE_WH = "Stores - SMM";
    const md = await as("sample.masterdata@sample.invalid");
    if (!(await md.list("Item", { name: SPARE })).length) {
      const r = await md.insert({ doctype: "Item", item_code: SPARE, item_name: "SAMPLE V-belt (spare part)", item_group: "Spare Parts", stock_uom: "Nos", is_stock_item: 1, valuation_rate: 250 });
      check("master data user creates a spare part", r.status === 200, SPARE);
    }
    await md.ctx.close();
    const stores = await as("sample.stores@sample.invalid");
    const rec = await stores.insert({ doctype: "Stock Entry", purpose: "Material Receipt", stock_entry_type: "Material Receipt", company: "SAMPLE Mintree Manufacturing", docstatus: 1,
      items: [{ item_code: SPARE, qty: 5, t_warehouse: SPARE_WH, basic_rate: 250 }] });
    check("stores receives 5 spare belts into stock", rec.status === 200, rec.body?.data?.name);
    const binQty = async (s) => Number((await s.list("Bin", { item_code: SPARE, warehouse: SPARE_WH }, ["actual_qty"]))[0]?.actual_qty ?? 0);
    const before = await binQty(stores);

    const mgr = await as("sample.maintmanager@sample.invalid");
    await go(mgr, "/maintenance/assets/new");
    await textField(mgr.page, "Name", `E2E capping machine ${RUN}`);
    await select(mgr.page, "Type", "Filling Machine");
    await textField(mgr.page, "Manufacturer", "E2E Machines");
    await textField(mgr.page, "Serial number", `SN-${RUN}`);
    await numberField(mgr.page, "Purchase value", 250000);
    await click(mgr.page, "Register equipment");
    const asset = await docName(mgr.page, "/maintenance/assets");
    let a = await mgr.doc("Asset", asset);
    check("maintenance manager registers equipment in React (submitted ERPNext Asset)", a.docstatus === 1 && a.fo_equipment_type === "Filling Machine" && a.fo_operational_status === "Active", asset);

    // reuse any existing team (the demo site seeds one); otherwise set one up
    const teams = await mgr.list("Asset Maintenance Team", {}, ["name"]);
    const team = teams[0]?.name ?? "SAMPLE Maintenance Team";
    if (!teams.length) {
      const r = await mgr.insert({ doctype: "Asset Maintenance Team", maintenance_team_name: team, company: "SAMPLE Mintree Manufacturing", maintenance_manager: "sample.maintmanager@sample.invalid",
        maintenance_team_members: [{ team_member: "sample.maintenance@sample.invalid", maintenance_role: "Maintenance User" }] });
      check("maintenance team set up", r.status === 200);
    }
    await go(mgr, "/maintenance/schedules/new");
    await link(mgr.page, "Equipment", asset);
    await link(mgr.page, "Maintenance team", team);
    await textField(mgr.page, "Task", "Lubricate cam track");
    await link(mgr.page, "Assign to", "sample.maintenance@sample.invalid");
    await click(mgr.page, "Save schedule");
    const sched = await docName(mgr.page, "/maintenance/schedules");
    const logs = await waitFor(async () => {
      const l = await mgr.list("Asset Maintenance Log", { asset_maintenance: sched }, ["name", "due_date", "maintenance_status"]);
      return l.length && l;
    }, "maintenance log");
    check("preventive schedule creates its first task with a due date", logs[0].due_date && logs[0].maintenance_status === "Planned", `${sched} → ${logs[0].name} due ${logs[0].due_date}`);

    const tech = await as("sample.maintenance@sample.invalid");
    await go(tech, `/maintenance/assets/${asset}`);
    await click(tech.page, "Report breakdown");
    await tech.page.waitForURL(/breakdowns\/new/);
    await select(tech.page, "Severity", "Critical");
    await tech.page.getByRole("textbox", { name: /^What happened/ }).fill("Capping head jammed (e2e)");
    await click(tech.page, "Report breakdown");
    const bd = await docName(tech.page, "/maintenance/breakdowns");
    a = await tech.doc("Asset", asset);
    check("technician reports a breakdown; the equipment shows Breakdown", a.fo_operational_status === "Breakdown", bd);

    await tech.page.getByRole("textbox", { name: /^Resolution/ }).fill("Cleared jam, replaced drive belt");
    await tech.page.getByRole("textbox", { name: /^Root cause/ }).fill("Worn drive belt slipped");
    await click(tech.page, "Add spare part");
    await link(tech.page, "Spare part", SPARE);
    await link(tech.page, "From warehouse", SPARE_WH);
    await numberField(tech.page, "Qty", 1);
    await click(tech.page, "Mark repaired");
    const rep = await waitFor(async () => {
      const d = await tech.doc("Asset Repair", bd);
      return d.repair_status === "Completed" && d;
    }, "repaired");
    check("technician records the repair with root cause and a spare part", rep.fo_root_cause && rep.stock_items.length === 1 && rep.fo_downtime_hours >= 0);
    check("technician is not offered closure approval", (await tech.page.getByRole("button", { name: "Approve closure" }).count()) === 0);

    await go(mgr, `/maintenance/breakdowns/${bd}`);
    await click(mgr.page, "Approve closure");
    const closed = await waitFor(async () => {
      const d = await mgr.doc("Asset Repair", bd);
      return d.docstatus === 1 && d;
    }, "closure");
    check("manager approves the closure (submitted, approver recorded)", closed.fo_closure_approved_by === "sample.maintmanager@sample.invalid");
    check("the spare belt left stock through ERPNext", before - (await binQty(stores)) === 1, `${before} → ${await binQty(stores)}`);
    check("spare-part cost carried on the breakdown", Number(closed.consumed_items_cost) === 250, String(closed.consumed_items_cost));
    a = await mgr.doc("Asset", asset);
    check("equipment back to Active after closure", a.fo_operational_status === "Active");

    await go(tech, `/maintenance/tasks/${logs[0].name}`);
    await tech.page.getByRole("textbox", { name: /^Work done/ }).fill("Cam track cleaned and greased (e2e)");
    await click(tech.page, "Complete task");
    await waitFor(async () => (await tech.doc("Asset Maintenance Log", logs[0].name)).docstatus === 1, "task done");
    check("technician completes the preventive task", true, logs[0].name);

    await go(mgr, "/maintenance");
    await mgr.page.getByText("Downtime and maintenance cost").waitFor();
    await shot(mgr, "maintenance-overview");
    check("maintenance overview loads from records", (await mgr.page.locator(".kpi").count()) >= 5);
    for (const c of [mgr, tech, stores]) check(`no JavaScript errors (${c.user})`, c.page.errors.length === 0, c.page.errors.join("; "));
  }
  if (SECTIONS.has("marketplace")) {
    /* ============ Marketplaces: honest channel state, listing, allocation, order once, sales order ============ */
    const FG = "SAMPLE-FG-0001";
    const mk = await as("sample.marketplace@sample.invalid");
    for (const [ch, share] of [["Amazon", 40], ["Flipkart", 30]]) {
      await go(mk, `/marketplace/channels/${ch}`);
      await mk.page.getByRole("spinbutton", { name: /^Stock share/ }).fill(String(share));
      await link(mk.page, "Customer for orders", "SAMPLE D2C - Website Orders");
      await click(mk.page, "Save settings");
      await waitFor(async () => (await mk.doc("Marketplace Channel", ch)).allocation_percent === share, `${ch} share`);
    }
    let amazon = await mk.doc("Marketplace Channel", "Amazon");
    check("channel settings saved in React; Amazon stays Not configured (no credentials)", amazon.connection_state === "Not configured" && amazon.allocation_percent === 40);
    await go(mk, "/marketplace/channels/Amazon");
    await click(mk.page, "Test connection");
    await mk.page.getByText(/^Skipped:/).waitFor();
    amazon = await mk.doc("Marketplace Channel", "Amazon");
    check("connection test is refused and logged, never shown as connected", amazon.connection_state !== "Connected", amazon.connection_state);
    const myntra = await mk.doc("Marketplace Channel", "Myntra");
    check("Myntra shows Access required", myntra.connection_state === "Access required");

    const skus = {};
    for (const ch of ["Amazon", "Flipkart"]) {
      const existing = await mk.list("Marketplace Listing", { channel: ch, item_code: FG }, ["marketplace_sku"]);
      if (existing.length) { skus[ch] = existing[0].marketplace_sku; continue; }
      await go(mk, "/marketplace/listings/new");
      await select(mk.page, "Channel", ch);
      await link(mk.page, "ERPNext item", FG);
      skus[ch] = `${ch.slice(0, 3).toUpperCase()}-E2E-${RUN}`;
      await textField(mk.page, "Marketplace SKU", skus[ch]);
      await click(mk.page, "Save listing");
      await mk.page.waitForURL(/\/marketplace\/listings$/);
    }
    const listings = await mk.list("Marketplace Listing", { item_code: FG }, ["channel"]);
    check("one ERPNext item listed on two channels (no duplicate item)", listings.filter((l) => ["Amazon", "Flipkart"].includes(l.channel)).length === 2);

    await go(mk, "/marketplace/inventory");
    await mk.page.getByRole("table", { name: "Inventory to publish" }).waitFor();
    const alloc = await mk.page.evaluate(async () => (await (await fetch("/api/method/factory_ops.api.marketplace.inventory_allocation?company=SAMPLE%20Mintree%20Manufacturing")).json()).message);
    const row = alloc.find((r) => r.item_code === FG);
    const by = Object.fromEntries(row.channels.map((c) => [c.channel, c.publish_qty]));
    check(
      "published quantities = available to sell × share, never more than available in total",
      by.Amazon === Math.floor(row.available_to_sell * 0.4) && by.Flipkart === Math.floor(row.available_to_sell * 0.3) && row.published_total <= row.available_to_sell,
      `ATS ${row.available_to_sell}: Amazon ${by.Amazon}, Flipkart ${by.Flipkart}`,
    );

    const ext = `408-E2E-${RUN}`;
    await go(mk, "/marketplace/orders/new");
    await select(mk.page, "Channel", "Amazon");
    await textField(mk.page, "Marketplace order ID", ext);
    await mk.page.getByLabel(/^Ordered at/).fill(new Date().toISOString().slice(0, 16));
    await textField(mk.page, "Marketplace SKU", skus.Amazon);
    await numberField(mk.page, "Qty", 2);
    await numberField(mk.page, "Rate", 249);
    await click(mk.page, "Record order");
    const mo = await docName(mk.page, "/marketplace/orders");
    let order = await mk.doc("Marketplace Order", mo);
    check("marketplace order recorded; SKU mapped to the ERPNext item", order.items[0].item_code === FG && order.order_total === 498, mo);

    await go(mk, "/marketplace/orders/new");
    await select(mk.page, "Channel", "Amazon");
    await textField(mk.page, "Marketplace order ID", ext);
    await mk.page.getByLabel(/^Ordered at/).fill(new Date().toISOString().slice(0, 16));
    await textField(mk.page, "Marketplace SKU", skus.Amazon);
    await click(mk.page, "Record order");
    const dupMsg = await refusal(mk.page);
    check("the same Amazon order ID is refused the second time", /already recorded/.test(dupMsg), dupMsg.split("\n")[0]);

    await go(mk, `/marketplace/orders/${mo}`);
    await click(mk.page, "Create sales order");
    order = await waitFor(async () => {
      const d = await mk.doc("Marketplace Order", mo);
      return d.sales_order && d;
    }, "sales order");
    const so = await mk.doc("Sales Order", order.sales_order);
    check("marketplace order becomes an ERPNext sales order (D2C Marketplace, external ID kept)", so.fo_sales_channel === "D2C Marketplace" && so.fo_external_order_id === `Amazon/${ext}`, so.name);

    await go(mk, "/marketplace");
    await mk.page.getByRole("table", { name: "Channels" }).waitFor();
    await shot(mk, "marketplace-overview");
    check("overview lists the four channels", (await mk.page.getByRole("table", { name: "Channels" }).getByRole("row").count()) === 5);
    check("no JavaScript errors (marketplace)", mk.page.errors.length === 0, mk.page.errors.join("; "));
  }
  if (SECTIONS.has("marketing")) {
    /* ============ Marketing: campaign approval, honest figures, content to published, Meta state ============ */
    const ex = await as("sample.marketingexec@sample.invalid");
    await go(ex, "/marketing/campaigns/new");
    await textField(ex.page, "Name", `E2E monsoon hair care ${RUN}`);
    await numberField(ex.page, "Budget", 50000);
    await ex.page.getByRole("textbox", { name: /^Target audience/ }).fill("Women 22-40, metro India, interested in hair care (e2e)");
    await click(ex.page, "Save draft");
    const camp = await docName(ex.page, "/marketing/campaigns");
    await click(ex.page, "Send for approval");
    await waitFor(async () => (await ex.doc("Marketing Campaign", camp)).status === "Awaiting Approval", "awaiting");
    check("executive drafts a campaign and sends it for approval", true, camp);
    check("executive is not offered Approve", (await ex.page.getByRole("button", { name: "Approve", exact: true }).count()) === 0);

    const mg = await as("sample.marketing@sample.invalid");
    await go(mg, `/marketing/campaigns/${camp}`);
    await click(mg.page, "Approve");
    await waitFor(async () => (await mg.doc("Marketing Campaign", camp)).status === "Approved", "approved");
    check("marketing manager approves; decision recorded", (await mg.doc("Marketing Campaign", camp)).approved_by === "sample.marketing@sample.invalid");

    await go(ex, `/marketing/campaigns/${camp}`);
    await click(ex.page, "Mark live");
    await waitFor(async () => (await ex.doc("Marketing Campaign", camp)).status === "Live", "live");
    await numberField(ex.page, "Spend", 1200);
    await numberField(ex.page, "Impressions", 40000);
    await numberField(ex.page, "Clicks", 600);
    await click(ex.page, "Record figures");
    const perf = await waitFor(async () => {
      const l = await ex.list("Campaign Performance", { campaign: camp }, ["name", "source", "ctr", "cost_per_lead"]);
      return l.length && l[0];
    }, "figures");
    check("figures entered by hand carry their source; CTR 1.5 %, no cost per lead without leads", perf.source === "Manual entry from the ad platform" && Math.abs(perf.ctr - 1.5) < 0.001 && !perf.cost_per_lead);

    await go(ex, "/marketing/content/new");
    await textField(ex.page, "Title", `E2E reel ${RUN}`);
    await link(ex.page, "Campaign", camp);
    await ex.page.getByRole("textbox", { name: /^Draft caption/ }).fill("Three steps to a calm scalp (e2e draft).");
    await click(ex.page, "Save");
    const content = await docName(ex.page, "/marketing/content");
    await click(ex.page, "Send for review");
    await waitFor(async () => (await ex.doc("Marketing Content", content)).status === "In Review", "review");
    await go(mg, `/marketing/content/${content}`);
    await click(mg.page, "Approve");
    await waitFor(async () => (await mg.doc("Marketing Content", content)).status === "Approved", "content approved");
    await go(ex, `/marketing/content/${content}`);
    await click(ex.page, "Mark scheduled");
    await waitFor(async () => (await ex.doc("Marketing Content", content)).status === "Scheduled", "scheduled");
    await textField(ex.page, "URL", "https://www.instagram.com/p/e2e-example");
    await click(ex.page, "Mark published");
    await waitFor(async () => (await ex.doc("Marketing Content", content)).status === "Published", "published");
    check("content: draft → review → approved by the manager → scheduled → published by hand with its URL", true, content);

    await go(mg, "/marketing/meta");
    await click(mg.page, "Test connection");
    await mg.page.getByText(/^Skipped:/).waitFor();
    const meta = await mg.doc("Meta Connection", "Meta Business");
    check("Meta connection is Not configured and the test is refused, not faked", meta.connection_state === "Not configured", meta.connection_state);
    await go(mg, "/marketing");
    await mg.page.getByText(/Performance · source: Manual entry/).waitFor();
    await shot(mg, "marketing-overview");
    check("overview groups figures by source", (await mg.page.getByText(/Performance · source:/).count()) >= 1);
    for (const c of [ex, mg]) check(`no JavaScript errors (${c.user})`, c.page.errors.length === 0, c.page.errors.join("; "));
  }
} catch (e) {
  results.push({ name: "run completed", ok: false });
  console.error(`FAIL run stopped: ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed (run ${RUN})`);
  process.exit(results.length && passed === results.length ? 0 : 1);
}
