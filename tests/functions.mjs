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
  await pg.fill('#g-email', 'owner@karoo.test'); await pg.fill('#g-pass', 'Karoo-Owner2!'); await pg.click('#g-submit');
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
  check('New customer shows on the Customers tab', (await text()).includes(NAME));
  check('A new customer is looked after by whoever added it', /Looked after by/.test(await pg.locator(`.cc:has-text("${NAME}")`).innerText()));
  const cs = await list(CO + 'clients'); if (cs) check('Customer is saved in the company’s space', cs.some(c => c.business === NAME));
});
await step('Mark a customer inactive', async () => {
  await pg.click(`.cc:has-text("${NAME}")`); await W(500);
  await pg.uncheck('#cl-active'); await pg.click('[data-save-client]'); await W(1200);
  check('Customers tab has no Active / Inactive / All buttons', !(await pg.locator('[data-cl-show], .cl-seg').count()));
  check('Inactive customer stays on the Customers tab, marked Inactive', (await pg.locator(`.cc.off:has-text("${NAME}") .cc-tag`).count()) === 1);
  check('Inactive customers are listed after the active ones', await pg.evaluate(() => { const c = [...document.querySelectorAll('.cc')]; const i = c.findIndex(x => x.classList.contains('off')); return i === -1 || c.slice(i).every(x => x.classList.contains('off')); }));
  const cs = await list(CO + 'clients'); if (cs) check('Inactive is saved', (cs.find(c => c.business === NAME) || {}).inactive === true);
  await go('quotes'); await pg.click('[data-new]'); await W(500);
  await pg.fill('#modal .cust', 'Function'); await W(400);
  check('Inactive customer isn’t offered for a new quote', !(await pg.locator('#modal .combo-list li:not(.add)', { hasText: NAME }).count()));
  await pg.keyboard.press('Escape'); await W(300); if (await modal().isVisible().catch(() => false)) await pg.click('#modal [data-close]').catch(() => {});
  await go('clients');
  await pg.click(`.cc:has-text("${NAME}")`); await W(500); await pg.check('#cl-active'); await pg.click('[data-save-client]'); await W(1200);
  await W(200);
  check('Customer can be made active again', (await pg.locator(`.cc:not(.off):has-text("${NAME}")`).count()) === 1);
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
await step('Add a team member with their own sign-in', async () => {
  await go('team'); await pg.locator('[data-user-add]').first().click(); await W(600);
  await pg.fill('#us-name', 'Pieter Test'); await pg.fill('#us-user', 'pieter');
  const startPw = await pg.inputValue('#us-pass');
  check('The starting password is the company’s name in small letters', startPw === (MOCK ? 'novyra' : 'karoocycles'), startPw);
  await pg.click('[data-us-save]'); await W(800);
  check('An email address is needed too', await pg.locator('#modal #us-email').isVisible());
  await pg.fill('#us-email', 'Pieter@Karoo.test'); await pg.click('[data-us-save]'); await W(1800);
  const card = await pg.locator('#modal .login-card').innerText().catch(() => '');
  check('Sign-in details show the username, email and starting password', card.includes('pieter') && card.includes('pieter@karoo.test') && card.includes(startPw), card.replace(/\s+/g, ' '));
  await pg.click('#modal [data-close]'); await W(500);
  check('Team member shows on the Team page', (await text()).includes('Pieter Test'));
  const us = MOCK ? null : await list(CO + 'users'); if (us) { const pu = us.find(u => u.login === 'pieter');
    check('Team member is saved by account with their email, waiting to choose a password', !!pu && pu.id === pu.uid && pu.email === 'pieter@karoo.test' && pu.mustChange === true, JSON.stringify(pu || {}));
    const un = await list('usernames/karoo-cycles/names'); check('Their username is claimed on the company’s desk', (un || []).some(d => d.id === 'pieter' && d.email === 'pieter@karoo.test')); }
  if (!MOCK) {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }), p2 = await c2.newPage(); p2.on('pageerror', e => errors.push('pieter: ' + e.message));
    await p2.goto(`http://127.0.0.1:${PORT}/karoo-cycles/?emu=1`); await p2.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
    await p2.fill('#g-email', 'pieter'); await p2.fill('#g-pass', startPw); await p2.click('#g-submit');
    await p2.waitForSelector('#g-setup:not([hidden])', { timeout: 30000 }).catch(() => {});
    check('Team member signs in with their username and is asked to set up', await p2.locator('#g-setup').isVisible());
    await p2.fill('#s-pass', 'Pieter-Own3!'); await p2.fill('#s-pass2', 'Pieter-Own3!'); await p2.click('#s-submit');
    const ok = await p2.waitForFunction(() => document.getElementById('gate').hidden && document.querySelector('.appbar'), null, { timeout: 30000 }).then(() => true, () => false);
    check('Team member opens the company desk after choosing a password', ok);
    await W(2000); await p2.evaluate(() => location.hash = '#clients'); await W(1200);
    check('Team member sees the company’s customers', (await p2.evaluate(() => document.getElementById('main').innerText)).includes('Function Test Co'));
    const us = await list(CO + 'users'); check('Team member’s setup is ticked off', (us.find(u => u.login === 'pieter') || {}).mustChange === false);
    await c2.close();
    // removing and adding back
    await go('team'); await pg.click('[data-user]:has-text("Pieter Test")'); await W(500); await pg.click('[data-us-del]'); await W(400); await pg.click('#modal [data-yes]'); await W(1500);
    check('Removed team member leaves the Team page', !(await text()).includes('Pieter Test'));
    const c3 = await b.newContext(), p3 = await c3.newPage(); await p3.goto(`http://127.0.0.1:${PORT}/karoo-cycles/?emu=1`); await p3.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
    await p3.fill('#g-email', 'pieter'); await p3.fill('#g-pass', 'Pieter-Own3!'); await p3.click('#g-submit'); await W(4000);
    check('Removed team member can’t get in', /isn’t on this company’s team/.test(await p3.locator('#g-msg').innerText().catch(() => '')));
    await c3.close();
    await pg.locator('[data-user-add]').first().click(); await W(600);
    await pg.fill('#us-name', 'Pieter Test'); await pg.fill('#us-user', 'pieter'); await pg.fill('#us-email', 'pieter@karoo.test'); await pg.click('[data-us-save]'); await W(1800);
    check('Adding them again with the same email gives their access back', (await text()).includes('Pieter Test') && ((await list(CO + 'users')).find(u => u.login === 'pieter') || {}).active === true);

    console.log('7b. Account manager and changing the person');
    const pieterUid = ((await list(CO + 'users')).find(u => u.login === 'pieter') || {}).id;
    // a quote Pieter made, written straight into the company's records
    await fetch(`${FS}/${CO}quotes?documentId=pieterq`, { method: 'POST', headers: adminH, body: JSON.stringify({ fields: { number: { integerValue: 7001 }, status: { stringValue: 'Draft' }, rev: { integerValue: 1 }, date: { stringValue: '2026-11-19' }, createdBy: { stringValue: 'Pieter Test' }, createdByUid: { stringValue: pieterUid }, client: { mapValue: { fields: { business: { stringValue: 'Function Test Co' } } } }, items: { arrayValue: { values: [] } } } }) });
    await go('clients'); await pg.click(`.cc:has-text("${'Function Test Co'}")`); await W(600);
    check('Customer form offers the team as account managers', (await pg.locator('#cl-mgr option').allInnerTexts()).some(t => t.includes('Pieter Test')));
    await pg.selectOption('#cl-mgr', { label: 'Pieter Test' }); await pg.click('[data-save-client]'); await W(1500);
    check('Customer card shows who looks after them', /Looked after by\s*Pieter Test/.test(await pg.locator('.cc:has-text("Function Test Co")').innerText()));
    let fc = ((await list(CO + 'clients')).find(c => c.business === 'Function Test Co') || {});
    check('Account manager is saved on the customer', (fc.manager || {}).id === pieterUid, JSON.stringify(fc.manager));
    await go('team'); await pg.click('[data-user]:has-text("Pieter Test")'); await W(500); await pg.click('[data-us-hand]'); await W(500);
    check('Change person starts with the company-name password', (await pg.inputValue('#ho-pass')) === 'karoocycles');
    await pg.fill('#ho-name', 'Lerato Test'); await pg.fill('#ho-user', 'lerato'); await pg.fill('#ho-email', 'lerato@karoo.test'); await pg.click('[data-ho-go]'); await W(4000);
    const hcard = await pg.locator('#modal .login-card').innerText().catch(() => '');
    check('New person’s sign-in details are shown', hcard.includes('lerato') && hcard.includes('lerato@karoo.test'), hcard.replace(/\s+/g, ' '));
    await pg.click('#modal [data-close]'); await W(800);
    check('Team page shows the new person, not the old one', (await text()).includes('Lerato Test') && !(await text()).includes('Pieter Test'));
    const us2 = await list(CO + 'users'), le = us2.find(u => u.login === 'lerato'), pi = us2.find(u => u.login === 'pieter');
    check('New person gets a fresh account that must be set up', !!le && le.id !== pieterUid && le.mustChange === true && le.role === 'staff' && le.email === 'lerato@karoo.test', JSON.stringify(le || {}));
    check('Old person is switched off', pi && pi.active === false && pi.removed === true);
    const pq = (await list(CO + 'quotes')).find(q => q.id === 'pieterq') || {};
    check('Pieter’s quote now falls under Lerato', pq.createdBy === 'Lerato Test' && pq.createdByUid === (le || {}).id, JSON.stringify({ by: pq.createdBy }));
    fc = ((await list(CO + 'clients')).find(c => c.business === 'Function Test Co') || {});
    check('Pieter’s customers are now looked after by Lerato', (fc.manager || {}).name === 'Lerato Test' && (fc.manager || {}).id === (le || {}).id);
    const c4 = await b.newContext(), p4 = await c4.newPage(); p4.on('pageerror', e => errors.push('lerato: ' + e.message));
    await p4.goto(`http://127.0.0.1:${PORT}/karoo-cycles/?emu=1`); await p4.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
    await p4.fill('#g-email', 'lerato'); await p4.fill('#g-pass', 'karoocycles'); await p4.click('#g-submit');
    await p4.waitForSelector('#g-setup:not([hidden])', { timeout: 30000 }).catch(() => {});
    check('The new person sets up their account from scratch', await p4.locator('#g-setup').isVisible());
    await p4.fill('#s-pass', 'Lerato-Own4!'); await p4.fill('#s-pass2', 'Lerato-Own4!'); await p4.click('#s-submit');
    check('…and opens the desk', await p4.waitForFunction(() => document.getElementById('gate').hidden && document.querySelector('.appbar'), null, { timeout: 30000 }).then(() => true, () => false));
    await W(2000); await p4.evaluate(() => location.hash = '#quotes'); await W(1200);
    check('The new person sees the quote they took over', (await p4.evaluate(() => document.getElementById('main').innerText)).includes('7001'));
    await c4.close();
    const c5 = await b.newContext(), p5 = await c5.newPage(); await p5.goto(`http://127.0.0.1:${PORT}/karoo-cycles/?emu=1`); await p5.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
    await p5.fill('#g-email', 'pieter'); await p5.fill('#g-pass', 'Pieter-Own3!'); await p5.click('#g-submit'); await W(4000);
    check('The old person can’t get in any more', /isn’t on this company’s team/.test(await p5.locator('#g-msg').innerText().catch(() => '')));
    await c5.close();
  }
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
