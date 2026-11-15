import json
FRONT_LINES=[
 dict(pts=[[221,79],[227,75],[233,76],[237,80]],w=2.6),   # brow L
 dict(pts=[[244,80],[250,76],[256,76],[260,79]],w=2.6),   # brow R
 dict(pts=[[222,83],[228,81],[234,83]],w=1.4),            # upper lid L
 dict(pts=[[247,83],[252,81],[258,83]],w=1.4),            # upper lid R
 dict(pts=[[225,86],[231,86]],w=0.7),                     # lower lid L
 dict(pts=[[249,86],[255,86]],w=0.7),                     # lower lid R
 dict(pts=[[230.5,83.2],[230.6,84.4]],w=2.6),             # iris L
 dict(pts=[[251.5,83.2],[251.6,84.4]],w=2.6),             # iris R
 dict(pts=[[239,85],[240,90],[241,94],[244,96]],w=1.1),   # nose bridge
 dict(pts=[[237,97],[240,98]],w=0.9),                     # nostril
 dict(pts=[[233,105],[240,104],[247,106]],w=1.2),         # mouth
 dict(pts=[[238,109],[243,109]],w=0.7),                   # lower lip
 dict(pts=[[227,113],[230,118],[235,121]],w=0.9),         # neck L
 dict(pts=[[251,112],[248,118]],w=0.9),                   # neck R
]
d=json.load(open('front.json'))
front=dict(box=dict(top=42,bottom=652,cx=238),line=1.4,parts=d["parts"],ink=d["ink"],lines=FRONT_LINES)
pal=dict(d['colors'])
t=open('template.html').read()
t=t.replace('__PALETTE__',json.dumps(pal,indent=2)).replace('__FRONT__',json.dumps(front,separators=(',',':'))).replace('__SIDEBACK__',open('side_back.js').read())
open('character.html','w').write(t)
