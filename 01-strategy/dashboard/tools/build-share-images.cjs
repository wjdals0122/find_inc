// Compose the collected original images in HTML/CSS, then capture fixed-size PNGs.
// Setup: npm ci --prefix 01-strategy/dashboard/tests
// Run: node 01-strategy/dashboard/tools/build-share-images.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.join(__dirname, '../tests/package.json'))('playwright');
const dashboard = path.resolve(__dirname, '..');
const root = path.resolve(dashboard, '../..');
const html = fs.readFileSync(path.join(dashboard, 'dashboard.html'), 'utf8');
const packed = html.match(/id="studio-data-gzip">([\s\S]*?)<\/script>/)[1];
const data = JSON.parse(zlib.gunzipSync(Buffer.from(packed, 'base64')));
const asset = suffix => {
  const key = Object.keys(data.assets).find(key => key.endsWith(suffix));
  if (!key) throw Error(`Missing collected asset: ${suffix}`);
  return data.assets[key];
};
const disk = (relative, mime) => `data:${mime};base64,${fs.readFileSync(path.join(root, relative)).toString('base64')}`;
const values = {
  FONT: asset('studio/ui-font.woff'),
  BMW_IMAGE: asset('bmw-g65-exterior.webp'),
  LG_IMAGE: asset('thumb-03.webp'),
  BMW_LOGO: disk('01-strategy/brand/BMW/assets/BMW_dark.svg', 'image/svg+xml'),
  LG_LOGO: asset('lg-logo-en-light.webp')
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
    await page.screenshot({ path: path.join(out, 'dashboard-og-20261106.png') });
    await page.setViewportSize({ width: 1200, height: 1200 });
    await page.evaluate(() => document.body.classList.add('square'));
    await page.screenshot({ path: path.join(out, 'dashboard-og-square-20261106.png') });
    console.log('Created landscape 1200x630 and square 1200x1200 sharing images.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
