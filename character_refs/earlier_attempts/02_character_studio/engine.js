/* =====================================================================
   CHARACTER ENGINE — procedural turnaround (front / side / back)
   ---------------------------------------------------------------------
   Units: 1 = one head height.  y = 0 at the top of the skull, grows
   downward; the ground is at y = body.heads.  x = lateral (+x is the
   character's LEFT, i.e. viewer's right in the front view), z = depth
   (+z points out of the character's chest).

   Views project the same 3D skeleton:
     front: (x, y)     back: (-x, y)     side (facing left): (-z, y)
   Every builder below returns flat 2D shapes for one view, tagged with a
   layer number (painter's order). In the side view, parts on the far
   side of the body ('L') are pushed behind everything else.
   ===================================================================== */

/* ---------- small math helpers ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (p, q, t) => p.map((v, i) => lerp(v, q[i], t));
const mirrorX = pts => pts.map(p => [-p[0], p[1], ...p.slice(2)]).reverse();
const sym = half => [...half, ...mirrorX(half)];          // half = right side points top→bottom→… mirrored
const shift = (pts, dx, dy) => pts.map(p => [p[0] + dx, p[1] + dy, ...p.slice(2)]);
const scaleP = (pts, sx, sy, ox = 0, oy = 0) => pts.map(p => [ox + (p[0] - ox) * sx, oy + (p[1] - oy) * sy, ...p.slice(2)]);
const circle = (cx, cy, r, ry = r, n = 14) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry]; });

function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function cr(p0, p1, p2, p3, t) {          // Catmull-Rom, any dimension
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
}
function sampleSpline(pts, per = 8) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(cr(p0, p1, p2, p3, k / per));
  }
  out.push(pts[n - 1]);
  return out;
}

/* Tapered tube around a spine: spine = [[x, y, halfWidth], ...] (2D, projected).
   caps: 'round' | 'flat'. Returns a dense polygon. */
function tube(spine, capStart = 'flat', capEnd = 'round') {
  const s = sampleSpline(spine, 8), L = [], R = [], N = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    N.push([dx, dy]);
    L.push([s[i][0] - dy * s[i][2], s[i][1] + dx * s[i][2]]);
    R.push([s[i][0] + dy * s[i][2], s[i][1] - dx * s[i][2]]);
  }
  const e0 = L.length - 1;
  if (capEnd === 'flat') { L[e0][2] = 1; R[e0][2] = 1; }
  if (capStart === 'flat') { L[0][2] = 1; R[0][2] = 1; }
  const out = [...L];
  const arc = (c, d, w, from) => {               // half circle from +n side to -n side through d
    const n = [-d[1], d[0]];
    for (let k = 1; k < 8; k++) {
      const f = k / 8 * Math.PI;
      out.push([c[0] + w * (from * n[0] * Math.cos(f) + from * d[0] * Math.sin(f)), c[1] + w * (from * n[1] * Math.cos(f) + from * d[1] * Math.sin(f))]);
    }
  };
  const e = s.length - 1;
  if (capEnd === 'round') arc(s[e], N[e], s[e][2], 1);
  out.push(...R.reverse());
  if (capStart === 'round') arc(s[0], N[0], s[0][2], -1);
  return out;
}

/* Fur / frayed trim along an edge polyline. side = +1/-1 picks which normal. */
function furStrip(edge, width, rnd, side = 1, inset = 0.25) {
  const pts = [], dense = [];
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / 0.05));
    for (let k = 0; k < n; k++) dense.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  dense.push(edge[edge.length - 1]);
  const nrm = i => { const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l * side, dx / l * side]; };
  const inner = [], outer = [];
  dense.forEach((p, i) => {
    const n = nrm(i);
    inner.push([p[0] - n[0] * width * inset, p[1] - n[1] * width * inset]);
    const tip = i % 2 === 1, k = tip ? width * (0.75 + rnd() * 0.75) : width * (0.25 + rnd() * 0.2);
    outer.push([p[0] + n[0] * k + (rnd() - .5) * width * .3, p[1] + n[1] * k, tip ? 1 : 0]);
  });
  return [...inner, ...outer.reverse()].map(p => [p[0], p[1], 1]);
}

/* ---------- colour helpers ---------- */
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function shadeColor(hex, k = 0.78) {    // darker + slightly cooler: cel shadow tone
  const [r, g, b] = hexToRgb(hex); return rgbToHex([r * k * 0.97, g * k, b * k * 1.06 + 4]);
}

/* =====================================================================
   RIG — skeleton landmarks from body parameters
   ===================================================================== */
function rig(spec) {
  const b = spec.body, F = b.female ? 1 : 0, m = b.muscle ?? 0.5;
  const H = b.heads;
  const r = { H, F, m };
  r.crotch = 3.55;
  r.knee = r.crotch + (H - r.crotch) * 0.47;
  r.ankle = H - 0.3;
  r.waistY = 2.78;

  // torso cross-sections: w = half width (front), zf/zb = depth to front/back (side)
  const sh = b.shoulders, ch = b.chest, wa = b.waist, hp = b.hips, bust = F * (b.bust ?? 0.5);
  r.secs = [
    { y: 1.22, w: 0.17, zf: 0.13, zb: 0.15 },
    { y: 1.36, w: sh * 0.62, zf: 0.2, zb: 0.24 },
    { y: 1.52, w: sh * 0.97, zf: 0.26, zb: 0.28 },
    { y: 1.62, w: sh, zf: 0.3, zb: 0.29 },
    { y: 1.92, w: ch, zf: 0.34 + bust * 0.06, zb: 0.3 },
    { y: 2.12, w: ch * 0.97, zf: 0.34 + bust * 0.17, zb: 0.29 },
    { y: 2.42, w: lerp(ch, wa, 0.6), zf: 0.3, zb: 0.25 },
    { y: 2.78, w: wa, zf: 0.27, zb: 0.24 },
    { y: 3.18, w: hp, zf: 0.3, zb: 0.34 + F * 0.07 },
    { y: 3.55, w: hp * 0.93, zf: 0.27, zb: 0.29 },
  ];
  r.sec = y => {                                  // interpolate a section at height y
    const S = r.secs; if (y <= S[0].y) return { ...S[0], y };
    for (let i = 0; i < S.length - 1; i++) if (y <= S[i + 1].y) {
      const t = (y - S[i].y) / (S[i + 1].y - S[i].y);
      return { y, w: lerp(S[i].w, S[i + 1].w, t), zf: lerp(S[i].zf, S[i + 1].zf, t), zb: lerp(S[i].zb, S[i + 1].zb, t) };
    }
    return { ...S[S.length - 1], y };
  };

  // limbs, as 3D joint chains. side: -1 = character's right (viewer-left in front)
  const spread = b.armSpread ?? 0.1, stance = b.stance ?? 0.1;
  r.arm = s => {
    const x0 = sh - 0.16;
    const S = [s * x0, 1.62, 0.0];
    const E = [s * (x0 + 0.07 + spread), 2.7, -0.06];
    const W = [s * (x0 + 0.11 + spread * 1.6), 3.6, 0.05];
    const Hd = [s * (x0 + 0.12 + spread * 1.8), 4.02, 0.09];
    return { S, E, W, Hd, z: s < 0 ? 0.04 : -0.04 };
  };
  r.leg = s => {
    const hx = hp * 0.5;
    const zoff = s < 0 ? 0.22 : -0.22;           // small stride so both legs read in the side view
    const Hp = [s * hx, 3.25, zoff * 0.3];
    const K = [s * (hx + stance * 0.45), r.knee, 0.06 + zoff];
    const A = [s * (hx + stance * 0.9), r.ankle, -0.02 + zoff];
    return { Hp, K, A, G: H };
  };
  // limb thickness (half widths)
  const mw = 1 + (m - 0.5) * 0.25 - F * 0.08;
  r.armW = { sh: 0.19 * mw, up: 0.155 * mw, el: 0.125 * mw, fo: 0.135 * mw, wr: 0.085 * mw };
  r.legW = { hip: hp * 0.5 * 0.92, th: 0.27 * mw, kn: 0.165 * mw, ca: 0.19 * mw, an: 0.1 * mw };
  return r;
}

