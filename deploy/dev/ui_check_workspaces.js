// Browser check of the role-based workspaces (Milestone 6), as each SAMPLE user (Playwright, Chromium).
// Usage: node ui_check_workspaces.js <sample_users.json> <screenshot dir>
// For every user: the role shells in their navigation are exactly the expected ones; each opens at
// /desk/<workspace> inside its own sidebar with working number cards and no error; another role's
// workspace is refused. Also: the master data import form and the new reports load.
const { chromium } = require('playwright');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync(process.argv[2]));
const out = process.argv[3];
const BASE = process.env.UI_BASE || 'http://factory.localhost:8000'; // e.g. http://demo.localhost:8001
const HOSTNAME = new URL(BASE).hostname;
const ALL = ['Management', 'Procurement', 'Stores and Warehouse', 'Production Floor', 'Quality Control', 'Sales and Dispatch', 'Factory Accounts'];
const EXPECTED = {
  'sample.management@sample.invalid': ['Management'],
  'sample.buyer@sample.invalid': ['Procurement'],
  'sample.approver@sample.invalid': ['Procurement'],
  'sample.stores@sample.invalid': ['Stores and Warehouse'],
  'sample.production@sample.invalid': ['Production Floor', 'Stores and Warehouse'],
  'sample.qc@sample.invalid': ['Quality Control'],
  'sample.qa@sample.invalid': ['Quality Control'],
  'sample.sales@sample.invalid': ['Sales and Dispatch', 'Stores and Warehouse'],
  'sample.dispatch@sample.invalid': ['Sales and Dispatch', 'Stores and Warehouse'],
  'sample.accounts@sample.invalid': ['Factory Accounts'],
  'sample.masterdata@sample.invalid': ['Stores and Warehouse'],
};
const slug = (s) => s.toLowerCase().replace(/ /g, '-');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

(async () => {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${HOSTNAME} 127.0.0.1`, '--no-proxy-server'] });
  const jsErrors = [];
  for (const [user, expected] of Object.entries(EXPECTED)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => jsErrors.push(`${user}: ${e}`));
    const short = user.split('@')[0].replace('sample.', '');
    await page.goto(BASE + '/login');
    await page.evaluate(async ([u, p]) => fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usr: u, pwd: p }) }), [user, creds[user]]);
    await page.goto(BASE + '/desk');
    await page.waitForFunction(() => window.frappe && frappe.boot && frappe.boot.module_sidebars, null, { timeout: 30000 });
    const shells = await page.evaluate((all) => Object.keys(frappe.boot.module_sidebars).filter((k) => all.includes(k)), ALL);
    check(`${short}: navigation holds exactly its role workspaces`, sameSet(shells.sort(), [...expected].sort()), `got [${shells.join(', ')}]`);
    for (const ws of expected) {
      await page.goto(`${BASE}/desk/${slug(ws)}`);
      await page.waitForSelector('.number-widget-box, .widget', { timeout: 30000 });
      await page.waitForTimeout(2500);
      const url = page.url();
      const sidebarTitle = await page.evaluate(() => (document.querySelector('.sidebar-header, .body-sidebar .header-title, [data-sidebar-title]') || {}).innerText || '');
      const body = await page.locator('body').innerText();
      const dlg = await page.locator('.modal.show .modal-content, .msgprint-dialog.show').count();
      check(`${short}: ${ws} opens in its own shell`, url.endsWith(`/desk/${slug(ws)}`) && (sidebarTitle.includes(ws) || body.split('\n').slice(0, 8).join(' ').includes(ws)), `${url} | sidebar "${sidebarTitle.trim().split('\n')[0]}"`);
      const cardErrors = await page.locator('.number-widget-box .widget-content:has-text("Error"), .widget.number-widget-box:has-text("Not permitted")').count();
      check(`${short}: ${ws} cards load without error dialog`, dlg === 0 && cardErrors === 0);
      // charts fetch their data after the cards; wait so the screenshot shows what users see
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${out}/${slug(ws)}--${short}.png` });
    }
    const forbidden = ALL.find((w) => !expected.includes(w));
    await page.goto(`${BASE}/desk/${slug(forbidden)}`);
    await page.waitForTimeout(3500);
    const deniedText = await page.locator('body').innerText();
    const cards = await page.locator('.number-widget-box').count();
    check(`${short}: another role's workspace (${forbidden}) is refused`, cards === 0 && /not permitted|not found|no permission/i.test(deniedText), page.url());
    await ctx.close();
  }

  // master data import form and the new reports
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => jsErrors.push(`stores: ${e}`));
  await page.goto(BASE + '/login');
  const stores = 'sample.stores@sample.invalid';
  await page.evaluate(async ([u, p]) => fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usr: u, pwd: p }) }), [stores, creds[stores]]);
  await page.goto(BASE + '/desk/master-data-import/new');
  await page.waitForSelector('.form-layout', { timeout: 30000 });
  await page.locator('select[data-fieldname="import_type"]').selectOption('Opening Stock');
  await page.waitForTimeout(1500);
  check('Master Data Import form offers Download Template', (await page.locator('button:has-text("Download Template")').count()) > 0);
  await page.screenshot({ path: `${out}/master-data-import--stores.png` });
  for (const report of ['RM PM Requirements', 'Wastage by Reason', 'Stock by QC Status']) {
    await page.goto(`${BASE}/desk/query-report/${report}`);
    await page.waitForSelector('.dt-scrollable, .no-result, .report-wrapper', { timeout: 30000 });
    await page.waitForTimeout(2000);
    const dlg = await page.locator('.modal.show .modal-content, .msgprint-dialog.show').count();
    check(`report ${report} loads for stores`, dlg === 0);
    await page.screenshot({ path: `${out}/report-${slug(report)}.png` });
  }
  check('no JavaScript errors', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  await browser.close();
  fs.writeFileSync(out + '/results-workspaces.json', JSON.stringify(results, null, 1));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} UI checks passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
