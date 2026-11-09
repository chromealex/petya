const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {SOUND,MIC}=require('./meeting-talk.cjs');
// Persist encrypted segments immediately; recognition runs in the background while the meeting goes on
// and finishes after the recording stops. `observe` sees each fragment recognised while the meeting is still being
// recorded (the live meeting stream, src/meeting-stream.cjs); fragments recognised after the stop are not live.
class MeetingRecording {
 constructor({directory,encrypt,decrypt,transcribe,save,emit=()=>{},observe=()=>{},days=()=>7}){
  Object.assign(this,{directory,encrypt,decrypt,transcribe,save,emit,observe,days});this.sessions=new Map();this.running=new Set();
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  this.cleanup();
  for(const name of fs.readdirSync(directory).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
   const state=JSON.parse(decrypt(fs.readFileSync(path.join(directory,name))));
   if(state.phase!=='done'){state.phase='error';state.message='Запись или обработка прервалась. Можно обработать сохранённые фрагменты.';}
   this.sessions.set(state.id,state);
  }
 }
 cleanup(){const cutoff=Date.now()-Number(this.days())*86400000;for(const name of fs.readdirSync(this.directory)){if(!/^[a-f0-9-]{36}(?:\.json(?:\.tmp)?|-\d+\.audio)$/.test(name))continue;const file=path.join(this.directory,name);if(fs.statSync(file).mtimeMs<cutoff)fs.rmSync(file,{force:true});}}
 state(id){const state=this.sessions.get(id);if(!state)throw Error('Запись встречи не найдена.');return state;}
 persist(state){const file=path.join(this.directory,state.id+'.json');fs.writeFileSync(file+'.tmp',this.encrypt(JSON.stringify(state)),{mode:0o600});fs.renameSync(file+'.tmp',file);this.emit(this.public(state));}
 public(s){const at=s.segments[0]?.at,end=s.segments.at(-1)?.endedAt;return {id:s.id,phase:s.phase,message:s.message,percent:s.phase==='processing'&&s.segments.length?Math.floor(s.completed/s.segments.length*100):undefined,
  segments:s.segments.length,completed:s.completed,bytes:s.segments.reduce((n,p)=>n+(p.bytes||0),0),startedAt:at||s.startedAt||null,duration:at&&end?Math.max(0,end-at):0};}
 status(){return [...this.sessions.values()].map(s=>this.public(s));}
 // `title` and `app` come from the meeting source that saw the meeting, if any.
 begin({title='',app=''}={}){this.cleanup();const s={id:randomUUID(),phase:'recording',message:'Записываю встречу и расшифровываю по ходу.',segments:[],completed:0,startedAt:Date.now(),title:String(title||'').replace(/\s+/g,' ').trim().slice(0,120),app:String(app||'').trim().slice(0,40)};this.sessions.set(s.id,s);this.persist(s);return s.id;}
 append(id,source,item){
  const s=this.state(id);if(s.phase!=='recording')throw Error('Запись встречи уже завершена.');
  if(![SOUND,MIC].includes(source)||!(item?.wav instanceof ArrayBuffer)||item.wav.byteLength<44||item.wav.byteLength>4e6||![item.at,item.endedAt].every(Number.isFinite))throw Error('Некорректный фрагмент встречи.');
  const key=s.segments.length,filename=id+'-'+key+'.audio';
  fs.writeFileSync(path.join(this.directory,filename),this.encrypt(Buffer.from(item.wav).toString('base64')),{mode:0o600});
  s.segments.push({filename,source,at:item.at,endedAt:item.endedAt,overlap:!!item.overlap,bytes:item.wav.byteLength,...typeof item.speaker==='string'&&item.speaker&&item.speaker.length<=80?{speaker:item.speaker}:{}});this.persist(s);void this.process(s);
 }
 finish(id){const s=this.state(id);if(s.phase!=='recording')return this.public(s);if(!s.segments.length){s.phase='error';s.message='В записи нет сохранённых звуковых фрагментов. Проверьте источники звука и начните запись заново.';this.persist(s);return this.public(s);}s.phase='processing';s.message=s.completed<s.segments.length?'Встреча завершена. Дорасшифровываю запись…':'Встреча завершена. Сохраняю расшифровку…';this.persist(s);void this.process(s);return this.public(s);}
 retry(id){const s=this.state(id);if(s.phase!=='error')throw Error('Повтор доступен после ошибки обработки.');s.phase='processing';this.persist(s);void this.process(s);return this.public(s);}
 async process(s){
  if(this.running.has(s.id))return;this.running.add(s.id);
  try{
   for(;s.completed<s.segments.length;){
    const part=s.segments[s.completed],bytes=Buffer.from(this.decrypt(fs.readFileSync(path.join(this.directory,part.filename))),'base64');
    const result=await this.transcribe(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    s.previous ||= {};
    const text=part.overlap?stitch(s.previous[part.source]||'',result||''):result;
    if(text)await this.save({id:s.id+'-'+s.completed,sessionId:s.id,source:part.source,...part.speaker?{speaker:part.speaker}:{},title:(s.title||'Встреча'+(s.app?' '+s.app:''))+' · '+new Date(part.at).toLocaleString('ru-RU'),text,at:part.endedAt,url:''});
    // A deterministic context ID makes recovery idempotent if persistence fails after saving.
    if(result)s.previous[part.source]=result;
    if(s.phase==='recording'){
     // Whether the next fragment of this source (if already recorded) continues this one without a pause.
     const next=s.segments.slice(s.completed+1).find(p=>p.source===part.source);
     try{this.observe({id:s.id,index:s.completed,source:part.source,at:part.at,endedAt:part.endedAt,overlap:part.overlap,text:text||'',...part.speaker?{speaker:part.speaker}:{},pending:s.segments.length-s.completed-1,...next?{continues:next.overlap}:{}});}catch{/* the live stream never breaks the recording */}
    }
    s.completed++;s.message=s.phase==='recording'?`Записываю встречу · расшифровано ${s.completed} из ${s.segments.length} фрагментов`:`Расшифровываю встречу: ${s.completed} из ${s.segments.length} фрагментов`;this.persist(s);
   }
   // Caught up while the meeting goes on: the next fragment or the finish starts the loop again.
   if(s.phase==='recording')return;
   s.phase='done';s.message='Расшифровка встречи сохранена в общей памяти компании.';this.persist(s);
   for(const part of s.segments)fs.rmSync(path.join(this.directory,part.filename),{force:true});
  }catch(e){
   // Recognition failing during the meeting never stops the recording: the rest is retried after it ends.
   if(s.phase==='recording'){s.message='Записываю встречу · расшифровка продолжится после её окончания';this.persist(s);return;}
   s.phase='error';s.message='Не удалось обработать встречу: '+e.message;this.persist(s);}
  finally{this.running.delete(s.id);if(s.phase==='processing'&&this.sessions.get(s.id)===s)void this.process(s);}
 }
 // Deleting a meeting removes its audio, its state and nothing else; the caller removes the saved transcript.
 remove(id){const s=this.state(id);this.sessions.delete(id);for(const part of s.segments)fs.rmSync(path.join(this.directory,part.filename),{force:true});fs.rmSync(path.join(this.directory,id+'.json'),{force:true});this.emit({id,phase:'removed'});}
}
function stitch(previous,current){const before=previous.trim().split(/\s+/),after=current.trim().split(/\s+/),normal=w=>w.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu,'');for(let n=Math.min(8,before.length,after.length);n>=1;n--)if(before.slice(-n).every((w,i)=>normal(w)&&normal(w)===normal(after[i])))return after.slice(n).join(' ');return current;}
module.exports={MeetingRecording};
