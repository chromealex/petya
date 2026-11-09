// «История буфера», watcher: Electron has no clipboard change event, so the clipboard is read every 1.5 s while
// history is on. A change is a new text or a new picture; what was on the clipboard when watching started is not a
// copy (it was there before the user agreed). Petya's own writes («вставь третье скопированное») are settled at once
// and never recorded. Reading a picture is the costly part, so it is read only when the clipboard holds no text and
// says it holds an image.
const {createHash}=require('node:crypto');
const hash=data=>createHash('sha256').update(data).digest('hex').slice(0,32);

function create({clipboard,onCopy,interval=1500,setTimer=setInterval,clearTimer=clearInterval}){
 let timer=null,last=null,busy=false;
 function read(){
  const formats=(()=>{try{return clipboard.availableFormats()||[];}catch{return [];}})();
  let text='';try{text=clipboard.readText()||'';}catch{text='';}
  if(text.trim())return {formats,text,image:null,sig:'t:'+hash(text)};
  if(!formats.some(f=>/^image\//i.test(f)))return {formats,text:'',image:null,sig:'e:'+hash(formats.join('|'))};
  let image=null;try{image=clipboard.readImage();}catch{image=null;}
  if(!image||image.isEmpty())return {formats,text:'',image:null,sig:'e:'};
  const size=image.getSize(),small=image.resize({width:24});
  return {formats,text:'',image,sig:'i:'+size.width+'x'+size.height+':'+hash(small.toBitmap())};
 }
 async function tick(){
  if(busy)return;busy=true;
  try{
   const now=read();
   if(now.sig===last)return;
   const first=last===null;last=now.sig;
   if(first||now.sig.startsWith('e:'))return;
   await onCopy(now);
  }catch{/* a failed read or store is not fatal: the next change is tried again */}
  finally{busy=false;}
 }
 return {
  start(){if(timer)return;last=null;tick();timer=setTimer(tick,interval);timer?.unref?.();},
  stop(){if(timer)clearTimer(timer);timer=null;last=null;},
  get running(){return !!timer;},
  // After Petya wrote to the clipboard itself: take the new content as seen.
  settle(){try{last=read().sig;}catch{/* next tick */}},
  tick,read
 };
}
module.exports={create};
