/* =====================================================================
   TRACED-PARTS CHARACTER GENERATOR
   ---------------------------------------------------------------------
   Every piece drawn here is a real traced figure (traces/*.js), cut into
   four stacked bands with Canvas clipping:

     head  : above the chin  (+ hair that hangs below the chin, from hand-marked hair regions)
     upper : chin  -> waist   (torso, arms, top)
     lower : waist -> shin    (pants / skirt / coat tails)
     feet  : shin  -> ground  (boots, wraps, shoes)

   Each band is pinned to the same body lines (skull, chin, waist, shin, ground) on a shared
   target skeleton, so a head from one figure sits on a torso from another. Colours are changed
   per role (skin, hair, top, top2, bottom, bottom2, shoes) by shifting every palette entry with
   that role by the same Lab offset, which keeps the original shading.
   ===================================================================== */

const VIEWS = ['front', 'side', 'back'];
const PIECES = ['feet', 'lower', 'upper', 'head'];          // drawing order
const ROLES = ['skin', 'hair', 'top', 'bottom', 'shoes'];

/* ---------- colour: sRGB <-> CIELab (D65) ---------- */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToHex(c) { return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function rgbToLab([r, g, b]) {
  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = t => t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const g = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return [g(X * 3.2406 - Y * 1.5372 - Z * 0.4986), g(-X * 0.9689 + Y * 1.8758 + Z * 0.0415), g(X * 0.0557 - Y * 0.2040 + Z * 1.0570)];
}

/* palette of one traced figure, recoloured for a theme ({role: '#hex'}; missing role = keep).
   Every palette entry carries a role (skin, hair, top, bottom, shoes, ink, keep), decided in
   tools/parts.py from colour and from where on the figure that colour sits (a tunic skirt below the
   waist is still 'top'). An entry moves by the offset that takes its role's anchor colour to the
   theme colour, so a garment's own shading and two-tone details are kept. */
const PIECE_ROLE = { head: 'top', upper: 'top', lower: 'bottom', feet: 'shoes' };
const _palCache = new Map();
function recolor(fid, theme, piece) {
  const key = fid + piece + JSON.stringify(theme); if (_palCache.has(key)) return _palCache.get(key);
  const t = TRACE[fid], f = FIG[fid], out = t.palette.slice();
  // light/dark targets: scale lightness differences so shading stays visible
  const shift = (hex, anchor, target) => {
    const e = rgbToLab(hexToRgb(hex)), a = rgbToLab(hexToRgb(anchor)), n = rgbToLab(hexToRgb(target));
    const dL = e[0] - a[0];
    return rgbToHex(labToRgb([Math.max(4, Math.min(97, n[0] + dL)), n[1] + (e[1] - a[1]) * 0.6, n[2] + (e[2] - a[2]) * 0.6]));
  };
  t.palette.forEach((hex, i) => {
    const tag = f.tags[i];
    if (!tag || tag === 'ink' || tag === 'keep') return;
    if (theme[tag] && f.anchors[tag]) out[i] = shift(hex, f.anchors[tag], theme[tag]);
  });
  _palCache.set(key, out); return out;
}

/* ---------- path helpers ---------- */
function ringPath(g, r) {
  const n = r.length / 3; if (n < 3) return;
  const X = i => r[((i % n) + n) % n * 3], Y = i => r[((i % n) + n) % n * 3 + 1], S = i => r[((i % n) + n) % n * 3 + 2];
  const k = 1 / 6;
  g.moveTo(X(0), Y(0));
  for (let i = 0; i < n; i++) {
    const t0x = S(i) ? 0 : (X(i + 1) - X(i - 1)) * k, t0y = S(i) ? 0 : (Y(i + 1) - Y(i - 1)) * k;
    const t1x = S(i + 1) ? 0 : (X(i + 2) - X(i)) * k, t1y = S(i + 1) ? 0 : (Y(i + 2) - Y(i)) * k;
    g.bezierCurveTo(X(i) + t0x, Y(i) + t0y, X(i + 1) - t1x, Y(i + 1) - t1y, X(i + 1), Y(i + 1));
  }
  g.closePath();
}
function polyPath(g, p) { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }

/* draw a trace's paths; filter(paletteIndex) decides which colour layers to draw */
function drawPaths(g, fid, pal, filter) {
  for (const [ci, rings] of TRACE[fid].paths) {
    if (filter && !filter(ci)) continue;
    g.beginPath(); for (const r of rings) ringPath(g, r);
    g.fillStyle = pal[ci]; g.fill('evenodd');
  }
}

/* ---------- which figure provides a piece in a view ---------- */
function figFor(setName, view) {
  const s = SETS[setName]; let fid = s.views[view];
  if (!fid && s.fallback) fid = SETS[s.fallback].views[view];
  return fid;
}

/* ---------- target skeleton ---------- */
function skeleton(body, pieces) {
  // band lengths come from the chosen pieces' own front-view proportions (so an unmixed character
  // reproduces its source exactly), then the proportion sliders scale them
  const frac = (piece, a, b) => { const f = FIG[figFor(pieces[piece], 'front')]; return (f[b] - f[a]) / (f.ground - f.skull); };
  const r = { head: frac('head', 'skull', 'chin') * body.head, upper: frac('upper', 'chin', 'waist') * body.torso,
              lower: frac('lower', 'waist', 'shin') * body.legs, feet: frac('feet', 'shin', 'ground') * body.legs };
  const H = 1000, u = H / (r.head + r.upper + r.lower + r.feet);
  const skull = 0, chin = r.head * u, waist = chin + r.upper * u, shin = waist + r.lower * u, ground = shin + r.feet * u;
  return { skull, chin, waist, shin, ground, H: ground };
}

/* band of a piece in source (figure) and target coordinates */
const BAND = { head: ['skull', 'chin'], upper: ['chin', 'waist'], lower: ['waist', 'shin'], feet: ['shin', 'ground'] };
const OVERLAP = { head: 0.022, upper: 0.03, lower: 0.008, feet: 0 };   // how far a piece reaches below its band (fraction of height)

// how much the target skeleton is taller than this figure's own proportions (keeps widths natural)
function bodyStretch(sk, f) { return 1; }

function placement(piece, fid, sk, body, view) {
  const f = FIG[fid], [a, b] = BAND[piece];
  const sy = (sk[b] - sk[a]) / (f[b] - f[a]);
  const u = sk.H / (f.ground - f.skull) / bodyStretch(sk, f);   // whole-figure scale (widths)
  let sx = piece === 'head' ? sy * body.headWidth : u * (piece === 'upper' ? body.shoulders : piece === 'lower' ? body.hips : 1);
  const flip = (view === 'side' && f.flip) ? -1 : 1;
  return { f, sy, sx: sx * flip, ty: sk[a] - f[a] * sy, a, b };
}

/* =====================================================================
   COMPOSE ONE VIEW
   char = { pieces: {head, upper, lower, feet: setName}, theme: {role: hex}, body: {...} }
   ===================================================================== */
function drawCharacter(g, char, view) {
  const P = char.pieces, sk = skeleton(char.body, P);
  const fids = {}; for (const p of PIECES) fids[p] = figFor(P[p], view);
  const pl = {}; for (const p of PIECES) pl[p] = placement(p, fids[p], sk, char.body, view);
  // horizontal chaining: lower and upper share the waist centre; head hangs from the upper's neck,
  // feet hang from the lower's shin centre
  const X = {};
  X.lower = -pl.lower.f.cxWaist * pl.lower.sx;
  X.upper = -pl.upper.f.cxWaist * pl.upper.sx;
  const neckX = X.upper + pl.upper.f.cxNeck * pl.upper.sx;
  X.head = neckX - pl.head.f.cxNeck * pl.head.sx;
  const shinX = X.lower + pl.lower.f.cxShin * pl.lower.sx;
  X.feet = shinX - pl.feet.f.cxShin * pl.feet.sx;

  for (const piece of PIECES) {
    const fid = fids[piece], p = pl[piece], f = p.f, H = f.ground - f.skull;
    const pal = recolor(fid, char.theme, piece);
    const yTop = piece === 'head' ? -1e4 : f[p.a];
    const yBot = piece === 'feet' ? 1e4 : f[p.b] + OVERLAP[piece] * H;
    const hairSwap = P.head !== P.upper;                    // someone else's head: remove this body's long hair
    g.save();
    applyTransform(g, p.sx, p.sy, X[piece], p.ty);
    const W = 1e4;
    if (piece === 'upper' && hairSwap && f.hair.length) {
      // (1) everything outside the hair regions
      g.save(); g.beginPath(); g.rect(-W, yTop, 2 * W, yBot - yTop); for (const h of f.hair) polyPath(g, h); g.clip('evenodd');
      drawPaths(g, fid, pal); g.restore();
      // (2) inside the hair regions: only clothing / skin layers (hair and ink dropped, so the clothing shows through)
      g.save(); g.beginPath(); g.rect(-W, yTop, 2 * W, yBot - yTop); g.clip(); g.beginPath(); for (const h of f.hair) polyPath(g, h); g.clip();
      const ink = TRACE[fid].order[TRACE[fid].order.length - 1];
      drawPaths(g, fid, pal, ci => f.tags[ci] !== 'hair' && f.tags[ci] !== 'ink'); g.restore();
    } else if (piece === 'head') {
      g.save(); g.beginPath(); g.rect(-W, yTop, 2 * W, yBot - yTop); g.clip(); drawPaths(g, fid, pal); g.restore();
    } else {
      g.beginPath(); g.rect(-W, yTop, 2 * W, yBot - yTop); g.clip(); drawPaths(g, fid, pal);
    }
    g.restore();
  }
  // long hair / side locks that hang below the chin: drawn last, over the body
  const hf = fids.head, hp = pl.head, F = FIG[hf];
  if (F.hair.length) {
    const pal = recolor(hf, char.theme, 'head');
    g.save(); applyTransform(g, hp.sx, hp.sy, X.head, hp.ty);
    g.beginPath(); for (const h of F.hair) polyPath(g, h); g.clip();
    g.beginPath(); g.rect(-1e4, F.chin + OVERLAP.head * (F.ground - F.skull) * 0.5, 2e4, 1e4); g.clip();
    const ink = TRACE[hf].order[TRACE[hf].order.length - 1];
    drawPaths(g, hf, pal, ci => F.tags[ci] === 'hair' || F.tags[ci] === 'ink');
    g.restore();
  }
  return { sk, fids };
}

/* the caller sets a "view transform" (scale + translate) on the context before calling drawCharacter;
   we read it back so piece transforms compose with it */
function applyTransform(g, sx, sy, tx, ty) {
  const B = g.__baseFull || [1, 0, 0, 1, 0, 0];
  // B * [sx 0 tx; 0 sy ty]
  g.setTransform(B[0] * sx, B[1] * sx, B[2] * sy, B[3] * sy, B[0] * tx + B[2] * ty + B[4], B[1] * tx + B[3] * ty + B[5]);
}
function setBase(g, a, b, c, d, e, f) { g.__base = [a, b, c, d]; g.__baseFull = [a, b, c, d, e, f]; g.setTransform(a, b, c, d, e, f); }

/* =====================================================================
   PRESETS + RANDOMIZER
   ===================================================================== */
const BODY_DEFAULT = { height: 1, head: 1, torso: 1, legs: 1, shoulders: 1, hips: 1, headWidth: 1 };

function originalOf(setName) {
  const p = {}; for (const k of PIECES) p[k] = setName;
  return { pieces: p, theme: {}, body: { ...BODY_DEFAULT } };
}

const THEMES = {
  'Water Tribe': { top: '#5a88b4', bottom: '#4a5d74', shoes: '#7a5f4a' },
  'Fire Nation': { top: '#8c2a24', bottom: '#2c2422', shoes: '#2a201e' },
  'Earth Kingdom': { top: '#4c6a38', bottom: '#5a5040', shoes: '#4a3d2c' },
  'Air Nomad': { top: '#d9902e', bottom: '#c97f22', shoes: '#6e3a1e' },
  'Republic City': { top: '#3c3f44', bottom: '#24242a', shoes: '#1d1d1f' },
  'Metal Clan': { top: '#2c2c2e', bottom: '#5c6254', shoes: '#56585a' },
};
const SKINS = ['#f1d2b6', '#e3bd9a', '#d2a882', '#bf9572', '#a37a58', '#8a6446', '#6e4c35'];
const HAIRS = ['#151414', '#241d1a', '#3b2a20', '#5a3a24', '#7a4a2a'];

function makeRng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function randomCharacter(seed, opts = {}) {
  const r = makeRng(seed), pick = a => a[Math.floor(r() * a.length)], jit = (v, d) => +(v + (r() * 2 - 1) * d).toFixed(3);
  const names = Object.keys(SETS);
  const sex = opts.sex || pick(['female', 'male']);
  const pool = names.filter(n => SETS[n].sex === sex);
  const pieces = { head: pick(pool), upper: pick(pool), lower: pick(names.filter(n => SETS[n].sex === sex || r() < 0.3)), feet: pick(names.filter(n => !SETS[n].lockFeet)) };
  if (r() < 0.35) pieces.lower = pieces.upper;          // keep some outfits whole
  if (SETS[pieces.lower].lockFeet) pieces.feet = pieces.lower;
  const themeName = pick(Object.keys(THEMES));
  const theme = { ...THEMES[themeName], skin: pick(SKINS), hair: pick(HAIRS) };
  const body = { height: 1, head: jit(1, 0.06), torso: jit(1, 0.06), legs: jit(1, 0.06), shoulders: jit(sex === 'male' ? 1.04 : 0.98, 0.05), hips: jit(1, 0.05), headWidth: jit(1, 0.04) };
  return { seed, sex, themeName, pieces, theme, body };
}
