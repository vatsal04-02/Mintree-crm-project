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
  const opt = page.getByRole("option").filter({ hasText: value }).first();
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
} catch (e) {
  results.push({ name: "run completed", ok: false });
  console.error(`FAIL run stopped: ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed (run ${RUN})`);
  process.exit(results.length && passed === results.length ? 0 : 1);
}
