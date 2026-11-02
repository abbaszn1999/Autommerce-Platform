import numpy as np
from PIL import Image, ImageFilter, ImageChops
import scipy.ndimage as ndi
W,H=1080,1350
src=Image.open('ref_portrait.jpg').convert('RGB')
cut=Image.open('real/cut.png')
a=np.array(cut.split()[3]).astype(float)/255
rgb=np.array(src).astype(float)
lum=rgb.mean(axis=2)
h,w=lum.shape
yy=np.arange(h)[:,None]*np.ones((1,w))
dark=((lum<52)&(yy>560)).astype(float)
dark=ndi.binary_closing(dark>0,iterations=6)
dark=ndi.binary_opening(dark,iterations=3)
lab,n=ndi.label(dark)
# keep the biggest component (the sweater)
sizes=ndi.sum(dark,lab,range(1,n+1)); keep=(lab==(1+int(np.argmax(sizes)))) if n else dark
keep=ndi.binary_fill_holes(keep).astype(float)
keep=ndi.gaussian_filter(keep,2.0)
alpha=np.clip(np.maximum(a,keep),0,1)
Image.fromarray((alpha*255).astype('uint8')).save('real/alpha.png')

# scale subject to canvas
s=1080/896*1.0
sw,sh=int(896*s),int(1200*s)
big=src.resize((sw,sh),Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6,percent=60,threshold=2))
al_er=ndi.grey_erosion(alpha,size=(5,5)); al_er=ndi.gaussian_filter(al_er,1.3)
al=Image.fromarray((al_er*255).astype('uint8')).resize((sw,sh),Image.LANCZOS)
ox=-(sw-W)//2; oy=-90
canvas=np.zeros((H,W,3),float)+np.array([11,10,16])
yy2,xx2=np.mgrid[0:H,0:W]
def glow(cx,cy,r,col,k):
    d=np.sqrt((xx2-cx)**2+(yy2-cy)**2)/r
    g=np.clip(1-d,0,1)**2*k
    return g[...,None]*np.array(col)
canvas+=glow(880,520,820,[107,53,141],1.0)   # violet behind head right
canvas+=glow(120,1180,820,[247,109,1],0.55)   # orange lower left
canvas+=glow(250,300,520,[64,0,149],0.35)
canvas=np.clip(canvas,0,255)
# subject layer
subj=np.zeros((H,W,3)); sa=np.zeros((H,W))
bx=np.array(big).astype(float); ba=np.array(al).astype(float)/255
x0,y0=max(ox,0),max(oy,0)
sx0,sy0=x0-ox,y0-oy
cw=min(W-x0,sw-sx0); ch=min(H-y0,sh-sy0)
subj[y0:y0+ch,x0:x0+cw]=bx[sy0:sy0+ch,sx0:sx0+cw]
sa[y0:y0+ch,x0:x0+cw]=ba[sy0:sy0+ch,sx0:sx0+cw]
# grade the subject: slight contrast, cooler shadows, warm highlights
sub=subj/255
sub=np.clip((sub-0.5)*1.04+0.5,0,1)*1.04
lumS=sub.mean(axis=2,keepdims=True)
sub=sub*np.array([1.03,1.0,1.0])+ (lumS**2)*np.array([0.03,0.0,-0.02])
# rim light on subject edges (orange left, violet right)
A=ndi.gaussian_filter(sa,1.5)
dx=ndi.shift(A,(0,10),order=1)
left=np.clip(A-dx,0,1); left=ndi.gaussian_filter(left,3); 
dxr=ndi.shift(A,(0,-10),order=1)
right=np.clip(A-dxr,0,1); right=ndi.gaussian_filter(right,3)
rim=left[...,None]*np.array([1.0,0.45,0.1])*1.6 + right[...,None]*np.array([0.55,0.3,0.9])*1.0
sub=np.clip(sub+rim*0.16,0,1)
out=canvas/255*(1-sa[...,None])+sub*sa[...,None]
# soft glow spill from background onto the subject (screen)
out=np.clip(out+ (canvas/255)*0.10*sa[...,None],0,1)
# vignette
d=np.sqrt(((xx2-W*0.52)/(W*0.75))**2+((yy2-H*0.45)/(H*0.8))**2)
out*= (1-0.45*np.clip(d-0.7,0,1))[...,None]
# grain
rng=np.random.default_rng(3)
g=rng.normal(0,1,(H,W))
g=ndi.gaussian_filter(g,0.7)*0.028
out=np.clip(out+g[...,None],0,1)
Image.fromarray((out*255).astype('uint8')).save('real/poster_bg.jpg',quality=95)
