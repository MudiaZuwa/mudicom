"""Landmarks for the figures used by the generator.

For every figure: top (crown), chin, waist (belt line), shin (where boots/wraps start) and ground,
in figure-box pixels, plus the body centre line and widths at each cut, measured from the silhouette.
y values come from generator/landmarks_manual.json when present (hand-checked), else from
proportional first guesses."""
import cv2, numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import figure_mask, bg_color

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SETS = json.load(open(os.path.join(ROOT, 'generator', 'sets.json')))

def run_at(mask, y, cx):
    row = mask[int(y)]
    xs = np.flatnonzero(row)
    if not len(xs): return cx, cx
    # central run containing (or nearest to) cx
    runs = np.split(xs, np.flatnonzero(np.diff(xs) > 1) + 1)
    best = min(runs, key=lambda r: 0 if r[0] <= cx <= r[-1] else min(abs(r[0] - cx), abs(r[-1] - cx)))
    return int(best[0]), int(best[-1])

def span_at(mask, y):
    xs = np.flatnonzero(mask[int(y)]);  return (int(xs[0]), int(xs[-1])) if len(xs) else (0, 0)

def main():
    figs = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'tools', 'figures.json')))['figures']}
    man_p = os.path.join(ROOT, 'generator', 'landmarks_manual.json')
    manual = json.load(open(man_p)) if os.path.exists(man_p) else {}
    ids = sorted({fid for s in SETS['sets'].values() for fid in s['views'].values() if fid})
    out = {}
    for fid in ids:
        f = figs[fid]
        src = cv2.imread(os.path.join(ROOT, 'originals', f['src']))
        x0, y0, x1, y1 = f['box']; bg = bg_color(src)[y0:y1, x0:x1]
        m = figure_mask(src[y0:y1, x0:x1].copy(), bg, f, f['box'])
        rows = np.flatnonzero(m.any(1)); top, ground = int(rows[0]), int(rows[-1])
        H = ground - top
        g = manual.get(fid, {})
        L = dict(top=g.get('top', top), ground=g.get('ground', ground))
        H = L['ground'] - L['top']
        L['chin'] = g.get('chin', L['top'] + 0.145 * H)
        L['waist'] = g.get('waist', L['top'] + 0.41 * H)
        L['shin'] = g.get('shin', L['top'] + 0.79 * H)
        cols = np.flatnonzero(m[int(L['waist'])]); cx0 = float(np.median(cols)) if len(cols) else m.shape[1] / 2
        a, b = run_at(m, L['waist'], g.get('cx', cx0)); L['cx'] = g.get('cx', (a + b) / 2)
        L['waistW'] = g.get('waistW', b - a)
        a, b = run_at(m, L['chin'] + 0.02 * H, L['cx']); L['neckW'] = g.get('neckW', b - a)
        a, b = span_at(m, L['shin']); L['shinW'] = g.get('shinW', b - a)
        L['flip'] = g.get('flip', False)
        L['skull'] = g.get('skull', L['top'])
        if 'face' in g: L['face'] = g['face']
        L['hair'] = g.get('hair', [])
        # centre line per seam: neck (just below chin), waist, shin
        a, b = run_at(m, L['chin'] + 0.015 * H, L['cx']); L['cxNeck'] = (a + b) / 2
        L['cxWaist'] = L['cx']
        a, b = span_at(m, L['shin']); L['cxShin'] = (a + b) / 2
        out[fid] = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in L.items()}
        np.save(os.path.join('/tmp', fid + '_mask.npy'), m)
    json.dump(out, open(os.path.join(ROOT, 'generator', 'landmarks.json'), 'w'), indent=1)
    return out

if __name__ == '__main__':
    out = main()
    for k, v in out.items(): print(k, v)
