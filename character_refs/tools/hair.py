"""Find hair that hangs below the chin (long hair, side locks) so the generator can move it with the head.
hair colour = median of the crown; mask = pixels of that colour connected to the crown, above maxDrop."""
import cv2, numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import figure_mask, bg_color
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CFG = {  # figure -> (colour tolerance, how far below the chin hair may go, as a fraction of height)
 'korra_s1_front': (26, 0.2), 'korra_s1_side': (26, 0.2), 'korra_s1_back': (26, 0.12),
 'asami_suit_front': (20, 0.38), 'asami_suit_side': (20, 0.4), 'asami_suit_back': (20, 0.42),
 'asami_gown_front': (22, 0.38), 'asami_gown_side': (22, 0.4), 'asami_gown_back': (22, 0.42),
}
def hair_mask(fid, figs, L):
    f = figs[fid]; l = L[fid]; tol, drop = CFG[fid]
    src = cv2.imread(os.path.join(ROOT, 'originals', f['src'])); x0, y0, x1, y1 = f['box']
    crop = src[y0:y1, x0:x1].copy(); m = figure_mask(crop, bg_color(src)[y0:y1, x0:x1], f, f['box'])
    flat = cv2.pyrMeanShiftFiltering(crop, 3, 12)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).astype(np.float32)
    H = l['ground'] - l['top']; top = int(l['top'])
    crown = (m > 0); crown[int(top + 0.07 * H):] = False
    hc = np.median(lab[crown], 0)
    print(fid, 'hair colour Lab', hc.round(1), 'crown px', crown.sum())
    d = np.sqrt(((lab - hc) ** 2).sum(-1))
    # ink lines are darker than hair: treat very dark as passable too
    cand = ((d < tol) | (lab[:, :, 0] < hc[0] + 4)) & (m > 0)
    cand[int(l['chin'] + drop * H):] = False
    n, cc = cv2.connectedComponents(cand.astype(np.uint8), connectivity=4)
    seeds = set(np.unique(cc[crown & cand])) - {0}
    hm = np.isin(cc, list(seeds))
    hm = cv2.morphologyEx(hm.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    hm = cv2.morphologyEx(hm, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    hm[:int(l['chin'])] = 0                        # above the chin stays with the head band anyway
    return hm, crop

if __name__ == '__main__':
    figs = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'tools/figures.json')))['figures']}
    L = json.load(open(os.path.join(ROOT, 'generator/landmarks.json')))
    os.makedirs(os.path.join(ROOT, 'generator/masks'), exist_ok=True)
    vis = []
    for fid in CFG:
        hm, crop = hair_mask(fid, figs, L)
        cv2.imwrite(os.path.join(ROOT, 'generator/masks', fid + '_hair.png'), hm * 255)
        v = crop.copy(); v[hm > 0] = (0.4 * v[hm > 0] + 0.6 * np.array([255, 0, 255])).astype(np.uint8)
        s = 420 / v.shape[0]; vis.append(cv2.resize(v, None, fx=s, fy=s))
    W = sum(v.shape[1] + 6 for v in vis); can = np.full((420, W, 3), 255, np.uint8); x = 0
    for v in vis: can[:, x:x + v.shape[1]] = v; x += v.shape[1] + 6
    cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else '/tmp/hair.png', can)
