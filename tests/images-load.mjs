// Run: node tests/images-load.mjs   (from the site folder)
// Loads each case in headless Chromium, scrolls the page and opens every section,
// then fails if any <img> on the visible page did not load.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Playwright is not a dependency of this static site; reuse the copy from the expense app.
const require = createRequire('/Users/yentran/Documents/personal expense app/package.json');
const { chromium } = require('playwright');

const types = { '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const routes = ['/#approvy', '/#chatbot', '/#expense-app', '/approvy/', '/chatbot/', '/expense-app/'];
const browser = await chromium.launch();
let failed = 0;
for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bad404 = [];
  page.on('response', r => { if (r.status() >= 400 && /\.(webp|png)$/.test(r.url())) bad404.push(r.status() + ' ' + r.url().replace(base, '')); });
  await page.goto(base + route, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelectorAll('.page:not([hidden]) details').forEach(d => { d.open = true; }));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.page:not([hidden]) img')];
    return { total: imgs.length, bad: imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')) };
  });
  const ok = res.total > 0 && res.bad.length === 0 && bad404.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${route.padEnd(15)} images ${res.total - res.bad.length}/${res.total} loaded` + (bad404.length ? `, ${bad404.length} request(s) 404` : ''));
  if (!ok) { failed++; if (bad404[0]) console.log('        e.g. ' + bad404[0]); }
  await page.close();
}
await browser.close();
server.close();
if (failed) { console.log(`\n${failed} route(s) failed`); process.exit(1); }
console.log('\nall routes passed');
