import cv2, numpy as np, json, sys
# usage: seg.py image palette_json out_prefix [ink_classes] 
def segment(img, pal, ink, fill_ignore=('bg',), min_area=12, belt_open=0):
    im = img.astype(np.float32)
    names = list(pal)
    P = np.array([[int(v[4:6],16),int(v[2:4],16),int(v[0:2],16)] for v in pal.values()],np.float32)
    lab = ((im[:,:,None,:]-P[None,None])**2).sum(-1).argmin(-1)
    bg = names.index('bg')
    inkmask = np.isin(lab,[names.index(n) for n in ink])
    # thick ink (e.g. belt) survives opening -> treat as fill class 'inkfill'
    thick = np.zeros_like(inkmask)
    if belt_open:
        k = np.ones((belt_open,belt_open),np.uint8)
        thick = cv2.morphologyEx(inkmask.astype(np.uint8),cv2.MORPH_OPEN,k).astype(bool)
    fillmask = (lab!=bg) & (~inkmask | thick)
    lab2 = lab.copy(); lab2[thick] = len(names)  # inkfill class id
    # components per class, lines act as separators
    comp = np.zeros(lab.shape,np.int32); cid=0; info=[]
    for c in np.unique(lab2[fillmask]):
        m = ((lab2==c)&fillmask).astype(np.uint8)
        n,cc,st,cen = cv2.connectedComponentsWithStats(m,connectivity=4)
        for i in range(1,n):
            if st[i,4] < min_area: continue
            cid+=1; comp[cc==i]=cid
            info.append(dict(id=cid, cls=(names+['inkfill'])[c], area=int(st[i,4]), cx=float(cen[i][0]), cy=float(cen[i][1])))
    # grow components into ink / unassigned non-bg pixels
    fg = lab!=bg
    # close silhouette small gaps
    todo = fg & (comp==0)
    k3 = np.ones((3,3),np.uint8)
    for _ in range(12):
        if not todo.any(): break
        grown = cv2.dilate(comp.astype(np.float32),k3).astype(np.int32)  # max id neighbor (deterministic)
        upd = todo & (grown>0)
        comp[upd]=grown[upd]; todo = fg & (comp==0)
    return lab, comp, info, inkmask & ~thick

def contours(comp, cid, eps):
    m = (comp==cid).astype(np.uint8)
    cs,_ = cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    out=[]
    for c in cs:
        if cv2.contourArea(c)<6: continue
        a = cv2.approxPolyDP(c,eps,True).reshape(-1,2)
        out.append(a.tolist())
    return out
