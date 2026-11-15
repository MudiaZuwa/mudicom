const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const [seed, out, clip] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1640, height: 1000 }, deviceScaleFactor: clip ? 2 : 1 });
  const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => m.type() === 'error' && e.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../style/index.html') + '?seed=' + seed);
  const c = await p.$('#c');
  if (clip) { const bb = await c.boundingBox(); const [x, y, w, h] = clip.split(',').map(Number); const k = bb.width / 1600; await p.screenshot({ path: out, clip: { x: bb.x + x * k, y: bb.y + y * k, width: w * k, height: h * k } }); }
  else await c.screenshot({ path: out });
  if (e.length) console.log('ERR', e); await b.close();
})();
