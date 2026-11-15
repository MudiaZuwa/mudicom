/* =====================================================================
   LoK-STYLE CONSTRUCTIONS
   ---------------------------------------------------------------------
   Rules learned from the traced references:
   * Every form is a SEPARATE closed shape with its own thin ink outline.
     Volume comes from overlapping shapes (a finger lobe over the palm, an
     ankle roll over the boot shaft), never from lines drawn on a flat blob.
   * Each shape: flat base colour + one cel-shadow shape clipped inside it
     (shadow on the side away from the light, and under overlaps).
   * Outline weight ~ 0.12% of figure height; detail lines ~ 70% of that.
   All functions draw in a local frame given by an origin, an angle and a
   size, so they can be placed on any body.
   ===================================================================== */
const LOK = (() => {
  // smooth closed/open Catmull-Rom path; [x,y,1] = sharp corner
  function sp(path, pts, closed = true) {
    const n = pts.length, P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const T = i => { const p = P(i); if (p[2] || (!closed && (i <= 0 || i >= n - 1))) return [0, 0]; const a = P(i - 1), b = P(i + 1); return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6]; };
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = P(i), b = P(i + 1), ta = T(i), tb = T(i + 1); path.bezierCurveTo(a[0] + ta[0], a[1] + ta[1], b[0] - tb[0], b[1] - tb[1], b[0], b[1]); }
    if (closed) path.closePath();
    return path;
  }
  const shape = pts => sp(new Path2D(), pts);
  // one form: base fill, shadow shapes clipped inside, outline
  function form(g, pts, base, shadows, st) {
    const p = shape(pts);
    g.fillStyle = base; g.fill(p);
    if (shadows && shadows.length) {
      g.save(); g.clip(p);
      for (const s of shadows) { g.fillStyle = s.color; g.fill(shape(s.pts)); }
      g.restore();
    }
    g.strokeStyle = st.ink; g.lineWidth = st.lw; g.lineJoin = 'round'; g.stroke(p);
  }
  function line(g, pts, w, color) { const p = sp(new Path2D(), pts, false); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.stroke(p); }
  // local frame: origin o, rotation a (radians, 0 = pointing down +y), scale s, mirror m (+1/-1)
  function frame(g, o, a, s, m, fn) { g.save(); g.translate(o[0], o[1]); g.rotate(a); g.scale(s * m, s); fn(); g.restore(); }

  /* ---------------- HAND ----------------
     Local units: 1 = hand length (wrist to knuckles of the curled fist ~ 1).
     +y runs from the wrist toward the fingers, +x toward the thumb.
     pose 'grip'   : fist closed on something (fingers curled under, thumb wrapped in front)
     pose 'relaxed': hanging hand, fingers loosely curled (from the leaning-pose reference) */
  function hand(g, o) {
    const st = { ink: o.ink || '#141414', lw: (o.lw || 0.7) / o.size };
    const sk = o.skin, sh = o.shade;
    frame(g, o.wrist, o.angle || 0, o.size, o.thumb === 'left' ? -1 : 1, () => {
      if (o.pose === 'relaxed') {
        // hanging hand seen from the side (from the leaning-pose reference): +x = thumb side,
        // units: 1 = wrist -> fingertip. back-of-hand slab, curled finger mass, thumb in front.
        form(g, [[-0.13, 0], [0.12, 0], [0.16, 0.2], [0.17, 0.42], [0.1, 0.58], [-0.06, 0.6], [-0.17, 0.48], [-0.17, 0.22]], sk,
          [{ color: sh, pts: [[-0.4, -0.1], [-0.09, -0.1], [-0.1, 0.3], [-0.12, 0.7], [-0.4, 0.7]] }], st);
        form(g, [[-0.17, 0.4], [-0.08, 0.5], [0.06, 0.53], [0.13, 0.62], [0.12, 0.8], [0.05, 0.92], [-0.04, 0.97], [-0.12, 0.9], [-0.18, 0.72], [-0.2, 0.55]], sk,
          [{ color: sh, pts: [[-0.4, 0.4], [-0.1, 0.5], [-0.07, 0.75], [-0.02, 1.1], [-0.4, 1.1]] }], st);
        line(g, [[-0.12, 0.55], [-0.05, 0.7], [0.0, 0.86]], st.lw * 0.8, st.ink);
        line(g, [[-0.02, 0.53], [0.05, 0.66], [0.07, 0.8]], st.lw * 0.8, st.ink);
        form(g, [[0.09, 0.1], [0.2, 0.2], [0.25, 0.4], [0.22, 0.58], [0.15, 0.66], [0.09, 0.6], [0.1, 0.42], [0.06, 0.25]], sk,
          [{ color: sh, pts: [[0.0, 0.5], [0.4, 0.45], [0.4, 0.8], [0.0, 0.8]] }], st);
      } else {
        // GRIP: back of hand
        form(g, [[-0.26, -0.06], [0.24, -0.06], [0.33, 0.22], [0.34, 0.52], [-0.30, 0.56], [-0.32, 0.24]], sk,
          [{ color: sh, pts: [[-0.6, -0.1], [-0.2, -0.1], [-0.24, 0.6], [-0.6, 0.6]] }], st);
        // four curled finger segments seen end-on: a row of rounded lobes, index (thumb side) biggest
        const row = [[-0.24, 0.14], [-0.085, 0.155], [0.075, 0.165], [0.235, 0.17]];
        row.forEach(([x, w], i) => {
          const y = 0.50 + i * 0.015, l = 0.36 + i * 0.03;
          form(g, [[x - w / 2, y, 1], [x + w / 2, y, 1], [x + w * 0.55, y + l * 0.6], [x + w * 0.3, y + l], [x - w * 0.3, y + l], [x - w * 0.55, y + l * 0.6]], sk,
            [{ color: sh, pts: [[x - w, y + l * 0.62], [x + w, y + l * 0.7], [x + w, y + l * 1.3], [x - w, y + l * 1.3]] }], st);
        });
        // thumb wrapped across the front of the index finger
        form(g, [[0.28, 0.08], [0.41, 0.20], [0.40, 0.50], [0.28, 0.72], [0.17, 0.76], [0.15, 0.6], [0.24, 0.44], [0.23, 0.24]], sk,
          [{ color: sh, pts: [[0.1, 0.6], [0.6, 0.55], [0.6, 0.9], [0.1, 0.9]] }], st);
        // knuckle crease
        line(g, [[-0.27, 0.30], [-0.03, 0.34], [0.23, 0.32]], st.lw * 0.75, st.ink);
      }
    });
  }

  /* ---------------- FUR-TOPPED BOOT ----------------
     Template measured from the front reference (korra_pair_front left boot), normalised:
     origin = centre of the boot top, unit = boot height (top -> ground), toe toward -x.
     Construction (back to front): leather silhouette (shaft + foot in one shape) with a side
     shadow and a thin sole shadow -> curved darker ankle strap -> toe creases -> fur cuff whose
     front hangs in a pointed flap.
     o.top [x,y], o.ground y, o.toe (+1 right / -1 left), o.lean (x shift of the ankle per unit
     height), o.widthScale. */
  const BOOT = {
    body: [[-0.284,0.159],[-0.239,0.409],[-0.232,0.557],[-0.265,0.655],[-0.403,0.76],[-0.5,0.849],[-0.516,0.914,1],[-0.435,0.977],[-0.208,0.995],[0.068,0.977],[0.231,0.931],[0.272,0.784],[0.261,0.686],[0.28,0.622,1],[0.247,0.557],[0.231,0.362],[0.25,0.159]],
    sideShadow: [[-0.4,0.1],[-0.2,0.1],[-0.185,0.42],[-0.19,0.6],[-0.4,0.6]],
    sole: [[-0.6,0.86],[-0.47,0.905],[-0.3,0.93],[-0.1,0.94],[0.1,0.925],[0.3,0.86],[0.3,1.1],[-0.6,1.1]],
    strap: [[-0.262,0.625],[-0.136,0.58],[0,0.568],[0.148,0.59],[0.282,0.612],[0.288,0.68],[0.148,0.66],[0,0.64],[-0.136,0.652],[-0.27,0.7]],
    creases: [[[-0.43,0.875],[-0.33,0.845],[-0.2,0.86]], [[-0.08,0.93],[0.05,0.912],[0.16,0.92]]],
    cuff: [[-0.33,0.004,1],[-0.193,0.045],[-0.057,0.074],[0.114,0.045],[0.288,0.028,1],[0.272,0.175],[0.136,0.227],[0.011,0.272],[0.011,0.329,1],[-0.102,0.435,1],[-0.193,0.329],[-0.28,0.207,1]],
    cuffShadow: [[-0.4,-0.05],[-0.1,-0.05],[-0.102,0.44],[-0.193,0.33],[-0.28,0.21],[-0.4,0.21]],
  };
  function furBoot(g, o) {
    const h = o.ground - o.top[1], d = o.toe, ws = o.widthScale || 1, lean = o.lean || 0;
    const st = { ink: o.ink || '#141414', lw: (o.lw || 0.7) / h };
    const B = o.colors;
    g.save();
    // x' = top.x + h*(d*-1*x*ws + lean*y) ; y' = top.y + h*y   (template toe points to -x)
    g.transform(-d * ws * h, 0, lean * h, h, o.top[0], o.top[1]);
    form(g, BOOT.body, B.leather, [{ color: B.leatherShade, pts: BOOT.sideShadow }, { color: B.leatherShade, pts: BOOT.sole }], st);
    { const p = shape(BOOT.strap); g.fillStyle = B.strap || B.leatherShade; g.fill(p); }
    for (const c of BOOT.creases) line(g, c, st.lw * 0.8, st.ink);
    form(g, BOOT.cuff, B.fur, [{ color: B.furShade, pts: BOOT.cuffShadow }], st);
    g.restore();
  }

  return { hand, furBoot, form, line, shape, sp };
})();
if (typeof module !== 'undefined') module.exports = LOK;