/* =====================================================================
   BUILD — returns { shapes } for a view
   shape = { pts, fill, layer, side?, smooth?, shade?, lw?, custom? }
   line  = { line: pts, w, layer, color? }
   ===================================================================== */
function build(spec, view) {
  const R = rig(spec), out = [], rnd = makeRng(spec.seed || 7);
  const P = (p) => view === 'front' ? [p[0], p[1]] : view === 'back' ? [-p[0], p[1]] : [-p[2], p[1]];
  const add = (o) => { out.push(o); return o; };
  const ctx = { spec, R, view, P, add, rnd, out };

  Body(ctx);
  Head(ctx);
  Hair(ctx);
  Top(ctx);
  Sleeves(ctx);
  Armwear(ctx);
  Pants(ctx);
  Footwear(ctx);
  Skirt(ctx);
  Waist(ctx);
  Scarf(ctx);

  // side view: far-side parts go behind the body
  for (const o of out) {
    if (view === 'side' && o.side === 'L') o.layer -= 100;
    if (view === 'back' && o.backLayer != null) o.layer = o.backLayer;
  }
  out.sort((a, b) => a.layer - b.layer);
  return out;
}

/* ---------- section outlines (torso-shaped garments) ---------- */
function secPts(view, secs, sharpEnds = true) {
  const L = [], Rr = [];
  secs.forEach((s, i) => {
    const end = sharpEnds && (i === 0 || i === secs.length - 1) ? 1 : 0;
    if (view === 'side') { L.push([-s.zf, s.y, end]); Rr.push([s.zb, s.y, end]); }
    else { L.push([-(s.wl ?? s.w), s.y, end]); Rr.push([(s.wr ?? s.w), s.y, end]); }
  });
  return [...L, ...Rr.reverse()];
}
function ease(s, e) { return { ...s, w: s.w + e, zf: s.zf + e, zb: s.zb + e }; }

/* ---------- limb helper: project a 3D chain with widths, make a tube ---------- */
function limb(ctx, chain, caps = ['flat', 'round']) {
  const sp = chain.map(([p, w]) => [...ctx.P(p), w]);
  return tube(sp, caps[0], caps[1]);
}
const along = (a, b, t) => mix3(a, b, t);

/* =====================================================================
   BODY
   ===================================================================== */
function Body(c) {
  const { R, view, add } = c;
  // torso
  add({ name: 'torso', pts: secPts(view, R.secs), fill: 'skin', layer: 14 });
  // neck
  add({ name: 'neck', pts: limb(c, [[[0, 0.78, 0.02], 0.135], [[0, 1.0, 0.0], 0.14], [[0, 1.3, -0.02], 0.16]], ['flat', 'flat']), fill: 'skin', layer: 15 });
  // legs
  for (const s of [-1, 1]) {
    const L = R.leg(s), W = R.legW, side = s < 0 ? 'R' : 'L';
    add({
      name: 'leg', side, fill: 'skin', layer: 10,
      pts: limb(c, [[[L.Hp[0] * 0.8, 2.95, L.Hp[2]], W.hip], [L.Hp, W.hip], [along(L.Hp, L.K, 0.5), W.th], [L.K, W.kn],
        [along(L.K, L.A, 0.3), W.ca], [along(L.K, L.A, 0.75), W.an * 1.15], [L.A, W.an]], ['flat', 'flat'])
    });
  }
  // arms + hands
  for (const s of [-1, 1]) {
    const A = R.arm(s), W = R.armW, side = s < 0 ? 'R' : 'L';
    add({
      name: 'arm', side, fill: 'skin', layer: 29,
      pts: limb(c, [[A.S, W.sh], [along(A.S, A.E, 0.45), W.up], [A.E, W.el], [along(A.E, A.W, 0.35), W.fo], [A.W, W.wr]], ['round', 'flat'])
    });
    Hand(c, A, s, side);
  }
}

function Hand(c, A, s, side) {
  const { view, add, P } = c;
  const W = A.W, Hd = A.Hd, gloved = c.spec.arms?.gloves;
  const fill = gloved ? 'armwear' : 'skin';
  const hw = view === 'side' ? 0.11 : 0.085;
  add({ name: 'hand', side, fill, layer: 34, pts: limb(c, [[W, 0.075], [along(W, Hd, 0.45), hw], [along(W, Hd, 0.8), hw * 0.95], [Hd, hw * 0.7]], ['flat', 'round']) });
  // thumb on the inner/front side
  const th0 = along(W, Hd, 0.2), th1 = along(W, Hd, 0.62);
  const off = view === 'side' ? [0, 0, 0.09] : [-s * 0.07, 0, 0.04];
  const t0 = [th0[0] + off[0] * 0.6, th0[1], th0[2] + off[2] * 0.6], t1 = [th1[0] + off[0], th1[1], th1[2] + off[2]];
  if (view !== 'back') add({ name: 'thumb', side, fill, layer: 34.5, pts: limb(c, [[t0, 0.035], [t1, 0.032]], ['round', 'round']) });
  if (gloved) { // finger tips peek out of fingerless gloves
    const tip = along(W, Hd, 0.85);
    add({ name: 'fingertips', side, fill: 'skin', layer: 34.6, pts: limb(c, [[tip, hw * 0.85], [Hd, hw * 0.7]], ['flat', 'round']) });
  }
  // knuckle line
  const k0 = P(along(W, Hd, 0.7)), d = view === 'side' ? 0.07 : 0.06;
  add({ line: [[k0[0] - d, k0[1]], [k0[0], k0[1] + 0.02], [k0[0] + d, k0[1]]], w: 0.012, layer: 34.7, side });
}

/* =====================================================================
   HEAD + FACE
   ===================================================================== */
function headShape(view, face, F) {
  const jw = face.jaw ?? 1, chin = face.chin ?? 1;
  if (view === 'side') {
    const nose = F ? -0.44 : -0.47;
    return [[0.02, -0.02], [0.27, 0.04], [0.42, 0.2], [0.46, 0.42], [0.41, 0.62], [0.29, 0.78], [0.14, 0.84], [-0.1 * chin, 0.95], [-0.26, 1.0], [-0.34, 0.96], [-0.36, 0.89],
      [-0.355, 0.86], [-0.38, 0.83], [-0.375, 0.78], [nose, 0.73, 1], [-0.39, 0.6], [-0.36, 0.53], [-0.4, 0.45], [-0.375, 0.27], [-0.26, 0.07]];
  }
  const half = [[0, -0.03], [0.24, 0.02], [0.37, 0.17], [0.4, 0.4], [0.385, 0.6], [0.3 * jw + 0.05, 0.79], [0.14 * jw + 0.04, 0.95], [0.05, 1.0]];
  if (view === 'back') { half[5] = [0.33, 0.78]; half[6] = [0.22, 0.88]; half[7] = [0.06, 0.92]; }
  return [...half, ...mirrorX(half).slice(0, -1)];
}

function Head(c) {
  const { spec, view, add, R } = c, F = R.F, face = spec.face || {};
  const hairCoversEars = ['bob', 'long'].includes(spec.hair?.style);
  // ears
  const earF = [[0.36, 0.47], [0.44, 0.43], [0.47, 0.53], [0.43, 0.69], [0.37, 0.7]];
  if (view === 'side') add({ name: 'ear', fill: 'skin', layer: hairCoversEars ? 17 : 39, pts: [[0.04, 0.47], [0.14, 0.44], [0.19, 0.55], [0.14, 0.71], [0.05, 0.69]] });
  else { add({ name: 'ear', fill: 'skin', layer: 16.5, pts: earF }); add({ name: 'ear', fill: 'skin', layer: 16.5, pts: mirrorX(earF) }); }
  add({ name: 'head', fill: 'skin', layer: 17, pts: headShape(view, face, F) });
  if (view === 'side') add({ line: [[0.08, 0.52], [0.14, 0.56], [0.1, 0.65]], w: 0.012, layer: 39.1 });
  if (view !== 'back') Face(c);
}

