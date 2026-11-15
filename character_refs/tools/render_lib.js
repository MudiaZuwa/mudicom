/* Shared Canvas renderer for traced figures.
   drawTrace(ctx, trace, opts) draws a figure in its own pixel space (use ctx transforms to place/scale). */
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
function drawTrace(g, t, opts = {}) {
  const pal = opts.palette || t.palette;
  for (const [ci, rings] of t.paths) {
    if (opts.only && !opts.only.has(ci)) continue;
    g.beginPath();
    for (const r of rings) ringPath(g, r);
    g.fillStyle = pal[ci];
    g.fill('evenodd');
  }
}
if (typeof module !== 'undefined') module.exports = { drawTrace, ringPath };
