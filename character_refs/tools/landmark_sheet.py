import cv2, numpy as np, json, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
figs = {f['id']: f for f in json.load(open(os.path.join(ROOT, 'tools/figures.json')))['figures']}
L = json.load(open(os.path.join(ROOT, 'generator/landmarks.json')))
out = sys.argv[1]; ids = sys.argv[2:] or list(L)
ims = []
for fid in ids:
    f = figs[fid]; l = L[fid]; x0, y0, x1, y1 = f['box']
    im = cv2.imread(os.path.join(ROOT, 'originals', f['src']))[y0:y1, x0:x1]
    s = 520 / im.shape[0]; im = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    pad = np.full((im.shape[0], 34, 3), 255, np.uint8)
    for y in range(0, int(im.shape[0] / s), 10):
        Y = int(y * s); cv2.line(pad, (24, Y), (34, Y), (150, 150, 150), 1)
        if y % 50 == 0: cv2.putText(pad, str(y), (0, Y + 4), 0, 0.33, (80, 80, 80), 1)
    for k, c in [('top', (0, 0, 0)), ('chin', (0, 0, 255)), ('waist', (255, 0, 0)), ('shin', (0, 160, 0)), ('ground', (0, 0, 0))]:
        Y = int(l[k] * s); cv2.line(im, (0, Y), (im.shape[1], Y), c, 1)
    X = int(l['cx'] * s); cv2.line(im, (X, 0), (X, im.shape[0]), (0, 200, 255), 1)
    lab = np.full((20, im.shape[1] + 34, 3), 255, np.uint8); cv2.putText(lab, fid, (2, 14), 0, 0.4, (0, 0, 0), 1)
    ims.append(np.vstack([lab, np.hstack([pad, im])]))
W = sum(i.shape[1] + 8 for i in ims); H = max(i.shape[0] for i in ims)
can = np.full((H, W, 3), 255, np.uint8); x = 0
for i in ims: can[:i.shape[0], x:x + i.shape[1]] = i; x += i.shape[1] + 8
cv2.imwrite(out, can)
