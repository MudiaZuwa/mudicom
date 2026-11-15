import sys; sys.path.insert(0,'tools')
from seg import *
img=cv2.imread('ref/front.png')
pal={'bg':'ffffff','tunic':'393c38','black':'171715','tunic2':'4d4b43','grey':'646157','line':'090807','scarf':'4f0411','skin':'bda283','cuff':'98968b','dk':'2b2823','cuff2':'b9b4aa','collar':'e0dfdc'}
lab,comp,info,ink=segment(img,pal,['line','dk'],belt_open=5,min_area=15)
rng=np.random.RandomState(3); cols=rng.randint(60,255,(comp.max()+1,3)).astype(np.uint8); cols[0]=255
v=cols[comp]; v[ink & (comp>0)] = (v[ink&(comp>0)]*0.4).astype(np.uint8)
v=cv2.resize(v,None,fx=2,fy=2,interpolation=cv2.INTER_NEAREST)
for d in info:
    if d['area']>40: cv2.putText(v,str(d['id']),(int(d['cx']*2)-6,int(d['cy']*2)+5),0,0.45,(0,0,0),1)
cv2.imwrite('ref/front_comp.png',v[60:1300,250:750])
for d in info:
    if d['area']>40: print(d['id'],d['cls'],d['area'],int(d['cx']),int(d['cy']))
