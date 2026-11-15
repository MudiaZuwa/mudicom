"""Build generator/parts.js: per-figure landmarks + colour roles, and the outfit sets.

Colour roles: each palette entry of a trace may be tagged with a role
(skin, hair, top, top2, bottom, bottom2, shoes). The generator recolours a role by moving every
entry with that role by the same Lab offset, so shading inside a piece is kept."""
import cv2, numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import figure_mask, bg_color
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

def hex2lab(h):
    bgr = np.uint8([[[int(h[5:7], 16), int(h[3:5], 16), int(h[1:3], 16)]]])
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[0, 0].astype(float)

def label_pixels(crop, mask, pal_lab):
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(float)
    d = ((lab[:, :, None, :] - pal_lab[None, None]) ** 2).sum(-1)
    lbl = d.argmin(-1); lbl[mask == 0] = -1
    return lbl

def analyse(fid, figs, L, T, ref=None):
    f = figs[fid]; l = L[fid]; t = T[fid]
    src = cv2.imread(os.path.join(ROOT, 'originals', f['src'])); x0, y0, x1, y1 = f['box']
    crop = src[y0:y1, x0:x1].copy(); m = figure_mask(crop, bg_color(src)[y0:y1, x0:x1], f, f['box'])
    m = cv2.erode(m, np.ones((3, 3), np.uint8))
    pal = np.array([hex2lab(h) for h in t['palette']])
    lbl = label_pixels(cv2.pyrMeanShiftFiltering(crop, 3, 12), m, pal)
    ink = int(np.argmin(pal[:, 0] + 0.6 * np.hypot(pal[:, 1] - 128, pal[:, 2] - 128)))
    roles = {}
    def dominant(y_a, y_b, exclude, x_a=0, x_b=None):
        reg = lbl[int(y_a):int(y_b), int(x_a):x_b]
        ids, cnt = np.unique(reg[reg >= 0], return_counts=True)
        order = [i for _, i in sorted(zip(-cnt, ids)) if i not in exclude]
        return order
    H = l['ground'] - l['top']
    if ref is None:   # front view: sample face and crown
        fx, fy = l.get('face') or (int(l['cxNeck']), int(l['skull'] + 0.62 * (l['chin'] - l['skull'])))
        face = dominant(fy - 4, fy + 4, {ink}, fx - 5, fx + 5)
        roles['skin'] = int(face[0])
        hy = int(l['skull'] + 0.12 * (l['chin'] - l['skull']))
        hair = dominant(l['skull'], hy, {ink, roles['skin']}, fx - 12, fx + 12)
        roles['hair'] = int(hair[0]) if hair else ink
    else:             # other views: nearest palette entry to the front view's skin / hair colour
        for r in ('skin', 'hair'):
            if r in ref:
                d = np.sqrt(((pal - ref[r]) ** 2).sum(1)); i = int(d.argmin())
                if d[i] < 30 and i != ink: roles[r] = i
    used = {ink, *roles.values()}
    up = dominant(l['chin'] + 0.03 * H, l['waist'], used, l['cxWaist'] - 0.12 * H, int(l['cxWaist'] + 0.12 * H))
    if up: roles['top'] = int(up[0]); used.add(up[0])
    if len(up) > 1: roles['top2'] = int(up[1]); used.add(up[1])
    lo = dominant(l['waist'] + 0.02 * H, l['shin'], used)
    if lo: roles['bottom'] = int(lo[0]); used.add(lo[0])
    if len(lo) > 1: roles['bottom2'] = int(lo[1]); used.add(lo[1])
    ft = dominant(l['shin'] + 0.03 * H, l['ground'], used)
    if ft: roles['shoes'] = int(ft[0])
    # per-entry tags: 'skin' / 'hair' near their anchors, 'ink' for the line colour, 'keep' for
    # near-white and near-black details; everything else is clothing (recoloured per piece)
    tags = [None] * len(pal)
    for j in range(len(pal)):
        Lj, cj = pal[j][0] * 100 / 255, np.hypot(pal[j][1] - 128, pal[j][2] - 128)
        if j == ink: tags[j] = 'ink'; continue
        ds = np.sqrt(((pal[j] - pal[roles['skin']]) ** 2).sum()) if 'skin' in roles else 99
        dh = np.sqrt(((pal[j] - pal[roles['hair']]) ** 2).sum()) if 'hair' in roles else 99
        if 'skin' in roles and (j == roles['skin'] or ds < 13): tags[j] = 'skin'
        elif 'hair' in roles and (j == roles['hair'] or (dh < 9 and (lbl[:int(l['waist'])] == j).sum() > 0.5 * max(1, (lbl == j).sum()))): tags[j] = 'hair'
        elif Lj > 86 and cj < 10: tags[j] = 'keep'
        elif Lj < 9: tags[j] = 'keep'
    # clothing entries: which garment? decided by where the colour lives on the figure
    tot = {j: (lbl == j).sum() for j in range(len(pal))}
    up = {j: (lbl[int(l['chin'] + 0.02 * H):int(l['waist'])] == j).sum() for j in range(len(pal))}
    ft = {j: (lbl[int(l['shin']):] == j).sum() for j in range(len(pal))}
    for j in range(len(pal)):
        if tags[j] or tot[j] == 0: continue
        if ref is not None:      # side/back: copy the garment of the closest front-view colour
            cands = [(np.sqrt(((pal[j] - q) ** 2).sum()), tg) for q, tg in zip(ref['_pal'], ref['_tags']) if tg in ('top', 'bottom', 'shoes')]
            if cands:
                dmin, tg = min(cands, key=lambda c: c[0])
                if dmin < 22: tags[j] = tg; continue
        su, sf = up[j] / tot[j], ft[j] / tot[j]
        tags[j] = 'top' if su >= 0.2 else 'shoes' if sf >= 0.5 else 'bottom'
    # anchors = the biggest entry of each garment
    for g in ('top', 'bottom', 'shoes'):
        cand = [j for j in range(len(pal)) if tags[j] == g]
        if cand: roles[g] = max(cand, key=lambda j: tot[j])
        else: roles.pop(g, None)
    anchors = {r: t['palette'][i] for r, i in roles.items()}
    if ref is not None: anchors = dict(ref['_anchors'])        # one anchor per role for every view of a set
    info = {r: pal[i] for r, i in roles.items()}
    info.update(_pal=pal, _tags=tags, _anchors=anchors)
    return tags, anchors, info

