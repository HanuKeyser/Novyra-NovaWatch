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
process.on('unhandledRejection', e => { console.log('  FAIL (stopped) ' + (e && e.message || e).split('\n')[0]); bad++; });
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
for (const e of ['hanu@keysers.cc', 'staff@karoo.test', 'stranger@else.test']) await account(e, PW);
// the company owner's sign-in is made by Novyra's owner in the app: a username and a starting password
const OWNER_USER = 'karoo-owner', OWNER_EMAIL = 'owner@karoo.test', START_PW = 'karoocycles', OWNER_PW = 'Karoo-Owner2!';
await put('users/placeholder@novyra.test', { email: 'placeholder@novyra.test', role: 'staff', active: false }); // Novyra team list exists, as it does live
await put('clients/nov1', { business: 'Novyra Customer (Pty) Ltd' });

console.log('1. Novyra’s own desk (novyradesk.com)');
const nov = await open('/?emu=1', 'novyra');
await signIn(nov, 'hanu@keysers.cc', PW);
check('Novyra owner opens novyradesk.com', await inApp(nov));
await W(1500);
check('Novyra’s tab is named “Novyra Desk”', (await nov.title()) === 'Novyra Desk', await nov.title());
check('Novyra’s menu footer keeps the Novyra icon', (await nov.locator('.sfoot .sm img:not(.co)').count()) === 1);
check('Novyra customer links use novyradesk.com/quote/', (await nov.evaluate(() => window.NOVYRA_DESK.shareBase)) === 'https://novyradesk.com/quote/#');
await nov.evaluate(() => location.hash = '#settings'); await W(2500);
check('Settings shows the Companies card', await nov.locator('#set-companies').count() === 1);
await nov.fill('#co-name', 'Karoo Cycles'); await W(150);
check('Web address fills in from the name', (await nov.inputValue('#co-slug')) === 'karoo-cycles');
check('The starting password is the company’s name in small letters', (await nov.inputValue('#co-pass')) === START_PW, await nov.inputValue('#co-pass'));
await nov.fill('#co-user', 'Karoo-Owner'); await nov.fill('#co-owner', ''); await nov.click('[data-co-add]'); await W(800);
check('Username and email are both needed', !(await get('companies/karoo-cycles')));
await nov.fill('#co-owner', 'Owner@Karoo.test');

await nov.click('[data-co-add]'); await W(3500);
const co = await get('companies/karoo-cycles');
check('Company is set up with its owner’s account', co && co.name === 'Karoo Cycles' && (co.ownerUids || []).length === 1 && (co.owners || []).join() === OWNER_EMAIL && co.ownerLogin === OWNER_USER && (co.mustChange || []).join() === (co.ownerUids || []).join(), JSON.stringify(co));
const un = await get('usernames/karoo-cycles/names/karoo-owner');
check('The owner’s username is claimed on the company’s desk', un && un.email === OWNER_EMAIL && un.uid === (co.ownerUids || [])[0], JSON.stringify(un));
check('Novyra’s owner is shown the owner’s sign-in details to pass on', /karoo-owner/.test(await nov.locator('#modal .login-card').innerText().catch(() => '')) && (await nov.locator('#modal .login-card').innerText()).includes(START_PW));
await nov.click('#modal [data-close]'); await W(500);
check('Novyra’s owner is still signed in as themselves', await nov.evaluate(() => window.STUDIO.email) === 'hanu@keysers.cc');
check('Company appears in the list with its link', (await nov.locator('#set-companies').innerText()).includes('novyradesk.com/karoo-cycles/'));
const br0 = await get('brands/karoo-cycles'); check('The company gets a public brand card for its sign-in page', br0 && br0.name === 'Karoo Cycles', JSON.stringify(br0));
await nov.screenshot({ path: 'shots/1-novyra-companies.png', fullPage: true });

