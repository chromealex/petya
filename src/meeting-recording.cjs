const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
// Persist encrypted segments immediately; recognition starts only after finish.
class MeetingRecording {
 constructor({directory,encrypt,decrypt,transcribe,save,emit=()=>{},days=()=>7}){
  Object.assign(this,{directory,encrypt,decrypt,transcribe,save,emit,days});this.sessions=new Map();this.running=new Set();
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
 public(s){return {id:s.id,phase:s.phase,message:s.message,percent:s.phase==='processing'&&s.segments.length?Math.floor(s.completed/s.segments.length*100):undefined};}
 status(){return [...this.sessions.values()].map(s=>this.public(s));}
 begin(){this.cleanup();const s={id:randomUUID(),phase:'recording',message:'Записываю до конца встречи. Обработка начнётся после завершения.',segments:[],completed:0};this.sessions.set(s.id,s);this.persist(s);return s.id;}
 append(id,source,item){
  const s=this.state(id);if(s.phase!=='recording')throw Error('Запись встречи уже завершена.');
  if(!['Zoom','Микрофон'].includes(source)||!(item?.wav instanceof ArrayBuffer)||item.wav.byteLength<44||item.wav.byteLength>4e6||![item.at,item.endedAt].every(Number.isFinite))throw Error('Некорректный фрагмент встречи.');
  const key=s.segments.length,filename=id+'-'+key+'.audio';
  fs.writeFileSync(path.join(this.directory,filename),this.encrypt(Buffer.from(item.wav).toString('base64')),{mode:0o600});
  s.segments.push({filename,source,at:item.at,endedAt:item.endedAt,overlap:!!item.overlap});this.persist(s);
 }
 finish(id){const s=this.state(id);if(s.phase!=='recording')return this.public(s);if(!s.segments.length){s.phase='error';s.message='В записи нет сохранённых звуковых фрагментов. Проверьте источники звука и начните запись заново.';this.persist(s);return this.public(s);}s.phase='processing';s.message='Встреча завершена. Расшифровываю запись…';this.persist(s);void this.process(s);return this.public(s);}
 retry(id){const s=this.state(id);if(s.phase!=='error')throw Error('Повтор доступен после ошибки обработки.');s.phase='processing';this.persist(s);void this.process(s);return this.public(s);}
 async process(s){
  if(this.running.has(s.id))return;this.running.add(s.id);
  try{
   for(;s.completed<s.segments.length;){
    const part=s.segments[s.completed],bytes=Buffer.from(this.decrypt(fs.readFileSync(path.join(this.directory,part.filename))),'base64');
    const result=await this.transcribe(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    s.previous ||= {};
    const text=part.overlap?stitch(s.previous[part.source]||'',result||''):result;
    if(text)await this.save({id:s.id+'-'+s.completed,sessionId:s.id,source:part.source,title:'Встреча Zoom · '+new Date(part.at).toLocaleString('ru-RU'),text,at:part.endedAt,url:''});
    // A deterministic context ID makes recovery idempotent if persistence fails after saving.
    if(result)s.previous[part.source]=result;
    s.completed++;s.message=`Расшифровываю встречу: ${s.completed} из ${s.segments.length} фрагментов`;this.persist(s);
   }
   s.phase='done';s.message='Расшифровка встречи сохранена в общей памяти компании.';this.persist(s);
   for(const part of s.segments)fs.rmSync(path.join(this.directory,part.filename),{force:true});
  }catch(e){s.phase='error';s.message='Не удалось обработать встречу: '+e.message;this.persist(s);}
  finally{this.running.delete(s.id);}
 }
}
function stitch(previous,current){const before=previous.trim().split(/\s+/),after=current.trim().split(/\s+/),normal=w=>w.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu,'');for(let n=Math.min(8,before.length,after.length);n>=1;n--)if(before.slice(-n).every((w,i)=>normal(w)&&normal(w)===normal(after[i])))return after.slice(n).join(' ');return current;}
module.exports={MeetingRecording};
