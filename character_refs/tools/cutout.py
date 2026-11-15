"""Cut figures out of images that are not on a plain page, and write masks/<id>.png.

The tracer (trace.py) assumes a plain background. Screenshots with scenery and sheets of line
drawings need the figure marked first. A figure in figures.json gets a mask when it has a
"cutout" field; trace.py then uses masks/<id>.png (white = figure, same size as the figure box)
instead of its own background test.

  "cutout": {"mode": "model", "model": "birefnet-general-lite"}
      screenshot: foreground found by a segmentation network (rembg). Needs `pip install rembg
      onnxruntime` and downloads the model once. Small enclosed gaps (eye whites the network
      dropped) are filled; set "holes": true to keep real gaps such as arm/body openings.
  "cutout": {"mode": "lines", "thr": 40, "grow": 9, "seal": 5, "cut": ["bottom"]}
      line drawing on white: the connected drawing that best fits the box, with its interior
      filled so the figure is a solid shape. "cut" lists box edges that crop the drawing (the
      interior is not allowed to leak out through them).
  "cutout": {"mode": "lines_rect", ...}
      line drawing where figures overlap: every line inside the box.

"exclude" entries on the figure (source pixels; a rect [x0,y0,x1,y1] or a polygon [[x,y],...]) are
removed in every mode.

usage: python3 tools/cutout.py [id ...]        (no ids = every figure with a cutout)
"""
import cv2, numpy as np, json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sessions, _probs = {}, {}

def model_prob(src_name, model):
    """Foreground probability (0-255) for a whole source image; cached."""
    key = (src_name, model)
    if key not in _probs:
        from rembg import new_session, remove
        from PIL import Image
        if model not in _sessions: _sessions[model] = new_session(model)
        im = Image.open(os.path.join(ROOT, 'originals', src_name)).convert('RGB')
        _probs[key] = np.asarray(remove(im, session=_sessions[model], only_mask=True))
    return _probs[key]

def keep_main(m, frac=0.03):
    n, cc, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    if n <= 2: return m
    big = st[1:, 4].max()
    return np.isin(cc, [i for i in range(1, n) if st[i, 4] >= frac * big])

def fill_small_holes(m, frac=0.01):
    inv = (~m).astype(np.uint8); H, W = m.shape
    n, cc, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    out = m.copy(); fg = m.sum()
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if x == 0 or y == 0 or x + w >= W or y + h >= H: continue
        if a < frac * fg: out[cc == i] = True
    return out

def interior(walls, cut=()):
    """Everything not reachable from outside the box. Edges in `cut` are closed."""
    H, W = walls.shape
    pad = np.zeros((H + 2, W + 2), np.uint8); pad[1:-1, 1:-1] = walls
    if 'top' in cut: pad[0, :] = 1
    if 'bottom' in cut: pad[-1, :] = 1
    if 'left' in cut: pad[:, 0] = 1
    if 'right' in cut: pad[:, -1] = 1
    free = (pad == 0).astype(np.uint8)
    n, cc = cv2.connectedComponents(free, connectivity=4)
    outside = set(np.unique(cc[0, :])) | set(np.unique(cc[-1, :])) | set(np.unique(cc[:, 0])) | set(np.unique(cc[:, -1]))
    outside.discard(0)
    return ~np.isin(cc, list(outside))[1:-1, 1:-1]

def ink_of(img, thr):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) < 255 - thr

def make_mask(fig, src=None):
    """Boolean mask for the figure's box."""
    c = fig['cutout']; x0, y0, x1, y1 = fig['box']
    if src is None: src = cv2.imread(os.path.join(ROOT, 'originals', fig['src']))
    excl = np.zeros(src.shape[:2], bool)
    for ex in fig.get('exclude', []):          # rect [x0,y0,x1,y1] or polygon [[x,y],...]
        if isinstance(ex[0], (int, float)): excl[ex[1]:ex[3], ex[0]:ex[2]] = True
        else:
            pm = np.zeros(src.shape[:2], np.uint8); cv2.fillPoly(pm, [np.array(ex, np.int32)], 1); excl |= pm > 0
    if c['mode'] == 'model':
        m = (model_prob(fig['src'], c.get('model', 'birefnet-general-lite')) > 127) & ~excl
        m = m[y0:y1, x0:x1]
        m = keep_main(m, c.get('keep', 0.03))
        if not c.get('holes'): m = fill_small_holes(m)
        return m
    ink = ink_of(src, c.get('thr', 40)) & ~excl
    if c['mode'] == 'lines':
        # the drawing = the connected group of lines whose extent best matches the box
        g = c.get('grow', 9)
        n, cc, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(ink.astype(np.uint8), np.ones((g, g), np.uint8)))
        best, score = 0, 0
        for i in range(1, n):
            ys, xs = np.nonzero((cc == i) & ink)
            if len(xs) < 20: continue
            bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
            iw, ih = min(bx1, x1) - max(bx0, x0), min(by1, y1) - max(by0, y0)
            if iw <= 0 or ih <= 0: continue
            iou = iw * ih / ((bx1 - bx0) * (by1 - by0) + (x1 - x0) * (y1 - y0) - iw * ih)
            if iou > score: best, score = i, iou
        ink = ink & (cc == best)
    ink = ink[y0:y1, x0:x1]
    k = c.get('seal', 5)
    walls = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    m = interior(walls, c.get('cut', ())) if c.get('fill', True) else walls > 0
    return m | ink

if __name__ == '__main__':
    figs = json.load(open(os.path.join(ROOT, 'tools', 'figures.json')))['figures']
    only = set(sys.argv[1:])
    os.makedirs(os.path.join(ROOT, 'masks'), exist_ok=True)
    for f in figs:
        if 'cutout' not in f or (only and f['id'] not in only): continue
        m = make_mask(f)
        cv2.imwrite(os.path.join(ROOT, 'masks', f['id'] + '.png'), m.astype(np.uint8) * 255)
        print(f['id'], f['cutout']['mode'], m.shape[1], 'x', m.shape[0], 'covered %.0f%%' % (100 * m.mean()), flush=True)
