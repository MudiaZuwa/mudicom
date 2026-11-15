/* =====================================================================
   ORIGINAL-CHARACTER GENERATOR  (front view)
   ---------------------------------------------------------------------
   Draws new characters from rules measured on the traced references —
   not by reusing their parts.

   Units: 1 = one head (crown -> chin). x = 0 is the body centre line,
   y = 0 the crown, y grows downward, ground at body.heads (~7.2).

   STYLE RULES (measured, see style/README.md)
   - every form is its own closed shape: flat base + one cel shadow + thin ink outline
   - light from the viewer's upper right: the shadow is a crescent on the
     viewer-left / lower edge of each form, plus bands under overlaps (collar, hems, jaw)
   - shadow colour: same hue and chroma, lightness lower by ~16 (skin) or 7 + 0.08*L (cloth)
   - outline ~0.011 head, interior lines ~0.007 head
   - proportions (Korra front): crown->chin 1, eyes 0.56, mouth 0.83, shoulders 1.6 wide,
     waist 0.95 wide, elbow ~2.6, wrist ~3.8, knee ~5.5, boot 1.1 tall, ground ~7.2
   ===================================================================== */
const GEN = (() => {
  const { sp, shape, line } = LOK;

  /* ---------- colour ---------- */
  const h2r = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const r2h = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function r2lab([r, g, b]) {
    const f0 = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; const R = f0(r), G = f0(g), B = f0(b);
    const X = (R * .4124 + G * .3576 + B * .1805) / .95047, Y = R * .2126 + G * .7152 + B * .0722, Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
    const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function lab2r([L, a, b]) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, inv = t => t ** 3 > .008856 ? t ** 3 : (t - 16 / 116) / 7.787;
    const X = inv(fx) * .95047, Y = inv(fy), Z = inv(fz) * 1.08883, g = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055);
    return [g(X * 3.2406 - Y * 1.5372 - Z * .4986), g(-X * .9689 + Y * 1.8758 + Z * .0415), g(X * .0557 - Y * .204 + Z * 1.057)];
  }
  // measured: skin drops ~16 L, cloth 7 + 0.08 L, near-whites ~13
  function shade(hex, kind) {
    const c = r2lab(h2r(hex)); const L = c[0];
    const d = kind === 'skin' ? 16 : L > 85 ? 13 : 7 + 0.08 * L;
    return r2h(lab2r([Math.max(3, L - d), c[1] * 1.02, c[2] * 1.02]));
  }

  /* ---------- geometry helpers ---------- */
  const mir = pts => pts.map(p => [-p[0], p[1], ...p.slice(2)]);
  const sym = half => [...half, ...mir(half.slice(0, -1)).reverse().slice(0, -0 || undefined)].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  // symmetric closed outline from a right-side half running top-centre -> bottom-centre
  const closedSym = half => { const r = half, l = mir(half).reverse(); return [...r, ...l.slice(1, -1)]; };
  // tapered tube along a spine [[x,y,halfWidth],...] -> outline points (flat ends are sharp)
  function tube(spine, roundEnd = true, roundStart = false) {
    const L = [], R = [];
    for (let i = 0; i < spine.length; i++) {
      const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const [x, y, w] = spine[i];
      L.push([x - dy * w, y + dx * w]); R.push([x + dy * w, y - dx * w]);
    }
    const e = spine.length - 1;
    if (!roundEnd) { L[e].push(1); R[e].push(1); }
    if (!roundStart) { L[0].push(1); R[0].push(1); }
    const out = [...L];
    if (roundEnd) { const [x, y, w] = spine[e], a = spine[e - 1]; let dx = x - a[0], dy = y - a[1]; const l = Math.hypot(dx, dy); out.push([x + dx / l * w * 0.9, y + dy / l * w * 0.9]); }
    out.push(...R.reverse());
    if (roundStart) { const [x, y, w] = spine[0], a = spine[1]; let dx = x - a[0], dy = y - a[1]; const l = Math.hypot(dx, dy); out.push([x + dx / l * w * 0.9, y + dy / l * w * 0.9]); }
    return out;
  }
  // pointed hair clumps along a path from a to b (tips hang toward +n side)
  function tips(a, b, n, depth, rnd, sweep = 0) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      if (i < n) {
        const m = (i + 0.5) / n, mx = a[0] + (b[0] - a[0]) * m, my = a[1] + (b[1] - a[1]) * m;
        pts.push([x, y, 1]);
        pts.push([mx + sweep * depth, my + depth * (0.75 + rnd() * 0.5), 1]);
      } else pts.push([x, y, 1]);
    }
    return pts;
  }

  /* ---------- the drawing primitive: a form ----------
     base fill, cel shadow crescent (lit copy shifted toward the light), extra shadow shapes, outline */
  function form(g, ctx, pts, base, o = {}) {
    const p = shape(pts);
    g.fillStyle = base; g.fill(p);
    const sh = o.shadow || shade(base, o.kind);
    g.save(); g.clip(p);
    if (o.crescent !== false) {
      const [dx, dy] = o.crescent || [0.05, -0.03];
      g.fillStyle = sh; g.fill(p);
      g.save(); g.translate(dx, dy); g.fillStyle = base; g.fill(p); g.restore();
    }
    for (const s of o.shadows || []) { g.fillStyle = sh; g.fill(shape(s)); }
    g.restore();
    if (o.outline !== false) { g.strokeStyle = ctx.ink; g.lineWidth = o.lw || ctx.lw; g.lineJoin = 'round'; g.stroke(p); }
    return p;
  }

  /* =================================================================
     RIG — measured proportions, scaled by the body parameters
     ================================================================= */
  function rig(b) {
    const F = b.female ? 1 : 0;
    const sh = (F ? 0.64 : 0.84) * b.shoulders, wa = (F ? 0.36 : 0.46) * b.waist, hp = (F ? 0.5 : 0.47) * b.hips;
    const legLen = (F ? 4.5 : 5.0) * b.legs;   // measured: women ~7.8 heads tall, men ~8.3
    const R = {
      F, sh, wa, hp, eyes: 0.56, chin: 1.0, neckBase: 1.2, shoulderY: 1.34, chestY: 1.95, waistY: 2.75, hipY: 3.3,
      crotch: 3.3 + 0.3 * legLen, knee: 3.3 + 0.56 * legLen, ankle: 3.3 + 0.88 * legLen, ground: 3.3 + legLen,
    };
    R.armS = s => [s * (sh - 0.08), 1.5];
    R.armE = s => [s * (sh + 0.0 + b.armOut * 0.25), 2.75];
    R.armW = s => [s * (sh + 0.03 + b.armOut * 0.5), 3.95];
    R.legH = s => [s * hp * 0.52, R.hipY + 0.2];
    R.legK = s => [s * (hp * 0.62 + b.stance * 0.3), R.knee];
    R.legA = s => [s * (hp * 0.66 + b.stance * 0.55), R.ankle];
    const mw = 1 + (b.muscle - 0.5) * 0.3 - F * 0.06;
    R.aw = { s: (F ? 0.125 : 0.155) * mw, e: (F ? 0.09 : 0.11) * mw, w: (F ? 0.065 : 0.08) * mw };
    return R;
  }

  /* =================================================================
     PARTS
     ================================================================= */
  function neckAndHead(g, c) {
    const { R, P, ch } = c, f = ch.face;
    // neck: form, with a shadow band under the jaw (measured: jaw shadow reaches ~0.12 below the jaw line)
    const nw = 0.115 * (R.F ? 0.95 : 1.1);
    form(g, c, [[-nw, 0.75], [nw, 0.75], [nw * 1.05, 1.2], [nw * 1.25, 1.32, 1], [-nw * 1.25, 1.32, 1], [-nw * 1.05, 1.2]], P.skin,
      { kind: 'skin', crescent: false, shadows: [[[-0.3, 0.7], [0.3, 0.7], [0.3, 0.92], [0.12, 1.06], [0, 1.12], [-0.12, 1.06], [-0.3, 0.92]]] });
    // ears (behind the face edge)
    for (const s of [-1, 1]) form(g, c, mir0(s, [[0.27, 0.46], [0.345, 0.43], [0.375, 0.52], [0.36, 0.64], [0.31, 0.72], [0.27, 0.68]]), P.skin, { kind: 'skin', crescent: [0.02, -0.01] });
    // face/head: cranium + measured jaw (Korra: jaw corner ~(0.21,0.84), chin point (0,1.0))
    const jw = f.jaw, cl = f.chin;
    const half = [[0, -0.01], [0.2, 0.02], [0.32, 0.14], [0.345, 0.32], [0.33, 0.5], [0.305, 0.64], [0.21 + 0.06 * jw, 0.82], [0.12 + 0.02 * jw, 0.93 * cl + 0.07 * (1 - cl)], [0.04, 0.99], [0, 1.0, f.pointy ? 1 : 0]];
    const head = closedSym(half);
    form(g, c, head, P.skin, { kind: 'skin', crescent: [0.035, -0.015] });
    // inner ear lines
    for (const s of [-1, 1]) line(g, mir0(s, [[0.33, 0.5], [0.35, 0.56], [0.325, 0.64]]), c.lw * 0.6, c.ink);
    face(g, c);
  }
  const mir0 = (s, pts) => s < 0 ? mir(pts) : pts;

  /* ---------- face: eye/lid/brow geometry measured from frontal close-ups (FACE_TEMPLATES.lok_female),
     re-expressed in head units; variation by parameters ---------- */
  function face(g, c) {
    const { R, P, ch } = c, f = ch.face, T = FACE_TEMPLATES.lok_female;
    const k = 0.00538 * f.eyeSize;                         // template px -> head units (measured on Korra front)
    const sp_ = f.eyeSpacing;
    const eh = R.F ? 1 : 0.78;                              // male eyes: narrower opening
    const tx = (p, s) => [s * ((T.cx - p[0]) * k + (sp_ - 1) * 0.09) * -1 + 0, R.eyes + (p[1] - T.eyeY) * k * (p[1] > T.eyeY ? eh : eh), ...p.slice(2)];
    // tx maps a template point (left eye, measured) to head units; s=-1 left (viewer), +1 right
    const T2 = (pts, s) => pts.map(p => { const x = (p[0] - T.cx) * k, y = (p[1] - T.eyeY) * k * eh; const xx = x - (sp_ - 1) * 0.09; return [s < 0 ? xx : -xx, R.eyes + y, ...p.slice(2)]; });
    for (const s of [-1, 1]) {
      const white = shape(T2(T.white, s));
      g.fillStyle = P.eyeWhite; g.fill(white);
      g.save(); g.clip(white);
      const I = T.iris, ic = T2([I.c], s)[0], ir = I.r * k;
      const look = f.look * 0.012;
      const irisP = new Path2D(); irisP.arc(ic[0] + look, ic[1], ir, 0, 7);
      g.fillStyle = P.iris; g.fill(irisP);
      g.save(); g.clip(irisP); g.fillStyle = shade(P.iris, 'cloth'); g.fillRect(ic[0] - ir * 2, ic[1] - ir * 2, ir * 4, ir * 1.35); g.restore();
      g.strokeStyle = shade(shade(P.iris, 'cloth'), 'cloth'); g.lineWidth = 0.9 * k; g.stroke(irisP);
      g.fillStyle = '#0e1418'; g.beginPath(); g.arc(ic[0] + look, ic[1] - ir * 0.12, I.pr * k, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ic[0] + look - ir * 0.38, ic[1] - ir * 0.45, I.hr * k, 0, 7); g.fill();
      g.restore();
      const lidT = R.F ? 1 : 0.8;
      g.fillStyle = c.ink;
      g.fill(shape(T2(T.upperLid, s).map((p, i, a) => i > a.length / 2 ? [p[0], p[1] + (1 - lidT) * 0.004, ...p.slice(2)] : p)));
      g.fill(shape(T2(T.lowerLid, s)));
      // brow: tapered, thick at the inner end; angle/height/weight are parameters
      const bw = (R.F ? 0.016 : 0.026) * f.brow, by = R.eyes - (R.F ? 0.095 : 0.075) - f.browRaise * 0.02;
      const ix = -0.05 - (sp_ - 1) * 0.05, ox = -0.22 - (sp_ - 1) * 0.07, ang = f.browAngle * 0.03;
      const brow = [[ox, by + 0.012 + ang], [(ix + ox) / 2, by - 0.018], [ix, by + 0.004 - ang, 1], [ix, by + bw - ang, 1], [(ix + ox) / 2, by - 0.018 + bw * 0.8], [ox, by + 0.012 + ang + 0.003, 1]];
      g.fillStyle = P.brow; g.fill(shape(s < 0 ? brow : mir(brow)));
    }
    // nose: bridge stroke on the shadow side + nostrils + tip shadow (measured placement)
    const nl = f.nose, ny = 0.74 + (nl - 1) * 0.03;
    g.fillStyle = shade(P.skin, 'skin'); g.fill(shape([[-0.045, ny - 0.006], [-0.015, ny - 0.016], [0.015, ny - 0.014], [0.045, ny - 0.004], [0.02, ny + 0.012], [-0.025, ny + 0.012]]));
    line(g, [[0.012, 0.62], [0.004, 0.67], [-0.012, ny - 0.02]], 0.007, shade(shade(P.skin, 'skin'), 'skin'));
    for (const s of [-1, 1]) line(g, mir0(-s, [[-0.04, ny - 0.002], [-0.026, ny + 0.004], [-0.012, ny + 0.001]]), 0.008, c.ink2);
    // mouth: one line, slight curve; lower lip hint
    const mw = 0.095 * f.mouth, smile = f.smile * 0.012;
    line(g, [[-mw, 0.835 - smile], [-mw * 0.4, 0.843], [mw * 0.4, 0.843], [mw, 0.835 - smile]], 0.0085, c.ink2);
    line(g, [[-0.035, 0.875], [0.035, 0.875]], 0.0045, shade(shade(P.skin, 'skin'), 'skin'));
  }

  /* ---------- hair: masses with pointed clump tips; back mass behind the head ---------- */
  const HAIR = {
    pixie(g, c, layer) {          // short, choppy, side-swept fringe
      const { P, rnd } = c;
      if (layer === 'back') return form(g, c, [[-0.38, 0.62], [-0.42, 0.3], [-0.33, 0.05], [0, -0.07], [0.33, 0.05], [0.42, 0.3], [0.38, 0.62], ...tips([0.38, 0.62], [-0.38, 0.62], 5, 0.06, rnd)], P.hair, { crescent: false });
      form(g, c, [[-0.39, 0.55, 1], [-0.4, 0.28], [-0.3, 0.06], [-0.1, -0.05], [0.12, -0.05], [0.3, 0.05], [0.4, 0.25], [0.4, 0.5, 1],
        ...tips([0.4, 0.5], [0.12, 0.28], 3, 0.09, rnd, -0.25), ...tips([0.12, 0.28], [-0.25, 0.3], 3, 0.1, rnd, -0.35), [-0.3, 0.4, 1]], P.hair, { crescent: [0.04, -0.04] });
    },
    long(g, c, layer) {           // long and straight, centre parting, curtains
      const { P, rnd } = c;
      if (layer === 'back') return form(g, c, [[-0.46, 2.05], [-0.5, 1.2], [-0.45, 0.25], [0, -0.07], [0.45, 0.25], [0.5, 1.2], [0.46, 2.05], ...tips([0.46, 2.05], [-0.46, 2.05], 6, 0.08, rnd)], P.hair, { crescent: [0.05, 0] });
      form(g, c, [[0, 0.06, 1], [-0.1, 0.1], [-0.26, 0.24], [-0.33, 0.5], [-0.32, 0.95], ...tips([-0.32, 0.95], [-0.44, 0.92], 2, 0.06, rnd), [-0.42, 0.5], [-0.38, 0.12], [-0.2, -0.04], [0, -0.06], [0.2, -0.04], [0.38, 0.12], [0.42, 0.5],
        ...tips([0.44, 0.92], [0.32, 0.95], 2, 0.06, rnd), [0.33, 0.5], [0.26, 0.24], [0.1, 0.1]], P.hair, { crescent: [0.04, -0.03] });
      line(g, [[0, -0.05], [0, 0.06]], c.lw * 0.7, c.ink);
    },
    ponytail(g, c, layer) {       // pulled back, high tail swinging to one side
      const { P, rnd } = c;
      if (layer === 'back') { form(g, c, [[0.12, 0.05], [0.42, 0.2], [0.55, 0.6], [0.52, 1.2], ...tips([0.52, 1.2], [0.3, 1.15], 3, 0.08, rnd), [0.38, 0.6], [0.2, 0.25]], P.hair, { crescent: [0.04, 0] }); return; }
      form(g, c, [[-0.36, 0.52, 1], [-0.37, 0.25], [-0.25, 0.03], [0, -0.05], [0.25, 0.03], [0.37, 0.25], [0.36, 0.52, 1], [0.3, 0.32], [0.18, 0.18], [0.03, 0.13], [-0.12, 0.16], [-0.26, 0.26], [-0.32, 0.38]], P.hair, { crescent: [0.04, -0.03] });
      form(g, c, [[0.14, -0.02, 1], [0.26, 0.0, 1], [0.27, 0.06, 1], [0.15, 0.05, 1]], P.accent, { crescent: false });
      for (const s of [-1, 1]) form(g, c, mir0(s, [[0.33, 0.35], [0.38, 0.5], [0.37, 0.72], ...tips([0.37, 0.72], [0.31, 0.7], 1, 0.05, rnd), [0.32, 0.5]]), P.hair, { crescent: [0.02, 0] });
    },
    undercut(g, c, layer) {       // shaved sides, long top swept over
      const { P, rnd } = c;
      if (layer === 'back') return;
      form(g, c, [[-0.36, 0.45, 1], [-0.36, 0.25], [-0.28, 0.06], [0, -0.03], [0.28, 0.06], [0.36, 0.25], [0.36, 0.45, 1], [0.32, 0.3], [-0.32, 0.3]], shade(P.hair, 'cloth'), { crescent: false });
      form(g, c, [[-0.34, 0.26, 1], [-0.33, 0.04], [-0.15, -0.12], [0.12, -0.13], [0.33, -0.04], [0.42, 0.12], ...tips([0.42, 0.14], [0.05, 0.24], 3, 0.08, rnd, 0.3), [-0.12, 0.2], [-0.25, 0.24]], P.hair, { crescent: [0.04, -0.03] });
    },
    cropped(g, c, layer) {        // very short, follows the skull
      const { P, rnd } = c;
      if (layer === 'back') return;
      form(g, c, [[-0.355, 0.48, 1], [-0.37, 0.25], [-0.28, 0.04], [0, -0.04], [0.28, 0.04], [0.37, 0.25], [0.355, 0.48, 1], [0.32, 0.3], ...tips([0.3, 0.22], [-0.3, 0.22], 6, 0.035, rnd), [-0.32, 0.3]], P.hair, { crescent: [0.03, -0.02] });
    },
    bob(g, c, layer) {            // blunt chin-length bob with straight fringe
      const { P, rnd } = c;
      if (layer === 'back') return form(g, c, [[-0.43, 1.0, 1], [-0.47, 0.5], [-0.4, 0.12], [0, -0.07], [0.4, 0.12], [0.47, 0.5], [0.43, 1.0, 1]], P.hair, { crescent: [0.04, 0] });
      form(g, c, [[-0.43, 1.0, 1], [-0.46, 0.5], [-0.4, 0.12], [-0.2, -0.04], [0, -0.06], [0.2, -0.04], [0.4, 0.12], [0.46, 0.5], [0.43, 1.0, 1], [0.34, 0.98, 1], [0.33, 0.6], [0.32, 0.36, 1],
        ...tips([0.32, 0.36], [-0.32, 0.36], 7, 0.035, rnd), [-0.33, 0.6], [-0.34, 0.98, 1]], P.hair, { crescent: [0.04, -0.03] });
    },
  };

  /* ---------- torso garment ---------- */
  function top(g, c) {
    const { R, P, ch } = c, t = ch.top, F = R.F;
    const hem = { waist: R.waistY + 0.1, hip: R.hipY + 0.2, long: R.knee - 0.2 }[t.length];
    const bust = F ? 0.04 : 0;
    const half = [[0, 1.17], [0.13, 1.17], [R.sh * 0.62, 1.26], [R.sh * 0.92, 1.36], [R.sh + 0.02, 1.5], [R.sh * 0.92, 1.68], [R.sh * 0.86 + bust, 1.95], [(R.sh * 0.8 + R.wa) / 2 + bust * 0.5, 2.25], [R.wa + 0.02, 2.5],
      [R.wa, R.waistY], ...(t.length === 'waist' ? [[R.wa + 0.01, hem, 1]] : [[R.hp, R.hipY], [R.hp + 0.03, hem, 1]]), [0, hem]];
    const pts = closedSym(half);
    form(g, c, pts, P.top, { crescent: [0.09, -0.02], shadows: [[[-1, 1.1], [1, 1.1], [1, 1.3], [0.15, 1.36], [0, 1.4], [-0.15, 1.36], [-1, 1.3]]] });
    if (F && bust) for (const s of [-1, 1]) line(g, mir0(s, [[0.06, 2.1], [0.2, 2.13], [0.32, 2.08]]), c.lw * 0.6, c.ink);
    // closure: diagonal wrap (trim band) or centre line with buttons
    if (t.closure === 'wrap') {
      const d = t.side;
      const tp = [[0, 1.2], [d * 0.18, 1.33], [d * 0.32, 1.52], [d * 0.36, 1.75]];
      line(g, tp, 0.05, c.ink); line(g, tp, 0.05 - 2 * c.lw, P.trim);
      line(g, [[d * 0.36, 1.75], [d * 0.36, hem]], c.lw * 0.8, c.ink);
    } else if (t.closure === 'buttons') {
      line(g, [[0, 1.22], [0, hem]], c.lw * 0.8, c.ink);
      for (let y = 1.45; y < hem - 0.1; y += 0.32) { g.fillStyle = P.trim; g.beginPath(); g.arc(0.05, y, 0.022, 0, 7); g.fill(); g.strokeStyle = c.ink; g.lineWidth = c.lw * 0.7; g.stroke(); }
    }
    // collar: two rounded stand-up flaps with a light lining edge
    if (t.collar === 'high') for (const s of [-1, 1]) {
      form(g, c, mir0(s, [[0.012, 1.03, 1], [0.1, 1.01], [0.15, 1.04], [0.16, 1.22, 1], [0.03, 1.24, 1]]), P.top, { crescent: false });
      line(g, mir0(s, [[0.03, 1.05], [0.1, 1.03], [0.14, 1.06]]), 0.018, P.trim);
    }
  }

  function arms(g, c, phase) {
    const { R, P, ch } = c, W = R.aw;
    for (const s of [-1, 1]) {
      const S = R.armS(s), E = R.armE(s), Wr = R.armW(s);
      if (phase === 'arm') {
        form(g, c, tube([[S[0], S[1], W.s], [(S[0] + E[0]) / 2, (S[1] + E[1]) / 2, W.s * 0.85], [E[0], E[1], W.e], [(E[0] + Wr[0]) / 2, (E[1] + Wr[1]) / 2, W.e * 1.08], [Wr[0], Wr[1], W.w]], false, true), P.skin, { kind: 'skin', crescent: [0.04 * -s, -0.02] });
        continue;
      }
      // sleeves
      const sl = ch.sleeves;
      if (sl !== 'none') {
        const end = sl === 'short' ? [S[0] + (E[0] - S[0]) * 0.5, S[1] + (E[1] - S[1]) * 0.5] : sl === 'elbow' ? E : Wr;
        const ew = sl === 'long' ? W.w + 0.05 : sl === 'elbow' ? W.e + 0.06 : W.s + 0.03;
        const spine = [[S[0] - s * 0.02, S[1] - 0.02, W.s + 0.05]];
        if (sl !== 'short') spine.push([(S[0] + E[0]) / 2, (S[1] + E[1]) / 2, W.s + 0.03]);
        if (sl === 'long') spine.push([E[0], E[1], W.e + 0.055], [(E[0] + Wr[0]) / 2, (E[1] + Wr[1]) / 2, W.e + 0.05]);
        spine.push([end[0], end[1], ew]);
        form(g, c, tube(spine, false, true), P.top, { crescent: [0.05 * -s, -0.02] });
        // cuff band
        const cdir = sl === 'long' ? [Wr[0] - E[0], Wr[1] - E[1]] : sl === 'elbow' ? [E[0] - S[0], E[1] - S[1]] : [E[0] - S[0], E[1] - S[1]];
        const l = Math.hypot(...cdir), ux = cdir[0] / l, uy = cdir[1] / l;
        form(g, c, tube([[end[0] - ux * 0.08, end[1] - uy * 0.08, ew + 0.012], [end[0], end[1], ew + 0.012]], false, false), P.trim, { crescent: false });
      }
      // forearm wraps / bracers
      if (ch.arms === 'bracers') {
        const a = [E[0] + (Wr[0] - E[0]) * 0.35, E[1] + (Wr[1] - E[1]) * 0.35];
        form(g, c, tube([[a[0], a[1], W.e + 0.035], [Wr[0], Wr[1] - 0.02, W.w + 0.04]], false, false), P.accent2, { crescent: [0.03 * -s, 0] });
        form(g, c, tube([[a[0], a[1], W.e + 0.04], [a[0] + (Wr[0] - a[0]) * 0.12, a[1] + (Wr[1] - a[1]) * 0.12, W.e + 0.04]], false, false), P.trim, { crescent: false });
      }
      LOK.hand(g, { pose: ch.handPose, wrist: [Wr[0], Wr[1] - 0.02], angle: -s * 0.08, size: (ch.handPose === 'grip' ? 0.3 : 0.55) * (R.F ? 0.95 : 1.05), thumb: s < 0 ? 'right' : 'left', skin: P.skin, shade: shade(P.skin, 'skin'), lw: c.lw, ink: c.ink });
    }
  }

  function legs(g, c) {
    const { R, P, ch } = c, pt = ch.pants;
    const bootTop = R.ground - 1.1;
    // seat
    form(g, c, closedSym([[0, R.waistY], [R.wa + 0.02, R.waistY], [R.hp + 0.03, R.hipY], [R.hp * 0.95, R.hipY + 0.6], [0, R.hipY + 0.7]]), P.pants, { crescent: [0.06, 0] });
    for (const s of [-1, 1]) {
      const H = R.legH(s), K = R.legK(s), A = R.legA(s);
      const ty = pt === 'baggy' ? bootTop + 0.3 : bootTop + 0.15;
      const t = (ty - K[1]) / (A[1] - K[1]), end = [K[0] + (A[0] - K[0]) * t, ty];
      const spine = pt === 'baggy'
        ? [[H[0] * 0.75, R.hipY, R.hp * 0.55], [H[0], H[1], R.hp * 0.58], [(H[0] + K[0]) / 2, (H[1] + K[1]) / 2, 0.4], [K[0], K[1], 0.38], [end[0], end[1] - 0.25, 0.4], [end[0], end[1], 0.32]]
        : [[H[0] * 0.75, R.hipY, R.hp * 0.5], [H[0], H[1], R.hp * 0.52], [(H[0] + K[0]) / 2, (H[1] + K[1]) / 2, 0.26], [K[0], K[1], 0.19], [end[0], end[1], 0.17]];
      form(g, c, tube(spine, pt === 'baggy', false), P.pants, { crescent: [0.06, -0.03], shadows: pt === 'baggy' ? [[[end[0] - 1, end[1] - 0.12], [end[0] + 1, end[1] - 0.16], [end[0] + 1, end[1] + 1], [end[0] - 1, end[1] + 1]]] : [] });
      // folds
      line(g, [[K[0] - s * 0.12, K[1] - 0.35], [K[0] - s * 0.02, K[1] - 0.05], [K[0] + s * 0.1, K[1] + 0.1]], c.lw * 0.7, c.ink);
      if (pt === 'baggy') line(g, [[end[0] + s * 0.18, end[1] - 0.45], [end[0] + s * 0.02, end[1] - 0.32], [end[0] - s * 0.15, end[1] - 0.3]], c.lw * 0.7, c.ink);
    }
  }

  function boots(g, c) {
    const { R, P, ch } = c;
    for (const s of [-1, 1]) {
      const A = R.legA(s), top = [A[0] - s * 0.02, R.ground - 1.1];
      const colors = { leather: P.boots, leatherShade: shade(P.boots, 'cloth'), strap: shade(shade(P.boots, 'cloth'), 'cloth'), fur: P.fur, furShade: shade(P.fur, 'cloth') };
      if (ch.boots === 'fur') LOK.furBoot(g, { top, ground: R.ground, toe: s, lean: s * 0.04, colors, lw: c.lw, widthScale: 0.95 });
      else plainBoot(g, c, top, R.ground, s, colors, ch.boots === 'tall');
    }
  }
  // plain boot: the measured boot silhouette without the fur cuff; optional tall shaft with a turned-down top band
  function plainBoot(g, c, top, ground, s, B, tall) {
    const h = ground - top[1];
    g.save(); g.transform(-s * h, 0, s * 0.04 * h, h, top[0], top[1]);
    const lw = c.lw / h;
    const body = [[-0.27, tall ? -0.25 : 0.12], [-0.239, 0.409], [-0.232, 0.557], [-0.265, 0.655], [-0.403, 0.76], [-0.5, 0.849], [-0.516, 0.914, 1], [-0.435, 0.977], [-0.208, 0.995], [0.068, 0.977], [0.231, 0.931], [0.272, 0.784], [0.261, 0.686], [0.28, 0.622, 1], [0.247, 0.557], [0.231, 0.362], [0.255, tall ? -0.25 : 0.12]];
    const p = shape(body);
    g.fillStyle = B.leather; g.fill(p);
    g.save(); g.clip(p); g.fillStyle = B.leatherShade;
    g.fill(shape([[-0.6, 0.86], [-0.47, 0.905], [-0.3, 0.93], [-0.1, 0.94], [0.1, 0.925], [0.3, 0.86], [0.3, 1.1], [-0.6, 1.1]]));
    g.fill(shape([[-0.4, -0.3], [-0.2, -0.3], [-0.185, 0.42], [-0.19, 0.6], [-0.4, 0.6]]));
    g.restore();
    g.strokeStyle = c.ink; g.lineWidth = lw; g.stroke(p);
    const ty = tall ? -0.25 : 0.12;
    const band = shape([[-0.285, ty - 0.01, 1], [0.27, ty - 0.01, 1], [0.265, ty + 0.1, 1], [-0.28, ty + 0.1, 1]]);
    g.fillStyle = B.strap; g.fill(band); g.stroke(band);
    for (const cr of [[[-0.43, 0.875], [-0.33, 0.845], [-0.2, 0.86]], [[-0.08, 0.93], [0.05, 0.912], [0.16, 0.92]]]) line(g, cr, lw * 0.8, c.ink);
    g.restore();
  }

  function waist(g, c) {
    const { R, P, ch } = c;
    if (ch.waist === 'none') return;
    const y0 = R.waistY - 0.08, y1 = R.waistY + 0.1, w0 = R.wa + 0.04, w1 = R.wa + 0.05;
    form(g, c, [[-w0, y0, 1], [w0, y0, 1], [w1, y1, 1], [-w1, y1, 1]], P.accent, { crescent: [0.05, 0], shadows: [[[-1, y1 - 0.05], [1, y1 - 0.05], [1, 9], [-1, 9]]] });
    if (ch.waist === 'sash') {
      const d = ch.top.side || 1, x = d * 0.12;
      form(g, c, [[x - 0.06, y0 + 0.02], [x + 0.06, y0 + 0.02], [x + 0.07, y1], [x - 0.07, y1]], P.accent, { crescent: false });
      for (const [dx, len] of [[-0.03, 0.55], [0.04, 0.42]]) form(g, c, [[x + dx - 0.035, y1 - 0.02, 1], [x + dx + 0.035, y1 - 0.02, 1], [x + dx + 0.05 + d * 0.02, y1 + len, 1], [x + dx - 0.02 + d * 0.02, y1 + len + 0.03, 1]], P.accent, { crescent: [0.02, 0] });
    } else if (ch.waist === 'belt') {
      form(g, c, [[-0.07, y0 - 0.01, 1], [0.07, y0 - 0.01, 1], [0.07, y1 + 0.01, 1], [-0.07, y1 + 0.01, 1]], P.trim, { crescent: false });
    }
  }

  function overskirt(g, c) {
    const { R, P, ch, rnd } = c;
    if (ch.skirt === 'none') return;
    const y0 = R.waistY, y1 = ch.skirt === 'panels' ? R.hipY + 1.0 : R.knee + 0.1;
    if (ch.skirt === 'panels') {
      for (const s of [-1, 1]) form(g, c, mir0(s, [[0.1, y0, 1], [R.wa + 0.06, y0, 1], [R.hp + 0.1, R.hipY], [R.hp + 0.16, y1, 1], [0.18, y1 - 0.12, 1], [0.14, R.hipY]]), P.accent2, { crescent: [0.05, -0.02] });
    } else {
      form(g, c, [[-R.wa - 0.02, y0, 1], [R.wa + 0.02, y0, 1], [R.hp + 0.12, R.hipY + 0.3], [R.hp + 0.32, y1, 1], [-R.hp - 0.32, y1, 1], [-R.hp - 0.12, R.hipY + 0.3]], P.accent2,
        { crescent: [0.08, -0.03], shadows: [[[-1, y1 - 0.08], [1, y1 - 0.08], [1, 9], [-1, 9]]] });
      for (const x of [-0.25, 0.05, 0.3]) line(g, [[x * 0.6, R.hipY], [x, y1 - 0.02]], c.lw * 0.7, c.ink);
    }
  }

  /* =================================================================
     COMPOSE (painter's order)
     ================================================================= */
  function draw(g, ch) {
    const R = rig(ch.body);
    const c = { R, P: ch.palette, ch, ink: '#141414', ink2: '#2b1f1a', lw: 0.011, rnd: rng(ch.seed * 7 + 3) };
    c.P.brow = c.P.brow || shade(c.P.hair, 'cloth');
    const hair = HAIR[ch.hair] || HAIR.cropped;
    hair(g, c, 'back');
    arms(g, c, 'arm');
    legs(g, c);
    boots(g, c);
    top(g, c);
    overskirt(g, c);
    waist(g, c);
    arms(g, c, 'over');
    neckAndHead(g, c);
    hair(g, c, 'front');
    return R;
  }

  /* =================================================================
     RANDOM CHARACTERS
     ================================================================= */
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const SKIN = ['#f2d4b8', '#e6be9a', '#d4a882', '#c0936d', '#a58063', '#8b6447', '#6f4c36'];
  const HAIRC = ['#141313', '#26201c', '#3a281e', '#563826', '#7a5232', '#9a6a3c', '#b8a68c'];
  const IRIS = ['#9ccfdc', '#7fa9c9', '#8a9f6c', '#b88a4a', '#7b5a3c', '#5e6e7a', '#a2b8a0'];
  // outfit schemes in the show's muted range (sampled hue/lightness of the references)
  const SCHEMES = [
    { top: '#4f7da3', trim: '#e8e6dc', pants: '#4d5d6b', accent: '#93abc0', accent2: '#1d3a4f', boots: '#6f5f52', fur: '#eae9e0' },
    { top: '#8e2f26', trim: '#d9b45c', pants: '#2c2624', accent: '#3a2422', accent2: '#5e1d19', boots: '#2a2220', fur: '#e8e1d4' },
    { top: '#56703c', trim: '#cdb877', pants: '#5c5443', accent: '#7b6a3e', accent2: '#34452a', boots: '#4a3d2c', fur: '#e6e1cf' },
    { top: '#d49335', trim: '#f2dca0', pants: '#b9772c', accent: '#7a3b1c', accent2: '#c26a24', boots: '#6e3a1e', fur: '#efe6cc' },
    { top: '#3d4148', trim: '#a6a294', pants: '#25262b', accent: '#6a1f24', accent2: '#2e3036', boots: '#1f1f22', fur: '#d9d6cc' },
    { top: '#6b5a7a', trim: '#e2d8c6', pants: '#3f3a48', accent: '#b9a46a', accent2: '#4a3d58', boots: '#3b2e2a', fur: '#e8e3d8' },
    { top: '#2f6f6a', trim: '#e9e4d2', pants: '#3e4a4a', accent: '#c9a24a', accent2: '#1f4a47', boots: '#5a4636', fur: '#ebe7da' },
  ];
  function random(seed) {
    const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], j = (v, d) => +(v + (r() * 2 - 1) * d).toFixed(3);
    const female = r() < 0.5;
    const scheme = pick(SCHEMES);
    const length = pick(['waist', 'hip', 'hip', 'long']);
    return {
      seed,
      body: { female, shoulders: j(1, 0.06), waist: j(1, 0.08), hips: j(1, 0.07), legs: j(1, 0.04), muscle: r(), armOut: j(0.12, 0.08), stance: j(0.12, 0.08) },
      face: { jaw: female ? j(0.1, 0.15) : j(0.65, 0.25), chin: j(1, 0.05), pointy: female && r() < 0.6, eyeSize: female ? j(1.0, 0.08) : j(0.92, 0.06), eyeSpacing: j(1, 0.06),
              brow: j(1, 0.2), browAngle: j(female ? 0 : 0.4, 0.6), browRaise: j(0, 0.6), nose: j(1, 0.3), mouth: j(1, 0.15), smile: j(0.2, 0.5), look: j(0, 0.5) },
      hair: female ? pick(['pixie', 'long', 'ponytail', 'bob']) : pick(['undercut', 'cropped', 'pixie', 'ponytail']),
      top: { length, collar: r() < 0.75 ? 'high' : 'none', closure: pick(['wrap', 'wrap', 'buttons', 'none']), side: r() < 0.5 ? 1 : -1 },
      sleeves: pick(['none', 'short', 'elbow', 'long', 'long']),
      arms: pick(['none', 'bracers', 'none']),
      handPose: 'relaxed',
      waist: pick(['sash', 'belt', 'none']),
      skirt: length === 'long' ? 'none' : pick(['none', 'none', 'panels', 'skirt']),
      pants: pick(['baggy', 'fitted']),
      boots: pick(['fur', 'plain', 'tall']),
      palette: { skin: pick(SKIN), hair: pick(HAIRC), iris: pick(IRIS), eyeWhite: '#eef0ec', ...scheme },
    };
  }

  return { draw, random, shade, rig };
})();
if (typeof module !== 'undefined') module.exports = GEN;
