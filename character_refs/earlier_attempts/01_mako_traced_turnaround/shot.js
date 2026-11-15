const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const dir = process.argv[2], out = process.argv[3], mode = process.argv[4] || 'plain', labels = process.argv[5] === '1';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1540, height: 1100 } });
  await p.goto('file://' + path.join(dir, 'character.html'));
  await p.evaluate(async ([dir, mode, labels]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'file://' + dir + '/ref/' + src; });
    if (mode !== 'plain') {
      refs.FRONT = { img: await load('front.png'), x: 0, y: 0, w: 472, h: 649 };
      refs.SIDE = { img: await load('side_ref.png'), x: 0, y: 0, w: 280, h: 924 };
      refs.BACK = { img: await load('back_ref.png'), x: 0, y: 0, w: 322, h: 924 };
    }
    render({ refUnder: mode !== 'plain', alpha: mode === 'overlay' ? 0.5 : 1, labels });
  }, [dir, mode, labels]);
  await (await p.$('#stage')).screenshot({ path: out });
  await b.close();
})();
