// Every everyday function of Novyra Desk, done through the screen the way a person does it,
// inside a company desk (novyradesk.com/karoo-cycles/). Runs after e2e.mjs on the same emulators.
// Local dry run without emulators: MOCK=/path/to/test.html node functions.mjs
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const MOCK = process.env.MOCK, P = 'novyra-studio', PORT = 5056;
const FS = `http://127.0.0.1:8085/v1/projects/${P}/databases/(default)/documents`;
const adminH = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : null;
const list = async path => { if (MOCK) return null; const r = await fetch(`${FS}/${path}?pageSize=300`, { headers: adminH }); const j = await r.json(); return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)])) })); };
const CO = 'companies/karoo-cycles/';
mkdirSync('shots', { recursive: true });

if (!MOCK) {
  const ROOT = new URL('../desk-site/', import.meta.url).pathname;
  const types = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = join(ROOT, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) f = /^\/[a-z0-9-]+\/quote(\/.*)?$/.test(p) ? join(ROOT, 'quote/index.html') : join(ROOT, 'index.html');
    r.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
  }).listen(PORT);
}

let n = 0, bad = 0; const errors = [];
const check = (name, ok, extra = '') => { n++; if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); };
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
process.on('unhandledRejection', e => { console.log('  FAIL (stopped) ' + (e && e.message || e).split('\n')[0]); bad++; });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage(); pg.setDefaultTimeout(15000);
pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.dismiss());
const go = async h => { await pg.evaluate(x => location.hash = '#' + x, h); await W(900); };
const text = () => pg.evaluate(() => document.getElementById('main').innerText);
const modal = () => pg.locator('#modal');
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (stopped)', false, (e.message || '').split('\n')[0]); await pg.screenshot({ path: `shots/fn-fail-${n}.png` }).catch(() => {}); await pg.keyboard.press('Escape').catch(() => {}); } };

if (MOCK) { await pg.goto('file://' + MOCK); await W(2500); }
else {
  await pg.goto(`http://127.0.0.1:${PORT}/karoo-cycles/?emu=1`);
  await pg.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
  await pg.fill('#g-email', 'owner@karoo.test'); await pg.fill('#g-pass', 'test-pass-123'); await pg.click('#g-submit');
  await pg.waitForFunction(() => document.getElementById('gate').hidden && document.querySelector('.appbar'), null, { timeout: 30000 });
  await W(2500);
}
const NAME = 'Function Test Co';

console.log('1. Customers');
await step('Add a customer', async () => {
  await go('clients'); await pg.click('[data-add-client]'); await W(500);
  await pg.fill('#cl-business', NAME);
  await pg.locator('#modal .pcard').nth(0).locator('[data-pf=name]').fill('Lindiwe Dube');
  await pg.locator('#modal .pcard').nth(0).locator('[data-pf=email]').fill('lindiwe@functiontest.test');
  await pg.click('[data-save-client]'); await W(1200);
  check('New customer shows in the Active list', (await text()).includes(NAME));
  const cs = await list(CO + 'clients'); if (cs) check('Customer is saved in the company’s space', cs.some(c => c.business === NAME));
});
await step('Mark a customer inactive', async () => {
  await pg.click(`.cc:has-text("${NAME}")`); await W(500);
  await pg.uncheck('#cl-active'); await pg.click('[data-save-client]'); await W(1200);
  check('Inactive customer leaves the Active list', !(await text()).includes(NAME));
  await pg.click('[data-cl-show=inactive]'); await W(400);
  check('Inactive customer is in the Inactive list, marked Inactive', (await pg.locator(`.cc.off:has-text("${NAME}") .cc-tag`).count()) === 1);
  const cs = await list(CO + 'clients'); if (cs) check('Inactive is saved', (cs.find(c => c.business === NAME) || {}).inactive === true);
  await go('quotes'); await pg.click('[data-new]'); await W(500);
  await pg.fill('#modal .cust', 'Function'); await W(400);
  check('Inactive customer isn’t offered for a new quote', !(await pg.locator('#modal .combo-list li:not(.add)', { hasText: NAME }).count()));
  await pg.keyboard.press('Escape'); await W(300); if (await modal().isVisible().catch(() => false)) await pg.click('#modal [data-close]').catch(() => {});
  await go('clients'); await pg.click('[data-cl-show=inactive]'); await W(400);
  await pg.click(`.cc:has-text("${NAME}")`); await W(500); await pg.check('#cl-active'); await pg.click('[data-save-client]'); await W(1200);
  await pg.click('[data-cl-show=active]'); await W(400);
  check('Customer can be made active again', (await text()).includes(NAME));
});

