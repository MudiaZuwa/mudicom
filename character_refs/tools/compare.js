// Render traced figures next to their originals and measure the match.
// usage: node compare.js out_dir [id ...]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const figs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/figures.json'))).figures;
  const ids = process.argv.slice(3).length ? process.argv.slice(3) : figs.map(f => f.id);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html><body style="margin:0;background:#fff"></body></html>');
  await p.addScriptTag({ path: path.join(ROOT, 'tools/render_lib.js') });
  const stats = [];
  for (const id of ids) {
    const f = figs.find(x => x.id === id);
    const traceSrc = fs.readFileSync(path.join(ROOT, 'traces', id + '.js'), 'utf8');
    const img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'originals', f.src)).toString('base64');
    const r = await p.evaluate(async ([traceSrc, img, box]) => {
      window.TRACES = []; eval(traceSrc); const t = TRACES[0];
      const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = img; });
      const W = t.width, H = t.height, s = Math.max(1, Math.min(4, 900 / H));
      const c = document.createElement('canvas'); c.width = Math.round(W * s * 2 + 20); c.height = Math.round(H * s); const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, box[0], box[1], W, H, 0, 0, W * s, H * s);
      g.setTransform(s, 0, 0, s, W * s + 20, 0); drawTrace(g, t); g.setTransform(1, 0, 0, 1, 0, 0);
      // similarity at 1x: mean abs RGB difference over figure pixels
      const a = document.createElement('canvas'); a.width = W; a.height = H; const ga = a.getContext('2d'); ga.fillStyle = '#fff'; ga.fillRect(0, 0, W, H); ga.drawImage(im, box[0], box[1], W, H, 0, 0, W, H);
      const bb = document.createElement('canvas'); bb.width = W; bb.height = H; const gb = bb.getContext('2d'); gb.fillStyle = '#fff'; gb.fillRect(0, 0, W, H); drawTrace(gb, t);
      const da = ga.getImageData(0, 0, W, H).data, db = gb.getImageData(0, 0, W, H).data;
      let sum = 0, n = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); if (db[i] + db[i + 1] + db[i + 2] < 750 || da[i] + da[i + 1] + da[i + 2] < 690) { sum += d / 3; n++; } }
      return { png: c.toDataURL('image/png'), mae: sum / Math.max(1, n), paths: t.paths.length };
    }, [traceSrc, img, f.box]);
    fs.writeFileSync(path.join(out, id + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
    stats.push({ id, mae: +r.mae.toFixed(1), paths: r.paths }); console.log(id, 'meanAbsDiff', r.mae.toFixed(1), 'paths', r.paths);
  }
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 1));
  await b.close();
})();
