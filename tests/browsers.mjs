// Novyra Desk in Chrome (Chromium), Firefox and Safari (WebKit) at phone, tablet, laptop and desktop sizes.
// For every page: no page errors, nothing wider than the screen, no sideways scrolling, and the page has content.
// Runs after e2e.mjs and functions.mjs on the same emulators, inside the Karoo Cycles company desk.
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import pw from 'playwright';

const MOCK = process.env.MOCK;
const ROOT = new URL('../desk-site/', import.meta.url).pathname, PORT = 5057;
const types = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) f = /^\/[a-z0-9-]+\/quote(\/.*)?$/.test(p) ? join(ROOT, 'quote/index.html') : join(ROOT, 'index.html');
  r.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
}).listen(PORT);
const URLB = `http://127.0.0.1:${PORT}`;
mkdirSync('shots', { recursive: true });

const SIZES = [['small phone', 360, 740], ['phone', 390, 844], ['tablet', 768, 1024], ['tablet landscape', 1024, 768], ['laptop', 1280, 800], ['desktop', 1440, 900], ['large desktop', 1920, 1080]];
const PAGES = ['overview', 'clients', 'quotes', 'prices', 'invoices', 'plans', 'expenses', 'calendar', 'company', 'team', 'settings', 'profile'];
const W = ms => new Promise(r => setTimeout(r, ms));
let n = 0, bad = 0;
const check = (name, ok, extra = '') => { n++; if (!ok) bad++; if (!ok || process.env.VERBOSE) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); };

// anything sticking out past the right edge that isn't inside its own scroll box
const layout = () => {
  const vw = document.documentElement.clientWidth, out = [];
  const scrolls = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
  for (const el of document.querySelectorAll('#main *, .appbar *, .side *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.position === 'fixed') continue;
    if (r.right > vw + 1 && !scrolls(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`);
  }
  const se = document.scrollingElement;
  return { sideways: se.scrollWidth > se.clientWidth + 1, sw: se.scrollWidth, cw: se.clientWidth, out: [...new Set(out)].slice(0, 4), text: (document.getElementById('main') || {}).innerText?.trim().length || 0 };
};

for (const [label, type] of MOCK ? [['Chrome', 'chromium']] : [['Chrome', 'chromium'], ['Firefox', 'firefox'], ['Safari', 'webkit']]) {
  console.log(`${label}`);
  let br; try { br = await pw[type].launch(); } catch (e) { check(`${label} starts`, false, e.message.split('\n')[0]); continue; }
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage();
  const errors = []; pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.dismiss());
  if (MOCK) { await pg.goto('file://' + MOCK); await W(2500); } else {
  // sign-in page at every size first
  await pg.goto(URLB + '/karoo-cycles/?emu=1'); await pg.waitForSelector('#g-email', { state: 'visible', timeout: 30000 });
  for (const [sz, w, h] of SIZES) { await pg.setViewportSize({ width: w, height: h }); await W(300); const L = await pg.evaluate(() => { const se = document.scrollingElement; return se.scrollWidth > se.clientWidth + 1; }); check(`${label} ${sz}: sign-in page fits`, !L); }
  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.fill('#g-email', 'owner@karoo.test'); await pg.fill('#g-pass', 'Karoo-Owner2!'); await pg.click('#g-submit');
  const inApp = await pg.waitForFunction(() => document.getElementById('gate').hidden && document.querySelector('.appbar'), null, { timeout: 30000 }).then(() => true, () => false);
  check(`${label}: signs in`, inApp); if (!inApp) { await br.close(); continue; }
  await W(2500); }
  let pages = 0, fits = 0;
  for (const [sz, w, h] of SIZES) {
    await pg.setViewportSize({ width: w, height: h }); await W(500);
    for (const p of PAGES) {
      const before = errors.length; await pg.evaluate(x => location.hash = '#' + x, p); await W(650);
      const L = await pg.evaluate(layout); pages++;
      const ok = !L.sideways && !L.out.length && L.text > 20 && errors.length === before; if (ok) fits++;
      check(`${label} ${sz} ${w}px: ${p}`, ok, [L.sideways ? `scrolls sideways ${L.sw}>${L.cw}` : '', L.out.join(', '), L.text > 20 ? '' : 'empty', errors.slice(before).join(' | ')].filter(Boolean).join(' · '));
      if (!ok) await pg.screenshot({ path: `shots/br-${type}-${w}-${p}.png`, fullPage: true }).catch(() => {});
    }
    // a document open full screen
    await pg.evaluate(() => location.hash = '#quotes'); await W(600);
    const row = pg.locator('tr[data-open], [data-open]').first();
    if (await row.count()) { const before = errors.length; await row.click().catch(() => {}); await W(1200); const L = await pg.evaluate(layout); pages++;
      const ok = !L.sideways && !L.out.length && errors.length === before; if (ok) fits++;
      check(`${label} ${sz} ${w}px: open quote`, ok, [L.sideways ? `scrolls sideways ${L.sw}>${L.cw}` : '', L.out.join(', '), errors.slice(before).join(' | ')].filter(Boolean).join(' · '));
      if (!ok) await pg.screenshot({ path: `shots/br-${type}-${w}-doc.png`, fullPage: true }).catch(() => {}); }
  }
  console.log(`  ${label}: ${fits} of ${pages} page views fit and load without errors`);
  await br.close();
}
console.log(`\nBrowsers: ${n - bad} of ${n} checks passed`);
process.exit(bad ? 1 : 0);
