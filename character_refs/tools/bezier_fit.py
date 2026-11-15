"""Fit smooth cubic Bezier curves to a closed contour (Schneider's algorithm, Graphics Gems 1990).

fit_closed(points, error, corner_deg) -> list of segments [p0, c1, c2, p3] (numpy 2-vectors).
Corners (turning more than corner_deg) split the contour so they stay sharp."""
import numpy as np

def _bez(ctrl, t):
    t = np.asarray(t)[:, None]; mt = 1 - t
    return mt**3 * ctrl[0] + 3 * mt**2 * t * ctrl[1] + 3 * mt * t**2 * ctrl[2] + t**3 * ctrl[3]

def _bez_d1(ctrl, t):
    t = np.asarray(t)[:, None]; mt = 1 - t
    return 3 * mt**2 * (ctrl[1] - ctrl[0]) + 6 * mt * t * (ctrl[2] - ctrl[1]) + 3 * t**2 * (ctrl[3] - ctrl[2])

def _bez_d2(ctrl, t):
    t = np.asarray(t)[:, None]; mt = 1 - t
    return 6 * mt * (ctrl[2] - 2 * ctrl[1] + ctrl[0]) + 6 * t * (ctrl[3] - 2 * ctrl[2] + ctrl[1])

def _chord(pts):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    return d / d[-1] if d[-1] > 0 else d

def _gen(pts, u, t1, t2):
    p0, p3 = pts[0], pts[-1]
    A1 = (3 * (1 - u)**2 * u)[:, None] * t1; A2 = (3 * (1 - u) * u**2)[:, None] * t2
    C = np.array([[np.sum(A1 * A1), np.sum(A1 * A2)], [np.sum(A1 * A2), np.sum(A2 * A2)]])
    base = _bez(np.array([p0, p0, p3, p3]), u)
    tmp = pts - base
    X = np.array([np.sum(A1 * tmp), np.sum(A2 * tmp)])
    det = C[0, 0] * C[1, 1] - C[0, 1] * C[1, 0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        a1 = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det; a2 = (C[0, 0] * X[1] - C[1, 0] * X[0]) / det
    else: a1 = a2 = 0
    eps = 1e-6 * seg
    if a1 < eps or a2 < eps: a1 = a2 = seg / 3
    return np.array([p0, p0 + t1 * a1, p3 + t2 * a2, p3])

def _maxerr(pts, ctrl, u):
    d = np.linalg.norm(_bez(ctrl, u) - pts, axis=1); i = int(np.argmax(d))
    return d[i], i

def _reparam(pts, ctrl, u):
    q, q1, q2 = _bez(ctrl, u), _bez_d1(ctrl, u), _bez_d2(ctrl, u)
    num = np.sum((q - pts) * q1, 1); den = np.sum(q1 * q1, 1) + np.sum((q - pts) * q2, 1)
    with np.errstate(divide='ignore', invalid='ignore'):
        nu = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(nu, 0, 1)

def _unit(v):
    n = np.linalg.norm(v); return v / n if n > 1e-12 else v

def _fit(pts, t1, t2, err, out, depth=0):
    if len(pts) == 2:
        d = np.linalg.norm(pts[1] - pts[0]) / 3
        out.append(np.array([pts[0], pts[0] + t1 * d, pts[1] + t2 * d, pts[1]])); return
    u = _chord(pts); ctrl = _gen(pts, u, t1, t2); e, split = _maxerr(pts, ctrl, u)
    if e < err: out.append(ctrl); return
    if e < err * 4:
        for _ in range(12):
            u = _reparam(pts, ctrl, u); ctrl = _gen(pts, u, t1, t2); e, split = _maxerr(pts, ctrl, u)
            if e < err: out.append(ctrl); return
    split = max(1, min(len(pts) - 2, split))
    if depth > 40: out.append(ctrl); return
    tc = _unit(pts[split - 1] - pts[split + 1])
    _fit(pts[:split + 1], t1, tc, err, out, depth + 1)
    _fit(pts[split:], -tc, t2, err, out, depth + 1)

def fit_open(pts, err):
    pts = np.asarray(pts, float)
    if len(pts) < 2: return []
    t1 = _unit(pts[min(2, len(pts) - 1)] - pts[0]); t2 = _unit(pts[max(-3, -len(pts))] - pts[-1])
    out = []; _fit(pts, t1, t2, err, out); return out

def fit_closed(pts, err=1.0, corner_deg=55, win=4):
    """pts: (N,2) densely sampled closed contour (no repeated last point)."""
    pts = np.asarray(pts, float); n = len(pts)
    if n < 8: return []
    # turning angle over a window
    a = pts[(np.arange(n) - win) % n]; b = pts[(np.arange(n) + win) % n]
    v1, v2 = pts - a, b - pts
    cos = np.sum(v1 * v2, 1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-9)
    ang = np.degrees(np.arccos(np.clip(cos, -1, 1)))
    corners = []
    for i in np.argsort(-ang):
        if ang[i] < corner_deg: break
        if all(min(abs(i - c), n - abs(i - c)) > win * 2 for c in corners): corners.append(i)
    corners.sort()
    segs = []
    if not corners:
        # smooth closed curve: start anywhere, matching tangents at the joint
        k = 0; ring = np.vstack([pts[k:], pts[:k + 1]])
        t = _unit(pts[(k + 1) % n] - pts[(k - 1) % n])
        _fit(ring, t, -t, err, segs); return segs
    for j, c in enumerate(corners):
        d = corners[(j + 1) % len(corners)]
        idx = np.arange(c, d + 1) if d > c else np.r_[np.arange(c, n), np.arange(0, d + 1)]
        part = pts[idx]
        if len(part) < 2: continue
        t1 = _unit(part[min(2, len(part) - 1)] - part[0]); t2 = _unit(part[max(-3, -len(part))] - part[-1])
        _fit(part, t1, t2, err, segs)
    return segs

def to_path(segs, scale=1.0, nd=1):
    """Compact command list for Canvas: ['M',x,y,'C',x1,y1,x2,y2,x,y,...,'Z']"""
    if not segs: return []
    r = lambda v: round(float(v) * scale, nd)
    out = ['M', r(segs[0][0][0]), r(segs[0][0][1])]
    for s in segs: out += ['C', r(s[1][0]), r(s[1][1]), r(s[2][0]), r(s[2][1]), r(s[3][0]), r(s[3][1])]
    out.append('Z'); return out
