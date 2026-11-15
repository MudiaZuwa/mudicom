/* Canvas renderer for clean part figures (clean/<id>.json). */
function cmdPath(g, d) {
  let i = 0;
  while (i < d.length) {
    const c = d[i++];
    if (c === 'M') { g.moveTo(d[i], d[i + 1]); i += 2; }
    else if (c === 'C') { g.bezierCurveTo(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5]); i += 6; }
    else if (c === 'L') { g.lineTo(d[i], d[i + 1]); i += 2; }
    else if (c === 'Z') g.closePath();
  }
}
function drawClean(g, fig, opts = {}) {
  const ink = opts.ink || fig.ink, ow = (opts.outline ?? fig.outline_width);
  const color = opts.color || ((p, c) => c);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of fig.parts) {
    const path = new Path2D(); for (const d of p.paths) cmdPath(path, d);
    g.fillStyle = color(p, p.fill, 'base'); g.fill(path, 'evenodd');
    if (p.tones.length) {
      g.save(); g.clip(path, 'evenodd');
      for (const t of p.tones) { const tp = new Path2D(); for (const d of t.paths) cmdPath(tp, d); g.fillStyle = color(p, t.fill, 'tone'); g.fill(tp, 'evenodd'); }
      g.restore();
    }
    if (p.outline && ow > 0) { g.strokeStyle = ink; g.lineWidth = ow; g.stroke(path); }
  }
  if (fig.face && opts.face !== false) drawFace(g, fig.face, opts);
  if (opts.lines !== false) for (const l of fig.lines) {
    const lp = new Path2D(); cmdPath(lp, l.d); g.strokeStyle = ink; g.lineWidth = l.w * (opts.lineScale || 1); g.stroke(lp);
  }
}
/* =====================================================================
   FACE TEMPLATES — measured from frontal close-ups (originals/20_korra_s4_face_closeup.jpg),
   in that image's pixel space. Placed on a figure by: anchor (midpoint between the eyes in the
   figure), scale, and per-figure tweaks. Left eye/brow is measured; the right side is mirrored
   about the centre line cx.
   Each eye = white (almond, sharp inner corner) + iris (light base, darker upper band from the
   lid's shadow, thin dark ring) + small pupil + highlight + tapered black upper lid (heaviest at
   the outer corner, with a flick) + thinner tapered lower lid.
   ===================================================================== */
