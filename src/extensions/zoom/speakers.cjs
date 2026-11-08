// «Zoom» extension: who is talking in a Zoom meeting, from the texts of Zoom's own window (tile labels, the active speaker, the
// participant list) read by `watch-macos --speakers`. During a recording the names are sampled every few seconds
// and each fragment of the meeting sound gets the name heard most during it.
const {execFile}=require('node:child_process'),path=require('node:path');
function unpacked(file){return file.replace(/app\.asar([/\\])/u,'app.asar.unpacked$1');}
function read(){
 if(process.platform!=='darwin')return Promise.resolve({texts:[]});
 return new Promise(resolve=>execFile(unpacked(path.join(__dirname,'../../../assets/native/watch-macos')),['--speakers'],{timeout:4000,maxBuffer:1024*1024},(error,stdout)=>{
  if(error)return resolve({texts:[],error:error.message});try{resolve(JSON.parse(stdout));}catch{resolve({texts:[]});}
 }));
}
const NAME=/^[\p{L}][\p{L}\p{M}'’.\- ]{0,60}[\p{L}.]$/u;
const SKIP=/^(?:zoom|zoom meeting|конференция zoom|mute|unmute|звук|видео|video|chat|чат|participants|участники|share screen|демонстрация|record|запись|reactions|реакции|more|ещё|end|leave|выйти|завершить|security|безопасность|apps|приложения|view|вид|gallery view|speaker view|галерея|you|вы|me|я|host|организатор|co-host|соорганизатор)$/iu;
const clean=name=>String(name||'').replace(/\s*\((?:host|me|you|организатор|я|вы|guest|гость|co-host|соорганизатор)[^)]*\)/giu,'').replace(/\s+/g,' ').trim();
// Names of the people talking now, and everybody seen in the meeting window.
function parse(texts=[]){
 const talking=new Set(),people=new Set();
 for(const raw of texts){const t=String(raw).trim();if(!t||t.length>200)continue;let m;
  if((m=/^(?:talking|speaking|говорит|сейчас говорит|выступает)\s*[:：]\s*(.+)$/iu.exec(t)))talking.add(clean(m[1]));
  else if((m=/^(.+?)(?:,\s*|\s+)(?:is\s+)?(?:talking|speaking|говорит)(?![\p{L}])/iu.exec(t)))talking.add(clean(m[1]));
  else if((m=/^(.+?)\s*\((?:talking|speaking|говорит)\)/iu.exec(t)))talking.add(clean(m[1]));
  // Video tiles: «Имя Фамилия, Audio muted, Video off», «Имя, звук включён».
  if((m=/^([^,]{2,60}),\s*(?:audio|video|computer audio|микрофон|звук|видео|камера)(?![\p{L}])/iu.exec(t.replace(/\s*\([^)]*\)/gu,''))))people.add(clean(m[1]));
 }
 const ok=n=>n&&NAME.test(n)&&!SKIP.test(n);
 return {talking:[...talking].filter(ok),people:[...people].filter(ok)};
}
class SpeakerTimeline{
 constructor({read:reader=read,every=2000,now=Date.now,keep=()=>{}}={}){Object.assign(this,{reader,every,now,keep});this.samples=[];this.people=new Set();}
 start(){this.stop();const tick=async()=>{if(this.busy)return;this.busy=true;try{const r=await this.reader();const {talking,people}=parse(r.texts||[]);for(const p of people)this.people.add(p);this.samples.push({at:this.now(),talking});if(this.samples.length>20000)this.samples.splice(0,5000);this.last=r;}catch{}finally{this.busy=false;}};
  void tick();this.timer=setInterval(tick,this.every);this.timer.unref?.();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;if(this.last)this.keep({at:this.now(),people:[...this.people],texts:(this.last.texts||[]).slice(0,400)});}
 // The name heard most often between `from` and `to` (a little slack on both sides for Zoom's delay).
 label(from,to){const counts=new Map();for(const s of this.samples)if(s.at>=from-1500&&s.at<=to+1500)for(const n of s.talking)counts.set(n,(counts.get(n)||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}
 // The samples between `from` and `to` as speaking intervals for the meeting source interface: one per name
 // heard in a sample (the recorder picks the name with the most overlap).
 intervals(from,to){const out=[];for(const s of this.samples)if(s.at>=from-1500&&s.at<=to+1500)for(const name of s.talking)out.push({name,start:s.at,end:s.at});return out;}
}
module.exports={read,parse,SpeakerTimeline};
