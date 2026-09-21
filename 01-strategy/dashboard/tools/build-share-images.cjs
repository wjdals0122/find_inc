// Render the light-mode FIND.INC wordmark and collected brand names as PNGs.
// Setup: npm ci --prefix 01-strategy/dashboard/tests
// Run: node 01-strategy/dashboard/tools/build-share-images.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.join(__dirname, '../tests/package.json'))('playwright');
const dashboard = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(dashboard, 'dashboard.html'), 'utf8');
const packed = html.match(/id="studio-data-gzip">([\s\S]*?)<\/script>/)[1];
const data = JSON.parse(zlib.gunzipSync(Buffer.from(packed, 'base64')));
const asset = suffix => {
  const key = Object.keys(data.assets).find(key => key.endsWith(suffix));
  if (!key) throw Error(`Missing collected asset: ${suffix}`);
  return data.assets[key];
};
const values = {
  FONT: asset('studio/ui-font.woff')
};
const template = fs.readFileSync(path.join(__dirname, 'share-card.html'), 'utf8');
const source = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  if (!values[key]) throw Error(`Missing template value: ${key}`);
  return values[key];
});
const out = path.join(dashboard, 'assets/share');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(source, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    await page.screenshot({ path: path.join(out, 'dashboard-og-light-v2.png') });
    await page.setViewportSize({ width: 1200, height: 1200 });
    await page.evaluate(() => document.body.classList.add('square'));
    await page.screenshot({ path: path.join(out, 'dashboard-og-square-light-v2.png') });
    console.log('Created landscape 1200x630 and square 1200x1200 sharing images.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
