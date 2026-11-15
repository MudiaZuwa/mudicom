// Draw reference with authored part outlines (cyan) + names, zoomed per view.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const dir = process.argv[2], view = process.argv[3], out = process.argv[4];
  const y0 = +(process.argv[5]||0), y1 = +(process.argv[6]||924), sc = +(process.argv[7]||2);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.join(dir, 'character.html'));
  const W = view==='SIDE'?280:322;
  await p.setViewportSize({ width: Math.ceil(W*sc), height: Math.ceil((y1-y0)*sc) });
  await p.evaluate(async ([dir, view, y0, y1, sc, W]) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'file://' + dir + '/ref/' + view.toLowerCase() + '_ref.png'; });
    document.body.innerHTML = ''; document.body.style.padding = 0; document.body.style.margin = 0;
    const c = document.createElement('canvas'); c.width = W*sc; c.height = (y1-y0)*sc; document.body.append(c);
    const ctx = c.getContext('2d'); ctx.setTransform(sc,0,0,sc,0,-y0*sc);
    ctx.drawImage(img, 0, 0, W, 924);
    const V = view==='SIDE'?SIDE:BACK;
    ctx.lineWidth = 1.2/sc*1.5; ctx.font = (9/sc*1.3)+'px sans-serif';
    for (const part of V.parts) {
      ctx.beginPath(); splinePath(ctx, part.pts, true); ctx.strokeStyle = '#00e5ff'; ctx.stroke();
      for (const pt of part.pts) { ctx.fillStyle = pt[2] ? '#ff2d55' : '#00e5ff'; ctx.fillRect(pt[0]-0.8, pt[1]-0.8, 1.6, 1.6); }
      const [x,y] = centroid(part.pts); ctx.fillStyle = '#0050ff'; ctx.fillText(part.name, x-10, y);
    }
    for (const l of V.lines||[]) { ctx.beginPath(); splinePath(ctx,l.pts,false); ctx.strokeStyle='#ff9500'; ctx.stroke(); }
    // grid labels
    ctx.fillStyle='rgba(255,0,0,.8)'; ctx.font=(8/sc*1.3)+'px sans-serif';
    for (let y=Math.ceil(y0/50)*50;y<y1;y+=50){ ctx.fillRect(0,y,W,0.3); ctx.fillText(y,1,y-1); }
    for (let x=50;x<W;x+=50){ ctx.fillRect(x,y0,0.3,y1-y0); ctx.fillText(x,x+1,y0+8); }
  }, [dir, view, y0, y1, sc, W]);
  await p.screenshot({ path: out }); await b.close();
})();