console.log('2. The company’s own desk (novyradesk.com/karoo-cycles/)');
const fnd = await open('/?emu=1', 'find'); await fnd.click('#g-find-open'); await fnd.fill('#g-find-in', 'https://novyradesk.com/Karoo-Cycles/'); await fnd.click('#g-find-go');
await fnd.waitForURL(/\/karoo-cycles\//, { timeout: 15000 }).catch(() => {});
check('Typing the company’s link on novyradesk.com opens its own sign-in page', new URL(fnd.url()).pathname === '/karoo-cycles/', fnd.url());
await fnd.waitForTimeout(1500); check('…which greets them with the company’s name', /Welcome to\s*Karoo Cycles/.test(await fnd.locator('.g-bt h1').innerText()));
await fnd.goto(`http://127.0.0.1:${PORT}/?emu=1`); await fnd.waitForSelector('#g-find-open'); await fnd.click('#g-find-open'); await fnd.fill('#g-find-in', 'nope-not-here'); await fnd.click('#g-find-go'); await W(2500);
check('A link with no business behind it says so', /couldn’t find a business/.test(await fnd.locator('#g-find-msg').innerText()));
const kar = await open('/karoo-cycles/?emu=1', 'karoo'); await W(1500);
check('Sign-in page names the company, not Novyra', /Karoo Cycles/.test(await kar.locator('.g-bt h1').innerText()) && !/novyra’s/i.test(await kar.locator('.g-bt').innerText()));
check('Sign-in page shows “Powered by Novyra Desk”, not Novyra’s own branding', await kar.locator('#g-pow').isVisible() && !(await kar.locator('.gate-logo').isVisible()));
check('Company sign-in page is kept out of search engines', (await kar.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow');
check('Company sign-in tab is named after the company', (await kar.title()) === 'Karoo Cycles Desk', await kar.title());
check('The sign-in page has no Create account option', !(await kar.locator('[data-mode=up], #t-up').count()));
await signIn(kar, OWNER_USER, START_PW);
await kar.waitForSelector('#g-setup:not([hidden])', { timeout: 30000 }).catch(() => {});
check('First sign-in asks the owner to set up their account', await kar.locator('#g-setup').isVisible());
await kar.fill('#s-pass', 'password1'); await kar.fill('#s-pass2', 'password1'); await kar.click('#s-submit'); await W(600);
check('A password that breaks the rule is refused', /capital letter/.test(await kar.locator('#s-msg').innerText()));
await kar.fill('#s-pass', OWNER_PW); await kar.fill('#s-pass2', OWNER_PW); await kar.click('#s-submit');
check('Company owner opens their desk', await inApp(kar));
check('The first-sign-in setup is ticked off', ((await get('companies/karoo-cycles')).mustChange || []).length === 0);
const old = await open('/karoo-cycles/?emu=1', 'old-password'); await signIn(old, OWNER_USER, START_PW);
const mo = await gateMsg(old); check('The starting password no longer works', mo.shown && /don’t match/.test(mo.msg), mo.msg);
await W(2500);
const kb = await get('companies/karoo-cycles/settings/business');
check('Business info starts with the company’s name', kb && kb.name === 'Karoo Cycles', JSON.stringify(kb));
check('Company customer links use novyradesk.com/karoo-cycles/quote/', (await kar.evaluate(() => window.NOVYRA_DESK.shareBase)) === 'https://novyradesk.com/karoo-cycles/quote/#');
check('Company desk does not show Novyra’s customers', !(await kar.evaluate(() => document.body.innerText)).includes('Novyra Customer'));
check('Company desk has no Companies card', await kar.evaluate(async () => { location.hash = '#settings'; await new Promise(r => setTimeout(r, 1200)); return !document.getElementById('set-companies'); }));
check('Browser tab is named “Karoo Cycles Desk”', (await kar.title()) === 'Karoo Cycles Desk', await kar.title());
check('Menu footer shows the company’s name', /Karoo Cycles/.test(await kar.locator('.sfoot').innerText()));
check('Menu footer shows the company’s letter until a logo is added', (await kar.locator('.sfoot .sm .lt').count()) === 1);
// upload a logo in Business info
await kar.evaluate(() => location.hash = '#company'); await W(1000);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUDAMABBAAAQ3dSUQAAAAASUVORK5CYII=', 'base64');
await kar.setInputFiles('[data-bz-logo]', { name: 'logo.png', mimeType: 'image/png', buffer: png }); await W(1200);
await kar.waitForSelector('[data-crop-ok]', { timeout: 15000 }); await W(300); await kar.click('[data-crop-ok]'); await kar.waitForSelector('#modal [data-crop-ok]', { state: 'detached', timeout: 10000 }).catch(() => {}); await W(600);
await kar.click('[data-save-biz]'); await W(1500);
const kb2 = await get('companies/karoo-cycles/settings/business');
check('Company logo is saved in the company’s business info', !!(kb2 && /^data:image\//.test(kb2.logo || '')), kb2 && String(kb2.logo).slice(0, 30));
check('Menu footer now shows the company’s logo', (await kar.locator('.sfoot .sm img.co').count()) === 1);
await W(1500); const br1 = await get('brands/karoo-cycles'); check('The logo goes onto the company’s sign-in page too', br1 && /^data:image\//.test(br1.logo || ''));
const lg = await open('/karoo-cycles/?emu=1', 'logo-gate'); await W(2000);
check('Company sign-in page shows its logo before signing in', (await lg.locator('#g-co-tile img').count()) === 1);
await lg.screenshot({ path: 'shots/2-branded-sign-in.png' });
check('Novyra’s business info has no Karoo logo', !(((await get('settings/business')) || {}).logo));
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
check('Nothing leaked into Novyra’s records', !(await list('clients')).some(c => c.business === 'Desert Bikes') && !(await list('quotes')).some(q => JSON.stringify(q).includes('Desert Bikes')));
await kar.screenshot({ path: 'shots/2-company-quote.png', fullPage: true });
// customer link
const lb = kar.locator('[data-act="link"]').first();
await kar.waitForFunction(() => { const x = document.querySelector('[data-act="link"]'); return x && !x.disabled; }, null, { timeout: 10000 }).catch(() => {});
console.log('    link button:', await lb.count() ? JSON.stringify(await lb.evaluate(x => ({ text: x.textContent.trim(), disabled: x.disabled, title: x.title, hash: location.hash }))) : 'not on the page (' + await kar.evaluate(() => location.hash + ' ' + [...document.querySelectorAll('[data-act]')].map(x => x.dataset.act).join(',')) + ')');
await lb.click({ timeout: 8000 }).catch(e => console.log('    could not open the link dialog:', e.message.split('\n')[0])); await W(800);
if (await kar.locator('[data-lk-make]').count()) { await kar.click('[data-lk-make]'); await W(2000); } // a saved quote may already have its link
const link = await kar.inputValue('#lk-url').catch(() => '');
check('Customer link is novyradesk.com/karoo-cycles/quote/#…', /^https:\/\/novyradesk\.com\/karoo-cycles\/quote\/#[\w-]{16,}$/.test(link), link);
const key = link.split('#')[1] || '';
check('Link is stored in the company’s space, not Novyra’s', !!(await get(`companies/karoo-cycles/shares/${key}`)) && !(await get(`shares/${key}`)));
await kar.keyboard.press('Escape');

console.log('3. The customer opens the link');
const cus = await open(`/karoo-cycles/quote/?emu=1#${key}`, 'customer');
await cus.waitForSelector('[data-open="accept"]', { timeout: 30000 }).catch(() => {});
check('Customer sees the quote', await cus.locator('[data-open="accept"]').count() === 1);
check('Customer page shows the company’s logo at the top', (await cus.locator('#bz-head img[alt="Karoo Cycles"]').count()) === 1);
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
const x1 = await open('/?emu=1', 'karoo-at-novyra'); await signIn(x1, OWNER_EMAIL, OWNER_PW);
const m1 = await gateMsg(x1); check('Company owner is turned away from Novyra’s desk', m1.shown && /access/.test(m1.msg), m1.msg);
const x2 = await open('/karoo-cycles/?emu=1', 'novyra-at-karoo'); await signIn(x2, 'hanu@keysers.cc', PW);
const m2 = await gateMsg(x2); check('Novyra owner is turned away from the company’s desk', m2.shown && /isn’t on this company’s team/.test(m2.msg), m2.msg);
const x3 = await open('/karoo-cycles/?emu=1', 'stranger'); await signIn(x3, 'stranger@else.test', PW);
const m3 = await gateMsg(x3); check('A stranger is turned away from the company’s desk', m3.shown && /isn’t on this company’s team/.test(m3.msg), m3.msg);
const x4 = await open('/no-such-co/?emu=1', 'nobody'); await W(2500);
check('An address with no company says so and offers to find the right one', /No business at this address/.test(await x4.locator('#g-title').innerText()) && await x4.locator('#g-find-in').isVisible() && !(await x4.locator('#g-form').isVisible()));
await x4.screenshot({ path: 'shots/5-turned-away.png' });

console.log('6. Username and email both sign in; the email stays with the profile');
const em = await open('/karoo-cycles/?emu=1', 'by-email'); await signIn(em, OWNER_EMAIL, OWNER_PW);
check('Owner also signs in with their email address', await inApp(em));
const nu = await open('/karoo-cycles/?emu=1', 'no-user'); await signIn(nu, 'nobody-here', OWNER_PW);
const mn = await gateMsg(nu); check('An unknown username says so', mn.shown && /no account with that username/.test(mn.msg), mn.msg);
await kar.evaluate(() => location.hash = '#settings-security'); await W(1200);
const sec = await kar.locator('#set-security').innerText();
check('Security shows their username and email', sec.includes(OWNER_USER) && sec.includes(OWNER_EMAIL), sec.slice(0, 200));
check('There is no way to change the email', !(await kar.locator('#sc-email, [data-sc-email]').count()) && /can’t be changed/.test(sec));
await kar.fill('#sc-cur', OWNER_PW); await kar.fill('#sc-new', 'Karoo-Owner3!'); await kar.fill('#sc-new2', 'Karoo-Owner3!'); await kar.click('[data-sc-pass]'); await W(2000);
check('Owner changes their password in Security', /Password changed/.test(await kar.locator('#sc-pass-out').innerText()), await kar.locator('#sc-pass-out').innerText());
await kar.fill('#sc-cur', 'Karoo-Owner3!'); await kar.fill('#sc-new', OWNER_PW); await kar.fill('#sc-new2', OWNER_PW); await kar.click('[data-sc-pass]'); await W(2000);
check('…and back again', /Password changed/.test(await kar.locator('#sc-pass-out').innerText()));

console.log('7. Pages load in Novyra’s desk and the company’s desk');
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