function Face(c) {
  const { spec, view, add, R } = c, F = R.F, f = spec.face || {};
  const es = f.eyeSize ?? 1, bw = (f.brows ?? 1) * 0.024, expr = f.expression || 'neutral';
  const L = 37;
  if (view === 'front') {
    const ey = 0.56, ex = 0.165, w = 0.095 * es * (F ? 1.08 : 1), h = 0.045 * es * (F ? 1.25 : 1);
    for (const s of [-1, 1]) {
      const cx = s * ex;
      // almond eye, outer corner toward s
      const eye = [[cx - s * w, ey + 0.005], [cx - s * w * 0.35, ey - h], [cx + s * w * 0.45, ey - h * 0.95], [cx + s * w, ey - h * 0.15, 1], [cx + s * w * 0.4, ey + h * 0.55], [cx - s * w * 0.45, ey + h * 0.55]];
      add({
        name: 'eye', layer: L, custom: (g, pal) => {
          const path = new Path2D(); pathFrom(path, eye, true);
          g.fillStyle = '#f4f1ea'; g.fill(path);
          g.save(); g.clip(path);
          const ir = h * 0.95;
          g.fillStyle = pal.eye; g.beginPath(); g.arc(cx + s * w * 0.08, ey - h * 0.05, ir, 0, 7); g.fill();
          g.fillStyle = shadeColor(pal.eye, 0.55); g.beginPath(); g.arc(cx + s * w * 0.08, ey - h * 0.05, ir * 0.45, 0, 7); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + s * w * 0.08 - ir * 0.35, ey - h * 0.4, ir * 0.25, 0, 7); g.fill();
          g.restore();
          // upper lid (heavier), lower lid (thin)
          g.strokeStyle = pal.ink; g.lineCap = 'round'; g.lineJoin = 'round';
          g.lineWidth = F ? 0.026 : 0.02; g.beginPath(); pathFrom(g, [eye[0], eye[1], eye[2], eye[3]], false); g.stroke();
          if (F) { g.lineWidth = 0.016; g.beginPath(); g.moveTo(eye[3][0], eye[3][1]); g.lineTo(eye[3][0] + s * 0.03, eye[3][1] - 0.03); g.stroke(); }
          g.lineWidth = 0.008; g.beginPath(); pathFrom(g, [eye[4], eye[5]], false); g.stroke();
        }
      });
      // brow
      const lo = expr === 'stern' ? 0.025 : 0;
      const brow = [[cx - s * 0.085, 0.475 + lo], [cx + s * 0.02, 0.445], [cx + s * 0.12, 0.455, 1], [cx + s * 0.02, 0.445 + bw], [cx - s * 0.085, 0.475 + lo + bw * 0.9, 1]];
      add({ name: 'brow', fill: 'hair', layer: L + 0.1, pts: brow, lw: 0.006 });
    }
    // nose + mouth
    add({ line: [[0.015, 0.63], [0.03, 0.7], [0.01, 0.735]], w: 0.012, layer: L });
    add({ line: [[-0.035, 0.745], [-0.005, 0.752]], w: 0.012, layer: L });
    const smile = expr === 'smile' ? 0.022 : expr === 'stern' ? -0.006 : 0.004;
    add({ line: [[-0.085, 0.845 - smile], [-0.03, 0.85], [0.03, 0.85], [0.085, 0.845 - smile]], w: 0.014, layer: L });
    if (F) add({ line: [[-0.03, 0.885], [0.03, 0.885]], w: 0.008, layer: L });
  } else if (view === 'side') {
    const eye = [[-0.345, 0.545], [-0.27, 0.53], [-0.255, 0.575, 1], [-0.33, 0.58]];
    add({
      name: 'eye', layer: L, custom: (g, pal) => {
        const path = new Path2D(); pathFrom(path, eye, true);
        g.fillStyle = '#f4f1ea'; g.fill(path); g.save(); g.clip(path);
        g.fillStyle = pal.eye; g.beginPath(); g.arc(-0.315, 0.555, 0.03 * es, 0, 7); g.fill(); g.restore();
        g.strokeStyle = pal.ink; g.lineWidth = F ? 0.024 : 0.018; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-0.35, 0.545); g.quadraticCurveTo(-0.3, 0.522, -0.255, 0.54); g.stroke();
        if (F) { g.lineWidth = 0.014; g.beginPath(); g.moveTo(-0.26, 0.54); g.lineTo(-0.235, 0.52); g.stroke(); }
      }
    });
    add({ name: 'brow', fill: 'hair', layer: L + 0.1, pts: [[-0.385, 0.455], [-0.3, 0.44], [-0.22, 0.455, 1], [-0.3, 0.44 + bw], [-0.38, 0.47 + bw * 0.6, 1]], lw: 0.006 });
    add({ line: [[-0.4, 0.745], [-0.375, 0.752]], w: 0.012, layer: L });
    add({ line: [[-0.37, 0.845], [-0.32, 0.85]], w: 0.012, layer: L });
  }
}

/* =====================================================================
   HAIR — each style returns per-view shapes in head space
   back: drawn behind head (layer 3/16), cap: over head (layer 38), extra
   ===================================================================== */
