// Browser check of the production screens on a development site (Playwright, Chromium).
// Usage: node ui_check_production.js <sample_users.json> <screenshot dir> <FG Work Order> <held FG batch>
// Run after acceptance_production_http.py, which prints the Work Order and batch to use.
const { chromium } = require('playwright');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync(process.argv[2]));
const out = process.argv[3];
const [workOrder, batch] = [process.argv[4], process.argv[5]];
const BASE = 'http://factory.localhost:8000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
const dialogErrors = async (pg) => {
  const dlg = pg.locator('.modal.show .modal-content, .msgprint-dialog.show');
  return (await dlg.count()) ? (await dlg.first().innerText()).replace(/\s+/g, ' ').slice(0, 160) : '';
};

(async () => {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP factory.localhost 127.0.0.1', '--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: false });

  await page.goto(BASE + '/login');
  const st = await page.evaluate(async ([u, p]) => (await fetch('/api/method/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ usr: u, pwd: p }) })).status, ['sample.production@sample.invalid', creds['sample.production@sample.invalid']]);
  check('production user logs in', st === 200, String(st));

  const open = async (path, name, waitFor = '.page-container') => {
    await page.goto(BASE + path);
    await page.waitForSelector(waitFor, { timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(name);
    const e = await dialogErrors(page);
    check(`no error dialog on ${name}`, !e, e);
    return (await page.locator('body').innerText());
  };

  let text = await open('/desk/work-order', '11-work-order-list', '.frappe-list');
  check('Work Order list shows the FG order', text.includes(workOrder));

  text = await open('/desk/work-order/' + workOrder, '12-work-order-fg', '.form-layout');
  check('FG Work Order shows output into FG-QC-HOLD and is Closed (short fill)', text.includes('FG-QC-HOLD') && text.includes('Closed'));
  check('FG Work Order consumes bulk from BULK-STORES', text.includes('SAMPLE-BULK-0001') && text.includes('BULK-STORES'));

  text = await open('/desk/bom?item=SAMPLE-BULK-0001', '13-bom-list', '.frappe-list');
  check('BOM list shows the bulk BOM', text.includes('SAMPLE-BULK-0001'));

  text = await open('/desk/wastage-reason', '14-wastage-reasons', '.frappe-list');
  check('Wastage Reason list readable by production', text.includes('Damaged in handling'));

  text = await open('/desk/batch/' + batch, '15-fg-batch', '.form-layout');
  check('FG batch shows QC Status Hold', text.includes('QC Status') && text.includes('Hold'));

  await page.goto(`${BASE}/printview?doctype=Batch&name=${encodeURIComponent(batch)}&format=Batch%20Label&no_letterhead=1`);
  await page.waitForSelector('.print-format', { timeout: 30000 });
  await shot('16-batch-label-printview');
  text = await page.locator('.print-format').innerText();
  check('Batch Label print view shows batch, Work Order and QC: HOLD', text.includes(batch) && text.includes(workOrder) && text.includes('QC: HOLD'));

  check('no JavaScript errors on these pages', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  fs.writeFileSync(out + '/results-production.json', JSON.stringify(results, null, 1));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} UI checks passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
