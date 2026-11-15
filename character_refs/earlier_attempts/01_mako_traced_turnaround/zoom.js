const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const [dir, out, x, y, w, h] = [process.argv[2], process.argv[3], ...process.argv.slice(4).map(Number)];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1540, height: 1100 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(dir, 'character.html'));
  const box = await (await p.$('#stage')).boundingBox(); const k = box.width / 1500;
  await p.screenshot({ path: out, clip: { x: box.x + x * k, y: box.y + y * k, width: w * k, height: h * k } });
  await b.close();
})();