const HAIR_STYLES = {
  topknot(v, c) {           // high tied bun + upswept tail, two wrapped side locks
    const S = [];
    const tail = (s, far) => {      // side lock in front of the ear, wrapped by a hair tube
      const x = v === 'side' ? 0.0 : s * 0.39, dx = v === 'side' ? -0.03 : s * 0.03;
      const lock = tube([[x, 0.42, 0.04], [x + dx, 0.75, 0.06], [x + dx * 0.3, 1.15, 0.065], [x + dx * 1.2, 1.45, 0.045], [x + dx * 0.6, 1.6, 0.01]], 'flat', 'round');
      const layer = v === 'back' ? 1 : 40;
      S.push({ name: 'side lock', fill: 'hair', layer, pts: lock, side: far });
      const ty = 0.66;
      S.push({ name: 'hair tube', fill: 'hairTie', layer: layer + 0.1, side: far, pts: [[x - 0.075 + dx * 0.55, ty, 1], [x + 0.075 + dx * 0.55, ty, 1], [x + 0.08 + dx * 0.7, ty + 0.16, 1], [x - 0.08 + dx * 0.7, ty + 0.16, 1]] });
    };
    if (v === 'front') {
      S.push({ name: 'hair back', fill: 'hair', layer: 3, pts: [[-0.43, 0.3], [-0.46, 0.62], [-0.38, 0.8], [0.38, 0.8], [0.46, 0.62], [0.43, 0.3], [0.2, -0.05], [-0.2, -0.05]] });
      S.push({ name: 'ponytail', fill: 'hair', layer: 2, pts: [[-0.07, -0.1], [-0.1, -0.24], [-0.04, -0.36, 1], [-0.01, -0.26], [0.06, -0.12]] });
      S.push({ name: 'bun', fill: 'hair', layer: 38.2, pts: circle(0, -0.085, 0.105, 0.085) });
      S.push({ name: 'hair tie', fill: 'hairTie', layer: 38.3, pts: [[-0.06, -0.02, 1], [0.06, -0.02, 1], [0.05, 0.02, 1], [-0.05, 0.02, 1]] });
      S.push({ name: 'hair cap', fill: 'hair', layer: 38, pts: [[-0.405, 0.6, 1], [-0.43, 0.32], [-0.36, 0.1], [-0.2, -0.02], [0, -0.05], [0.2, -0.02], [0.36, 0.1], [0.43, 0.32], [0.405, 0.6, 1], [0.37, 0.42], [0.3, 0.3], [0.17, 0.2], [0.04, 0.15], [0, 0.11, 1], [-0.04, 0.15], [-0.17, 0.2], [-0.3, 0.3], [-0.37, 0.42]] });
      tail(-1, 'R'); tail(1, 'L');
    } else if (v === 'side') {
      S.push({ name: 'ponytail', fill: 'hair', layer: 3, pts: [[0.04, -0.12], [0.1, -0.3], [0.24, -0.38], [0.37, -0.32], [0.45, -0.12], [0.5, 0.12], [0.53, 0.36, 1], [0.42, 0.16], [0.35, -0.04], [0.22, -0.12]] });
      S.push({ name: 'hair cap', fill: 'hair', layer: 38, pts: [[-0.36, 0.27], [-0.3, 0.08], [-0.12, -0.04], [0.12, -0.06], [0.32, 0.02], [0.46, 0.2], [0.49, 0.42], [0.44, 0.62], [0.34, 0.78], [0.22, 0.83, 1], [0.21, 0.66], [0.21, 0.48], [0.1, 0.4], [-0.04, 0.32], [-0.22, 0.26]] });
      S.push({ name: 'bun', fill: 'hair', layer: 38.2, pts: circle(0.1, -0.07, 0.11, 0.085) });
      S.push({ name: 'hair tie', fill: 'hairTie', layer: 38.3, pts: [[0.03, -0.01, 1], [0.15, -0.03, 1], [0.15, 0.01, 1], [0.04, 0.03, 1]] });
      tail(-1, 'R');
    } else {
      tail(-1, 'R'); tail(1, 'L');
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.42, 0.62], [-0.45, 0.3], [-0.37, 0.06], [-0.2, -0.04], [0, -0.06], [0.2, -0.04], [0.37, 0.06], [0.45, 0.3], [0.42, 0.62], [0.3, 0.8], [0.14, 0.86], [0, 0.88], [-0.14, 0.86], [-0.3, 0.8]] });
      S.push({ name: 'bun', fill: 'hair', layer: 38.2, pts: circle(0, -0.09, 0.11, 0.09) });
      S.push({ name: 'ponytail', fill: 'hair', layer: 38.4, pts: tube([[0, -0.1, 0.07], [0.03, 0.2, 0.1], [-0.01, 0.6, 0.095], [0.04, 0.95, 0.06], [0.01, 1.15, 0.01]], 'round', 'round') });
      S.push({ name: 'hair tie', fill: 'hairTie', layer: 38.5, pts: [[-0.07, -0.04, 1], [0.07, -0.04, 1], [0.065, 0.01, 1], [-0.065, 0.01, 1]] });
    }
    return S;
  },
  spiky(v) {                // short, swept-back spikes
    const S = [];
    if (v === 'front') {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.4, 0.6, 1], [-0.44, 0.3], [-0.41, 0.1], [-0.47, -0.03, 1], [-0.3, -0.01], [-0.29, -0.15, 1], [-0.15, -0.06], [-0.05, -0.2, 1], [0.05, -0.08], [0.18, -0.21, 1], [0.24, -0.06], [0.36, -0.12, 1], [0.38, 0.04], [0.47, 0.07, 1], [0.43, 0.3], [0.4, 0.6, 1], [0.37, 0.42], [0.32, 0.3], [0.2, 0.22], [0.08, 0.25], [0, 0.2, 1], [-0.1, 0.24], [-0.22, 0.22], [-0.33, 0.3], [-0.38, 0.42]] });
    } else if (v === 'side') {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.36, 0.27], [-0.4, 0.05], [-0.5, -0.14, 1], [-0.27, -0.08], [-0.12, -0.2, 1], [0.04, -0.09], [0.24, -0.16, 1], [0.3, -0.04], [0.5, 0.0, 1], [0.47, 0.14], [0.62, 0.24, 1], [0.48, 0.34], [0.48, 0.6], [0.38, 0.8], [0.25, 0.85, 1], [0.21, 0.68], [0.2, 0.48], [0.06, 0.43], [0.0, 0.6, 1], [-0.05, 0.4], [-0.2, 0.3]] });
    } else {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.42, 0.58], [-0.45, 0.25], [-0.38, 0.0], [-0.3, -0.12, 1], [-0.15, -0.06], [-0.05, -0.18, 1], [0.08, -0.08], [0.2, -0.16, 1], [0.3, -0.04], [0.42, 0.02, 1], [0.44, 0.25], [0.42, 0.58], [0.32, 0.78], [0.16, 0.86, 1], [0.06, 0.8], [0, 0.88, 1], [-0.08, 0.8], [-0.16, 0.86, 1], [-0.32, 0.78]] });
    }
    return S;
  },
  bob(v) {                  // chin-length, choppy ends, side-swept fringe
    const S = [];
    const ends = (x0, x1, y, n, dir = 1) => { const p = []; for (let i = 0; i <= n; i++) { const t = i / n; p.push([lerp(x0, x1, t), y + (i % 2 ? -0.07 : 0.02) * dir, 1]); } return p; };
    if (v === 'front') {
      S.push({ name: 'hair back', fill: 'hair', layer: 3, pts: [[-0.5, 0.95], [-0.53, 0.55], [-0.45, 0.15], [0, -0.07], [0.45, 0.15], [0.53, 0.55], [0.5, 0.95], ...ends(0.42, -0.42, 1.04, 8)] });
      S.push({ name: 'fringe', fill: 'hair', layer: 38, pts: [[-0.43, 0.62, 1], [-0.46, 0.3], [-0.36, 0.06], [-0.14, -0.06], [0.12, -0.06], [0.34, 0.03], [0.46, 0.25], [0.46, 0.6, 1], [0.39, 0.4], [0.33, 0.28, 1], [0.24, 0.34], [0.1, 0.22], [-0.06, 0.3, 1], [-0.1, 0.2], [-0.24, 0.28], [-0.32, 0.36], [-0.37, 0.46]] });
      S.push({ name: 'lock', fill: 'hair', layer: 38.1, pts: [[-0.43, 0.42], [-0.36, 0.5], [-0.37, 0.8], [-0.33, 1.0, 1], [-0.39, 0.93], [-0.43, 1.04, 1], [-0.47, 0.92], [-0.52, 0.98, 1], [-0.5, 0.7]] });
      S.push({ name: 'lock', fill: 'hair', layer: 38.1, pts: [[0.43, 0.42], [0.36, 0.5], [0.37, 0.8], [0.34, 1.0, 1], [0.4, 0.94], [0.44, 1.05, 1], [0.48, 0.92], [0.52, 0.98, 1], [0.5, 0.7]] });
    } else if (v === 'side') {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.36, 0.3], [-0.33, 0.08], [-0.14, -0.06], [0.12, -0.07], [0.35, 0.02], [0.5, 0.22], [0.54, 0.5], [0.5, 0.8], [0.48, 1.0, 1], [0.4, 0.92], [0.33, 1.04, 1], [0.27, 0.93], [0.18, 1.02, 1], [0.12, 0.9], [0.04, 0.98, 1], [0.0, 0.72], [-0.04, 0.5], [-0.15, 0.4, 1], [-0.22, 0.32]] });
    } else {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.5, 0.95], [-0.53, 0.55], [-0.45, 0.15], [-0.22, -0.05], [0, -0.07], [0.22, -0.05], [0.45, 0.15], [0.53, 0.55], [0.5, 0.95], ...ends(0.45, -0.45, 1.04, 10)] });
    }
    return S;
  },
  bun(v) {                  // slicked back, low bun
    const S = [];
    if (v === 'front') {
      S.push({ name: 'bun', fill: 'hair', layer: 3, pts: circle(0, 0.62, 0.2, 0.17) });
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.4, 0.55, 1], [-0.43, 0.3], [-0.35, 0.08], [-0.18, -0.03], [0, -0.05], [0.18, -0.03], [0.35, 0.08], [0.43, 0.3], [0.4, 0.55, 1], [0.36, 0.36], [0.27, 0.22], [0.13, 0.15], [0.03, 0.14], [-0.03, 0.13, 1], [-0.16, 0.17], [-0.3, 0.27], [-0.37, 0.4]] });
      S.push({ line: [[-0.03, 0.13], [-0.06, 0.02]], w: 0.012, layer: 38.1 });
    } else if (v === 'side') {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.36, 0.25], [-0.3, 0.07], [-0.12, -0.04], [0.12, -0.05], [0.32, 0.03], [0.45, 0.22], [0.48, 0.45], [0.42, 0.66], [0.3, 0.8], [0.2, 0.82, 1], [0.2, 0.62], [0.2, 0.46], [0.08, 0.4], [-0.08, 0.3], [-0.22, 0.25]] });
      S.push({ name: 'bun', fill: 'hair', layer: 38.2, pts: circle(0.5, 0.66, 0.16, 0.15) });
      S.push({ line: [[0.38, 0.62], [0.5, 0.58], [0.6, 0.66]], w: 0.012, layer: 38.3 });
    } else {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.42, 0.6], [-0.45, 0.3], [-0.37, 0.06], [-0.2, -0.04], [0, -0.06], [0.2, -0.04], [0.37, 0.06], [0.45, 0.3], [0.42, 0.6], [0.3, 0.8], [0.14, 0.86], [0, 0.88], [-0.14, 0.86], [-0.3, 0.8]] });
      S.push({ name: 'bun', fill: 'hair', layer: 38.2, pts: circle(0, 0.68, 0.2, 0.17) });
      S.push({ line: [[-0.14, 0.62], [0, 0.56], [0.14, 0.64]], w: 0.012, layer: 38.3 });
      S.push({ line: [[-0.12, 0.74], [0.02, 0.8], [0.15, 0.72]], w: 0.012, layer: 38.3 });
    }
    return S;
  },
  long(v) {                 // loose, past the shoulders, centre-parted
    const S = [];
    const ends = (x0, x1, y, n) => { const p = []; for (let i = 0; i <= n; i++) p.push([lerp(x0, x1, i / n), y + (i % 2 ? -0.09 : 0.02), 1]); return p; };
    if (v === 'front') {
      S.push({ name: 'hair back', fill: 'hair', layer: 3, pts: [[-0.55, 1.9], [-0.6, 1.0], [-0.5, 0.2], [0, -0.07], [0.5, 0.2], [0.6, 1.0], [0.55, 1.9], ...ends(0.5, -0.5, 1.98, 8)] });
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.42, 0.7, 1], [-0.45, 0.3], [-0.36, 0.06], [-0.18, -0.04], [0, -0.06], [0.18, -0.04], [0.36, 0.06], [0.45, 0.3], [0.42, 0.7, 1], [0.37, 0.45], [0.27, 0.27], [0.12, 0.17], [0, 0.12, 1], [-0.12, 0.17], [-0.27, 0.27], [-0.37, 0.45]] });
      for (const s of [-1, 1]) S.push({ name: 'front lock', fill: 'hair', layer: 40, side: s < 0 ? 'R' : 'L', pts: tube([[s * 0.4, 0.5, 0.05], [s * 0.45, 1.0, 0.09], [s * 0.42, 1.5, 0.09], [s * 0.45, 1.85, 0.02]], 'flat', 'round') });
    } else if (v === 'side') {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.36, 0.28], [-0.32, 0.07], [-0.12, -0.05], [0.14, -0.06], [0.38, 0.05], [0.52, 0.3], [0.56, 0.8], [0.62, 1.4], [0.6, 1.9, 1], [0.48, 1.8], [0.38, 1.95, 1], [0.3, 1.6], [0.22, 1.2], [0.14, 0.95], [0.04, 0.75], [-0.02, 0.5], [-0.16, 0.36]] });
    } else {
      S.push({ name: 'hair', fill: 'hair', layer: 38, pts: [[-0.55, 1.9], [-0.6, 1.0], [-0.5, 0.2], [-0.25, -0.05], [0, -0.07], [0.25, -0.05], [0.5, 0.2], [0.6, 1.0], [0.55, 1.9], ...ends(0.5, -0.5, 1.98, 10)] });
      S.push({ line: [[0, 0.1], [0.02, 0.9], [-0.02, 1.7]], w: 0.012, layer: 38.1 });
    }
    return S;
  },
};
function Hair(c) {
  const style = HAIR_STYLES[c.spec.hair?.style] || HAIR_STYLES.spiky;
  for (const s of style(c.view, c)) c.add(s);
}

