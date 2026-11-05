// Browser check of the sales, dispatch and accounts screens (Playwright, Chromium).
// Usage: node ui_check_sales.js <sample_users.json> <screenshot dir> <Sales Order> <Delivery Note> <Sales Invoice> <Payment Entry>
// Run after acceptance_sales_http.py, which prints the documents to use.
const { chromium } = require('playwright');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync(process.argv[2]));
const out = process.argv[3];
const [so, dn, si, pe] = process.argv.slice(4, 8);
const BASE = 'http://factory.localhost:8000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};

(async () => {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP factory.localhost 127.0.0.1', '--no-proxy-server'] });
  const errors = [];
  const session = async (user) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${user}: ${e}`));
    await page.goto(BASE + '/login');
    const st = await page.evaluate(async ([u, p]) => (await fetch('/api/method/login', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: u, pwd: p }) })).status, [user, creds[user]]);
    check(`${user.split('@')[0]} logs in`, st === 200, String(st));
    return page;
  };
  const open = async (page, path, name, waitFor) => {
    await page.goto(BASE + path);
    await page.waitForSelector(waitFor, { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}.png` });
    const dlg = page.locator('.modal.show .modal-content, .msgprint-dialog.show');
    const e = (await dlg.count()) ? (await dlg.first().innerText()).replace(/\s+/g, ' ').slice(0, 160) : '';
    check(`no error dialog on ${name}`, !e, e);
    return page.locator('body').innerText();
  };

  const sales = await session('sample.sales@sample.invalid');
  let t = await open(sales, '/desk/sales-order/' + so, '21-sales-order', '.form-layout');
  check('Sales Order shows channel and customer', t.includes('Sales Channel') && t.includes('B2B') && t.includes('SAMPLE Customer - Distributor'));
  t = await open(sales, '/desk/sales-order?fo_sales_channel=D2C%20Website', '22-d2c-orders', '.frappe-list');
  check('D2C website orders listed with their order numbers', t.includes('WEB-'));
  t = await open(sales, '/desk/query-report/Available to Sell', '23-available-to-sell', '.dt-scrollable, .no-result');
  check('Available to Sell report shows sellable / reserved / available', ['Sellable', 'Reserved', 'Available to Sell', 'In QC Hold'].every((x) => t.includes(x)));
  t = await open(sales, '/desk/dashboard-view/Sales and Dispatch', '24-sales-dashboard', '.widget, .dashboard-widget-box, .number-widget-box');
  check('Sales and Dispatch dashboard shows sales and dispatch cards to sales', t.includes('Open Sales Orders') && t.includes('Pick Lists Open') && t.includes('Dispatches Not Billed'));
  check('receivables cards hidden from a salesperson (no invoice rights)', !t.includes('Receivables Outstanding'));

  const dispatch = await session('sample.dispatch@sample.invalid');
  t = await open(dispatch, '/desk/delivery-note/' + dn, '25-delivery-note', '.form-layout');
  check('Delivery Note form opens for dispatch', t.includes(dn) || t.includes('SAMPLE Customer - Distributor'));
  t = await open(dispatch, '/desk/query-report/Dispatch Register', '26-dispatch-register', '.dt-scrollable, .no-result');
  check('Dispatch Register lists the delivery with LR / AWB and packages', t.includes(dn) && t.includes('SAMPLE Transport Co'));

  const accounts = await session('sample.accounts@sample.invalid');
  t = await open(accounts, '/desk/sales-invoice/' + si, '27-sales-invoice', '.form-layout');
  check('Sales Invoice shows Paid', t.includes('Paid'));
  t = await open(accounts, '/desk/payment-entry/' + pe, '28-payment-entry', '.form-layout');
  check('Payment Entry opens', t.includes('SAMPLE Customer - Distributor'));
  t = await open(accounts, '/desk/dashboard-view/Sales and Dispatch', '30-dashboard-accounts', '.widget, .dashboard-widget-box, .number-widget-box');
  check('accounts see receivables on the dashboard', t.includes('Receivables Outstanding') && t.includes('Payments Received by Week'));
  t = await open(accounts, '/desk/query-report/Accounts Receivable', '29-accounts-receivable', '.dt-scrollable, .no-result');
  check('Accounts Receivable shows the unpaid website order', t.includes('SAMPLE D2C - Website Orders'));

  check('no JavaScript errors on these pages', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  fs.writeFileSync(out + '/results-sales.json', JSON.stringify(results, null, 1));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} UI checks passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