console.log('2. Price list');
await step('Add a price', async () => {
  await go('prices'); await pg.click('[data-edit-prices]'); await W(700);
  await pg.click('[data-add-price]'); await W(1000);
  const rows = pg.locator('input[value="New item"]'); check('New price row is added', (await rows.count()) >= 1);
  const r = rows.last().locator('xpath=ancestor::tr');
  await rows.last().fill('Function test item'); await rows.last().dispatchEvent('change');
  await r.locator('[data-k=unit]').fill('per month'); await r.locator('[data-k=unit]').dispatchEvent('change');
  await r.locator('[data-k=price]').fill('3500'); await r.locator('[data-k=price]').dispatchEvent('change'); await W(200);
  await pg.click('[data-save-prices]'); await W(1500);
  check('New price shows on the price sheet', (await text()).includes('Function test item'));
});

console.log('3. Quote → invoice → payment');
let qText = '';
await step('Make and save a quote', async () => {
  await go('quotes'); await pg.click('[data-new]'); await W(500);
  await pg.fill('#modal .cust', NAME); await W(400);
  await pg.locator('#modal .combo-list li:not(.add)', { hasText: NAME }).first().click(); await W(400);
  await pg.click('[data-create]'); await W(900);
  await pg.fill('.item[data-i="0"] [data-f="item"]', 'Logo design'); await pg.dispatchEvent('.item[data-i="0"] [data-f="item"]', 'change'); await W(150);
  await pg.fill('.item[data-i="0"] [data-f="rate"]', '2000'); await pg.dispatchEvent('.item[data-i="0"] [data-f="rate"]', 'change'); await W(150);
  await pg.click('[data-act="add-item"]'); await W(300);
  await pg.fill('.item[data-i="1"] [data-f="item"]', 'Business cards'); await pg.dispatchEvent('.item[data-i="1"] [data-f="item"]', 'change'); await W(150);
  await pg.fill('.item[data-i="1"] [data-f="rate"]', '500'); await pg.dispatchEvent('.item[data-i="1"] [data-f="rate"]', 'change'); await W(150);
  await pg.click('[data-act="add-item"]'); await W(300);
  await pg.fill('.item[data-i="2"] [data-f="item"]', 'Function test item'); await pg.dispatchEvent('.item[data-i="2"] [data-f="item"]', 'change'); await W(300);
  const r3 = pg.locator('.item[data-i="2"] [data-f="rate"]'); if (!Number(await r3.inputValue())) { await r3.fill('3500'); await r3.dispatchEvent('change'); } await W(150);
  await pg.click('[data-act="save"]'); await W(1500);
  qText = await text();
  check('Quote total adds up (R6,000 incl. first month)', /6[ ,]?000/.test(qText));
  check('Price list fills in the monthly item’s price', /3[ ,]?500/.test(qText));
  const qs = await list(CO + 'quotes'); if (qs) check('Quote is saved with all three items', qs.some(q => (q.client || {}).business === NAME && (q.items || []).length === 3));
});
await step('Mark the quote as sent', async () => {
  await pg.click('[data-act="sent"]'); await W(500); await pg.click('#modal [data-confirm]'); await W(1500);
  const qs = await list(CO + 'quotes'); if (qs) check('Quote is marked as sent', qs.some(q => (q.client || {}).business === NAME && q.status === 'Open' && q.sentAt));
  else check('Quote is marked as sent', /sent/i.test(await text()));
});
await step('Accept the quote', async () => {
  await pg.click('[data-act="accept"]'); await W(500); await pg.click('#modal [data-confirm]'); await W(1500);
  const qs = await list(CO + 'quotes'); if (qs) check('Quote is accepted', qs.some(q => (q.client || {}).business === NAME && q.status === 'Accepted'));
  else check('Quote is accepted', /accepted/i.test(await text()));
});
if (!MOCK) await step('Download the quote as a PDF', async () => {
  const dl = pg.waitForEvent('download', { timeout: 30000 }); await pg.click('[data-act="pdf"]'); const f = await dl;
  check('Quote PDF downloads', /\.pdf$/i.test(f.suggestedFilename()), f.suggestedFilename());
});
await step('Create the invoice from the quote', async () => {
  await pg.click('[data-act="invoice"]'); await W(1200);
  if (await pg.locator('#modal [data-create]').count()) { await pg.click('#modal [data-create]'); await W(900); }
  if (await pg.locator('[data-act="save"]:not([disabled])').count()) { await pg.click('[data-act="save"]'); await W(1500); }
  const vs = await list(CO + 'invoices'); if (vs) check('Invoice is created for the customer', vs.some(v => (v.client || {}).business === NAME));
  else check('Invoice is created for the customer', /invoice/i.test(await text()));
});
await step('Send the invoice', async () => {
  await pg.click('[data-act="send"]'); await W(500); await pg.click('#modal [data-confirm]'); await W(1800);
  const vs = await list(CO + 'invoices'); if (vs) check('Invoice gets a number and is sent', vs.some(v => (v.client || {}).business === NAME && v.status === 'Sent' && v.number));
  else check('Invoice is sent', /INV-/.test(await text()));
});
await step('Record a part payment, then the rest', async () => {
  await pg.click('[data-act="pay"]'); await W(500); await pg.fill('#cf-amount', '1000'); await pg.click('#modal [data-confirm]'); await W(1500);
  check('Part payment shows what is still owed (R5,000)', /5[ ,]?000/.test(await text()));
  await pg.click('[data-act="pay"]'); await W(500); await pg.fill('#cf-amount', '5000'); await pg.click('#modal [data-confirm]'); await W(1500);
  check('Invoice shows as paid in full', /paid/i.test(await text()));
  const vs = await list(CO + 'invoices'); if (vs) { const v = vs.find(v => (v.client || {}).business === NAME); check('Both payments are saved', v && (v.payments || []).length === 2); }
  check('Receipts can be downloaded', (await pg.locator('[data-receipt]').count()) === 2);
});
await step('Customer card counts the work', async () => {
  await go('clients'); const card = await pg.locator(`.cc:has-text("${NAME}")`).innerText();
  check('Customer card shows 1 quote, 1 invoice, nothing owed', /1\s*quote/.test(card) && /1\s*invoice/.test(card) && /Nothing owed/.test(card), card.replace(/\s+/g, ' '));
});

