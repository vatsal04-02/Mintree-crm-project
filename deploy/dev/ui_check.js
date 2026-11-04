// Browser check of the essential QC screens on a development site (Playwright, Chromium).
// Usage: node ui_check.js <sample_users.json> <screenshot dir> <submitted Reject QC Release> <draft QC Release> <held batch>
// Expects the dev site at http://factory.localhost:8000 (mapped to 127.0.0.1) with SAMPLE data from acceptance_http.py.
const { chromium } = require('playwright');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync(process.argv[2]));
const out = process.argv[3];
const BASE = 'http://factory.localhost:8000';
const results = [];
const dialogErrors = async (pg) => {
  // any visible message dialog counts as a failure on these screens
  const dlg = pg.locator('.modal.show .modal-content, .msgprint-dialog.show');
  const n = await dlg.count();
  return n ? (await dlg.first().innerText()).replace(/\s+/g, ' ').slice(0, 160) : '';
};
const check = (name, ok, detail='') => { results.push({name, ok, detail}); console.log((ok?'PASS ':'FAIL ')+name+(detail?' — '+detail:'')); };

(async () => {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP factory.localhost 127.0.0.1', '--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // v16 renders the login form with JavaScript; log in through the same API it calls
  const loginIn = async (pg, user) => {
    await pg.goto(BASE + '/login');
    return pg.evaluate(async ([u, p]) => {
      const r = await fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usr: u, pwd: p }) });
      return r.status;
    }, [user, creds[user]]);
  };
  const st = await loginIn(page, 'sample.qc@sample.invalid');
  check('QC officer logs in', st === 200, String(st));
  await page.goto(BASE + '/desk');
  await page.waitForSelector('.page-container, .desk-page, #page-desktop, body', { timeout: 30000 });
  check('QC officer logs in to Desk', page.url().includes('/desk') || page.url().includes('/app'), page.url());

  // QC Release list
  await page.goto(BASE + '/desk/qc-release');
  await page.waitForSelector('.list-row, .no-result', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const listText = await page.locator('body').innerText();
  const shown = (listText.match(/SAMPLE-RM-0001-26-\d+|SAMPLE-FG-0001-26-\d+/g) || []).length;
  check('QC Release list loads with releases', shown > 0, `${shown} batch references visible`);
  await page.screenshot({ path: out + '/01-qc-release-list.png' });
  { const e = await dialogErrors(page); check('no error dialog on 01-qc-release-list', !e, e); }

  // Draft QC Release form shows the Create Quality Inspection action
  await page.goto(BASE + '/desk/qc-release/' + process.argv[5]);
  await page.waitForSelector('.form-layout', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const btn = await page.locator('button:has-text("Create Quality Inspection")').count();
  check('draft QC Release shows "Create Quality Inspection"', btn > 0);
  const title = await page.title();
  check('QC Release form opens', title.includes(process.argv[5]) || (await page.content()).includes(process.argv[5]), title);
  await page.screenshot({ path: out + '/02-qc-release-draft.png', fullPage: true });
  { const e = await dialogErrors(page); check('no error dialog on 02-qc-release-draft', !e, e); }

  // Submitted rejection: QC officer must NOT see Send for Re-test
  await page.goto(BASE + '/desk/qc-release?decision=Reject&docstatus=1');
  await page.waitForSelector('.list-row, .no-result', { timeout: 30000 });
  const rejName = await page.locator('.list-row .level-item.bold a, .list-row a.ellipsis').first().getAttribute('data-name').catch(() => null);
  // QC Queue report
  await page.goto(BASE + '/desk/query-report/QC Queue');
  await page.waitForSelector('.dt-scrollable, .no-result', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const queueText = await page.locator('.report-wrapper, .page-content').first().innerText();
  check('QC Queue report shows the held batch', queueText.includes(process.argv[6]));
  await page.screenshot({ path: out + '/03-qc-queue.png' });
  { const e = await dialogErrors(page); check('no error dialog on 03-qc-queue', !e, e); }

  // Stock by QC Status
  await page.goto(BASE + '/desk/query-report/Stock by QC Status');
  await page.waitForSelector('.dt-scrollable, .no-result', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const stockText = await page.locator('.page-content').first().innerText();
  check('Stock by QC Status shows hold, usable and rejected', ['QC Hold','Usable','Rejected'].every(t => stockText.includes(t)));
  await page.screenshot({ path: out + '/04-stock-by-qc-status.png' });
  { const e = await dialogErrors(page); check('no error dialog on 04-stock-by-qc-status', !e, e); }

  // Batch with derived QC status and supplier details
  await page.goto(BASE + '/desk/batch/' + process.argv[6]);
  await page.waitForSelector('.form-layout', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const batchText = await page.locator('.form-layout').innerText();
  check('Batch shows QC Status and supplier batch', batchText.includes('QC Status') && batchText.includes('SAMPLE-HTTP-LOT-1'));
  await page.screenshot({ path: out + '/05-batch.png', fullPage: true });
  { const e = await dialogErrors(page); check('no error dialog on 05-batch', !e, e); }

  // QA manager sees "Send for Re-test" on a submitted rejection
  const qa = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const qp = await qa.newPage();
  await loginIn(qp, 'sample.qa@sample.invalid');
  const rej = process.argv[4];
  await qp.goto(BASE + '/desk/qc-release/' + rej);
  await qp.waitForSelector('.form-layout', { timeout: 30000 });
  await qp.waitForTimeout(1500);
  check('QA Manager sees "Send for Re-test" on a rejection', (await qp.locator('button:has-text("Send for Re-test")').count()) > 0, rej);
  await qp.screenshot({ path: out + '/06-reject-send-for-retest.png' });
  { const e = await dialogErrors(qp); check('no error dialog on 06-reject-send-for-retest', !e, e); }
  // and the QC officer does not
  await page.goto(BASE + '/desk/qc-release/' + rej);
  await page.waitForSelector('.form-layout', { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('QC Officer does not see "Send for Re-test"', (await page.locator('button:has-text("Send for Re-test")').count()) === 0);

  check('no JavaScript errors on these pages', errors.length === 0, errors.slice(0,3).join(' | '));
  await browser.close();
  fs.writeFileSync(out + '/results.json', JSON.stringify(results, null, 1));
  console.log(`${results.filter(r=>r.ok).length}/${results.length} UI checks passed`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