/* =====================================================================
   CLOTHING
   ===================================================================== */
function topHem(t) { return { crop: 2.55, waist: 2.95, hip: 3.35, knee: 3.4 }[t.length || 'waist']; }

function Top(c) {
  const { spec, R, view, add } = c, t = spec.top; if (!t) return;
  const e = 0.025, hem = topHem(t);
  let secs = R.secs.filter(s => s.y < hem).map(s => ease(s, e));
  secs.push(ease(R.sec(hem), e + 0.01));
  if (t.type === 'sleeveless' && view !== 'side') {
    secs = secs.map(s => s.y < 1.8 ? { ...s, w: Math.min(s.w, s.y < 1.4 ? 0.3 : s.y < 1.58 ? 0.44 : 0.52) } : s);
  }
  if (t.type === 'armor') secs = secs.map(s => ({ ...s, w: s.w + 0.03, zf: s.zf + 0.03 }));
  add({ name: 'top', fill: 'top', layer: 26, pts: secPts(view, secs) });
  // front closure + seams
  if (view === 'front' && t.closure === 'diagonal') {
    add({ line: [[-0.02, 1.27], [0.14, 1.36], [0.3, 1.5], [0.4, 1.66]], w: 0.03, layer: 26.5, color: 'topTrim', outline: true });
    add({ line: [[0.4, 1.66], [0.42, 1.9], [0.38, 2.4], [0.36, hem - 0.02]], w: 0.012, layer: 26.5 });
  }
  if (view === 'front' && t.closure === 'center') add({ line: [[0, 1.28], [0, hem - 0.02]], w: 0.014, layer: 26.5 });
  if (view === 'front' && t.closure === 'frogs') {
    add({ line: [[-0.02, 1.27], [0.14, 1.36], [0.3, 1.5], [0.4, 1.66], [0.42, 1.9], [0.38, 2.4], [0.36, hem - 0.02]], w: 0.014, layer: 26.5 });
    for (const y of [1.75, 2.0, 2.25]) add({ line: [[0.33, y], [0.5, y]], w: 0.03, layer: 26.6 });
  }
  if (view === 'front' && R.F && (spec.body.bust ?? 0.5) > 0.2) {
    add({ line: [[-0.38, 2.2], [-0.24, 2.25], [-0.1, 2.2]], w: 0.009, layer: 26.4 });
    add({ line: [[0.1, 2.2], [0.24, 2.25], [0.38, 2.2]], w: 0.009, layer: 26.4 });
  }
  if (view === 'back') add({ line: [[0, 1.4], [0.01, 2.0], [0, hem - 0.05]], w: 0.009, layer: 26.4 });
  if (view === 'side' && R.F) add({ line: [[-0.2, 1.7], [-0.4, 2.1], [-0.25, 2.33]], w: 0.009, layer: 26.4 });
  if (t.type === 'armor') {
    const ys = [1.95, 2.3, 2.65];
    for (const y of ys) { const s = R.sec(y); const w = view === 'side' ? null : s.w + 0.05; add({ line: view === 'side' ? [[-s.zf - 0.05, y], [s.zb + 0.03, y + 0.02]] : [[-w, y], [w, y]], w: 0.012, layer: 26.4 }); }
    if (view !== 'side') add({ line: [[-0.2, 1.3], [0.2, 1.3]], w: 0.024, layer: 26.6, color: 'topTrim', outline: true });
  }
  // collar
  const col = t.collar || 'mandarin';
  if (col !== 'none') {
    const hgt = col === 'high' ? 0.25 : 0.18, y0 = 1.27 - hgt;
    if (view === 'side') add({ name: 'collar', fill: 'top', layer: 30, pts: [[-0.19, y0 + 0.04, 1], [0.18, y0 - 0.03, 1], [0.22, 1.28, 1], [-0.2, 1.34, 1]] });
    else if (view === 'front') {
      for (const s of [-1, 1]) add({ name: 'collar', fill: 'top', layer: 30, pts: [[s * 0.025, y0 + 0.03, 1], [s * 0.2, y0, 1], [s * 0.225, 1.29, 1], [s * 0.035, 1.31, 1]] });
      add({ line: [[-0.2, y0 + 0.012], [-0.03, y0 + 0.04]], w: 0.022, layer: 30.2, color: 'topTrim', outline: true });
      add({ line: [[0.03, y0 + 0.04], [0.2, y0 + 0.012]], w: 0.022, layer: 30.2, color: 'topTrim', outline: true });
    } else add({ name: 'collar', fill: 'top', layer: 30, pts: [[-0.2, y0, 1], [0.2, y0, 1], [0.225, 1.31, 1], [-0.225, 1.31, 1]] });
  }
  // tunic skirt (long tops)
  if (t.length === 'knee') TunicSkirt(c, hem);
}

