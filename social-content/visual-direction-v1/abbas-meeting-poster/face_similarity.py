import numpy as np, cv2, sys, glob
from insightface.app import FaceAnalysis
app=FaceAnalysis(name='buffalo_l',providers=['CPUExecutionProvider']); app.prepare(ctx_id=-1,det_size=(640,640))
E=np.load('meet/ref_embs.npy',allow_pickle=True).item()
real=[E['portrait'],E['selfie'],E['hoodie']]
for f in sys.argv[1:]:
    im=cv2.imread(f); fs=app.get(im)
    if not fs: print(f,'no face'); continue
    fs=sorted(fs,key=lambda x:-(x.bbox[2]-x.bbox[0]))
    e=fs[0].normed_embedding
    sc=[round(float(e@r),2) for r in real]; sheet=round(float(np.mean([e@E[k] for k in E if k.startswith('sheet')])),2)
    print(f.split('/')[-1],'portrait/selfie/hoodie',sc,'sheet',sheet,'mean_real',round(float(np.mean(sc)),3),'facew',int(fs[0].bbox[2]-fs[0].bbox[0]))
