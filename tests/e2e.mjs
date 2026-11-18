// Uses the real Novyra Desk (desk-site/) against Firebase's local emulators, the way people do:
// Novyra's owner sets up a company, that company's owner signs in at its own address, makes a quote and a customer link,
// a customer accepts it, and nobody can get into a desk that isn't theirs.
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('../desk-site/', import.meta.url).pathname, PORT = 5055, P = 'novyra-studio';
const FS = `http://127.0.0.1:8085/v1/projects/${P}/databases/(default)/documents`, AUTH = 'http://127.0.0.1:9099';
mkdirSync('shots', { recursive: true });
const types = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
// same routing as firebase.json: files first, /<company>/quote → quote page, everything else → the app
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) f = /^\/[a-z0-9-]+\/quote(\/.*)?$/.test(p) ? join(ROOT, 'quote/index.html') : join(ROOT, 'index.html');
  r.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
}).listen(PORT);
const URLB = `http://127.0.0.1:${PORT}`;

const adminH = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : JSON.stringify(v);
const get = async path => { const r = await fetch(`${FS}/${path}`, { headers: adminH }); if (r.status === 404) return null; const j = await r.json(); return j.fields ? Object.fromEntries(Object.entries(j.fields).map(([k, x]) => [k, val(x)])) : null; };
const list = async path => { const r = await fetch(`${FS}/${path}?pageSize=300`, { headers: adminH }); const j = await r.json(); return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)])) })); };
const put = async (path, obj) => { const enc = v => typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  const r = await fetch(`${FS}/${path}`, { method: 'PATCH', headers: adminH, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, enc(x)])) }) }); if (!r.ok) throw new Error('seed ' + path + ' ' + r.status); };
const account = async (email, password) => {
  const r = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`, { method: 'POST', headers: adminH, body: JSON.stringify({ localId: r.localId, emailVerified: true }) });
};

let n = 0, bad = 0;
const check = (name, ok, extra = '') => { n++; if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); };
const b = await chromium.launch();
const errors = [];
const open = async (path, who) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(`${who}: ${e.message}`)); pg.on('dialog', d => d.dismiss());
  await pg.goto(URLB + path); return pg; };
const signIn = async (pg, email, pw) => { await pg.waitForSelector('#g-email', { state: 'visible', timeout: 30000 }); await pg.fill('#g-email', email); await pg.fill('#g-pass', pw); await pg.click('#g-submit'); };
const inApp = pg => pg.waitForFunction(() => document.getElementById('gate') && document.getElementById('gate').hidden && document.querySelector('.appbar'), null, { timeout: 30000 }).then(() => true, () => false);
const gateMsg = async pg => { await pg.waitForTimeout(3500); return pg.evaluate(() => ({ shown: !document.getElementById('gate').hidden, msg: (document.getElementById('g-msg') || {}).textContent || '' })); };
const W = ms => new Promise(r => setTimeout(r, ms));

// people
const PW = 'test-pass-123';
for (const e of ['hanu@keysers.cc', 'owner@karoo.test', 'staff@karoo.test', 'stranger@else.test']) await account(e, PW);
await put('users/placeholder@novyra.test', { email: 'placeholder@novyra.test', role: 'staff', active: false }); // Novyra team list exists, as it does live
await put('clients/nov1', { business: 'Novyra Customer (Pty) Ltd' });

console.log('1. Novyra’s own desk (novyradesk.com)');
const nov = await open('/?emu=1', 'novyra');
await signIn(nov, 'hanu@keysers.cc', PW);
check('Novyra owner opens novyradesk.com', await inApp(nov));
check('Novyra customer links use novyradesk.com/quote/', (await nov.evaluate('SHARE_BASE')) === 'https://novyradesk.com/quote/#');
await nov.evaluate(() => location.hash = '#settings'); await W(2500);
check('Settings shows the Companies card', await nov.locator('#set-companies').count() === 1);
await nov.fill('#co-name', 'Karoo Cycles'); await W(150);
check('Web address fills in from the name', (await nov.inputValue('#co-slug')) === 'karoo-cycles');
await nov.fill('#co-owner', 'Owner@Karoo.test'); await nov.click('[data-co-add]'); await W(3000);
const co = await get('companies/karoo-cycles');
check('Company is set up with its owner', co && co.name === 'Karoo Cycles' && (co.owners || []).join() === 'owner@karoo.test', JSON.stringify(co));
check('Company appears in the list with its link', (await nov.locator('#set-companies').innerText()).includes('novyradesk.com/karoo-cycles/'));
await nov.screenshot({ path: 'shots/1-novyra-companies.png', fullPage: true });

console.log('2. The company’s own desk (novyradesk.com/karoo-cycles/)');
const kar = await open('/karoo-cycles/?emu=1', 'karoo');
check('Sign-in page names the company, not Novyra', /Karoo Cycles/.test(await kar.locator('.g-tag').innerText()));
await signIn(kar, 'owner@karoo.test', PW);
check('Company owner opens their desk', await inApp(kar));
await W(2500);
const kb = await get('companies/karoo-cycles/settings/business');
check('Business info starts with the company’s name', kb && kb.name === 'Karoo Cycles', JSON.stringify(kb));
check('Company customer links use novyradesk.com/karoo-cycles/quote/', (await kar.evaluate('SHARE_BASE')) === 'https://novyradesk.com/karoo-cycles/quote/#');
check('Company desk does not show Novyra’s customers', !(await kar.evaluate(() => document.body.innerText)).includes('Novyra Customer'));
check('Company desk has no Companies card', await kar.evaluate(async () => { location.hash = '#settings'; await new Promise(r => setTimeout(r, 1200)); return !document.getElementById('set-companies'); }));
// make a quote the normal way
await kar.evaluate(() => location.hash = '#quotes'); await W(800);
await kar.click('[data-new]'); await W(400);
await kar.fill('#modal .cust', 'Desert Bikes'); await W(200);
await kar.click('#modal .combo-list li.add'); await W(400);
const pc = kar.locator('#modal .pcard').nth(0);
await pc.locator('[data-pf=name]').fill('Thabo Mokoena'); await pc.locator('[data-pf=email]').fill('thabo@desertbikes.test');
if (await kar.locator('[data-fin-copy]').count()) await kar.click('[data-fin-copy]');
await kar.click('[data-save-client]'); await W(600);
await kar.click('[data-create]'); await W(800);
await kar.fill('.item[data-i="0"] [data-f="item"]', 'Bike service'); await kar.dispatchEvent('.item[data-i="0"] [data-f="item"]', 'change'); await W(150);
await kar.fill('.item[data-i="0"] [data-f="rate"]', '1500'); await kar.dispatchEvent('.item[data-i="0"] [data-f="rate"]', 'change'); await W(150);
await kar.click('[data-act="save"]'); await W(1500);
const kq = await list('companies/karoo-cycles/quotes'), kc = await list('companies/karoo-cycles/clients');
check('Quote is saved in the company’s space', kq.length === 1, `${kq.length} quotes`);
check('Customer is saved in the company’s space', kc.some(c => c.business === 'Desert Bikes'));
check('Nothing leaked into Novyra’s records', !(await list('clients')).some(c => c.business === 'Desert Bikes') && (await list('quotes')).length === 0);
await kar.screenshot({ path: 'shots/2-company-quote.png', fullPage: true });
// customer link
await kar.click('[data-act="link"]'); await W(600);
await kar.click('[data-lk-make]'); await W(2000);
const link = await kar.inputValue('#lk-url').catch(() => '');
check('Customer link is novyradesk.com/karoo-cycles/quote/#…', /^https:\/\/novyradesk\.com\/karoo-cycles\/quote\/#[\w-]{16,}$/.test(link), link);
const key = link.split('#')[1] || '';
check('Link is stored in the company’s space, not Novyra’s', !!(await get(`companies/karoo-cycles/shares/${key}`)) && !(await get(`shares/${key}`)));
await kar.keyboard.press('Escape');

console.log('3. The customer opens the link');
const cus = await open(`/karoo-cycles/quote/?emu=1#${key}`, 'customer');
await cus.waitForSelector('[data-open="accept"]', { timeout: 30000 }).catch(() => {});
check('Customer sees the quote', await cus.locator('[data-open="accept"]').count() === 1);
check('Quote shows the company’s name', (await cus.evaluate(() => document.body.innerText)).includes('Karoo Cycles'));
await cus.click('[data-open="accept"]'); await W(300);
await cus.fill('#a-name', 'Thabo Mokoena'); await cus.check('#a-ok'); await cus.click('[data-send="Accepted"]'); await W(3000);
check('Customer’s acceptance is saved', ((await get(`companies/karoo-cycles/shares/${key}`)) || {}).status === 'Accepted');
await cus.screenshot({ path: 'shots/3-customer-accepted.png', fullPage: true });
await W(4000);
const kq2 = await list('companies/karoo-cycles/quotes');
check('Company desk picks up the acceptance', kq2[0] && kq2[0].status === 'Accepted', kq2[0] && kq2[0].status);
const bad1 = await open(`/quote/?emu=1#${key}`, 'customer2');
await W(4000);
check('The same key does not open on Novyra’s quote address', !(await bad1.locator('[data-open="accept"]').count()) && !(await bad1.evaluate(() => document.body.innerText)).includes('Bike service'));

console.log('4. Team member of the company');
await put('companies/karoo-cycles/users/staff@karoo.test', { email: 'staff@karoo.test', name: 'Sam Staff', role: 'staff', active: true, access: { quotes: true, clients: true } });
const stf = await open('/karoo-cycles/?emu=1', 'staff');
await signIn(stf, 'staff@karoo.test', PW);
check('Team member opens the company desk', await inApp(stf));
await W(2500);
check('Team member sees the company’s customer', (await stf.evaluate(async () => { location.hash = '#clients'; await new Promise(r => setTimeout(r, 1200)); return document.body.innerText; })).includes('Desert Bikes'));

console.log('5. Nobody gets into a desk that isn’t theirs');
const x1 = await open('/?emu=1', 'karoo-at-novyra'); await signIn(x1, 'owner@karoo.test', PW);
const m1 = await gateMsg(x1); check('Company owner is turned away from Novyra’s desk', m1.shown && /access/.test(m1.msg), m1.msg);
const x2 = await open('/karoo-cycles/?emu=1', 'novyra-at-karoo'); await signIn(x2, 'hanu@keysers.cc', PW);
const m2 = await gateMsg(x2); check('Novyra owner is turned away from the company’s desk', m2.shown && /isn’t on this company’s team/.test(m2.msg), m2.msg);
const x3 = await open('/karoo-cycles/?emu=1', 'stranger'); await signIn(x3, 'stranger@else.test', PW);
const m3 = await gateMsg(x3); check('A stranger is turned away from the company’s desk', m3.shown && /isn’t on this company’s team/.test(m3.msg), m3.msg);
const x4 = await open('/no-such-co/?emu=1', 'nobody'); await signIn(x4, 'owner@karoo.test', PW);
const m4 = await gateMsg(x4); check('An address with no company says so', m4.shown && /team|no company/.test(m4.msg), m4.msg);
await x4.screenshot({ path: 'shots/5-turned-away.png' });

console.log('6. Pages load in Novyra’s desk and the company’s desk');
for (const [pg, who] of [[nov, 'Novyra'], [kar, 'Karoo']]) for (const h of ['overview', 'clients', 'quotes', 'prices', 'invoices', 'plans', 'expenses', 'calendar', 'company', 'team', 'settings']) {
  const before = errors.length; await pg.evaluate(x => location.hash = '#' + x, h); await W(700);
  check(`${who}: ${h} opens without errors`, errors.length === before, errors.slice(before).join(' | '));
}
await kar.evaluate(() => location.hash = '#calendar'); await W(600);
check('Calendar has no List view or status buttons', !(await kar.locator('[data-cal-v], [data-cal-f]').count()));
await kar.screenshot({ path: 'shots/6-calendar.png', fullPage: true });

console.log(`\nApp: ${n - bad} of ${n} checks passed`);
if (errors.length) console.log('Page errors:\n  ' + errors.join('\n  '));
await b.close(); process.exit(bad ? 1 : 0);
