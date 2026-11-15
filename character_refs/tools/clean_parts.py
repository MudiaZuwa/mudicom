"""Rebuild a reference figure as clean, named vector parts in the show's cel style.

For each part:  smooth silhouette (cubic Beziers) + flat base colour + tone shapes (shadow /
highlight, clipped to the part) + thin ink outline.  Interior ink lines (face, folds) become
stroked centre-lines.  Output: clean/<id>.json, coordinates in figure pixels.

The part spec (clean_specs/<id>.json) lists, in priority order, which colour clusters belong to
which part inside which zone; zones only separate parts that share a colour."""
import cv2, numpy as np, json, os, sys
from skimage.morphology import skeletonize
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bezier_fit import fit_closed, fit_open, to_path

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
UP = 3

def hex2lab(h):
    return cv2.cvtColor(np.uint8([[[int(h[5:7], 16), int(h[3:5], 16), int(h[1:3], 16)]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)

def in_zone(shape, zone):
    """zone: list of rects [x0,y0,x1,y1] / polygons [[x,y],...] in figure px; None = everywhere"""
    H, W = shape; m = np.zeros((H, W), np.uint8)
    if zone is None: m[:] = 1; return m.astype(bool)
    for z in zone:
        if isinstance(z[0], (int, float)):
            x0, y0, x1, y1 = [int(v * UP) for v in z]; m[max(0, y0):y1, max(0, x0):x1] = 1
        else: cv2.fillPoly(m, [np.array(z, np.float32).__mul__(UP).astype(np.int32)], 1)
    return m.astype(bool)

def contour_paths(mask, err, corner, min_area, sigma):
    m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma) > 0.5
    cs, hier = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None: return out
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < min_area * UP * UP: continue
        pts = c.reshape(-1, 2).astype(float)[::2]
        segs = fit_closed(pts, err * UP, corner)
        if segs: out.append(to_path(segs, 1 / UP))
    return out

def mean_hex(img, m):
    px = img[m]; c = np.median(px, 0) if len(px) else np.array([255, 0, 255])
    return '#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0]))

def run(spec_path):
    S = json.load(open(spec_path))
    figs = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'tools/figures.json')))['figures']}
    f = figs[S['figure']]; x0, y0, x1, y1 = f['box']
    src = cv2.imread(os.path.join(ROOT, 'originals', f['src']))[y0:y1, x0:x1]
    big = cv2.resize(src, None, fx=UP, fy=UP, interpolation=cv2.INTER_LANCZOS4)
    flat = cv2.pyrMeanShiftFiltering(big, 6, 18)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).astype(np.float32)
    C = np.array([hex2lab(h) for h in S['clusters']])
    bgL = hex2lab(S.get('background', '#ffffff'))
    fg = np.sqrt(((lab - bgL) ** 2).sum(-1)) > S.get('fg_thr', 18)
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    lbl = ((lab[:, :, None, :] - C[None, None]) ** 2).sum(-1).argmin(-1)
    H, W = lbl.shape
    owner = np.full((H, W), -1, np.int32)
    parts = S['parts']
    for pi, p in enumerate(parts):          # priority order
        sel = fg & (owner < 0) & np.isin(lbl, p['clusters']) & in_zone((H, W), p.get('zone'))
        owner[sel] = pi
    # 'lines_only' parts just reserve pixels (e.g. face lines) so no other part claims them;
    # the pixels go back to the surrounding part below
    for pi, p in enumerate(parts):
        if p.get('lines_only'): owner[owner == pi] = -1
    # unowned foreground (ink edges, stray tones): give to the nearest owned part
    for _ in range(30):
        todo = fg & (owner < 0)
        if not todo.any(): break
        g = cv2.dilate((owner + 1).astype(np.float32), np.ones((3, 3), np.uint8)).astype(np.int32) - 1
        u = todo & (g >= 0); owner[u] = g[u]
    ink_ids = S.get('ink', [])
    out_parts = []
    for pi, p in enumerate(parts):
        if p.get('lines_only') or p.get('skip'): continue
        pm = owner == pi
        if pm.sum() < 20: continue
        pm = cv2.morphologyEx(pm.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
        # split into connected pieces (left / right arm etc.)
        n, cc, st, cen = cv2.connectedComponentsWithStats(pm.astype(np.uint8))
        pieces = sorted([i for i in range(1, n) if st[i, 4] >= p.get('min_area', 30) * UP * UP], key=lambda i: cen[i][0])
        for k, i in enumerate(pieces):
            m = cc == i
            name = p['name'] if len(pieces) == 1 else f"{p['name']}_{k + 1}"
            # tones: clusters inside the piece by area (ink excluded)
            ids, cnt = np.unique(lbl[m & ~np.isin(lbl, ink_ids)], return_counts=True)
            order = [c for _, c in sorted(zip(-cnt, ids))]
            if not order: continue
            base = order[0]
            body = contour_paths(m, p.get('err', 0.45), p.get('corner', 60), p.get('min_area', 30) * 0.5, p.get('sigma', 2.2))
            if not body: continue
            tones = []
            for c in order[1:]:
                tm = m & (lbl == c)
                if tm.sum() < max(40, 0.04 * m.sum()): continue
                ys_, xs_ = np.nonzero(tm); cxy = (xs_.mean() / UP, ys_.mean() / UP)
                if any(r[0] <= cxy[0] <= r[2] and r[1] <= cxy[1] <= r[3] for r in S.get('tone_exclude', [])): continue
                tp = contour_paths(tm, 0.5, 55, 6, 1.8)
                if tp: tones.append(dict(fill=mean_hex(big, tm & (cv2.erode(tm.astype(np.uint8), np.ones((3, 3))) > 0)), paths=tp))
            # lighter tone first, darker on top reads as cel shadow
            base_fill = mean_hex(big, m & (lbl == base))
            ys, xs = np.nonzero(m)
            out_parts.append(dict(name=name, z=p.get('z', pi), fill=base_fill, paths=body, tones=tones,
                                  outline=p.get('outline', True), bbox=[round(xs.min() / UP, 1), round(ys.min() / UP, 1), round(xs.max() / UP, 1), round(ys.max() / UP, 1)]))
    # interior ink lines: thin dark strokes away from part borders
    lines = []
    ink = np.zeros((H, W), bool)
    for ls in S.get('line_sets', [{'clusters': ink_ids, 'zone': None}]):
        ink |= fg & np.isin(lbl, ls['clusters']) & in_zone((H, W), ls.get('zone'))
    border = np.zeros((H, W), bool)
    border[:, 1:] |= owner[:, 1:] != owner[:, :-1]; border[1:] |= owner[1:] != owner[:-1]
    dist = cv2.distanceTransform((~border).astype(np.uint8), cv2.DIST_L2, 3)
    ink &= dist > S.get('line_border_gap', 3) * 1.0
    ink = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    thick = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 3)
    sk = skeletonize(ink)
    for poly in trace_skeleton(sk):
        if len(poly) < S.get('min_line', 6): continue
        pts = np.array(poly, float)
        w = float(np.median([thick[int(y), int(x)] for x, y in poly])) * 2 / UP
        pts = cv2.GaussianBlur(pts.reshape(-1, 1, 2), (1, 5), 0).reshape(-1, 2) if len(pts) > 6 else pts
        segs = fit_open(pts, 0.5 * UP)
        if segs:
            d = to_path(segs, 1 / UP)[:-1]
            lines.append(dict(d=d, w=round(max(0.5, min(2.2, w)), 2)))
    ex = S.get('line_exclude', [])
    def outside(d):
        xs, ys = d[1::2], d[2::2]
        pts = [(v, w) for v, w in zip([x for x in d if isinstance(x, (int, float))][0::2], [x for x in d if isinstance(x, (int, float))][1::2])]
        return not any(r[0] <= x <= r[2] and r[1] <= y <= r[3] for x, y in pts for r in ex)
    lines = [l for l in lines if outside(l['d'])]
    for mp in S.get('manual', []):
        out_parts.append(dict(name=mp['name'], z=mp['z'], fill=mp['fill'], paths=[cr_path(mp['pts'])],
                              tones=[dict(fill=t['fill'], paths=[cr_path(t['pts'])]) for t in mp.get('tones', [])],
                              outline=mp.get('outline', True), bbox=None))
        for l in mp.get('lines', []): lines.append(dict(d=cr_path(l['pts'], closed=False), w=l['w']))
    res = dict(id=S['figure'], width=x1 - x0, height=y1 - y0, ink=S.get('ink_color', '#16191b'),
               outline_width=S.get('outline_width', 0.7), face=S.get('face'), construct=S.get('construct', []), parts=sorted(out_parts, key=lambda q: q['z']), lines=lines)
    os.makedirs(os.path.join(ROOT, 'clean'), exist_ok=True)
    json.dump(res, open(os.path.join(ROOT, 'clean', S['figure'] + '.json'), 'w'), separators=(',', ':'))
    np.save('/tmp/owner.npy', owner)
    return res