const FACE_TEMPLATES = {
  lok_female: {
    cx: 199.15, eyeY: 106.5,
    white: [[156.1,104.2],[158.5,102.0],[161,100.8],[166.7,100.0],[174.4,100.3],[180,102.2],[183.3,105.8,1],[182.2,108.6],[178.9,111.9],[173.3,114.0],[166.7,113.9],[160.6,111.2],[157.2,107.2]],
    iris: { c: [170.6, 105.9], r: 6.1, pupil: [170.8, 105.0], pr: 1.9, hi: [168.4, 102.9], hr: 0.95, shadeY: 103.2 },
    upperLid: [[153.6,104.9,1],[156.6,101.3],[160.8,99.2],[166.7,98.5],[174.4,98.8],[180.2,100.7],[183.9,105.4,1],[180,102.3],[174.4,100.5],[166.7,100.3],[161,101.4],[157.4,103.6],[155.6,105.6,1]],
    lowerLid: [[159.6,110.5,1],[163.5,113.0],[168,114.3],[173.3,114.3],[178.6,112.1],[182.8,108.0,1],[179.2,113.1],[173.3,115.4],[167.6,115.5],[162.6,113.8]],
    brow: [[151.5,85.6,1],[160,80.6],[170,78.6],[178.5,80.4],[186.8,84.2,1],[186.2,86.4,1],[178,83.3],[169.6,81.7],[160.5,82.7]],
    noseBridge: [[195.4,119],[194.4,124],[193,129.5],[191.6,135]],
    nostrils: [[[193,141.1],[195,141.9],[197.2,141.4]], [[201.3,141.4],[203.4,141.9],[205.5,141.1]]],
    mouth: [[181.5,156.4],[190,157.9],[200,158.5],[210,157.8],[219.5,155.6]],
    lowerLip: [[194.5,163.4],[200,163.9],[205.5,163.4]],
  },
};
function _sp(path, pts, closed = true) {        // smooth Catmull-Rom through points; [x,y,1] = corner
  const n = pts.length, P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const T = i => { const p = P(i); if (p[2] || (!closed && (i <= 0 || i >= n - 1))) return [0, 0]; const a = P(i - 1), b = P(i + 1); return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6]; };
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = P(i), b = P(i + 1), ta = T(i), tb = T(i + 1); path.bezierCurveTo(a[0] + ta[0], a[1] + ta[1], b[0] - tb[0], b[1] - tb[1], b[0], b[1]); }
  if (closed) path.closePath();
}
function drawFace(g, F, opts = {}) {
  const T = FACE_TEMPLATES[F.template], k = F.scale, P = { ...F.colors, ...(opts.faceColors || {}) };
  const ink = P.ink || '#121314';
  g.save();
  // template -> figure: centre between the eyes goes to F.anchor
  g.translate(F.anchor[0], F.anchor[1]); g.scale(k, k); g.translate(-T.cx, -T.eyeY);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const mir = pts => pts.map(p => [2 * T.cx - p[0], p[1], ...p.slice(2)]);
  for (const side of [0, 1]) {
    const M = side ? mir : (p => p);
    const white = new Path2D(); _sp(white, M(T.white));
    g.fillStyle = P.eyeWhite; g.fill(white);
    g.save(); g.clip(white);
    const I = T.iris, cx = side ? 2 * T.cx - I.c[0] : I.c[0];
    const ir = new Path2D(); ir.arc(cx, I.c[1], I.r, 0, 7);
    g.fillStyle = P.iris; g.fill(ir);
    g.save(); g.clip(ir); g.fillStyle = P.irisShade; g.fillRect(cx - I.r, I.c[1] - I.r - 1, I.r * 2, I.shadeY - (I.c[1] - I.r - 1)); g.restore();
    g.strokeStyle = P.irisRing; g.lineWidth = 0.9; g.stroke(ir);
    g.fillStyle = P.pupil; g.beginPath(); g.arc(side ? 2 * T.cx - I.pupil[0] : I.pupil[0], I.pupil[1], I.pr, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(side ? 2 * T.cx - I.hi[0] : I.hi[0], I.hi[1], I.hr, 0, 7); g.fill();
    g.restore();
    for (const lid of [T.upperLid, T.lowerLid]) { const p = new Path2D(); _sp(p, M(lid)); g.fillStyle = ink; g.fill(p); }
    if (F.templateBrows !== false) { const p = new Path2D(); _sp(p, M(T.brow)); g.fillStyle = P.brow || ink; g.fill(p); }
  }
  const stroke = (pts, w, c) => { const p = new Path2D(); _sp(p, pts, false); g.strokeStyle = c; g.lineWidth = w; g.stroke(p); };
  const bridge = F.noseSide === 'left' ? T.noseBridge : mir(T.noseBridge);
  stroke(bridge, 1.35, P.noseLine);
  for (const n of T.nostrils) stroke(n, 1.15, P.nostril);
  stroke(T.mouth, 1.2, P.mouth);
  stroke(T.lowerLip, 0.7, P.noseLine);
  g.restore();
  // figure-specific brows (figure coords), tapered: thick at the inner end
  for (const b of F.brows || []) {
    const [o, m, i] = b, w = F.browWidth || 1.1, p = new Path2D();
    const nx = (a, c) => { const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; };
    const n1 = nx(o, i);
    p.moveTo(o[0], o[1]);
    p.quadraticCurveTo(m[0] - n1[0] * w * 0.4, m[1] - n1[1] * w * 0.4, i[0] - n1[0] * w * 0.5, i[1] - n1[1] * w * 0.5);
    p.lineTo(i[0] + n1[0] * w * 0.5, i[1] + n1[1] * w * 0.5);
    p.quadraticCurveTo(m[0] + n1[0] * w * 0.4, m[1] + n1[1] * w * 0.4, o[0], o[1]);
    g.fillStyle = (F.colors && F.colors.brow) || ink; g.fill(p);
  }
}

if (typeof module !== 'undefined') module.exports = { drawClean, cmdPath };