function TunicSkirt(c, top) {
  const { R, view, add, rnd } = c, hem = R.knee + 0.05, hp = R.secs[8].w + 0.06;
  if (view === 'front') {
    add({ name: 'tunic back panel', fill: 'skirtInner', layer: 9, pts: [[-0.25, 3.5, 1], [0.25, 3.5, 1], [0.38, hem + 0.1, 1], [-0.3, hem, 1]] });
    add({ name: 'tunic skirt', fill: 'top', layer: 27, pts: [[-hp + 0.02, top - 0.02, 1], [hp - 0.02, top - 0.02, 1], [hp + 0.08, 3.9], [hp + 0.2, hem + 0.25, 1], [hp - 0.05, hem - 0.05], [0.3, hem - 0.2, 1], [0.05, 3.85, 1], [-0.05, hem - 0.05, 1], [-hp - 0.05, hem - 0.1, 1], [-hp - 0.02, 3.7]] });
    add({ line: [[0.05, 3.85], [0.07, 3.3], [0.25, top]], w: 0.012, layer: 27.1 });
  } else if (view === 'side') {
    add({ name: 'tunic skirt', fill: 'top', layer: 27, pts: [[-0.31, top - 0.02, 1], [0.38, top - 0.02, 1], [0.55, 3.8], [0.85, hem + 0.2, 1], [0.6, hem + 0.35, 1], [0.35, hem + 0.05], [0.0, 4.0], [-0.33, 3.75, 1]] });
    add({ name: 'tunic lining', fill: 'skirtInner', layer: 27.2, pts: [[0.1, 4.25], [0.4, 4.4], [0.62, hem + 0.33, 1], [0.35, hem + 0.12]] });
  } else {
    add({ name: 'tunic skirt', fill: 'top', layer: 27, pts: [[-hp + 0.02, top - 0.02, 1], [hp - 0.02, top - 0.02, 1], [hp + 0.05, 3.9], [hp + 0.1, hem, 1], [0.05, hem + 0.1, 1], [0.02, 3.9, 1], [-0.02, 3.9, 1], [-0.1, hem + 0.05, 1], [-hp - 0.2, hem + 0.3, 1], [-hp - 0.08, 3.8]] });
  }
}

function Sleeves(c) {
  const { spec, R, add } = c, t = spec.top, kind = spec.sleeves || 'none'; if (!t || kind === 'none' || t.type === 'sleeveless') return;
  for (const s of [-1, 1]) {
    const A = R.arm(s), W = R.armW, side = s < 0 ? 'R' : 'L', e = 0.035;
    const endT = { short: 0.45, rolled: 0.85, long: 1 }[kind];
    const chain = [[A.S, W.sh + e], [along(A.S, A.E, 0.45), W.up + e]];
    if (endT >= 0.85) chain.push([A.E, W.el + e + 0.02]);
    if (kind === 'long') chain.push([along(A.E, A.W, 0.5), W.fo + e], [A.W, W.wr + e]);
    const stop = kind === 'long' ? A.W : kind === 'rolled' ? along(A.E, A.W, 0.12) : along(A.S, A.E, endT);
    chain.push([stop, (kind === 'long' ? W.wr : W.el) + e + 0.03]);
    add({ name: 'sleeve', side, fill: 'top', layer: 31, pts: limb(c, chain, ['round', 'flat']) });
    if (kind === 'rolled') {
      const a = along(A.E, A.W, 0.0), b = along(A.E, A.W, 0.2);
      add({ name: 'rolled cuff', side, fill: 'topTrim', layer: 31.5, pts: limb(c, [[a, W.el + 0.06], [b, W.fo + 0.055]], ['flat', 'flat']) });
    }
    if (kind === 'short' || kind === 'long') {
      const a = along(stop, A.S, 0.0), b = kind === 'long' ? along(A.W, A.E, 0.12) : along(A.S, A.E, endT - 0.06);
      add({ name: 'cuff', side, fill: 'topTrim', layer: 31.5, pts: limb(c, [[b, (kind === 'long' ? W.wr + 0.06 : W.up + 0.05)], [a, (kind === 'long' ? W.wr + 0.06 : W.up + 0.05)]], ['flat', 'flat']) });
    }
    // fold lines
    const p = c.P(along(A.S, A.E, 0.55));
    add({ line: [[p[0] - 0.05, p[1] - 0.12], [p[0] - 0.03, p[1]], [p[0] - 0.06, p[1] + 0.1]], w: 0.01, layer: 31.6, side });
  }
}

function Armwear(c) {
  const { spec, R, add } = c, a = spec.arms || {};
  for (const s of [-1, 1]) {
    const A = R.arm(s), W = R.armW, side = s < 0 ? 'R' : 'L';
    if (a.armbands) {
      const p0 = along(A.S, A.E, 0.4), p1 = along(A.S, A.E, 0.7);
      add({ name: 'armband', side, fill: 'armwear', layer: 32, pts: limb(c, [[p0, W.up + 0.03], [p1, W.up + 0.02]], ['flat', 'flat']) });
      for (const t of [0.43, 0.67]) { const q0 = along(A.S, A.E, t - 0.02), q1 = along(A.S, A.E, t + 0.02); add({ name: 'armband trim', side, fill: 'armTrim', layer: 32.1, pts: limb(c, [[q0, W.up + 0.035], [q1, W.up + 0.03]], ['flat', 'flat']) }); }
    }
    if (a.gauntlets) {
      const p0 = along(A.E, A.W, 0.12), p1 = A.W, p2 = along(A.W, A.Hd, 0.35);
      add({ name: 'gauntlet', side, fill: 'armwear', layer: 33, pts: limb(c, [[p0, W.fo + 0.03], [along(A.E, A.W, 0.5), W.fo + 0.025], [p1, W.wr + 0.03], [p2, 0.095]], ['flat', 'flat']) });
      const q0 = along(A.E, A.W, 0.12), q1 = along(A.E, A.W, 0.2);
      add({ name: 'gauntlet trim', side, fill: 'armTrim', layer: 33.1, pts: limb(c, [[q0, W.fo + 0.035], [q1, W.fo + 0.035]], ['flat', 'flat']) });
    }
    if (a.bracers) {
      const p0 = along(A.E, A.W, 0.35), p1 = along(A.E, A.W, 0.95);
      add({ name: 'bracer', side, fill: 'armwear', layer: 33, pts: limb(c, [[p0, W.fo + 0.035], [p1, W.wr + 0.04]], ['flat', 'flat']) });
      add({ line: [c.P(along(A.E, A.W, 0.65)), c.P(along(A.E, A.W, 0.66))].map((p, i) => [p[0] + (i ? 0.09 : -0.09), p[1]]), w: 0.02, layer: 33.1, color: 'armTrim', outline: true, side });
    }
    if (a.gloves) {
      const p0 = along(A.E, A.W, 0.8), p1 = along(A.W, A.Hd, 0.15);
      add({ name: 'glove cuff', side, fill: 'armwear', layer: 35, pts: limb(c, [[p0, W.wr + 0.045], [p1, W.wr + 0.04]], ['flat', 'flat']) });
    }
  }
}

