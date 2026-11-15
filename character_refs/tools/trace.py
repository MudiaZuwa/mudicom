"""Trace every figure listed in figures.json into Canvas-drawable vector data.

Pipeline per figure:
  1. cut the figure out of its sheet (background = median border colour)
  2. flatten JPEG noise (mean-shift) and quantise to the figure's own palette
  3. upscale x4 with smooth edges, re-quantise  -> clean flat colour regions
  4. vectorise each colour region with vtracer (stacked splines)
  5. write traces/<id>.js :  TRACES.push({id, ..., palette, paths:[[fillIndex, cmds]]})
     each path = [paletteIndex, [ring, ring, ...]]; ring = flat [x, y, sharp, x, y, sharp, ...]
     (first ring = outline, others = holes; drawn as smooth closed curves, even-odd fill)
     coordinates are source-image pixels relative to the figure box.
"""
import cv2, numpy as np, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UP = 4

def bg_color(im):
    """Per-pixel background model (handles vignetting / paper shading): a smooth quadratic
    surface per Lab channel, fitted to pixels that look like background."""
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    H, W = lab.shape[:2]
    b = np.concatenate([lab[:3].reshape(-1, 3), lab[-3:].reshape(-1, 3), lab[:, :3].reshape(-1, 3), lab[:, -3:].reshape(-1, 3)])
    model = np.broadcast_to(np.median(b, 0), lab.shape).copy()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); xn, yn = xx / W, yy / H
    A = np.stack([np.ones_like(xn), xn, yn, xn * xn, yn * yn, xn * yn], -1).reshape(-1, 6)
    for it in range(3):
        d = np.sqrt(((lab - model) ** 2).sum(-1))
        sel = (cv2.erode((d < 22).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0).reshape(-1)
        if sel.sum() < 500: break
        idx = np.flatnonzero(sel)[::7]
        coef, *_ = np.linalg.lstsq(A[idx], lab.reshape(-1, 3)[idx], rcond=None)
        model = (A @ coef).reshape(H, W, 3).astype(np.float32)
    return model

def paper_model(im, k=71):
    """Photographed paper: brightness varies locally (shadows). Local max of L (the paper is the
    lightest thing around) + smooth a/b from the quadratic model."""
    model = bg_color(im)
    L = cv2.cvtColor(im, cv2.COLOR_BGR2LAB)[:, :, 0]
    Lb = cv2.dilate(L, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    Lb = cv2.GaussianBlur(Lb.astype(np.float32), (0, 0), k / 3)
    model[:, :, 0] = Lb
    return model

def figure_mask(crop, bg, fig, box, thr=26):
    thr = fig.get('thr', thr)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    d = np.sqrt(((lab - bg) ** 2).sum(-1))
    m = (d > thr).astype(np.uint8)
    x0, y0 = box[0], box[1]
    for ex in fig.get('exclude', []):
        m[max(0, ex[1] - y0):max(0, ex[3] - y0), max(0, ex[0] - x0):max(0, ex[2] - x0)] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # keep the main figure: largest component + sizeable pieces in the central band
    n, cc, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    if n > 1:
        big = 1 + np.argmax(st[1:, 4]); w = m.shape[1]; keep = np.zeros(n, bool); keep[big] = True
        for i in range(1, n):
            if st[i, 4] >= 25 and (0.1 * w < cen[i][0] < 0.9 * w or st[i, 4] > 0.02 * st[big, 4]):
                # drop pieces touching the left/right crop edge (neighbouring figures)
                x, y, bw, bh, a = st[i]
                touches = x <= 0 or x + bw >= w
                if not touches or i == big: keep[i] = True
        m = keep[cc].astype(np.uint8)
    # peel light anti-alias fringe pixels off the silhouette (they are mostly background colour)
    for _ in range(2):
        er = cv2.erode(m, np.ones((3, 3), np.uint8))
        edge = (m > 0) & (er == 0)
        m[edge & (d < 60)] = 0
    if fig.get('paper'):
        # photographed sheet: refine with GrabCut colour models (separates paper shadows from the figure)
        gc = np.full(m.shape, cv2.GC_PR_BGD, np.uint8)
        gc[m > 0] = cv2.GC_PR_FGD
        gc[cv2.erode(m, np.ones((5, 5), np.uint8)) > 0] = cv2.GC_FGD
        gc[(d < thr * 0.45) & (cv2.dilate(m, np.ones((3, 3), np.uint8)) == 0)] = cv2.GC_BGD
        bgdm, fgdm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(crop, gc, None, bgdm, fgdm, 4, cv2.GC_INIT_WITH_MASK)
        m = np.isin(gc, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
        n, cc, st, _ = cv2.connectedComponentsWithStats(m)
        if n > 1: m = (cc == 1 + np.argmax(st[1:, 4])).astype(np.uint8) | (m & (st[cc, 4] > 60).astype(np.uint8))
    # fill enclosed holes that are NOT background-coloured (white fur, collars, eye whites)
    inv = (1 - m).astype(np.uint8)
    n, cc, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    H, W = m.shape
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if x == 0 or y == 0 or x + bw >= W or y + bh >= H: continue      # touches border -> real background
        hole = cc == i
        if np.median(d[hole]) > max(4, thr * 0.55) or a < 12: m[hole] = 1
    return m

def quantize(img, mask, k):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    Z = lab[mask > 0].reshape(-1, 3).astype(np.float32)
    k = min(k, max(2, len(Z) // 50))
    _, lbl, C = cv2.kmeans(Z, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    return C

def remap(img, C):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    d = ((lab[:, :, None, :] - C[None, None]) ** 2).sum(-1)
    return d.argmin(-1)

def lab2hex(c):
    bgr = cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_LAB2BGR)[0, 0]
    return '#%02x%02x%02x' % (bgr[2], bgr[1], bgr[0])

EPS = 0.45   # simplification tolerance in source pixels
def ring_pts(c):
    a = cv2.approxPolyDP(c, EPS * UP, True).reshape(-1, 2).astype(float)
    out, n = [], len(a)
    for k in range(n):
        p0, p1, p2 = a[k - 1], a[k], a[(k + 1) % n]
        v1, v2 = p0 - p1, p2 - p1
        cos = (v1 @ v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
        x, y = round(p1[0] / UP, 1), round(p1[1] / UP, 1)
        out.extend([x, y, 1 if cos > -0.5 else 0])           # 1 = sharp corner (angle < 120 deg)
    return out

TOK = re.compile(r'[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?')
def parse_path(d, tx, ty, s):
    out, cmd, nums = [], None, []
    toks = TOK.findall(d)
    i = 0
    def emit(c, vals):
        out.append(c)
        for j in range(0, len(vals), 2): out.extend([round((vals[j] + tx) / s, 2), round((vals[j + 1] + ty) / s, 2)])
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZmlcz':
            cmd = t.upper(); i += 1
            if cmd == 'Z': out.append('Z'); continue
            n = {'M': 2, 'L': 2, 'C': 6}[cmd]
            while i < len(toks) and toks[i] not in 'MLCZmlcz':
                emit(cmd, [float(v) for v in toks[i:i + n]]); i += n
                if cmd == 'M': cmd = 'L'; n = 2
        else: i += 1
    return out

def trace_figure(fig, k=None):
    src = cv2.imread(os.path.join(ROOT, 'originals', fig['src']))
    # remove signatures / watermarks by inpainting their dark strokes (keeps what is underneath)
    for ex in fig.get('inpaint', []):
        sub = src[ex[1]:ex[3], ex[0]:ex[2]]
        g = cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
        mk = np.full(g.shape, 255, np.uint8)               # inpaint the whole watermark rectangle
        full = np.zeros(src.shape[:2], np.uint8); full[ex[1]:ex[3], ex[0]:ex[2]] = mk
        src = cv2.inpaint(src, full, 4, cv2.INPAINT_TELEA)
    bg_full = bg_color(src)
    x0, y0, x1, y1 = fig['box']; crop = src[y0:y1, x0:x1].copy(); bg = bg_full[y0:y1, x0:x1]
    mask = figure_mask(crop, bg, fig, fig['box'])
    flat = cv2.pyrMeanShiftFiltering(crop, 3, 14)
    k = k or fig.get('colors', 22)
    C = quantize(flat, mask, k)
    lbl = remap(flat, C)
    # palette image -> upscale smoothly -> re-quantise (sub-pixel smooth boundaries)
    pal_bgr = cv2.cvtColor(C.astype(np.uint8)[None], cv2.COLOR_LAB2BGR)[0]
    q = pal_bgr[lbl]
    big = cv2.resize(q, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    big = cv2.medianBlur(big, 5)
    lbl_big = remap(big, C)
    mbig = cv2.resize(mask * 255, None, fx=UP, fy=UP, interpolation=cv2.INTER_LINEAR)
    mbig = cv2.GaussianBlur(mbig, (5, 5), 0) > 127
    # silhouette rim -> ink colour (removes the light anti-alias halo, matches the outlined style)
    dark_i = int(np.argmin(C[:, 0] + 0.6 * np.hypot(C[:, 1] - 128, C[:, 2] - 128)))   # darkest neutral = ink
    if C[dark_i][0] < 90:
        dist = cv2.distanceTransform(mbig.astype(np.uint8), cv2.DIST_L2, 3)
        rim = mbig & (dist < UP * 0.85)
        lbl_big[rim] = dark_i
    # one layer per palette entry, drawn largest-area first (stacked, no seams)
    areas = [(lbl_big[mbig] == i).sum() for i in range(len(C))]
    order = [i for i in np.argsort(areas)[::-1] if areas[i] > 0]
    darkest = min(order, key=lambda i: C[i][0] + 0.6 * np.hypot(C[i][1] - 128, C[i][2] - 128))          # ink lines go on top, traced as their own crisp shapes
    order = [i for i in order if i != darkest] + [darkest]
    paths = []
    for rank, ci in enumerate(order):
        # stacked: this colour + every colour drawn after it (so lower layers have no holes)
        region = (mbig & np.isin(lbl_big, order[rank:])) if rank else mbig
        g = cv2.GaussianBlur(region.astype(np.uint8) * 255, (0, 0), UP * 0.45) > 127
        cs, hier = cv2.findContours(g.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hier is None: continue
        hier = hier[0]
        for j, c in enumerate(cs):
            if hier[j][3] != -1: continue                       # outer contours; holes appended below
            if cv2.contourArea(c) < (UP * 1.2) ** 2: continue
            rings = [c] + [cs[h] for h in range(len(cs)) if hier[h][3] == j and cv2.contourArea(cs[h]) >= (UP * 1.2) ** 2]
            shape = [ring_pts(r) for r in rings]
            shape = [r for r in shape if len(r) >= 3]
            if shape: paths.append([int(ci), shape])
    # true colours: median of the ORIGINAL (unsmoothed) pixels that fell in each cluster, away from edges
    inner = cv2.erode(mask, np.ones((3, 3), np.uint8)) > 0
    palette = []
    for i in range(len(C)):
        px = crop[(lbl == i) & inner]
        palette.append('#%02x%02x%02x' % tuple(int(v) for v in np.median(px, 0)[::-1]) if len(px) > 8 else lab2hex(C[i]))
    # remap palette to drawing order indices
    return dict(id=fig['id'], src=fig['src'], box=fig['box'], character=fig['character'], sex=fig['sex'], view=fig['view'],
                outfit=fig['outfit'], width=x1 - x0, height=y1 - y0, palette=palette, order=[int(i) for i in order], paths=paths)

if __name__ == '__main__':
    figs = json.load(open(os.path.join(ROOT, 'tools', 'figures.json')))['figures']
    only = set(sys.argv[1:])
    os.makedirs(os.path.join(ROOT, 'traces'), exist_ok=True)
    for f in figs:
        if only and f['id'] not in only: continue
        t = trace_figure(f)
        with open(os.path.join(ROOT, 'traces', f['id'] + '.js'), 'w') as fh:
            fh.write('TRACES.push(' + json.dumps(t, separators=(',', ':')) + ');\n')
        print(f['id'], 'paths', len(t['paths']), 'colors', len(t['palette']), 'KB', os.path.getsize(os.path.join(ROOT, 'traces', f['id'] + '.js')) // 1024, flush=True)
