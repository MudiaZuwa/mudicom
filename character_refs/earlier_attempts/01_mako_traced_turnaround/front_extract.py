import sys, json; sys.path.insert(0,'tools')
from seg import *
img=cv2.imread('ref/front.png')
pal={'bg':'ffffff','tunic':'393c38','black':'171715','tunic2':'4d4b43','grey':'646157','line':'090807','scarf':'4f0411','skin':'bda283','cuff':'98968b','dk':'2b2823','cuff2':'b9b4aa','collar':'e0dfdc'}
lab,comp,info,ink=segment(img,pal,['line','dk'],belt_open=5,min_area=15)
names=list(pal)
# hair: thick dark pixels in head box
dark=np.isin(lab,[names.index('black'),names.index('line'),names.index('dk')])
hb=np.zeros_like(dark); hb[25:100,180:300]=True
thick=cv2.morphologyEx((dark&hb).astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
n,cc,st,_=cv2.connectedComponentsWithStats(thick)
hair=np.zeros_like(dark)
for i in range(1,n):
    x,y,w,h,a=st[i]
    if a>25 and y<70: hair|=(cc==i)
hair=cv2.morphologyEx(hair.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)).astype(bool)
HAIR=1000; comp[hair & (comp>0)]=HAIR
for k in (9,10): comp[comp==k]=HAIR
P={ # id -> (name, color key)
 47:('flap_back','lining'),46:('panel_back','lining'),
 41:('leg_L','wrap'),42:('leg_R','wrap'),43:('ankle_L','wrap'),44:('ankle_R','wrap'),
 38:('shoe_L','dark'),39:('shoe_R','dark'),34:('pants','dark'),
 52:('forearm_L','skin'),53:('forearm_R','skin'),
 7:('skirt_L','tunic'),6:('skirt_front','tunic'),1:('torso','tunic'),2:('torso_flap','tunic'),5:('torso_bit','tunic'),
 4:('sleeve_L','tunic'),3:('sleeve_R','tunic'),14:('sleeve_fold_L','dark'),
 60:('cuff_L','cuff'),61:('cuff_R','cuff'),
 33:('glove_L','dark'),32:('glove_band_L','dark'),31:('glove_R','dark'),
 67:('belt','dark'),
 50:('head','skin'),56:('collar_L','collar'),57:('collar_R','collar'),64:('collar_in','shirt'),
 49:('scarf','scarf'),HAIR:('hair','hair'),
 20:('frogs','dark'),27:('seam_bit','dark'),30:('frog_skirt','dark'),
}
# drop unmapped components, regrow mapped ones to fill gaps
keep=np.isin(comp,list(P.keys())); comp[~keep]=0
fg=(lab!=names.index('bg'))
fg=cv2.morphologyEx(fg.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)).astype(bool)
for _ in range(20):
    todo=fg&(comp==0)
    if not todo.any(): break
    g=cv2.dilate(comp.astype(np.float32),np.ones((3,3),np.uint8)).astype(np.int32)
    u=todo&(g>0); comp[u]=g[u]
# light per-part smoothing of the label map (majority filter)
# measure colors (median of original pixels of non-ink part)
med={}
for cid,(nm,ck) in P.items():
    m=(comp==cid)&~ink
    if m.sum()<5: continue
    c=np.median(img[m],0); med.setdefault(ck,[]).append(c)
colors={k:'#%02x%02x%02x'%tuple(int(x) for x in np.median(np.array(v),0)[::-1]) for k,v in med.items()}
# boundaries for detail ink
b=np.zeros(comp.shape,bool)
b[:,1:]|=comp[:,1:]!=comp[:,:-1]; b[:,:-1]|=comp[:,1:]!=comp[:,:-1]
b[1:]|=comp[1:]!=comp[:-1]; b[:-1]|=comp[1:]!=comp[:-1]
dist=cv2.distanceTransform((~b).astype(np.uint8),cv2.DIST_L2,3)
detail=(ink|(dark&(comp==50)))&(dist>2.2)&(comp>0)&(comp!=HAIR)&(comp!=34)
detail=cv2.dilate(detail.astype(np.uint8),np.ones((2,2),np.uint8))
order=[47,46,41,42,43,44,38,39,34,52,53,7,6,1,2,5,4,3,14,60,61,33,32,31,67,50,56,57,64,49,HAIR,20,27,30]
parts=[]
for cid in order:
    nm,ck=P[cid]
    m=(comp==cid).astype(np.uint8)*255
    m=cv2.GaussianBlur(m,(5,5),1.2)
    cs2,_=cv2.findContours((m>127).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    cs2=[c for c in cs2 if cv2.contourArea(c)>=8]
    for j,c in enumerate(sorted(cs2,key=lambda c:-cv2.contourArea(c))):
        a=cv2.approxPolyDP(c,1.1 if nm!='hair' else 0.8,True).reshape(-1,2).astype(float)
        pts=[]
        n=len(a)
        for k in range(n):
            p0,p1,p2=a[k-1],a[k],a[(k+1)%n]
            v1,v2=p0-p1,p2-p1
            cosang=(v1@v2)/(np.linalg.norm(v1)*np.linalg.norm(v2)+1e-9)
            sharp = cosang>-0.35   # angle < ~110 deg
            pts.append([int(p1[0]),int(p1[1])]+([1] if sharp else []))
        parts.append(dict(name=nm if j==0 else f'{nm}_{j+1}',fill=ck,pts=pts))
cs,_=cv2.findContours(detail,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
def in_face(c):
    x,y,w,h=cv2.boundingRect(c); return 208<=x+w/2<=272 and 70<=y+h/2<=126
ink_polys=[cv2.approxPolyDP(c,0.7,True).reshape(-1,2).tolist() for c in cs if cv2.contourArea(c)>=10 and not in_face(c)]
print(colors, len(parts), sum(len(q['pts']) for q in parts), len(ink_polys), sum(len(p) for p in ink_polys))
json.dump(dict(colors=colors,parts=parts,ink=ink_polys),open('front.json','w'))
