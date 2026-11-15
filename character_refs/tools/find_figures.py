"""Detect individual figures in each reference sheet.
Background colour = median of the border; foreground = pixels far from it (in Lab)."""
import cv2, numpy as np, json, glob, os, sys
SRC = os.path.join(os.path.dirname(__file__), '..', 'originals')

def fg_mask(im, thr=28):
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    b = np.concatenate([lab[:4].reshape(-1,3), lab[-4:].reshape(-1,3), lab[:, :4].reshape(-1,3), lab[:, -4:].reshape(-1,3)])
    bg = np.median(b, 0)
    d = np.sqrt(((lab - bg) ** 2).sum(-1))
    m = (d > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return m, bg

def figures(path, min_frac=0.12):
    im = cv2.imread(path); h, w = im.shape[:2]
    m, bg = fg_mask(im)
    k = cv2.dilate(m, np.ones((5, 5), np.uint8))
    n, cc, st, _ = cv2.connectedComponentsWithStats(k)
    boxes = []
    for i in range(1, n):
        x, y, bw, bh, a = st[i]
        if bh > h * min_frac and a > 400: boxes.append([int(x), int(y), int(bw), int(bh), int(a)])
    boxes.sort(key=lambda b: b[0])
    return boxes, bg.tolist()

if __name__ == '__main__':
    out = {}
    for p in sorted(glob.glob(os.path.join(SRC, '*'))):
        b, bg = figures(p); out[os.path.basename(p)] = b
        print(os.path.basename(p), len(b), [bb[:4] for bb in b])
