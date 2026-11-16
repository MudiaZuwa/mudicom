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
      { sh: [[[-0.3, 0.8], [0.3, 0.8], [0.3, 0.99], [0.15, 1.06], [0.03, 1.1], [-0.1, 1.085], [-0.3, 1.0]], [[-0.3, 0.9], [-0.12, 0.9], [-0.13, 1.3], [-0.3, 1.3]]] });
    // collar of the under-tunic inside the mantle's opening
    form([[-0.235, 1.12, 1], [-0.12, 1.09], [0.0, 1.25, 1], [0.12, 1.09], [0.235, 1.12, 1], [0.03, 1.66, 1]], P.tunic, { sh: [[[-0.3, 1.0], [0.0, 1.23], [0.03, 1.75], [-0.3, 1.75]]] });
  }
  function head() {
    both(ear);
    // face: wide across the cheekbones, a straight run down to a jaw corner below the ear, a second straight run to a small blunt chin
    const half = [[198.5, 10], [226, 12.5], [243, 29], [247.5, 58], [247.2, 92], [246.4, 122], [244.6, 142], [239.5, 158.5, 1], [226, 174], [212.5, 186], [205, 189.6], [198.5, 190.4]].map(hp);
    const soft = shade(P.skin, 0.55);
    form(sym(half), P.skin, { over: [
      { color: soft, pts: HP([[178, 90.2], [185.5, 89.4], [188.6, 93.6], [184, 95.4], [179, 93.8]]) },                  // eye sockets: a small plane under the inner end of each brow
      { color: soft, pts: HP([[219, 90.2], [211.5, 89.4], [208.4, 93.6], [213, 95.4], [218, 93.8]]) },
      { color: soft, pts: HP([[194, 167.2], [198.5, 166.4], [203, 167.2], [201, 169.4], [196, 169.4]]) } ] });          // under the lower lip
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
  function braid() {        // one silhouette with a zig-zag edge; the plaits are short interior lines that stop near the middle
    const A = [[0.19, 0.66, 0.085], [0.325, 0.97, 0.105], [0.39, 1.24, 0.102], [0.425, 1.5, 0.096], [0.445, 1.76, 0.088], [0.455, 2.0, 0.08], [0.46, 2.2, 0.072]];
    const at = t => { const i = Math.min(A.length - 2, Math.floor(t)), f = t - i; return A[i].map((v, k) => v + (A[i + 1][k] - v) * f); };
    const N = 8, Lf = [], Rt = [], inner = [];
    for (let i = 0; i < N; i++) { const t0 = i / N * (A.length - 1), t1 = (i + 0.5) / N * (A.length - 1), t2 = (i + 1) / N * (A.length - 1), a = at(t0), m = at(t1), b = at(t2);
      Lf.push([a[0] - a[2] * 0.72, a[1], 1], [m[0] - m[2] * 1.02, m[1] + 0.012]);
      Rt.push([a[0] + a[2] * 1.0, a[1] + 0.012], [m[0] + m[2] * 0.72, m[1], 1]);
      inner.push([[a[0] - a[2] * 0.72, a[1]], [a[0] - a[2] * 0.3, a[1] + (m[1] - a[1]) * 0.7], [a[0] + a[2] * 0.12, m[1] + (b[1] - m[1]) * 0.1]]);
      inner.push([[m[0] + m[2] * 0.72, m[1]], [m[0] + m[2] * 0.3, m[1] + (b[1] - m[1]) * 0.7], [m[0] - m[2] * 0.12, b[1] + (b[1] - m[1]) * 0.1]]); }
    const e = at(A.length - 1);
    form([[e[0] - 0.05, e[1] + 0.07, 1], [e[0] + 0.05, e[1] + 0.07, 1], [e[0] + 0.066, e[1] + 0.22], [e[0] + 0.045, e[1] + 0.33, 1], [e[0] + 0.03, e[1] + 0.27], [e[0] + 0.012, e[1] + 0.47, 1], [e[0] - 0.012, e[1] + 0.3], [e[0] - 0.04, e[1] + 0.36, 1], [e[0] - 0.045, e[1] + 0.2]], P.hair, {});      // loose end, in points
    form([...Lf, [e[0] - e[2] * 0.75, e[1] + 0.02, 1], [e[0] + e[2] * 0.75, e[1] + 0.02, 1], ...Rt.reverse()], P.hair,
      { sh: [[[0, 0.5], [0.3, 0.9], [0.37, 1.3], [0.41, 1.7], [0.43, 2.3], [0, 2.3]]], shadow: shade(P.hair, 0.9), inside: () => { for (const q of inner.slice(1, -1)) tl(q, 1.7 * LW, P.ink, 'out'); } });
    form([[e[0] - 0.066, e[1] - 0.005, 1], [e[0] + 0.066, e[1] - 0.005, 1], [e[0] + 0.06, e[1] + 0.1, 1], [e[0] - 0.06, e[1] + 0.1, 1]], P.tie, { sh: [[[e[0] - 0.1, e[1] - 0.1], [e[0] - 0.02, e[1] - 0.1], [e[0] - 0.025, e[1] + 0.2], [e[0] - 0.1, e[1] + 0.2]]] });
  }

  /* =================================================================
     HAND — hanging at rest it is a loose fist: the back of the hand, the fingers curled under
     and foreshortened, the thumb lying in front on the body side. One silhouette, no seams
     across the wrist or knuckles; fingers are separated by tapering lines.
     Local units: 1 = wrist to the lowest knuckle, +y down the hand, +x toward the thumb.
     ================================================================= */
  function hand(wx, wy, S, m, ang) {
    const keep = LW; LW = LW / S;
    g.save(); g.translate(wx, wy); g.rotate(ang || 0); g.scale(S * m, S);
    const sk = P.skin, lf = m > 0 ? -1 : 1;                 // lf: local x direction of the viewer's left (the shadow side)
    form([[-0.2, 0, 1], [-0.27, 0.2], [-0.34, 0.45], [-0.345, 0.66, 1], [-0.31, 0.83], [-0.245, 0.9], [-0.185, 0.87, 1],
      [-0.165, 0.95], [-0.095, 0.99], [-0.03, 0.94, 1], [-0.005, 1.0], [0.065, 1.02], [0.125, 0.955, 1], [0.15, 0.975], [0.205, 0.965], [0.255, 0.9],
      [0.285, 0.74, 1], [0.3, 0.5], [0.275, 0.25], [0.2, 0, 1]], sk,
      { sh: [[[-0.5, 0.7], [-0.2, 0.74], [0.05, 0.8], [0.4, 0.74], [0.4, 1.2], [-0.5, 1.2]], [[lf * 0.5, -0.1], [lf * 0.2, -0.1], [lf * 0.25, 0.4], [lf * 0.26, 0.8], [lf * 0.5, 0.8]]] });
    tl([[-0.185, 0.87], [-0.2, 0.72], [-0.185, 0.56]], 1.5 * LW, P.ink, 'out');       // between the curled fingers, fading toward the knuckles
    tl([[-0.03, 0.94], [-0.05, 0.76], [-0.035, 0.58]], 1.5 * LW, P.ink, 'out');
    tl([[0.125, 0.955], [0.11, 0.78], [0.12, 0.62]], 1.5 * LW, P.ink, 'out');
    // thumb, in front, pointing down along the index finger
    form([[0.15, 0.2], [0.27, 0.27], [0.37, 0.44], [0.395, 0.64], [0.365, 0.8, 1], [0.3, 0.85], [0.245, 0.78], [0.235, 0.6], [0.18, 0.44]], sk,
      { sh: [[[0.1, 0.62], [0.5, 0.56], [0.5, 1], [0.1, 1]]] });
    tl([[0.31, 0.83], [0.325, 0.74], [0.36, 0.7]], 1.2 * LW, P.ink, 'out');           // thumbnail edge
    g.restore(); LW = keep;
  }

  /* =================================================================
     BODY AND CLOTHES — contours are long near-straight runs that break at corners; each form
     carries shadow planes (the viewer's-left side of the form, and under whatever overlaps it)
     ================================================================= */
  function hoodBack() {     // the hood, lying bunched behind the neck
    form([[-0.58, 1.44], [-0.52, 1.14], [-0.38, 0.97], [-0.15, 0.9], [0.15, 0.9], [0.38, 0.97], [0.52, 1.14], [0.58, 1.44], [0, 1.55]], shade(P.cowl), {});
    fold([[-0.36, 1.4], [-0.35, 1.2], [-0.42, 1.04]], 1.4); fold([[0.36, 1.4], [0.35, 1.2], [0.42, 1.04]], 1.4);
  }
  function backPanel() {
    form([[-0.56, 3.4, 1], [0.56, 3.4, 1], [0.6, 5.08, 1], [0, 5.32, 1], [-0.6, 5.08, 1]], shade(P.vest, 1.15), {});
  }
  function pants() {        // baggy trousers: straight runs to a corner where they blouse over the boot cuffs; the legs are not a mirror pair
    const R = [[0.62, 3.4, 1], [0.84, 4.5], [1.1, 5.66], [1.2, 6.06, 1], [1.085, 6.5, 1], [0.86, 6.555], [0.635, 6.5, 1], [0.535, 6.1, 1], [0.44, 5.4], [0.1, 4.44]];
    const L = [[-0.1, 4.44], [-0.3, 5.3], [-0.395, 6.08, 1], [-0.495, 6.5, 1], [-0.72, 6.555], [-0.945, 6.5, 1], [-1.045, 6.08, 1], [-0.99, 5.6], [-0.8, 4.4], [-0.62, 3.4, 1]];
    form([...R, [0, 4.36, 1], ...L], P.pants, { sh: [
      [[-0.7, 3.3], [0.7, 3.3], [0.66, 5.2], [0, 5.44], [-0.66, 5.2]],                                                   // cast by the tunic skirt
      [[0.0, 4.3], [0.34, 4.6], [0.56, 5.4], [0.7, 6.0], [0.78, 6.6], [0.4, 6.7], [0.3, 5.4]],                            // the shadow side of each leg
      [[-1.3, 3.3], [-0.72, 3.3], [-0.76, 4.5], [-0.82, 5.5], [-0.8, 6.08], [-0.75, 6.6], [-1.3, 6.6]],
      [[0.9, 6.22], [1.21, 6.05], [1.12, 6.6], [0.86, 6.6]], [[-0.62, 6.25], [-0.38, 6.05], [-0.48, 6.6], [-0.7, 6.6]] ] });   // under the blouse
    fold([[1.2, 6.06], [1.04, 5.98], [0.92, 5.74]], 1.6); fold([[0.535, 6.1], [0.68, 6.02], [0.78, 5.82]], 1.6);          // folds start at the corners and the gather
    fold([[0.76, 6.52], [0.78, 6.36], [0.75, 6.2]], 1.4); fold([[0.97, 6.52], [0.95, 6.36], [0.99, 6.22]], 1.4);
    fold([[1.0, 5.2], [0.9, 5.36], [0.76, 5.42]], 1.4); fold([[0.4, 5.3], [0.52, 5.5], [0.62, 5.56]], 1.3);
    fold([[-1.045, 6.08], [-0.9, 5.98], [-0.8, 5.76]], 1.6); fold([[-0.395, 6.08], [-0.52, 6.0], [-0.6, 5.84]], 1.6);
    fold([[-0.62, 6.52], [-0.6, 6.36], [-0.64, 6.22]], 1.4); fold([[-0.83, 6.52], [-0.85, 6.38], [-0.81, 6.24]], 1.4);
    fold([[-0.93, 5.1], [-0.8, 5.24], [-0.66, 5.26]], 1.4);
  }
  function boot(s, dx, ext) {   // soft boot: shaft, bunching at the ankle, long foot with a firm heel corner, thin sole strip, straps that follow the surface
    const ax = 0.84, W = p => { const x = p[1] > 7.25 ? ax + (p[0] - ax) * ext : p[0]; return [s * x + dx, p[1], ...p.slice(2)]; }, E = pts => pts.map(W);
    const body = E([[0.585, 6.5, 1], [0.975, 6.5, 1], [0.995, 6.9], [1.03, 7.14, 1], [1.0, 7.24], [1.15, 7.44], [1.31, 7.62], [1.4, 7.75], [1.415, 7.835], [1.36, 7.89, 1], [1.12, 7.92], [0.88, 7.91], [0.715, 7.885, 1], [0.675, 7.7], [0.705, 7.34], [0.675, 7.2, 1], [0.69, 7.1], [0.645, 6.9]]);
    const lit = s > 0;      // shadow side = viewer's left: the inner side of this boot, the outer side of the other
    form(body, P.boot, { sh: [lit ? E([[0.5, 6.4], [0.76, 6.4], [0.8, 7.0], [0.86, 7.5], [0.84, 8], [0.5, 8]]) : E([[1.2, 6.4], [0.86, 6.4], [0.9, 7.0], [1.0, 7.36], [1.3, 7.6], [1.6, 7.7], [1.6, 6.4]]),
        E([[0.5, 6.4], [1.2, 6.4], [1.2, 6.96], [0.85, 7.02], [0.5, 6.94]])], inside: () => {
      g.fillStyle = shade(P.boot, 1.7); g.fill(shape(E([[0.6, 7.845], [0.88, 7.862], [1.12, 7.872], [1.32, 7.848], [1.45, 7.795], [1.6, 8], [0.6, 8]])));              // sole
      for (const b of [[[0.6, 7.3], [0.86, 7.25], [1.1, 7.33], [1.17, 7.45], [0.88, 7.37], [0.66, 7.42]]]) { const q = shape(E(b)); g.fillStyle = P.strap; g.fill(q); g.strokeStyle = P.ink; g.lineWidth = LW; g.stroke(q); }
    } });
    fold(E([[1.03, 7.14], [0.92, 7.1], [0.82, 7.14]]), 1.5); fold(E([[0.675, 7.2], [0.78, 7.22], [0.88, 7.19]]), 1.4); fold(E([[1.0, 7.03], [0.93, 7.0], [0.87, 7.02]]), 1.2);     // ankle bunching
    tl(E([[1.14, 7.53], [1.22, 7.61], [1.27, 7.7]]), 1.5 * LW); tl(E([[0.78, 7.62], [0.89, 7.67], [0.98, 7.67]]), 1.4 * LW);
    // turned-down cuff with a split at the front
    form(E([[0.535, 6.4, 1], [1.01, 6.4, 1], [1.045, 6.7], [1.0, 6.8, 1], [0.86, 6.87], [0.8, 6.84, 1], [0.79, 6.9, 1], [0.66, 6.84], [0.585, 6.76, 1]]), P.cuff,
      { sh: [lit ? E([[0.4, 6.3], [0.7, 6.3], [0.72, 7], [0.4, 7]]) : E([[1.1, 6.3], [0.86, 6.3], [0.88, 7], [1.1, 7]]), E([[0.5, 6.35], [1.1, 6.35], [1.1, 6.6], [0.5, 6.6]])] });
    tl(E([[0.8, 6.84], [0.81, 6.72], [0.8, 6.6]]), 1.3 * LW, P.ink, 'out');
  }
  function vest() {
    const half = [[0, 1.3], [0.17, 1.29], [0.5, 1.44], [0.72, 1.575], [0.775, 1.73], [0.69, 1.95], [0.635, 2.1, 1], [0.645, 2.32], [0.58, 2.66], [0.525, 2.93], [0.55, 3.15], [0.6, 3.38, 1], [0, 3.42]];
    form(sym(half), P.vest, { sh: [[[-0.9, 1.8], [-0.38, 1.95], [-0.43, 2.45], [-0.36, 3.0], [-0.9, 3.0]], [[-0.9, 1.2], [0.9, 1.2], [0.9, 1.84], [0.62, 1.92], [0.32, 2.02], [0.03, 2.2], [-0.3, 2.03], [-0.62, 1.92], [-0.9, 1.84]], [[-0.7, 2.88], [0.7, 2.88], [0.7, 3.5], [-0.7, 3.5]]] });
    form([[0.12, 1.8, 1], [0.185, 1.8, 1], [-0.35, 2.99, 1], [-0.42, 2.985, 1]], P.trim, {});      // trimmed edge of the upper panel
  }
  function skirt() {
    both(s => form(flip(s, [[0.4, 3.34, 1], [0.64, 3.32, 1], [0.725, 3.7], [0.745, 4.04, 1], [0.5, 4.12, 1], [0.455, 3.7]]), P.vest, { cres: [s > 0 ? 0.04 : 0.06, -0.01], sh: [flip(s, [[0.3, 3.2], [0.9, 3.2], [0.9, 3.47], [0.3, 3.47]])] }));
    form([[-0.445, 3.36, 1], [0.445, 3.36, 1], [0.475, 4.2], [0.435, 4.87, 1], [0, 5.07, 1], [-0.435, 4.87, 1], [-0.475, 4.2]], P.vest, { sh: [[[-0.6, 3.3], [-0.2, 3.3], [-0.19, 4.2], [-0.23, 5.0], [-0.6, 5.0]], [[-0.6, 3.3], [0.6, 3.3], [0.6, 3.5], [-0.6, 3.5]]] });
    form([[-0.435, 4.87, 1], [0, 5.07, 1], [0.435, 4.87, 1], [0.44, 4.795, 1], [0, 4.99, 1], [-0.44, 4.795, 1]], P.trim, {});
    fold([[0, 3.45], [0.005, 4.2], [0, 4.99]], 1.2);
  }
  function sash() {
    form([[-0.59, 2.955, 1], [0, 3.0], [0.59, 2.955, 1], [0.63, 3.37, 1], [0, 3.43], [-0.63, 3.37, 1]], P.sash, { sh: [[[-0.7, 2.9], [-0.4, 2.9], [-0.42, 3.5], [-0.7, 3.5]], [[-0.7, 3.27], [0, 3.33], [0.7, 3.27], [0.7, 3.5], [-0.7, 3.5]]] });
    // hanging ends first, then the knot that pinches them
    form([[-0.5, 3.3, 1], [-0.41, 3.3, 1], [-0.52, 4.12, 1], [-0.66, 4.02, 1]], P.sash, { cres: [0.03, 0] });
    form([[-0.44, 3.3, 1], [-0.33, 3.3, 1], [-0.36, 4.36, 1], [-0.5, 4.24, 1]], P.sash, { cres: [0.035, 0] });
    form([[-0.5, 3.08, 1], [-0.36, 3.06], [-0.3, 3.1, 1], [-0.31, 3.3], [-0.35, 3.36, 1], [-0.48, 3.36], [-0.52, 3.3, 1]], P.sash, { cres: [0.03, -0.01] });
    fold([[-0.36, 3.08], [-0.4, 3.2], [-0.41, 3.34]], 1.3); fold([[-0.5, 3.1], [-0.455, 3.2], [-0.45, 3.32]], 1.2);
    fold([[-0.3, 3.16], [0.0, 3.14], [0.3, 3.17]], 1.3); fold([[-0.3, 3.27], [-0.05, 3.3], [0.2, 3.29]], 1.2);
  }
  function arm(s, rot, hAng) {   // loose sleeve gathered into a wrapped forearm; the hand hangs as a loose fist at mid-thigh
    const E = pts => flip(s, pts), lit = s > 0;
    g.save(); g.translate(s * 0.78, 1.7); g.rotate(rot); g.translate(-s * 0.78, -1.7);
    hand(s * 1.012, 4.0, 0.47, -s, hAng);
    form(E([[0.8, 1.6], [0.98, 2.2], [1.115, 2.85], [1.215, 3.36, 1], [1.165, 3.5, 1], [0.86, 3.52, 1], [0.785, 3.36, 1], [0.765, 2.9], [0.665, 2.1], [0.62, 1.8]]), P.tunic,
      { sh: [E([[0.5, 1.5], [1.3, 1.5], [1.3, 1.84], [0.9, 1.92], [0.5, 1.9]]),
        lit ? E([[0.5, 1.6], [0.8, 1.9], [0.87, 2.6], [0.9, 3.1], [0.93, 3.6], [0.5, 3.6]]) : E([[1.4, 1.6], [0.92, 1.9], [1.0, 2.6], [1.06, 3.1], [1.07, 3.6], [1.4, 3.6]]),
        E([[0.7, 3.4], [1.0, 3.3], [1.25, 3.38], [1.25, 3.6], [0.7, 3.6]])] });
    fold(E([[1.215, 3.36], [1.12, 3.3], [1.03, 3.16]]), 1.6); fold(E([[0.785, 3.36], [0.87, 3.28], [0.93, 3.12]]), 1.5); fold(E([[1.0, 3.5], [1.01, 3.4], [0.99, 3.3]]), 1.2);
    fold(E([[0.72, 2.56], [0.86, 2.7], [0.99, 2.72]]), 1.4); fold(E([[1.1, 2.8], [1.0, 2.9], [0.9, 2.92]]), 1.2);
    form(E([[0.87, 3.47, 1], [1.16, 3.455, 1], [1.14, 3.75], [1.105, 4.04, 1], [0.92, 4.04, 1], [0.89, 3.75]]), P.wrap,
      { sh: [lit ? E([[0.8, 3.4], [0.95, 3.4], [0.98, 4.1], [0.8, 4.1]]) : E([[1.2, 3.4], [1.06, 3.4], [1.05, 4.1], [1.2, 4.1]])], inside: () => {
        for (const y of [3.6, 3.74, 3.88]) tl(E([[0.84, y - 0.02], [0.94, y + 0.035], [1.06, y + 0.04], [1.2, y - 0.03]]), 1.5 * LW, shade(P.wrap, -2.4)); } });   // wraps curve round the forearm
    g.restore();
  }
  function mantle() {       // hooded mantle: straight shoulder lines to a corner, a short straight drop, hems running in to a point; the viewer's-left flap lies on top
    form([[0.03, 1.86, 1], [0.34, 1.9, 1], [0.215, 2.075, 1]], shade(P.cowl), {});                                         // corner of the under flap showing below the hem
    form([[-0.2, 1.07], [-0.45, 1.2], [-0.72, 1.37], [-0.875, 1.53, 1], [-0.895, 1.76, 1], [-0.6, 1.83], [-0.3, 1.94], [0.03, 2.13, 1], [0.33, 1.9], [0.6, 1.8], [0.885, 1.735, 1], [0.865, 1.52, 1], [0.71, 1.36], [0.45, 1.2], [0.2, 1.07],
      [0.175, 1.18], [0.115, 1.34], [0.03, 1.5, 1], [-0.105, 1.34], [-0.175, 1.18]], P.cowl, { sh: [
      [[-0.3, 1.0], [-0.105, 1.32], [0.03, 1.5], [0.07, 2.2], [-0.05, 2.2], [-0.22, 1.56], [-0.4, 1.22]],                    // inside the opening and under the top flap's edge
      [[-1, 1.2], [-0.56, 1.24], [-0.6, 1.5], [-0.52, 1.82], [-0.6, 2], [-1, 2]],                                             // the shoulder turning away from the light
      [[0.42, 1.14], [0.76, 1.36], [0.9, 1.5], [0.6, 1.42], [0.3, 1.22]] ] });                                                // cast by the hood's edge
    tl([[0.03, 1.5], [0.045, 1.8], [0.03, 2.1]], 1.6 * LW, P.ink, 'out');                // where the flaps overlap
    const seam = shade(P.cowl, 2.2);                                                     // gathers toward the collar, in the cloth's own dark
    tl([[-0.2, 1.16], [-0.3, 1.36], [-0.34, 1.6]], 1.6 * LW, seam, 'out'); tl([[0.27, 1.2], [0.42, 1.42], [0.47, 1.66]], 1.6 * LW, seam, 'out'); tl([[-0.875, 1.53], [-0.78, 1.58], [-0.72, 1.7]], 1.5 * LW, seam, 'out');
    form([[0.015, 1.68], [0.07, 1.7], [0.075, 1.79], [0.03, 1.81], [-0.005, 1.75]], P.trim, {});   // toggle
  }
  function draw(ctx, o = {}) {
    g = ctx; LW = o.lineWidth || 0.0045;
    const tilt = fn => { g.save(); g.translate(0, 1.0); g.rotate(-0.035); g.translate(0, -1.0); fn(); g.restore(); };
    tilt(hairBack); hoodBack(); backPanel(); boot(1, 0.08, 1); boot(-1, 0.06, 0.72); pants(); vest(); skirt(); sash(); arm(-1, 0.02, -0.06); arm(1, -0.085, 0.1); neck(); mantle(); braid(); tilt(() => { head(); hairFront(); });
  }
  return { draw, P, HEIGHT, shade };
})();
if (typeof module !== 'undefined') module.exports = NAORI;