function Pants(c) {
  const { spec, R, view, add } = c, p = spec.pants || { type: 'baggy' };
  const bootTop = footTop(spec, R);
  // seat
  const seat = [R.sec(3.0), R.sec(3.18), R.sec(3.5)].map(s => ease(s, 0.03));
  add({ name: 'pants seat', fill: 'pants', layer: 20, pts: secPts(view, seat) });
  for (const s of [-1, 1]) {
    const L = R.leg(s), W = R.legW, side = s < 0 ? 'R' : 'L';
    let chain, caps = ['flat', 'flat'];
    const top = [[L.Hp[0] * 0.8, 3.02, L.Hp[2] * 0.5], W.hip + 0.02];
    if (p.type === 'baggy') {
      const yEnd = bootTop + 0.1;
      const end = along(L.K, L.A, (yEnd - L.K[1]) / (L.A[1] - L.K[1]));
      const puff = along(L.K, L.A, (yEnd - 0.25 - L.K[1]) / (L.A[1] - L.K[1]));
      chain = [top, [L.Hp, W.hip + 0.07], [along(L.Hp, L.K, 0.5), 0.35], [L.K, 0.33], [puff, 0.38], [end, 0.3]];
      caps = ['flat', 'round'];
    } else if (p.type === 'knickers') {
      const end = along(L.K, L.A, 0.22);
      chain = [top, [L.Hp, W.hip + 0.06], [along(L.Hp, L.K, 0.5), 0.32], [L.K, 0.3], [along(L.K, L.A, 0.12), 0.29], [end, 0.21]];
      caps = ['flat', 'round'];
    } else {
      const end = along(L.K, L.A, (bootTop + 0.05 - L.K[1]) / (L.A[1] - L.K[1]));
      chain = [top, [L.Hp, W.hip + 0.04], [along(L.Hp, L.K, 0.5), W.th + 0.04], [L.K, W.kn + 0.05], [along(L.K, L.A, 0.3), W.ca + 0.04], [end, W.an + 0.06]];
    }
    add({ name: 'pants leg', side, fill: 'pants', layer: 21, pts: limb(c, chain, caps) });
    // folds
    const k = c.P(L.K), d = view === 'side' ? -1 : s;
    add({ line: [[k[0] - d * 0.12, k[1] - 0.25], [k[0] - d * 0.02, k[1] - 0.05], [k[0] + d * 0.1, k[1] + 0.05]], w: 0.011, layer: 21.2, side });
    if (p.type !== 'fitted') add({ line: [[k[0] + d * 0.15, k[1] + 0.3], [k[0] + d * 0.02, k[1] + 0.42], [k[0] - d * 0.12, k[1] + 0.45]], w: 0.011, layer: 21.2, side });
  }
}

function footTop(spec, R) {
  const f = spec.feet?.type || 'boots';
  return { furBoots: lerp(R.knee, R.ankle, 0.42), boots: lerp(R.knee, R.ankle, 0.2), wraps: R.knee + 0.3, shoes: R.ankle - 0.05, armoredBoots: R.knee + 0.05 }[f];
}

function footShape(c, L) {
  const { view, P } = c, A = P(L.A), G = L.G;
  if (view === 'side') {
    const x = A[0];
    return [[x + 0.12, A[1] - 0.05], [x + 0.17, G - 0.12], [x + 0.13, G, 1], [x - 0.45, G], [x - 0.68, G - 0.04], [x - 0.6, G - 0.15], [x - 0.3, G - 0.22], [x - 0.12, A[1] - 0.05]];
  }
  const s = view === 'front' ? Math.sign(L.A[0]) : -Math.sign(L.A[0]), x = A[0], o = view === 'front' ? s * 0.06 : 0;
  if (view === 'back') return [[x - 0.12, A[1] - 0.05], [x + 0.12, A[1] - 0.05], [x + 0.15, G - 0.12], [x + 0.12, G, 1], [x - 0.12, G, 1], [x - 0.15, G - 0.12]];
  return [[x - 0.13, A[1] - 0.05], [x + 0.13, A[1] - 0.05], [x + 0.18 + o, G - 0.13], [x + 0.15 + o * 1.5, G, 1], [x - 0.13 + o * 1.5, G, 1], [x - 0.18 + o, G - 0.13]];
}

function Footwear(c) {
  const { spec, R, view, add, rnd } = c, f = spec.feet?.type || 'boots';
  const top = footTop(spec, R);
  for (const s of [-1, 1]) {
    const L = R.leg(s), W = R.legW, side = s < 0 ? 'R' : 'L';
    const tKnee = y => along(L.K, L.A, (y - L.K[1]) / (L.A[1] - L.K[1]));
    const shoe = f === 'wraps' || f === 'shoes' ? 'shoes' : 'boots';
    add({ name: 'foot', side, fill: 'boots', layer: 24.7, pts: footShape(c, L) });
    if (f === 'furBoots' || f === 'boots' || f === 'armoredBoots') {
      const ww = f === 'furBoots' ? 0.25 : 0.215;
      add({ name: 'boot shaft', side, fill: 'boots', layer: 24.5, pts: limb(c, [[tKnee(top), ww], [tKnee(lerp(top, L.A[1], 0.5)), ww - 0.03], [L.A, W.an + 0.08], [[L.A[0], L.A[1] + 0.12, L.A[2]], W.an + 0.09]], ['flat', 'flat']) });
      if (f === 'furBoots') {
        const a = c.P(tKnee(top - 0.04)), b = c.P(tKnee(top + 0.12));
        const w0 = ww + 0.03;
        add({ name: 'fur cuff', side, fill: 'fur', layer: 25, pts: [[a[0] - w0, a[1], 1], [a[0] + w0, a[1], 1], [b[0] + w0 + 0.01, b[1], 1], [b[0] + w0 * 0.5, b[1] + 0.06, 1], [b[0] + 0.03, b[1] - 0.02, 1], [b[0] - w0 * 0.3, b[1] + 0.07, 1], [b[0] - w0 - 0.01, b[1] + 0.01, 1]] });
        const m = c.P(tKnee(lerp(top, L.A[1], 0.55)));
        add({ line: [[m[0] - ww + 0.02, m[1]], [m[0] + ww - 0.04, m[1] + 0.03]], w: 0.01, layer: 25.1, side });
      }
      if (f === 'armoredBoots') {
        const k = c.P(L.K);
        add({ name: 'knee guard', side, fill: 'bootTrim', layer: 25, pts: [[k[0] - 0.17, k[1] - 0.12, 1], [k[0] + 0.17, k[1] - 0.12, 1], [k[0] + 0.14, k[1] + 0.12], [k[0], k[1] + 0.2, 1], [k[0] - 0.14, k[1] + 0.12]] });
        add({ line: [[k[0] - 0.15, k[1] + 0.35], [k[0] + 0.15, k[1] + 0.35]], w: 0.012, layer: 25.1 });
        add({ line: [[k[0] - 0.14, k[1] + 0.6], [k[0] + 0.14, k[1] + 0.6]], w: 0.012, layer: 25.1 });
      }
    }
    if (f === 'wraps') {
      add({ name: 'leg wraps', side, fill: 'bootTrim', layer: 22.5, pts: limb(c, [[tKnee(top - 0.06), W.ca + 0.05], [tKnee(lerp(top, L.A[1], 0.45)), W.ca + 0.03], [L.A, W.an + 0.045], [[L.A[0], L.A[1] + 0.1, L.A[2]], W.an + 0.05]], ['flat', 'flat']) });
      for (let k = 1; k < 5; k++) { const y = lerp(top, L.A[1], k / 5); const p = c.P(tKnee(y)), w = lerp(W.ca + 0.04, W.an + 0.04, k / 5); add({ line: [[p[0] - w, p[1]], [p[0] + w, p[1] + 0.06]], w: 0.008, layer: 22.6, side }); }
    }
  }
}

