"""Cut Petya's icon into layers for the startup splash animation (assets/boot/).
Usage: python3 scripts/split-petya-layers.py assets/app-icon.png assets/boot
Layers: body, head (eyes and mouth painted over with skin, hair drawn under the cap), cap, eye-l, eye-r, mouth.
Coordinates are tuned for the 1024 px app-icon.png; redraw them if the icon changes."""
from PIL import Image, ImageDraw, ImageFilter
import sys
src=Image.open(sys.argv[1]).convert('RGBA'); W,H=src.size; px=src.load()
SKIN=(250,217,204,255); HAIR=(253,177,2,255); INK=(18,15,16,255)
def skin(c): r,g,b,a=c; return a>40 and r>200 and r-g>18 and g>150 and b>130
def hair(c): r,g,b,a=c; return a>40 and r>200 and 110<g<210 and b<90
def empty(): return Image.new('L',(W,H),0)
# --- cap: walk each column from the top until hair, skin or transparency
cap=empty(); cm=cap.load(); BX,BY,BR=655,255,52
for x in range(W):
  y=0
  while y<H and px[x,y][3]<40: y+=1
  if y>=480: continue
  while y<480:
    c=px[x,y]; inbtn=(x-BX)**2+(y-BY)**2<BR*BR
    if skin(c) or (hair(c) and not inbtn): break
    if c[3]<40 and x>=330: break
    if c[3]>0: cm[x,y]=255
    y+=1
cap=cap.filter(ImageFilter.MaxFilter(3))
# --- head/body split per column: body starts at the first collar/coat pixel below the chin
body=empty(); bm=body.load(); cuts=[]
for x in range(W):
  cut=H
  for y in range(700,H):
    c=px[x,y]; r,g,b,a=c
    if a>40 and (hair(c) or (r>170 and g<80 and b<80)): cut=y; break
  cuts.append(cut)
dark=lambda c:c[3]>40 and sum(c[:3])<300
for x in range(W):
  cut=min(cuts[max(0,x-15):x+16])
  if cut>=H: continue
  k=0
  while k<30 and cut>700 and dark(px[x,cut-1]): cut-=1;k+=1
  for y in range(max(700,cut-2),H): bm[x,y]=255
# --- feature masks: dark/white pixels inside boxes (eyes, mouth), grown to cover antialiasing
def feature(box):
  m=empty(); mm=m.load(); x0,y0,x1,y1=box
  for x in range(x0,x1):
    for y in range(y0,y1):
      if not skin(px[x,y]) and px[x,y][3]>40: mm[x,y]=255
  return m.filter(ImageFilter.MaxFilter(5))
eyeL=feature((335,495,440,565)); eyeR=feature((545,490,655,555)); mouth=feature((380,585,605,748))
def layer(mask):
  out=Image.new('RGBA',(W,H)); out.paste(src,(0,0),mask); return out
def minus(*ms):
  m=Image.new('L',(W,H),255)
  for k in ms: m=Image.composite(Image.new('L',(W,H),0),m,k)
  return m
headmask=Image.composite(Image.new('L',(W,H),0),minus(cap),body)
head=layer(headmask)
# paint skin over the eyes and mouth so blinking and laughing reveal skin, not the old drawing
d=ImageDraw.Draw(head)
for m in (eyeL,eyeR,mouth):
  ring=Image.composite(m.filter(ImageFilter.MaxFilter(15)),Image.new('L',(W,H),0),Image.eval(m,lambda v:255-v))
  rp=ring.load(); acc=[0,0,0]; n=0
  for x in range(W):
    for y in range(480,760):
      if rp[x,y] and skin(px[x,y]): c=px[x,y]; acc=[acc[0]+c[0],acc[1]+c[1],acc[2]+c[2]]; n+=1
  col=tuple(v//n for v in acc)+(255,)
  head.paste(Image.new('RGBA',(W,H),col),(0,0),m.filter(ImageFilter.GaussianBlur(1.5)).point(lambda v:255 if v>20 else v*12))
# hair dome under the cap: visible only when the cap is lifted
dome=Image.new('RGBA',(W,H)); dd=ImageDraw.Draw(dome)
dd.ellipse((205,190,805,800),fill=INK); dd.ellipse((219,204,791,786),fill=HAIR)
domeclip=Image.new('L',(W,H),0); ImageDraw.Draw(domeclip).rectangle((0,0,W,500),fill=255)
dome.putalpha(Image.composite(dome.getchannel('A'),Image.new('L',(W,H),0),domeclip))
head.putalpha(head.getchannel('A').point(lambda v:255 if v>200 else v))
head=Image.alpha_composite(dome,head)
# body gets a neck patch so a tilted head never shows a gap
bodyl=layer(body); neck=Image.new('RGBA',(W,H)); ImageDraw.Draw(neck).ellipse((400,700,630,800),fill=SKIN)
bodyl=Image.alpha_composite(neck,bodyl)
out={'body':bodyl,'head':head,'cap':layer(cap),'eye-l':layer(eyeL),'eye-r':layer(eyeR),'mouth':layer(mouth)}
for k,v in out.items(): v.resize((512,512),Image.LANCZOS).save(f'{sys.argv[2]}/petya-{k}.png',optimize=True)
