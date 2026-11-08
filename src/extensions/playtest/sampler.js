// «Разбор плейтеста», hidden sampler window: opens a local video once and grabs frames at given times. Each frame gives
// a JPEG for the vision model (≤ 640 px), a small thumbnail for the card (≤ 176 px), the mean pixel change from the
// previous grabbed frame (32×18 grey) and a 64-bit average hash (8×8 grey) to recognise the same place again.
// Limits follow Petya's video reader: up to 16 megapixels, 15 s per seek.
(()=>{
 let video=null;let previous=null;
 const wait=(target,name)=>new Promise((resolve,reject)=>{let timer;const done=()=>{clearTimeout(timer);target.removeEventListener(name,ok);target.removeEventListener('error',bad);};const ok=()=>{done();resolve();},bad=()=>{done();reject(Error('Видео повреждено или кодек не поддерживается. Используйте MP4/H.264 или WebM.'));};target.addEventListener(name,ok,{once:true});target.addEventListener('error',bad,{once:true});timer=setTimeout(bad,15000);});
 const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 let model,thumb,tiny,hashc;
 window.openSample=async url=>{
  video=document.createElement('video');video.muted=true;video.preload='auto';
  const meta=wait(video,'loadedmetadata');video.src=url;await meta;
  if(video.duration===Infinity){const end=wait(video,'seeked');video.currentTime=1e9;await end;}
  const duration=video.duration;
  if(!Number.isFinite(duration)||duration<=0)throw Error('Не удалось определить длительность видео.');
  if(!video.videoWidth||video.videoWidth*video.videoHeight>16000000)throw Error('Видео слишком большого разрешения (до 16 мегапикселей).');
  const fit=max=>{const s=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));return [Math.max(1,Math.round(video.videoWidth*s)),Math.max(1,Math.round(video.videoHeight*s))];};
  model=canvas(...fit(640));thumb=canvas(...fit(176));tiny=canvas(32,18);hashc=canvas(8,8);previous=null;
  return {duration,width:video.videoWidth,height:video.videoHeight};
 };
 const grey=ctx=>{const d=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data,out=new Float32Array(d.length/4);for(let i=0;i<out.length;i++)out[i]=(d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114)/255;return out;};
 window.grabSamples=async times=>{
  if(!video)throw Error('Видео не открыто.');
  const frames=[];
  for(const at of times){
   const ready=wait(video,'seeked');video.currentTime=Math.max(0.001,Math.min(video.duration-0.001,at));await ready;
   model.getContext('2d').drawImage(video,0,0,model.width,model.height);
   thumb.getContext('2d').drawImage(video,0,0,thumb.width,thumb.height);
   const t=tiny.getContext('2d',{willReadFrequently:true});t.drawImage(video,0,0,32,18);const g=grey(t);
   let diff=null;if(previous){let sum=0;for(let i=0;i<g.length;i++)sum+=Math.abs(g[i]-previous[i]);diff=sum/g.length;}previous=g;
   const h=hashc.getContext('2d',{willReadFrequently:true});h.drawImage(video,0,0,8,8);const hg=grey(h),mean=hg.reduce((a,b)=>a+b,0)/hg.length;
   let hash='';for(let i=0;i<64;i+=4){let n=0;for(let j=0;j<4;j++)n=n<<1|(hg[i+j]>mean?1:0);hash+=n.toString(16);}
   frames.push({at:Number(video.currentTime.toFixed(2)),image:model.toDataURL('image/jpeg',0.82).split(',')[1],thumb:thumb.toDataURL('image/jpeg',0.72),diff,hash});
  }
  return frames;
 };
})();
