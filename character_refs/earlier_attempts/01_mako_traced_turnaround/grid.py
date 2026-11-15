import cv2,sys
src,out,y0,y1,scale=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),float(sys.argv[5])
im=cv2.imread(src)[y0:y1]
im=cv2.resize(im,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)
h,w=im.shape[:2]
for gx in range(0,int(w/scale)+1,10):
    X=int(gx*scale); c=(0,0,255) if gx%50==0 else (230,200,120)
    if gx%50==0 or scale>=2: cv2.line(im,(X,0),(X,h),c,1)
    if gx%50==0: cv2.putText(im,str(gx),(X+2,11),0,0.38,(0,0,200),1)
for gy in range((y0//10)*10,y1+1,10):
    Y=int((gy-y0)*scale); c=(0,0,255) if gy%50==0 else (230,200,120)
    if gy%50==0 or scale>=2: cv2.line(im,(0,Y),(w,Y),c,1)
    if gy%50==0: cv2.putText(im,str(gy),(2,Y-2),0,0.38,(0,0,200),1)
cv2.imwrite(out,im)
