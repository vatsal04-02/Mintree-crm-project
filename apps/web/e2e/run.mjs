/**
 * End-to-end check of the six Factory OS modules against a running development site, through the
 * built React app at /factory, signed in as the separate SAMPLE role users. Every step is done by
 * clicking the UI; each result is then read back through the ERP's REST API, so what the screen
 * did is what ERPNext Desk shows.
 *
 * Usage (development only; Playwright from the global install):
 *   NODE_PATH=$(npm root -g) node e2e/run.mjs http://factory.localhost:8000 \
 *     ~/frappe-bench/sites/factory.localhost/private/sample_users.json
 *
 * Exits non-zero on the first failed check. Screenshots land in e2e/out/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [BASE = "http://factory.localhost:8000", CREDS_FILE] = process.argv.slice(2);
const CREDS = JSON.parse(readFileSync(CREDS_FILE, "utf8"));
const HOST = new URL(BASE).hostname;
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const RUN = Date.now().toString(36).toUpperCase();
const TODAY = new Date().toISOString().slice(0, 10);
const results = [];

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, "--no-proxy-server"] });
{
  // a real (tiny) PDF for the certificate of analysis upload
  const p = await browser.newPage();
  await p.setContent("<p>SAMPLE certificate of analysis - end-to-end test, not real</p>");
  await p.pdf({ path: `${OUT}COA-E2E.pdf`, width: "200px", height: "200px" });
  await p.close();
}

function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(`check failed: ${name}`);
}

/** A signed-in browser for one SAMPLE user, plus a REST helper in the same session. */
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
  await page.getByRole("heading", { name: "Command Center" }).waitFor();
  // REST reads go through the page itself (same origin, same session cookie), as the app does
  const api = (method, args = {}) =>
    page.evaluate(
      async ([m, a]) => {
        const boot = await (await fetch("/api/method/factory_ops.api.factory_os.boot")).json();
        const r = await fetch(`/api/method/${m}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": boot.message.csrf_token },
          body: JSON.stringify(a),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(`${m}: ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
        return body.message;
      },
      [method, args],
    );
  const doc = (doctype, name) =>
    page.evaluate(
      async ([dt, n]) => (await (await fetch(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(n)}`)).json()).data,
      [doctype, name],
    );
  return { ctx, page, api, doc, user };
}

const go = (s, path) => s.page.goto(`${BASE}/factory${path}`);
const shot = (s, name) => s.page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });

/** Fill a Link field: type, then pick the server's suggestion. */
async function link(page, name, value, nth = 0) {
  const box = page.getByRole("combobox", { name: new RegExp(`^${name}`) }).nth(nth);
  await box.click();
  await box.fill(value);
  const opt = page.getByRole("option").filter({ hasText: value }).first();
  await opt.waitFor({ timeout: 10_000 });
  await opt.click();
}

async function numberField(page, name, value, nth = 0) {
  await page.getByRole("spinbutton", { name: new RegExp(`^${name}`) }).nth(nth).fill(String(value));
}

async function textField(page, name, value, nth = 0) {
  await page.getByRole("textbox", { name: new RegExp(`^${name}`) }).nth(nth).fill(String(value));
}

async function click(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

/** Wait for the URL to settle on a document page and return its name. */
async function docName(page, prefix) {
  await page.waitForURL(new RegExp(`/factory${prefix}/(?!new)[^/?]+$`), { timeout: 20_000 });
  return decodeURIComponent(page.url().split("/").pop());
}

async function refusal(page) {
  const note = page.locator(".note-error").first();
  await note.waitFor({ timeout: 15_000 });
  return note.innerText();
}

async function statusChip(page) {
  return page.locator(".page-title .chip").innerText();
}

const COMPANY = "SAMPLE Mintree Manufacturing";
const RM = "SAMPLE-RM-0001";

try {
  /* ============ 1. Procurement: PO by buyer, approval by approver, GRN by stores ============ */
  const buyer = await as("sample.buyer@sample.invalid");
  await go(buyer, "/procurement/purchase-orders/new");
  await link(buyer.page, "Supplier", "SAMPLE Supplier - Actives");
  await link(buyer.page, "Item", RM);
  await numberField(buyer.page, "Quantity", 20);
  await numberField(buyer.page, "Rate", 50);
  await click(buyer.page, "Save for approval");
  const po = await docName(buyer.page, "/procurement/purchase-orders");
  const poDoc = await buyer.doc("Purchase Order", po);
  check("buyer creates a purchase order in React (draft, into QC Hold)", poDoc.docstatus === 0 && poDoc.items[0].warehouse === "RM-QC-HOLD - SMM", po);
  await click(buyer.page, "Approve and submit");
  const msg = await refusal(buyer.page);
  check("buyer cannot approve own order: ERP refusal shown", /another approver/.test(msg) && (await buyer.doc("Purchase Order", po)).docstatus === 0, msg.replace(/\s+/g, " "));
  await shot(buyer, "01-po-refused");

  const approver = await as("sample.approver@sample.invalid");
  await go(approver, `/procurement/purchase-orders/${po}`);
  await click(approver.page, "Approve and submit");
  await approver.page.getByText("To Receive and Bill").first().waitFor();
  check("approver approves the order in React", (await approver.doc("Purchase Order", po)).docstatus === 1);

  const stores = await as("sample.stores@sample.invalid");
  await go(stores, `/procurement/purchase-orders/${po}`);
  await click(stores.page, "Receive goods");
  await stores.page.waitForURL(/\/procurement\/receipts\/new/);
  await textField(stores.page, "Supplier batch no.", `SAMPLE-E2E-LOT-${RUN}`);
  await stores.page.getByLabel(/^Mfg date/).fill("2026-10-20");
  await stores.page.getByLabel(/^Expiry date/).fill("2028-10-20");
  await stores.page.locator("input[type=file]").first().setInputFiles(`${OUT}COA-E2E.pdf`);
  await stores.page.getByRole("link", { name: /COA-E2E/ }).waitFor();
  await click(stores.page, "Submit receipt");
  const grn = await docName(stores.page, "/procurement/receipts");
  const grnDoc = await stores.doc("Purchase Receipt", grn);
  const batch = grnDoc.items[0].batch_no;
  check("stores receives goods in React: GRN submitted, batch on QC Hold", grnDoc.docstatus === 1 && grnDoc.items[0].warehouse === "RM-QC-HOLD - SMM" && !!batch, `${grn} batch ${batch}`);
  await shot(stores, "02-grn");

  /* ============ 2. Inventory: a transfer out of QC Hold is refused by the server ============ */
  await go(stores, "/inventory/movements/new");
  await link(stores.page, "From warehouse", "RM-QC-HOLD");
  await link(stores.page, "To warehouse", "RM-STORES");
  await link(stores.page, "Item", RM);
  await link(stores.page, "Batch", batch);
  await numberField(stores.page, "Quantity", 5);
  const sleBefore = await stores.api("frappe.client.get_count", { doctype: "Stock Ledger Entry", filters: { batch_no: batch } });
  await click(stores.page, "Post movement");
  const qcMsg = await refusal(stores.page);
  const sleAfter = await stores.api("frappe.client.get_count", { doctype: "Stock Ledger Entry", filters: { batch_no: batch } });
  check("moving QC Hold stock from React is refused and writes nothing", /QC/i.test(qcMsg) && sleBefore === sleAfter, qcMsg.replace(/\s+/g, " ").slice(0, 160));
  await shot(stores, "03-transfer-refused");
  await go(stores, "/inventory/stock");
  await stores.page.getByText(batch).first().waitFor();
  check("Stock by QC Status shows the held batch", true);

  /* ============ 3. Quality: QC officer releases the batch with an inspection ============ */
  const qc = await as("sample.qc@sample.invalid");
  await go(qc, "/quality/queue");
  await qc.page.getByRole("row").filter({ hasText: batch }).click();
  await qc.page.waitForURL(/\/quality\/releases\/new/);
  await qc.page.getByRole("combobox", { name: /^Decision/ }).selectOption("Release");
  await click(qc.page, "Save and record inspection");
  const rel = await docName(qc.page, "/quality/releases");
  await click(qc.page, "Create inspection");
  await qc.page.getByRole("combobox", { name: /^Outcome/ }).waitFor();
  await qc.page.getByRole("combobox", { name: /^Outcome/ }).selectOption("Accepted");
  await click(qc.page, "Submit inspection");
  await qc.page.locator(".panel .chip", { hasText: "Accepted" }).first().waitFor();
  await click(qc.page, "Submit release");
  await qc.page.locator(".page-title .chip", { hasText: "Submitted" }).waitFor();
  const relDoc = await qc.doc("QC Release", rel);
  const batchDoc = await qc.doc("Batch", batch);
  check("QC officer releases the batch in React: QI + release submitted, batch Released", relDoc.docstatus === 1 && batchDoc.fo_qc_status === "Released", `${rel} → ${relDoc.target_warehouse}`);
  await shot(qc, "04-qc-release");
  await go(qc, "/");
  check("QC officer has no purchase or sales menu", (await qc.page.getByRole("link", { name: "Purchase Orders" }).count()) === 0 && (await qc.page.getByRole("link", { name: "Sales Orders" }).count()) === 0);

  /* ============ 4. Production: FG work order, issue materials, record output ============ */
  const prod = await as("sample.production@sample.invalid");
  await go(prod, "/production/work-orders/new");
  await link(prod.page, "Item to produce", "SAMPLE-FG-0001");
  await numberField(prod.page, "Quantity", 10);
  await click(prod.page, "Save work order");
  const wo = await docName(prod.page, "/production/work-orders");
  await click(prod.page, "Submit work order");
  await prod.page.getByRole("button", { name: "Issue materials to production" }).waitFor();
  await click(prod.page, "Issue materials to production");
  await prod.page.waitForURL(/\/inventory\/movements\/new/);
  await click(prod.page, "Post movement");
  await prod.page.waitForURL(new RegExp(`/production/work-orders/${wo}`));
  await prod.page.getByRole("button", { name: "Record output" }).waitFor();
  await click(prod.page, "Record output");
  await prod.page.waitForURL(/\/inventory\/movements\/new/);
  await click(prod.page, "Post movement");
  await prod.page.waitForURL(new RegExp(`/production/work-orders/${wo}`));
  const woDoc = await prod.doc("Work Order", wo);
  check("production runs a work order in React: issued and produced 10", woDoc.produced_qty === 10 && woDoc.material_transferred_for_manufacturing === 10, `${wo} ${woDoc.status}`);
  await shot(prod, "05-work-order");

  /* ============ 5. Sales & dispatch: SO, pick list, reservation, DN ============ */
  const sales = await as("sample.sales@sample.invalid");
  await go(sales, "/sales/orders/new");
  await link(sales.page, "Customer", "SAMPLE Customer - Distributor");
  await link(sales.page, "Dispatch from", "FG-STORES");
  await link(sales.page, "Item", "SAMPLE-FG-0001");
  await sales.page.locator(".row-edit .readonly .num").first().waitFor();
  await numberField(sales.page, "Quantity", 4);
  await numberField(sales.page, "Rate", 250);
  await click(sales.page, "Save draft");
  const so = await docName(sales.page, "/sales/orders");
  await click(sales.page, "Submit order");
  await sales.page.locator(".page-title .chip", { hasText: "To Deliver and Bill" }).waitFor();
  check("sales user creates and submits a sales order in React", (await sales.doc("Sales Order", so)).docstatus === 1, so);

  // started from the Pick Lists list, through its "pick a sales order" picker
  await go(stores, "/sales/pick-lists");
  await click(stores.page, "Create pick list");
  await stores.page.getByRole("dialog").getByRole("row").filter({ hasText: so }).click();
  const pl = await docName(stores.page, "/sales/pick-lists");
  await click(stores.page, "Reserve picked batches");
  await stores.page.getByRole("table", { name: "Stock reservations" }).getByRole("row").nth(1).waitFor();
  const plDoc = await stores.doc("Pick List", pl);
  check("stores picks (FEFO, FG-STORES) and reserves in React", plDoc.docstatus === 1 && plDoc.locations.every((r) => r.warehouse === "FG-STORES - SMM"), pl);

  const dispatch = await as("sample.dispatch@sample.invalid");
  await go(dispatch, `/sales/pick-lists/${pl}`);
  await click(dispatch.page, "Create delivery note");
  const dn = await docName(dispatch.page, "/sales/deliveries");
  await click(dispatch.page, "Dispatch");
  const dnMsg = await refusal(dispatch.page);
  check("dispatch without transporter / LR is refused by the ERP", (await dispatch.doc("Delivery Note", dn)).docstatus === 0, dnMsg.replace(/\s+/g, " ").slice(0, 160));
  await textField(dispatch.page, "Transporter", "SAMPLE Transport Co");
  await textField(dispatch.page, "LR / AWB no.", `SAMPLE-LR-${RUN}`);
  await textField(dispatch.page, "Vehicle no.", "SAMPLE-MH-00");
  await click(dispatch.page, "Save dispatch details");
  await dispatch.page.getByText("Dispatch details saved").waitFor();
  await numberField(dispatch.page, "Net weight per unit", 0.05);
  await click(dispatch.page, "Create packing slip");
  await dispatch.page.getByText(/Packing slip .* submitted/).waitFor();
  await click(dispatch.page, "Dispatch");
  await dispatch.page.locator(".page-title .chip", { hasText: "To Bill" }).waitFor();
  const dnDoc = await dispatch.doc("Delivery Note", dn);
  check("dispatch user dispatches in React: DN submitted with LR", dnDoc.docstatus === 1 && dnDoc.lr_no === `SAMPLE-LR-${RUN}`, dn);
  await shot(dispatch, "06-delivery");

  /* ============ 6. Accounts: invoice from DN, payment ============ */
  const acc = await as("sample.accounts@sample.invalid");
  // started from the Sales Invoices list, through its "invoice a delivery" picker
  await go(acc, "/accounts/invoices");
  await click(acc.page, "Create invoice");
  await acc.page.getByRole("dialog").getByRole("row").filter({ hasText: dn }).click();
  const si = await docName(acc.page, "/accounts/invoices");
  await click(acc.page, "Submit invoice");
  await acc.page.getByRole("button", { name: "Record payment" }).waitFor();
  const siDoc = await acc.doc("Sales Invoice", si);
  check("accounts invoices the delivery in React: no stock update, 1,000.00", siDoc.docstatus === 1 && !siDoc.update_stock && siDoc.grand_total === 1000, si);
  await click(acc.page, "Record payment");
  await acc.page.waitForURL(/\/accounts\/payments\/new/);
  await textField(acc.page, "Bank reference / UTR", `SAMPLE-UTR-${RUN}`);
  await click(acc.page, "Post payment");
  const pe = await docName(acc.page, "/accounts/payments");
  const paid = await acc.doc("Sales Invoice", si);
  check("payment posted in React clears the invoice", (await acc.doc("Payment Entry", pe)).docstatus === 1 && paid.outstanding_amount === 0 && paid.status === "Paid", pe);
  await go(acc, "/accounts/receivables");
  await acc.page.getByText(/rows · report “Accounts Receivable”/).waitFor();
  check("receivables report loads from the ERP", true);
  await shot(acc, "07-receivables");

  /* ============ 7. Management viewer: read only ============ */
  const mgmt = await as("sample.management@sample.invalid");
  check(
    "management viewer has no Create section anywhere",
    (await mgmt.page.locator(".panel-nav").getByRole("button", { name: "Create" }).count()) === 0,
  );
  await go(mgmt, `/sales/orders/${so}`);
  await mgmt.page.locator(".page-title .chip").waitFor();
  check("management viewer sees the order but no actions", (await mgmt.page.locator(".page-actions .btn-primary").count()) === 0);
  await go(mgmt, "/integrations");
  // states come from the channel records (management may not read them: one "Hidden" row); none may say Connected
  const mktTable = mgmt.page.getByRole("table", { name: "Marketplaces" });
  await mktTable.getByRole("row").filter({ hasText: "Amazon" }).waitFor();
  check(
    "Integration Centre lists no connected marketplace",
    (await mktTable.getByRole("row").count()) >= 2 && (await mktTable.getByText("Connected", { exact: true }).count()) === 0,
  );

  /* ============ 8. Every report page loads without an error, for the roles that see it ============ */
  for (const [s, paths] of [
    [mgmt, ["/inventory/stock", "/procurement/requirements", "/production/wastage", "/sales/available", "/sales/dispatch-register"]],
    [acc, ["/accounts/receivables", "/accounts/payables"]],
    [qc, ["/quality/queue"]],
  ]) {
    for (const path of paths) {
      await go(s, path);
      await s.page.locator(".page-meta, .note-error").first().waitFor({ timeout: 20_000 });
      const err = await s.page.locator(".note-error").count();
      check(`report page ${path} loads for ${s.user.split("@")[0]}`, err === 0, err ? await s.page.locator(".note-error").innerText() : "");
    }
  }

  /* ============ 9. Navigation: every module, every page in its panel, per role ============ */
  for (const s of [buyer, stores, qc, prod, sales, dispatch, acc, mgmt]) {
    await go(s, "/");
    const rail = s.page.locator(".side .rail-modules button");
    await rail.first().waitFor();
    const n = await rail.count();
    let pages = 0;
    for (let m = 0; m < n; m += 1) {
      await rail.nth(m).click();
      const moduleName = await rail.nth(m).getAttribute("aria-label");
      // open every collapsed section, then visit each link
      for (const b of await s.page.locator('.side .panel-nav button.pn-item[aria-expanded="false"]').all()) await b.click();
      const links = await s.page.locator(".side .panel-nav .pn-list a.pn-item").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      for (const href of links) {
        await s.page.goto(`${BASE}${href}`);
        await s.page.locator("h1").first().waitFor({ timeout: 20_000 });
        // a page started from another document opens its picker; close it before checking
        if (href.includes("start=1")) {
          await s.page.getByRole("dialog").waitFor();
          await s.page.keyboard.press("Escape");
        }
        await s.page.waitForLoadState("networkidle");
        const err = await s.page.locator(".note-error").count();
        const active = await s.page.locator(".side .pn-item[data-active]").count();
        if (err || active !== 1) check(`${s.user.split("@")[0]}: ${moduleName} → ${href}`, false, err ? await s.page.locator(".note-error").first().innerText() : `${active} active items`);
        pages += 1;
      }
    }
    check(`navigation sweep for ${s.user.split("@")[0]}: ${n} modules, ${pages} pages open with one active item and no error`, pages > 0);
  }

  for (const s of [buyer, approver, stores, qc, prod, sales, dispatch, acc, mgmt]) {
    check(`no page errors for ${s.user}`, s.page.errors.length === 0, s.page.errors.join("; "));
  }
} catch (e) {
  console.error(String(e));
  let i = 0;
  for (const c of browser.contexts()) {
    for (const pg of c.pages()) {
      i += 1;
      await pg.screenshot({ path: `${OUT}failure-${i}.png`, fullPage: true }).catch(() => undefined);
      const note = await pg.locator(".note-error").allInnerTexts().catch(() => []);
      if (note.length) console.error(`page ${i} (${pg.url()}): ${note.join(" | ").replace(/\s+/g, " ")}`);
    }
  }
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}results.json`, JSON.stringify({ run: RUN, date: TODAY, company: COMPANY, results }, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed (run ${RUN})`);
  await browser.close();
}