console.log('4. Monthly billing');
await step('Start monthly billing from the accepted quote', async () => {
  await go('quotes'); await pg.locator('tr[data-open]', { hasText: NAME }).first().click(); await W(1000);
  await pg.click('[data-act="plan"]'); await W(600);
  check('Monthly item is carried over from the quote', (await pg.locator('#modal [data-pi]').count()) === 1);
  await pg.click('#modal [data-plan-save]'); await W(1500);
  await go('plans');
  check('Monthly billing shows the customer at R3,500 a month', (await text()).includes(NAME) && /3[ ,]?500/.test(await text()));
  const ps = await list(CO + 'plans'); if (ps) check('Plan is saved in the company’s space', ps.some(p => (p.client || {}).business === NAME && p.active === true));
});
console.log('5. Expenses');
await step('Add an expense', async () => {
  await go('expenses'); await pg.click('[data-add-expense]'); await W(500);
  await pg.fill('#ex-desc', 'Printer ink'); await pg.fill('#ex-amount', '450'); if (await pg.locator('#ex-sup').count()) await pg.fill('#ex-sup', 'Takealot');
  await pg.click('[data-ex-save]'); await W(1300);
  check('Expense shows in the list', (await text()).includes('Printer ink'));
  check('Expenses page has no period buttons or search box', !(await pg.locator('#main [data-filter], #main .toolbar input').count()));
  const es = await list(CO + 'expenses'); if (es) check('Expense is saved', es.some(e => e.desc === 'Printer ink' || e.description === 'Printer ink'));
});

console.log('6. Content calendar');
await step('Add a post', async () => {
  await go('calendar'); await pg.locator('[data-cal-add]').first().click(); await W(600);
  await pg.fill('#ca-name', 'Function test post'); if (await pg.locator('#ca-cap').count()) await pg.fill('#ca-cap', 'Caption text');
  await pg.click('[data-ca-save]'); await W(1300);
  check('Post shows on the calendar', (await text()).includes('Function test post'));
});

console.log('7. Team');
await step('Add a team member', async () => {
  await go('team'); await pg.locator('[data-user-add]').first().click(); await W(600);
  await pg.fill('#us-name', 'Pieter Test'); await pg.fill('#us-email', 'pieter@karoo.test');
  await pg.click('[data-us-save]'); await W(1500);
  check('Team member shows on the Team page', (await text()).includes('Pieter Test'));
  const us = MOCK ? null : await list(CO + 'users'); if (us) check('Team member is saved in the company’s team', us.some(u => u.id === 'pieter@karoo.test'));
});

console.log('8. Search and settings');
await step('Search finds the customer', async () => {
  await pg.click('#top-q'); await pg.keyboard.type('Function Test'); await W(800);
  check('Search shows the customer', (await pg.evaluate(() => document.body.innerText)).includes(NAME));
  await pg.keyboard.press('Escape'); await W(300);
  await pg.click('#top-q'); await pg.keyboard.type('Printer'); await W(800);
  check('Search finds the expense', (await pg.locator('#spop-res .sp-it', { hasText: 'Printer ink' }).count()) === 1);
  await pg.keyboard.press('Escape'); await W(300);
});
await step('Save the profile', async () => {
  await go('profile'); const nm = pg.locator('#main input').first(); await nm.fill('Karoo Owner'); await pg.click('[data-save-profile]'); await W(1200);
  check('Profile saves', (await pg.evaluate(() => document.body.innerText)).includes('Karoo Owner'));
});

check('No page errors during any of it', !errors.length, errors.join(' | '));
await pg.screenshot({ path: 'shots/fn-end.png' });
console.log(`\nFunctions: ${n - bad} of ${n} checks passed`);
await b.close(); process.exit(bad ? 1 : 0);
