// Browser check of the local demo site's product master and demo documents (Playwright).
// Usage: node ui_check_demo.js <sites/demo.localhost/private> <screenshot dir> [base URL]
// Reads sample_users.json, demo_scenario.json and demo_documents.json from the private folder.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const priv = process.argv[2];
const out = process.argv[3];
const BASE = process.argv[4] || 'http://demo.localhost:8001';
const HOSTNAME = new URL(BASE).hostname;
const creds = JSON.parse(fs.readFileSync(path.join(priv, 'sample_users.json')));
const scenario = JSON.parse(fs.readFileSync(path.join(priv, 'demo_scenario.json')));
const documents = JSON.parse(fs.readFileSync(path.join(priv, 'demo_documents.json')));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};

async function session(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no JavaScript error (${user})`, false, String(e)));
  await page.goto(BASE + '/login');
  await page.evaluate(async ([u, p]) => fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usr: u, pwd: p }) }), [user, creds[user]]);
  return { ctx, page };
}

async function openForm(page, doctype, name) {
  await page.goto(`${BASE}/desk/${doctype.toLowerCase().replace(/ /g, '-')}/${encodeURIComponent(name)}`);
  await page.waitForSelector('.form-layout', { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page.locator('.form-layout').innerText();
}

const errorDialog = async (page) => (await page.locator('.modal.show .modal-content:has-text("Error"), .msgprint-dialog.show').count()) > 0;

(async () => {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOSTNAME} 127.0.0.1`, '--no-proxy-server'] });

  // product master, as the master-data user
  let { ctx, page } = await session(browser, 'sample.masterdata@sample.invalid');
  for (const group of ['Skin Care', 'Hair Care', 'Gift Sets / Combos']) {
    await page.goto(`${BASE}/desk/item?item_group=${encodeURIComponent(group)}`);
    await page.waitForSelector('.list-row-container, .no-result', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const rows = await page.locator('.list-row-container').count();
    check(`Item list filtered by category "${group}" shows the website products`, rows > 0, `${rows} rows`);
    await page.screenshot({ path: `${out}/items--${group.replace(/[^A-Za-z]+/g, '-').toLowerCase()}.png` });
  }
  const fg = scenario.fg_item;
  const itemText = await openForm(page, 'Item', fg);
  await page.locator('text=Public website catalogue').first().click().catch(() => {});
  await page.waitForTimeout(800);
  const itemTextOpen = await page.locator('.form-layout').innerText();
  check('Item form shows the public catalogue section with source URL', /Public website catalogue/.test(itemTextOpen) && /Source URL/.test(itemTextOpen), fg);
  check('Item form shows the pack size', /Pack size/.test(itemText + itemTextOpen));
  const img = await page.locator('.sidebar-image img, .form-sidebar img').count();
  check('Item has an image in the form sidebar', img > 0);
  check('no error dialog on the Item form', !(await errorDialog(page)));
  await page.screenshot({ path: `${out}/item-form.png`, fullPage: true });
  await page.goto(`${BASE}/desk/master-data-import`);
  await page.waitForSelector('.list-row-container', { timeout: 30000 });
  check('Master Data Import list shows the catalogue imports', (await page.locator('.list-row-container').count()) >= 2);
  await page.screenshot({ path: `${out}/master-data-imports.png` });
  await ctx.close();

  // one form per step of the scenario, each as the user who did it
  const steps = [
    ['sample.approver@sample.invalid', 'Purchase Order'],
    ['sample.stores@sample.invalid', 'Purchase Receipt'],
    ['sample.qc@sample.invalid', 'QC Release'],
    ['sample.production@sample.invalid', 'Work Order'],
    ['sample.sales@sample.invalid', 'Sales Order'],
    ['sample.stores@sample.invalid', 'Pick List'],
    ['sample.dispatch@sample.invalid', 'Delivery Note'],
    ['sample.accounts@sample.invalid', 'Sales Invoice'],
    ['sample.accounts@sample.invalid', 'Payment Entry'],
  ];
  for (const [user, doctype] of steps) {
    ({ ctx, page } = await session(browser, user));
    const name = documents[doctype].slice(-1)[0];
    const text = await openForm(page, doctype, name);
    check(`${doctype} ${name} opens for ${user.split('@')[0]}`, text.length > 0 && !(await errorDialog(page)));
    await page.screenshot({ path: `${out}/doc--${doctype.toLowerCase().replace(/ /g, '-')}.png` });
    await ctx.close();
  }

  // management dashboard figures after the scenario
  ({ ctx, page } = await session(browser, 'sample.management@sample.invalid'));
  await page.goto(`${BASE}/desk/management`);
  await page.waitForSelector('.number-widget-box', { timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  const mgmt = await page.locator('body').innerText();
  check('Management dashboard loads with figures', (await page.locator('.number-widget-box').count()) >= 8 && /Finished Goods Stock/.test(mgmt) && !(await errorDialog(page)));
  await page.screenshot({ path: `${out}/management.png` });
  await ctx.close();

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} demo UI checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
