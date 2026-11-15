const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const [q, out] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1800, height: 1100 } });
  const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => m.type() === 'error' && e.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../generator/index.html') + (q || ''));
  await p.waitForTimeout(300);
  await (await p.$('#stage')).screenshot({ path: out });
  const info = await p.$eval('#info', el => el.textContent);
  if (e.length) console.log('ERR', e); if (info) console.log('info:', info);
  await b.close();
})();