function Skirt(c) {
  const { spec, R, view, add, rnd } = c, k = spec.skirt?.type || 'none'; if (k === 'none') return;
  const wa = R.secs[7].w + 0.06, hp = R.secs[8].w + 0.08;
  if (k === 'pelt') {
    const hem = 3.62;
    if (view === 'front') {
      add({ name: 'apron', fill: 'skirtInner', layer: 26.8, pts: [[-0.2, 2.86, 1], [0.2, 2.86, 1], [0.24, 3.4], [0.16, hem + 0.05, 1], [0, hem + 0.12, 1], [-0.16, hem + 0.05, 1], [-0.24, 3.4]] });
      for (const s of [-1, 1]) {
        const side = s < 0 ? 'R' : 'L';
        const panel = [[s * 0.1, 2.86, 1], [s * wa, 2.86, 1], [s * (hp + 0.02), 3.3], [s * (hp + 0.1), hem + 0.12, 1], [s * 0.2, hem - 0.08, 1], [s * 0.15, 3.2]];
        add({ name: 'pelt panel', side, fill: 'skirt', layer: 27, pts: panel });
        add({ name: 'fur', side, fill: 'fur', layer: 27.2, pts: furStrip([[s * 0.16, 3.25], [s * 0.2, hem - 0.08], [s * (hp + 0.1), hem + 0.12]], 0.06, rnd, -s) });
      }
    } else if (view === 'side') {
      add({ name: 'pelt', fill: 'skirt', layer: 27, pts: [[-0.33, 2.86, 1], [0.32, 2.86, 1], [0.48, 3.3], [0.55, 3.95, 1], [0.1, 3.7], [-0.25, 3.6, 1], [-0.36, 3.2]] });
      add({ name: 'fur', fill: 'fur', layer: 27.2, pts: furStrip([[-0.25, 3.6], [0.1, 3.7], [0.55, 3.95]], 0.06, rnd, -1) });
    } else {
      add({ name: 'pelt', fill: 'skirt', layer: 27, pts: [[-wa, 2.86, 1], [wa, 2.86, 1], [hp + 0.05, 3.3], [hp + 0.1, 3.7, 1], [0, 3.98, 1], [-hp - 0.1, 3.7, 1], [-hp - 0.05, 3.3]] });
      add({ name: 'fur', fill: 'fur', layer: 27.2, pts: furStrip([[-hp - 0.1, 3.7], [0, 3.98], [hp + 0.1, 3.7]], 0.06, rnd, -1) });
    }
  }
  if (k === 'tassets') {
    const y0 = 2.95, y1 = 3.75;
    if (view === 'side') {
      add({ name: 'tasset', fill: 'top', layer: 27, pts: [[-0.33, y0, 1], [0.36, y0, 1], [0.44, y1, 1], [-0.38, y1 - 0.05, 1]] });
      add({ line: [[-0.36, 3.35], [0.4, 3.37]], w: 0.012, layer: 27.1 });
    } else {
      for (const x of [-1, 0, 1]) {
        const cx = x * 0.32, w = 0.17;
        add({ name: 'tasset', fill: 'top', layer: 27 + (x === 0 ? 0.1 : 0), pts: [[cx - w, y0, 1], [cx + w, y0, 1], [cx + w * 1.15 + x * 0.04, y1, 1], [cx - w * 1.15 + x * 0.04, y1, 1]] });
        add({ line: [[cx - w * 1.07, 3.35], [cx + w * 1.07, 3.35]], w: 0.012, layer: 27.15 });
      }
    }
  }
}

function Waist(c) {
  const { spec, R, view, add } = c, w = spec.waist?.type || 'none'; if (w === 'none') return;
  const s0 = ease(R.sec(2.76), 0.05), s1 = ease(R.sec(2.94), 0.06);
  add({ name: w, fill: 'waist', layer: 28, pts: secPts(view, [s0, s1]) });
  if (w === 'sash') {
    if (view === 'front') {
      add({ name: 'sash knot', fill: 'waist', layer: 28.3, pts: [[-0.08, 2.78, 1], [0.08, 2.78, 1], [0.1, 2.95, 1], [-0.1, 2.95, 1]] });
      add({ name: 'sash tie', fill: 'waist', layer: 28.2, pts: [[-0.07, 2.92, 1], [0.0, 2.92, 1], [-0.03, 3.6, 1], [-0.1, 3.55, 1]] });
      add({ name: 'sash tie', fill: 'waist', layer: 28.25, pts: [[0.0, 2.92, 1], [0.08, 2.92, 1], [0.1, 3.5, 1], [0.03, 3.53, 1]] });
      add({ line: [[-0.05, 3.0], [-0.06, 3.5]], w: 0.008, layer: 28.4 });
    } else if (view === 'side') {
      add({ name: 'sash tie', fill: 'waist', layer: 28.2, pts: [[-0.34, 2.9, 1], [-0.27, 2.9, 1], [-0.3, 3.55, 1], [-0.37, 3.5, 1]] });
    }
  }
  if (w === 'buckle' && view === 'front') add({ name: 'buckle', fill: 'waistTrim', layer: 28.5, pts: [[-0.08, 2.75, 1], [0.08, 2.75, 1], [0.08, 2.96, 1], [-0.08, 2.96, 1]] });
  if (w === 'medallion' && view === 'front') add({ name: 'medallion', fill: 'waistTrim', layer: 28.5, pts: circle(0, 2.85, 0.065, 0.06) });
}

function Scarf(c) {
  const { spec, view, add } = c; if (!spec.scarf) return;
  if (view === 'front') {
    add({ name: 'scarf', fill: 'scarf', layer: 36, pts: [[-0.32, 1.22], [0, 1.18], [0.32, 1.22], [0.42, 1.32], [0.36, 1.48], [0.1, 1.55], [-0.2, 1.52], [-0.4, 1.4]] });
    add({ name: 'scarf end', fill: 'scarf', layer: 36.1, pts: [[0.12, 1.4], [0.34, 1.38], [0.36, 1.8], [0.34, 2.25, 1], [0.15, 2.25, 1], [0.14, 1.8]] });
    add({ line: [[0.24, 1.6], [0.25, 2.1]], w: 0.01, layer: 36.2 });
  } else if (view === 'side') {
    add({ name: 'scarf', fill: 'scarf', layer: 36, pts: [[-0.3, 1.25], [0.0, 1.16], [0.3, 1.18], [0.4, 1.32], [0.3, 1.45], [-0.05, 1.5], [-0.32, 1.45]] });
    add({ name: 'scarf end', fill: 'scarf', layer: 36.1, pts: [[-0.36, 1.35], [-0.22, 1.38], [-0.24, 1.8], [-0.26, 2.2, 1], [-0.42, 2.17, 1], [-0.42, 1.8]] });
  } else {
    add({ name: 'scarf', fill: 'scarf', layer: 36, pts: [[-0.38, 1.3], [-0.2, 1.2], [0.2, 1.2], [0.38, 1.3], [0.36, 1.45], [0, 1.52], [-0.36, 1.45]] });
  }
}

/* =====================================================================
   RENDERER
   ===================================================================== */
function pathFrom(g, pts, closed) {
  const n = pts.length; if (n < 2) return;
  const t = 0.5, P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const tan = i => { const p = P(i); if (p[2] || (!closed && (i === 0 || i === n - 1))) return [0, 0]; const a = P(i - 1), b = P(i + 1); return [(b[0] - a[0]) * t / 3, (b[1] - a[1]) * t / 3]; };
  g.moveTo(pts[0][0], pts[0][1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const a = P(i), b = P(i + 1), ta = tan(i), tb = tan(i + 1); g.bezierCurveTo(a[0] + ta[0], a[1] + ta[1], b[0] - tb[0], b[1] - tb[1], b[0], b[1]); }
  if (closed) g.closePath();
}

function drawView(g, spec, view, opts = {}) {
  const pal = spec.palette, shapes = build(spec, view), lw = opts.lineWidth ?? 0.022;
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const s of shapes) {
    if (s.custom) { s.custom(g, pal); continue; }
    if (s.line) {
      g.beginPath(); pathFrom(g, s.line, false);
      if (s.outline) { g.strokeStyle = pal.ink; g.lineWidth = s.w + lw * 1.1; g.stroke(); }
      g.strokeStyle = s.color ? pal[s.color] : pal.ink; g.lineWidth = s.w; g.stroke();
      continue;
    }
    const col = pal[s.fill] || '#ff00ff';
    const path = new Path2D(); pathFrom(path, s.pts, true);
    g.fillStyle = col; g.fill(path);
    if (opts.shading && s.shade !== false) {     // cel shadow: crescent on the side away from the light
      g.save(); g.clip(path);
      g.fillStyle = shadeColor(col); g.fill(path);
      g.translate(-0.055, -0.02); g.fillStyle = col; g.fill(path);
      g.restore();
    }
    g.strokeStyle = pal.ink; g.lineWidth = s.lw ?? lw; g.stroke(path);
  }
  return shapes;
}