def cr_path(pts, closed=True):
    """Hand-placed points -> smooth Bezier commands (Catmull-Rom). [x,y,1] = sharp corner."""
    P = [np.array(p[:2], float) for p in pts]; sharp = [len(p) > 2 and p[2] for p in pts]; n = len(P)
    def tan(i):
        if sharp[i % n] or (not closed and (i == 0 or i == n - 1)): return np.zeros(2)
        return (P[(i + 1) % n] - P[(i - 1) % n]) / 6
    r = lambda v: round(float(v), 2)
    d = ['M', r(P[0][0]), r(P[0][1])]
    for i in range(n if closed else n - 1):
        a, b = P[i], P[(i + 1) % n]; c1, c2 = a + tan(i), b - tan(i + 1)
        d += ['C', r(c1[0]), r(c1[1]), r(c2[0]), r(c2[1]), r(b[0]), r(b[1])]
    if closed: d.append('Z')
    return d

def trace_skeleton(sk):
    """skeleton pixels -> polylines (split at junctions)."""
    sk = sk.astype(np.uint8); H, W = sk.shape
    nb = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32)) - sk
    nb = nb * sk
    visited = np.zeros_like(sk, bool); polys = []
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    ends = list(zip(*np.nonzero((nb == 1) | (nb >= 3))))
    starts = ends + list(zip(*np.nonzero(sk)))
    for (y, x) in starts:
        if visited[y, x] and nb[y, x] < 3: continue
        for dy, dx in dirs:
            yy, xx = y + dy, x + dx
            if not (0 <= yy < H and 0 <= xx < W) or not sk[yy, xx] or visited[yy, xx]: continue
            poly = [(x, y)]; cy, cx = yy, xx
            while True:
                visited[cy, cx] = True; poly.append((cx, cy))
                if nb[cy, cx] >= 3: break
                nxt = None
                for ddy, ddx in dirs:
                    ny, nx = cy + ddy, cx + ddx
                    if 0 <= ny < H and 0 <= nx < W and sk[ny, nx] and not visited[ny, nx]: nxt = (ny, nx); break
                if nxt is None: break
                cy, cx = nxt
            polys.append(poly)
        visited[y, x] = True
    return polys

if __name__ == '__main__':
    r = run(sys.argv[1])
    print(r['id'], len(r['parts']), 'parts', len(r['lines']), 'lines', [p['name'] for p in r['parts']])
