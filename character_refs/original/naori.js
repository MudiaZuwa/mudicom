/* =====================================================================
   NAORI — an original character drawn with the Canvas API in the style
   documented in ../DRAWING_GUIDE.md. Nothing here is traced: every form
   is placed by hand from the measured rules.

   Units: 1 = one head (crown -> chin). x = 0 is the body centre line,
   y = 0 the crown, y grows downward, the ground is at y = 7.9.
   Light comes from the viewer's upper right, so each form carries one
   hard shadow on the viewer's left and under whatever overlaps it.
   ===================================================================== */
const NAORI = (() => {
  const HEIGHT = 7.9;
  const P = {
    skin: '#c59d78', hair: '#3a2521', hairLight: '#4d352e', brow: '#2b1a17', iris: '#b58d49', irisRing: '#7c5f2c', eyeWhite: '#f2efe7',
    cowl: '#a47f41', vest: '#74432f', trim: '#ddd3b6', tunic: '#c4b38b', sash: '#49303a', pants: '#5c5a4d',
    wrap: '#40332c', boot: '#5a4435', strap: '#3f2f25', cuff: '#76603f', tie: '#c4b38b',
    ink: '#22150f', face: '#6a4630', mouth: '#4a2a1c',
  };

  /* ---------- colour: shadow = same hue, darker by an amount that grows with lightness ---------- */
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
  function shade(hex, k = 1) { const c = r2lab(h2r(hex)); return r2h(lab2r([Math.max(2, c[0] - (4.5 + 0.153 * c[0]) * k), c[1], c[2]])); }

  /* ---------- paths: smooth curve through points; [x, y, 1] = sharp corner ---------- */
  function sp(path, pts, closed = true) {
    const n = pts.length, Q = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const T = i => { const p = Q(i); if (p[2] || (!closed && (i <= 0 || i >= n - 1))) return [0, 0]; const a = Q(i - 1), b = Q(i + 1); return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6]; };
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = Q(i), b = Q(i + 1), ta = T(i), tb = T(i + 1); path.bezierCurveTo(a[0] + ta[0], a[1] + ta[1], b[0] - tb[0], b[1] - tb[1], b[0], b[1]); }
    if (closed) path.closePath();
    return path;
  }
  const shape = pts => sp(new Path2D(), pts);
  const mir = pts => pts.map(p => [-p[0], p[1], ...p.slice(2)]).reverse();
  const sym = half => [...half, ...mir(half).slice(1, -1)];          // half runs top-centre -> bottom-centre on the right
  const flip = (s, pts) => s > 0 ? pts : pts.map(p => [-p[0], p[1], ...p.slice(2)]);
  const both = fn => { fn(1); fn(-1); };
  // points along an open smooth curve
  function sample(pts, per = 8) {
    const n = pts.length, out = [], Q = i => pts[Math.max(0, Math.min(n - 1, i))];
    const T = i => { if (i <= 0 || i >= n - 1 || Q(i)[2]) return [0, 0]; const a = Q(i - 1), b = Q(i + 1); return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6]; };
    for (let i = 0; i < n - 1; i++) { const a = Q(i), b = Q(i + 1), ta = T(i), tb = T(i + 1), c1 = [a[0] + ta[0], a[1] + ta[1]], c2 = [b[0] - tb[0], b[1] - tb[1]];
      for (let k = (i ? 1 : 0); k <= per; k++) { const t = k / per, m = 1 - t; out.push([m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1]]); } }
    return out;
  }

  /* ---------- drawing primitives ---------- */
  let g, LW = 0.0045;
  // a closed form: flat base, shadow shapes clipped inside (never stroked), hairline outline
  function form(pts, base, o = {}) {
    const p = shape(pts), sh = o.shadow || shade(base);
    g.fillStyle = base; g.fill(p);
    g.save(); g.clip(p);
    if (o.cres) { const [dx, dy] = o.cres; g.fillStyle = sh; g.fill(p); g.save(); g.translate(dx, dy); g.fillStyle = base; g.fill(p); g.restore(); }
    for (const q of o.sh || []) { g.fillStyle = sh; g.fill(shape(q)); }
    for (const q of o.over || []) { g.fillStyle = q.color; g.fill(shape(q.pts)); }
    if (o.inside) o.inside(p);
    g.restore();
    if (o.line !== false) { g.strokeStyle = o.ink || P.ink; g.lineWidth = o.lw || LW; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(p); }
    return p;
  }
  // an interior line drawn as a filled sliver, so it tapers: mode 'both' (thin at both ends), 'out' (thick start, thin end)
  function tl(pts, w, color, mode = 'both') {
    const S = sample(pts), n = S.length, L = [], R = [];
    for (let i = 0; i < n; i++) { const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (n - 1), pr = 0.12 + 0.88 * (mode === 'both' ? Math.pow(Math.sin(Math.PI * t), 0.7) : Math.pow(1 - t, 0.8)), h = (w || LW) * pr / 2;
      L.push([S[i][0] + dy * h, S[i][1] - dx * h]); R.push([S[i][0] - dy * h, S[i][1] + dx * h]); }
    g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (const q of L) g.lineTo(q[0], q[1]); for (const q of R.reverse()) g.lineTo(q[0], q[1]); g.closePath();
    g.fillStyle = color || P.ink; g.fill();
  }
  const fold = (pts, w) => tl(pts, (w || 1.5) * LW, P.ink, 'out');     // cloth fold: starts at a seam or gather and fades out

  /* =================================================================
     HEAD — laid out in the pixel space of the neutral front close-up the eye shapes were
     measured in (originals/20: eyes at y 106.5, chin at y 190, centre x 198.5), then scaled
     so crown -> chin = 1. Her own differences from that face are applied on top.
     ================================================================= */
  const K = 1 / 180, CX = 198.5, CY = 10;
  const hp = p => [(p[0] - CX) * K, (p[1] - CY) * K, ...p.slice(2)];                 // close-up px -> head units
  const HP = pts => pts.map(hp);
  // eye pieces are given for the viewer's left eye; hers are narrower than the measured ones and lift at the outer corner
  const EYE = { yScale: 0.86, lift: 1.7, eyeY: 106.5, inner: 183.9, outer: 153.6 };
  const ep = (p, s) => { const u = Math.max(0, Math.min(1, (EYE.inner - p[0]) / (EYE.inner - EYE.outer))), q = hp([p[0], EYE.eyeY + (p[1] - EYE.eyeY) * EYE.yScale - EYE.lift * u, ...p.slice(2)]); return s < 0 ? q : [-q[0], q[1], ...q.slice(2)]; };
  const EP = (pts, s) => pts.map(p => ep(p, s));
  const T = {   // measured on the close-up (tools/clean_lib.js, FACE_TEMPLATES.lok_female)
    white: [[156.1, 104.2], [158.5, 102.0], [161, 100.8], [166.7, 100.0], [174.4, 100.3], [180, 102.2], [183.3, 105.8, 1], [182.2, 108.6], [178.9, 111.9], [173.3, 114.0], [166.7, 113.9], [160.6, 111.2], [157.2, 107.2]],
    upperLid: [[152.6, 104.4, 1], [156.6, 101.1], [160.8, 98.9], [166.7, 98.1], [174.4, 98.5], [180.2, 100.6], [183.9, 105.4, 1], [180, 102.3], [174.4, 100.6], [166.7, 100.5], [161, 101.6], [157.4, 103.8], [155.4, 106.0, 1]],
    lowerLid: [[158.6, 110.2], [163.5, 113.2], [168, 114.5], [173.3, 114.4], [178.2, 112.4]],
    iris: { c: [170.4, 106.1], r: 6.2, pr: 2.0 },
  };

  function hairBack() {     // the mass behind the head: gathered toward the nape on the viewer's right, where the braid starts
    form(HP([[198, -8], [228, -3], [252, 14], [263, 40], [266, 70], [262, 100], [256, 128], [250, 150], [236, 166], [214, 172], [182, 170], [160, 160], [146, 138], [136, 100], [131, 70], [134, 40], [146, 14], [170, -3]]), P.hair, { cres: false });
  }
  function ear(s) {         // C-shaped rim, top level with the brow, lobe level with the nose base; inner fold lines; shadowed bowl
    const x = 0.262, E = pts => flip(s, pts);
    form(E([[x - 0.012, 0.485], [x + 0.016, 0.452], [x + 0.044, 0.448], [x + 0.06, 0.478], [x + 0.057, 0.56], [x + 0.042, 0.63], [x + 0.018, 0.675], [x - 0.004, 0.66], [x - 0.016, 0.6]]), P.skin,
      { sh: [E([[x - 0.02, 0.51], [x + 0.024, 0.485], [x + 0.042, 0.51], [x + 0.036, 0.6], [x + 0.016, 0.65], [x - 0.02, 0.63]])] });
    tl(E([[x + 0.008, 0.482], [x + 0.036, 0.474], [x + 0.047, 0.505], [x + 0.04, 0.575], [x + 0.024, 0.626]]), LW * 1.3, P.face);
    tl(E([[x + 0.002, 0.525], [x + 0.022, 0.538], [x + 0.024, 0.585], [x + 0.01, 0.615]]), LW * 1.2, P.face);
  }
  function neck() {
    form([[-0.175, 0.86], [0.175, 0.86], [0.182, 1.06], [0.25, 1.22], [-0.25, 1.22], [-0.182, 1.06]], P.skin,
      { cres: [0.035, 0], sh: [[[-0.3, 0.8], [0.3, 0.8], [0.3, 0.99], [0.15, 1.06], [0.03, 1.1], [-0.1, 1.085], [-0.3, 1.0]]] });
    // collar of the under-tunic inside the mantle's opening
    form([[-0.235, 1.12, 1], [-0.12, 1.09], [0.0, 1.25, 1], [0.12, 1.09], [0.235, 1.12, 1], [0.03, 1.66, 1]], P.tunic, { sh: [[[-0.3, 1.0], [0.0, 1.23], [0.03, 1.75], [-0.3, 1.75]]] });
  }
  function head() {
    both(ear);
    // face: wide across the cheekbones, a long nearly straight run down to a soft jaw corner, small rounded chin
    const half = [[198.5, 10], [226, 12.5], [243, 29], [247.5, 58], [247, 92], [246, 120], [243.5, 143], [236.5, 162, 1], [221, 179], [208, 188], [198.5, 190]].map(hp);
    form(sym(half), P.skin, { cres: [0.03, -0.006], sh: [
      HP([[150, 96], [158, 88], [170, 86.5], [181, 90], [186, 97], [176, 94.5], [165, 94], [156, 97.5]]),          // eye sockets: the planes between brow and lid
      HP([[247, 96], [239, 88], [227, 86.5], [216, 90], [211, 97], [221, 94.5], [232, 94], [241, 97.5]]),
      HP([[194, 167.2], [198.5, 166.4], [203, 167.2], [201, 169.4], [196, 169.4]]) ] });                                  // under the lower lip
    face();
  }
  function face() {
    const sk2 = shade(P.skin), sk3 = shade(sk2, 0.7);
    both(s => {
      const white = shape(EP(T.white, s));
      g.fillStyle = P.eyeWhite; g.fill(white);
      g.save(); g.clip(white);
      g.fillStyle = '#d8d3c8'; g.fill(shape(EP([[150, 96], [190, 96], [190, 103.2], [174, 102.2], [162, 103.2], [150, 106]], s)));       // lid shadow on the white
      const c = ep([T.iris.c[0] + (s < 0 ? 1.1 : -1.1) * -1 + 0.9 * (s < 0 ? 1 : -1) * 0, T.iris.c[1]], s), look = 0.007, r = T.iris.r * K, iris = new Path2D(); iris.arc(c[0] + look, c[1], r, 0, 7);
      g.fillStyle = P.iris; g.fill(iris);
      g.save(); g.clip(iris); g.fillStyle = shade(P.iris, 1.3); g.fillRect(c[0] - 2 * r, c[1] - 2 * r, 4 * r, 2 * r - r * 0.25); g.restore();   // darker upper half, under the lid
      g.strokeStyle = P.irisRing; g.lineWidth = 0.9 * K; g.stroke(iris);
      g.fillStyle = '#1a110c'; g.beginPath(); g.arc(c[0] + look, c[1] - 0.2 * K, T.iris.pr * K, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c[0] + look - 2.3 * K, c[1] - 2.6 * K, 1.0 * K, 0, 7); g.fill();
      g.restore();
      g.fillStyle = P.ink; g.fill(shape(EP(T.upperLid, s)));                               // heavy upper lid with a flick at the outer corner
      tl(EP(T.lowerLid, s), 1.0 * K, P.ink, 'both');                                     // thin lower lid
      tl(EP([[157.5, 97.6], [165, 95.6], [174, 95.9], [180.5, 98.2]], s), 0.75 * K, P.face);   // lid crease
      // brow: a filled shape — thick and square at the inner end, tapering to a point; hers sit low and nearly straight
      g.fillStyle = P.brow; g.fill(shape(HP([[151, 90.5, 1], [160, 85.2], [172, 83.4], [186.5, 86, 1], [187.5, 90.6, 1], [173, 87.6], [161, 88.2]]).map(q => s < 0 ? q : [-q[0], q[1] - (s > 0 ? 0.006 : 0), ...q.slice(2)])));
    });
    // nose: no outline. The plane on the shadow side of the bridge, a wedge under the tip, two nostril marks.
    g.fillStyle = sk2;
    g.fill(shape(HP([[203.5, 124], [206, 126], [207.6, 131], [207, 136.5], [204.6, 137.5], [203.8, 132]])));
    g.fill(shape(HP([[193, 141], [198, 139.3], [204, 139.6], [208, 141.2], [204.5, 144.3], [197, 144.4]])));
    tl(HP([[192.6, 141.6], [195, 143.4], [198, 143.2]]), 1.25 * K, P.face); tl(HP([[208.6, 141.6], [206.2, 143.4], [203.4, 143.2]]), 1.25 * K, P.face);
    // mouth: one line, lifted at the viewer's right; a short lighter line for the lower lip
    tl(HP([[181, 158.2], [189, 159.6], [199, 160.2], [209, 159], [219.5, 155.2]]), 1.5 * K, P.mouth);
    tl(HP([[219.5, 155.2], [221.5, 154], [222.6, 152.4]]), 1.0 * K, P.mouth, 'out');
    tl(HP([[193.5, 165.6], [199, 166.2], [204.5, 165.6]]), 0.9 * K, sk3);
  }
  function hairFront() {    // one mass: off-centre part, a long fringe swept across to the viewer's left, pointed sideburns
    const pts = HP([[148.5, 124, 1], [141, 100], [134.5, 70], [137, 40], [148, 15], [170, -3], [198, -8], [228, -3], [251, 15], [262, 40], [264.5, 70], [258, 100], [249.5, 124, 1],
      [247.5, 100], [245, 76, 1], [236, 58], [218, 38, 1], [206, 54], [188, 76], [176, 87, 1], [181, 72], [168, 82], [156, 96, 1], [156.5, 80], [150.5, 96]]);
    form(pts, P.hair, { over: [{ color: P.hairLight, pts: HP([[222, -1], [246, 13], [258, 38], [261, 62], [252, 60], [245, 38], [232, 20], [214, 10]]) }] });
    tl(HP([[218, 38], [210, 20], [196, 2]]), 1.3 * K, P.ink, 'out');                       // the part
    tl(HP([[206, 54], [186, 46], [166, 52], [150, 70]]), 1.0 * K, P.ink, 'out');
    tl(HP([[236, 58], [246, 46], [252, 30]]), 1.0 * K, P.ink, 'out');
    tl(HP([[176, 87], [170, 66], [176, 44]]), 0.9 * K, P.ink, 'out');
  }
  function braid() {        // one silhouette with a zig-zag edge; the plaits are interior lines only
    const A = [[0.19, 0.66, 0.085], [0.325, 0.97, 0.105], [0.39, 1.24, 0.102], [0.425, 1.5, 0.096], [0.445, 1.76, 0.088], [0.455, 2.0, 0.08], [0.46, 2.2, 0.072]];
    const at = t => { const i = Math.min(A.length - 2, Math.floor(t)), f = t - i; return A[i].map((v, k) => v + (A[i + 1][k] - v) * f); };
    const N = 9, Lf = [], Rt = [], inner = [];
    for (let i = 0; i < N; i++) { const t0 = i / N * (A.length - 1), t1 = (i + 0.5) / N * (A.length - 1), t2 = (i + 1) / N * (A.length - 1), a = at(t0), m = at(t1), b = at(t2);
      Lf.push([a[0] - a[2] * 0.7, a[1], 1], [m[0] - m[2] * 1.02, m[1] + 0.01]);
      Rt.push([a[0] + a[2] * 1.0, a[1] + 0.01], [m[0] + m[2] * 0.7, m[1], 1]);
      inner.push([[a[0] - a[2] * 0.7, a[1]], [a[0] - a[2] * 0.1, a[1] + (m[1] - a[1]) * 0.9], [m[0] + m[2] * 0.3, m[1] + (b[1] - m[1]) * 0.6]]);
      inner.push([[m[0] + m[2] * 0.7, m[1]], [m[0] + m[2] * 0.1, m[1] + (b[1] - m[1]) * 0.9], [b[0] - b[2] * 0.3, b[1] + (b[1] - m[1]) * 0.6]]); }
    const e = at(A.length - 1);
    form([[e[0] - 0.05, e[1] + 0.07, 1], [e[0] + 0.05, e[1] + 0.07, 1], [e[0] + 0.062, e[1] + 0.24], [e[0] + 0.02, e[1] + 0.46, 1], [e[0] - 0.035, e[1] + 0.25]], P.hair, {});      // loose end, to a point
    form([...Lf, [e[0] - e[2] * 0.75, e[1] + 0.02, 1], [e[0] + e[2] * 0.75, e[1] + 0.02, 1], ...Rt.reverse()], P.hair, { inside: () => { for (const q of inner.slice(0, -1)) tl(q, 1.6 * LW, P.ink, 'out'); } });
    form([[e[0] - 0.066, e[1] - 0.005, 1], [e[0] + 0.066, e[1] - 0.005, 1], [e[0] + 0.06, e[1] + 0.1, 1], [e[0] - 0.06, e[1] + 0.1, 1]], P.tie, { cres: [0.025, 0] });
  }

  /* =================================================================
     HAND — one silhouette for the back of the hand and the four fingers (no seams across the
     wrist or knuckles); the thumb is drawn first so the hand covers its root; fingers are
     separated by tapering lines that fade out before the knuckles.
     Local units: 1 = wrist to middle fingertip, +y down the hand, +x toward the thumb.
     ================================================================= */
  function hand(wx, wy, S, m, ang) {
    const keep = LW; LW = LW / S;
    g.save(); g.translate(wx, wy); g.rotate(ang || 0); g.scale(S * m, S);
    const sk = P.skin, cr = [0.045 * m, 0];
    form([[0.1, 0.2], [0.2, 0.3], [0.265, 0.46], [0.285, 0.62], [0.262, 0.72], [0.215, 0.7], [0.19, 0.56], [0.13, 0.45]], sk, { cres: cr });                       // thumb
    form([[-0.135, 0, 1], [-0.18, 0.2], [-0.2, 0.42], [-0.195, 0.6], [-0.185, 0.76], [-0.15, 0.865], [-0.112, 0.845], [-0.098, 0.78, 1],
      [-0.085, 0.9], [-0.05, 0.955], [-0.018, 0.925], [-0.012, 0.84, 1], [0.0, 0.95], [0.035, 1.0], [0.068, 0.965], [0.072, 0.85, 1], [0.088, 0.9], [0.122, 0.925], [0.15, 0.885],
      [0.165, 0.75], [0.168, 0.6], [0.185, 0.42], [0.165, 0.2], [0.135, 0, 1]], sk,
      { cres: cr, sh: [[[-0.3, 0.74], [-0.1, 0.8], [0.05, 0.88], [0.2, 0.83], [0.2, 1.1], [-0.3, 1.1]]] });
    tl([[-0.098, 0.78], [-0.104, 0.66], [-0.098, 0.55]], 1.5 * LW, P.ink, 'out');
    tl([[-0.012, 0.84], [-0.018, 0.69], [-0.01, 0.56]], 1.5 * LW, P.ink, 'out');
    tl([[0.072, 0.85], [0.068, 0.7], [0.074, 0.58]], 1.5 * LW, P.ink, 'out');
    tl([[0.168, 0.6], [0.14, 0.5], [0.12, 0.4]], 1.3 * LW, P.ink, 'out');             // fold where the thumb meets the hand
    g.restore(); LW = keep;
  }

  /* =================================================================
     BODY AND CLOTHES
     ================================================================= */
  function hoodBack() {     // the hood, lying bunched behind the neck
    form([[-0.58, 1.44], [-0.52, 1.14], [-0.38, 0.97], [-0.15, 0.9], [0.15, 0.9], [0.38, 0.97], [0.52, 1.14], [0.58, 1.44], [0, 1.55]], shade(P.cowl), {});
    fold([[-0.36, 1.4], [-0.35, 1.2], [-0.42, 1.04]], 1.4); fold([[0.36, 1.4], [0.35, 1.2], [0.42, 1.04]], 1.4);
  }
  function backPanel() {
    form([[-0.56, 3.4, 1], [0.56, 3.4, 1], [0.6, 5.08, 1], [0, 5.32, 1], [-0.6, 5.08, 1]], shade(P.vest, 1.15), {});
  }
  function pants() {        // baggy, gathered into the boot cuffs
    const R = [[0.62, 3.4, 1], [0.76, 3.9], [0.92, 4.7], [1.035, 5.4], [1.09, 5.95], [1.075, 6.28], [1.0, 6.5, 1], [0.56, 6.5, 1], [0.475, 6.28], [0.44, 5.9], [0.31, 5.0], [0.09, 4.42]];
    form([...R, [0, 4.34, 1], ...mir(R)], P.pants, { cres: [0.075, -0.02], sh: [[[-0.7, 3.3], [0.7, 3.3], [0.66, 5.2], [0, 5.44], [-0.66, 5.2]]] });
    both(s => {             // folds run up from the gather and in from the seams
      fold(flip(s, [[0.62, 6.42], [0.6, 6.2], [0.63, 6.0]]), 1.5); fold(flip(s, [[0.8, 6.42], [0.83, 6.18], [0.8, 5.95]]), 1.5); fold(flip(s, [[0.96, 6.42], [0.99, 6.22], [0.97, 6.04]]), 1.5);
      fold(flip(s, [[1.05, 5.5], [0.95, 5.62], [0.82, 5.66]]), 1.4); fold(flip(s, [[0.38, 5.36], [0.5, 5.52], [0.62, 5.56]]), 1.4);
    });
  }
  function boot(s) {        // soft boot seen turned outward: shaft, long foot, sole strip, wrap straps that follow the surface
    const E = pts => flip(s, pts), sm = s > 0 ? 1 : 0.6;
    const body = E([[0.585, 6.5, 1], [0.975, 6.5, 1], [1.005, 6.92], [1.03, 7.2], [1.15, 7.43], [1.31, 7.62], [1.4, 7.75], [1.415, 7.835], [1.36, 7.89, 1], [1.12, 7.92], [0.88, 7.905], [0.73, 7.87, 1], [0.685, 7.72], [0.7, 7.32], [0.645, 6.92]]);
    form(body, P.boot, { cres: [0.06 * sm, -0.01], inside: () => {
      g.fillStyle = shade(P.boot, 1.6); g.fill(shape(E([[0.6, 7.83], [0.88, 7.855], [1.12, 7.87], [1.32, 7.845], [1.45, 7.79], [1.6, 8], [0.6, 8]])));                 // sole
      for (const b of [[[0.6, 7.07], [0.84, 7.03], [1.06, 7.07], [1.08, 7.17], [0.84, 7.13], [0.62, 7.17]], [[0.62, 7.3], [0.86, 7.25], [1.1, 7.33], [1.17, 7.45], [0.88, 7.36], [0.66, 7.41]]]) {
        const q = shape(E(b)); g.fillStyle = P.strap; g.fill(q); g.strokeStyle = P.ink; g.lineWidth = LW; g.stroke(q); }
    } });
    fold(E([[0.93, 6.84], [0.95, 6.95], [0.965, 7.05]]), 1.2);
    tl(E([[1.14, 7.53], [1.22, 7.61], [1.27, 7.7]]), 1.5 * LW); tl(E([[0.78, 7.6], [0.89, 7.66], [0.98, 7.66]]), 1.4 * LW);
    // turned-down cuff: drawn after the trousers, which tuck into it
    form(E([[0.535, 6.4, 1], [1.01, 6.4, 1], [1.05, 6.76, 1], [0.84, 6.87], [0.6, 6.79, 1]]), P.cuff, { cres: [0.045 * sm, -0.01], sh: [E([[0.5, 6.35], [1.1, 6.35], [1.1, 6.47], [0.5, 6.47]])] });
  }
  function vest() {
    const half = [[0, 1.3], [0.17, 1.29], [0.5, 1.44], [0.72, 1.575], [0.775, 1.73], [0.69, 1.95], [0.635, 2.1, 1], [0.645, 2.32], [0.58, 2.66], [0.525, 2.93], [0.55, 3.15], [0.6, 3.38, 1], [0, 3.42]];
    form(sym(half), P.vest, { cres: [0.07, -0.02], sh: [[[-0.9, 1.2], [0.9, 1.2], [0.9, 1.84], [0.62, 1.92], [0.32, 2.02], [0.03, 2.2], [-0.3, 2.03], [-0.62, 1.92], [-0.9, 1.84]], [[-0.7, 2.88], [0.7, 2.88], [0.7, 3.5], [-0.7, 3.5]]] });
    form([[0.12, 1.8, 1], [0.185, 1.8, 1], [-0.35, 2.99, 1], [-0.42, 2.985, 1]], P.trim, {});      // trimmed edge of the upper panel
  }
  function skirt() {
    both(s => form(flip(s, [[0.4, 3.34, 1], [0.64, 3.32, 1], [0.725, 3.7], [0.745, 4.04, 1], [0.5, 4.12, 1], [0.455, 3.7]]), P.vest, { cres: [s > 0 ? 0.04 : 0.06, -0.01], sh: [flip(s, [[0.3, 3.2], [0.9, 3.2], [0.9, 3.47], [0.3, 3.47]])] }));
    form([[-0.445, 3.36, 1], [0.445, 3.36, 1], [0.475, 4.2], [0.435, 4.87, 1], [0, 5.07, 1], [-0.435, 4.87, 1], [-0.475, 4.2]], P.vest, { cres: [0.06, -0.01], sh: [[[-0.6, 3.3], [0.6, 3.3], [0.6, 3.5], [-0.6, 3.5]]] });
    form([[-0.435, 4.87, 1], [0, 5.07, 1], [0.435, 4.87, 1], [0.44, 4.795, 1], [0, 4.99, 1], [-0.44, 4.795, 1]], P.trim, {});
    fold([[0, 3.45], [0.005, 4.2], [0, 4.99]], 1.2);
  }
  function sash() {
    form([[-0.59, 2.955, 1], [0, 3.0], [0.59, 2.955, 1], [0.63, 3.37, 1], [0, 3.43], [-0.63, 3.37, 1]], P.sash, { cres: [0.06, -0.02] });
    // hanging ends first, then the knot that pinches them
    form([[-0.5, 3.3, 1], [-0.41, 3.3, 1], [-0.52, 4.12, 1], [-0.66, 4.02, 1]], P.sash, { cres: [0.03, 0] });
    form([[-0.44, 3.3, 1], [-0.33, 3.3, 1], [-0.36, 4.36, 1], [-0.5, 4.24, 1]], P.sash, { cres: [0.035, 0] });
    form([[-0.5, 3.08, 1], [-0.36, 3.06], [-0.3, 3.1, 1], [-0.31, 3.3], [-0.35, 3.36, 1], [-0.48, 3.36], [-0.52, 3.3, 1]], P.sash, { cres: [0.03, -0.01] });
    fold([[-0.36, 3.08], [-0.4, 3.2], [-0.41, 3.34]], 1.3); fold([[-0.5, 3.1], [-0.455, 3.2], [-0.45, 3.32]], 1.2);
    fold([[-0.3, 3.16], [0.0, 3.14], [0.3, 3.17]], 1.3); fold([[-0.3, 3.27], [-0.05, 3.3], [0.2, 3.29]], 1.2);
  }
  function arm(s) {         // loose sleeve gathered into a wrapped forearm; hand hanging at mid-thigh
    const E = pts => flip(s, pts), sm = s > 0 ? 0.6 : 1;
    g.save(); g.translate(s * 0.78, 1.7); g.rotate(s > 0 ? -0.05 : 0.02); g.translate(-s * 0.78, -1.7);
    hand(s * 1.012, 3.99, 0.7, -s, s * 0.04);
    form(E([[0.8, 1.6], [0.975, 2.15], [1.09, 2.75], [1.155, 3.12], [1.205, 3.4], [1.165, 3.5, 1], [0.86, 3.52, 1], [0.805, 3.42], [0.775, 3.05], [0.73, 2.6], [0.66, 2.1], [0.62, 1.8]]), P.tunic,
      { cres: [0.055 * sm, -0.01], sh: [E([[0.5, 1.5], [1.3, 1.5], [1.3, 1.84], [0.9, 1.92], [0.5, 1.9]])] });
    fold(E([[1.16, 3.47], [1.1, 3.32], [1.02, 3.22]]), 1.5); fold(E([[0.84, 3.48], [0.86, 3.3], [0.93, 3.16]]), 1.5); fold(E([[1.0, 3.5], [0.99, 3.38]]), 1.2);
    fold(E([[0.74, 2.62], [0.86, 2.74], [0.98, 2.76]]), 1.4);
    form(E([[0.87, 3.47, 1], [1.16, 3.455, 1], [1.14, 3.75], [1.105, 4.03, 1], [0.92, 4.03, 1], [0.89, 3.75]]), P.wrap, { cres: [0.04 * sm, 0], inside: () => {
      for (const y of [3.58, 3.72, 3.86, 3.98]) tl(E([[0.85, y + 0.035], [1.0, y], [1.2, y - 0.05]]), 1.4 * LW, shade(P.wrap, -2.4)); } });
    g.restore();
  }
  function mantle() {       // hooded mantle: two front flaps crossing to a point
    form([[-0.2, 1.07], [-0.44, 1.21], [-0.7, 1.39], [-0.84, 1.56], [-0.855, 1.74, 1], [-0.6, 1.8], [-0.3, 1.9], [0.03, 2.1, 1], [0.32, 1.89], [0.6, 1.8], [0.855, 1.74, 1], [0.84, 1.56], [0.7, 1.39], [0.44, 1.21], [0.2, 1.07],
      [0.175, 1.18], [0.115, 1.34], [0.03, 1.5, 1], [-0.105, 1.34], [-0.175, 1.18]], P.cowl, { cres: [0.06, -0.025], sh: [[[-0.3, 1.0], [-0.105, 1.32], [0.03, 1.5], [0.07, 2.2], [-0.05, 2.2], [-0.24, 1.5], [-0.4, 1.2]]] });
    tl([[0.03, 1.5], [0.045, 1.8], [0.03, 2.08]], 1.6 * LW, P.ink, 'out');                // where the flaps overlap
    const seam = shade(P.cowl, 2.2);                                                     // gathers toward the collar, in the cloth's own dark
    tl([[-0.26, 1.2], [-0.4, 1.42], [-0.46, 1.7]], 1.6 * LW, seam, 'out'); tl([[0.28, 1.2], [0.44, 1.44], [0.5, 1.7]], 1.6 * LW, seam, 'out'); tl([[-0.58, 1.34], [-0.7, 1.5], [-0.73, 1.66]], 1.4 * LW, seam, 'out');
    form([[0.015, 1.68], [0.07, 1.7], [0.075, 1.79], [0.03, 1.81], [-0.005, 1.75]], P.trim, {});   // toggle
  }

  function draw(ctx, o = {}) {
    g = ctx; LW = o.lineWidth || 0.0045;
    const tilt = fn => { g.save(); g.translate(0, 1.0); g.rotate(-0.035); g.translate(0, -1.0); fn(); g.restore(); };
    tilt(hairBack); hoodBack(); backPanel(); pants(); both(boot); vest(); skirt(); sash(); both(arm); neck(); mantle(); braid(); tilt(() => { head(); hairFront(); });
  }
  return { draw, P, HEIGHT, shade };
})();
if (typeof module !== 'undefined') module.exports = NAORI;
