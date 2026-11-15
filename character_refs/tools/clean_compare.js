// node tools/clean_compare.js <id> <out.png> [scale] [x y w h crop in figure px]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const [id, out, sc = '2', ...crop] = process.argv.slice(2);
  const fig = JSON.parse(fs.readFileSync(path.join(ROOT, 'clean', id + '.json')));
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/figures.json'))).figures.find(x => x.id === id);
  const img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'originals', f.src)).toString('base64');
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<body style="margin:0"></body>'); await p.addScriptTag({ path: path.join(ROOT, 'tools/clean_lib.js') });
  const png = await p.evaluate(async ([fig, img, box, s, crop]) => {
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = img; });
    const [cx, cy, cw, ch] = crop.length ? crop : [0, 0, fig.width, fig.height];
    const c = document.createElement('canvas'); c.width = Math.ceil(cw * s * 2 + 20); c.height = Math.ceil(ch * s); const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high'; g.drawImage(im, box[0] + cx, box[1] + cy, cw, ch, 0, 0, cw * s, ch * s);
    g.setTransform(s, 0, 0, s, cw * s + 20 - cx * s, -cy * s); drawClean(g, fig);
    return c.toDataURL('image/png');
  }, [fig, img, f.box, +sc, crop.map(Number)]);
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64')); await b.close();
})();
