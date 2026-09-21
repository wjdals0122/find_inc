// FIND.INC monogram with the unmodified collected BMW roundel as a research badge.
// Setup: npm ci --prefix 01-strategy/dashboard/tests
// Run: node 01-strategy/dashboard/tools/build-favicon.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.join(__dirname, '../tests/package.json'))('playwright');
const dashboard = path.resolve(__dirname, '..');
const root = path.resolve(dashboard, '../..');
const logo = fs.readFileSync(path.join(root, '01-strategy/brand/BMW/assets/BMW_light.svg')).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="1" y="1" width="62" height="62" rx="16" fill="#f5f8ff" stroke="#dce5f2" stroke-width="2"/>
<path fill="#14243b" d="M15 13h32v9H25v8h18v8H25v14H15z"/>
<circle cx="47" cy="46" r="14" fill="#fff" stroke="#e4e9f2" stroke-width="2"/>
<image x="35.8" y="34.5" width="22.4" height="23" preserveAspectRatio="xMidYMid meet" href="data:image/svg+xml;base64,${logo}"/>
</svg>`;
const dir = path.join(dashboard, 'assets/icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'find-bmw-v1.svg'), svg);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const images = [];
    for (const size of [16, 32, 48, 180]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const source = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
      await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style><img src="${source}" alt="">`, {waitUntil: 'load'});
      await page.locator('img').evaluate(image => image.decode());
      const image = await page.screenshot({ omitBackground: true });
      if (size === 32 || size === 180) fs.writeFileSync(path.join(dir, `find-bmw-v1-${size}.png`), image);
      if (size <= 48) images.push({size, image});
      await page.close();
    }
    // ICO directory entries point to the PNG frames without modifying their contents.
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({size, image}, i) => {
      const entry = 6 + 16 * i;
      header.writeUInt8(size, entry); header.writeUInt8(size, entry + 1);
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
      offset += image.length;
    });
    fs.writeFileSync(path.join(dashboard, 'favicon.ico'), Buffer.concat([header, ...images.map(x => x.image)]));
    console.log('Created SVG, 32px PNG, 180px touch icon and multi-size favicon.ico.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