if __name__ == '__main__':
    figs = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'tools/figures.json')))['figures']}
    L = json.load(open(os.path.join(ROOT, 'generator/landmarks.json')))
    SETS = json.load(open(os.path.join(ROOT, 'generator/sets.json')))['sets']
    T = {}
    for fid in L:
        s = open(os.path.join(ROOT, 'traces', fid + '.js')).read()
        T[fid] = json.loads(s[len('TRACES.push('):s.rindex(')')])
    out = {}
    for name, st in SETS.items():
        front = st['views']['front']
        tags, anchors, ref = analyse(front, figs, L, T)
        if front in out: ref = out[front]['_ref']
        if front not in out: out[front] = dict(L[front], tags=tags, anchors=anchors, _ref=ref)
        for v in ('side', 'back'):
            fid = st['views'][v]
            if not fid or fid in out: continue
            tags, anchors, _ = analyse(fid, figs, L, T, ref)
            out[fid] = dict(L[fid], tags=tags, anchors=anchors)
        print(name, {k: v for k, v in out[front]['anchors'].items()})
    with open(os.path.join(ROOT, 'generator', 'parts.js'), 'w') as fh:
        fh.write('const SETS = ' + json.dumps(SETS) + ';\n')
        for v in out.values(): v.pop('_ref', None)
        fh.write('const FIG = ' + json.dumps(out) + ';\n')
