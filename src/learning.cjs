const growth=require('./growth.cjs');
const {randomUUID}=require('node:crypto');
// `command` runs the filled-in output as a chat request of its own (an app added to Petya may answer it); `answer`
// says it. Other actions are apps' ("<app>:<action>", voice-action providers, src/voice-actions.cjs).
const {CORE:ACTIONS,ID:APP_ACTION}=require('./voice-actions.cjs');
const clean=s=>String(s||'').trim().replace(/[.!?]+$/u,'').replace(/\s+/g,' ');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function compile(pattern){
 const names=[];let source='',last=0;
 for(const match of pattern.matchAll(/\{([a-z]+)\}/g)){
  if(!['delay','message','query'].includes(match[1])||names.includes(match[1]))throw new Error('Переменные: {delay}, {message}, {query}, каждая не больше одного раза.');
  source+=escape(pattern.slice(last,match.index))+'(.+?)';names.push(match[1]);last=match.index+match[0].length;
 }
 source+=escape(pattern.slice(last));
 if(/[{}]/.test(pattern.replace(/\{(?:delay|message|query)\}/g,'')))throw new Error('Неизвестная переменная.');
 if(!pattern.replace(/\{[^}]+\}/g,'').trim())throw new Error('Добавьте слова, по которым узнавать фразу.');
 if(/\}\s*\{/.test(pattern))throw new Error('Разделите переменные словами.');
 return {regex:new RegExp('^'+source+'$','iu'),names};
}
function duration(value){
 let s=clean(value).toLowerCase().replace(/^через\s+/,'');
 const words={одну:1,одна:1,один:1,две:2,два:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,пятнадцать:15,двадцать:20,тридцать:30,сорок:40,полчаса:'30 минут'};
 if(s==='час')s='1 час';if(s==='минуту')s='1 минуту';
 s=s.split(' ').map(w=>words[w]??w).join(' ');
 let total=0,last=0;const re=/(\d+(?:[.,]\d+)?)\s*(секунд[ауы]?|сек|минут[ауы]?|мин|час(?:а|ов)?|день|дня|дней)(?=$|\s)/gu;
 for(const m of s.matchAll(re)){if(s.slice(last,m.index).trim().replace(/^и$/,'').trim())return null;const unit=m[2];total+=Number(m[1].replace(',','.'))*(unit.startsWith('сек')?1000:unit.startsWith('мин')?60000:unit.startsWith('час')?3600000:86400000);last=m.index+m[0].length;}
 return last&& !s.slice(last).trim()&&total>=1000&&total<=365*86400000?total:null;
}
function validate(input){
 if(!input||typeof input!=='object')throw new Error('Укажите навык.');
 const name=clean(input.name),patterns=Array.isArray(input.patterns)?input.patterns.map(clean).filter(Boolean):[];
 if(!name||name.length>100||!patterns.length||patterns.length>20||patterns.some(p=>p.length>500))throw new Error('Нужны название до 100 символов и 1–20 фраз до 500 символов.');
 if(!ACTIONS.includes(input.action)&&!APP_ACTION.test(String(input.action||'')))throw new Error('Выберите доступное действие.');
 const output=String(input.output||'').trim();if(output.length>4000)throw new Error('Текст слишком длинный.');
 for(const p of patterns){const {names}=compile(p);for(const m of output.matchAll(/\{([a-z]+)\}/g))if(!names.includes(m[1]))throw new Error('В ответе есть переменная, которой нет во фразе.');}
 if(!output)throw new Error('Укажите текст ответа или запрос к сервису.');
 return {id:typeof input.id==='string'&&input.id?input.id:randomUUID(),name,patterns:[...new Set(patterns)],action:input.action,output,enabled:input.enabled!==false};
}
class Learning{
 // Fields Petya no longer owns stay in the state untouched until the app that owns them now takes them (`take`).
 constructor({state={version:1,skills:[]},save=()=>{},notify=()=>{},now=Date.now}){if(state.version!==1||!Array.isArray(state.skills))throw new Error('Неизвестный формат обучения.');this.state=structuredClone(state);this.state.dictionary ||= [];this.state.undoLog ||= [];growth.initialize(this.state);this.save=save;this.notify=notify;this.now=now;}
 commit(next){this.save(next);this.state=next;}
 list(){return structuredClone(this.state);}
 commitUser(next,collection,id,label){
  const before=this.state[collection].find(r=>r.id===id)||null,after=next[collection].find(r=>r.id===id)||null;
  if(JSON.stringify(before)!==JSON.stringify(after))next.undoLog=[...(next.undoLog||[]),{id:randomUUID(),at:this.now(),collection,itemId:id,label,before:structuredClone(before),after:structuredClone(after)}].slice(-30);
  growth.record(next,collection,after,before,this.now());
  this.commit(next);
 }
 growth(extra=[]){return growth.summary(this.state,extra);}
 // The user's own wording for «Чему я научился»; an empty text brings back Petya's.
 growthNote(key,text){if(typeof key!=='string'||!/^[\w:.-]{1,200}$/.test(key)||typeof text!=='string'||text.length>2000)throw new Error('Некорректная запись.');const next=this.list();next.growth.notes={...next.growth.notes};if(text.trim())next.growth.notes[key]=text.trim();else delete next.growth.notes[key];this.commit(next);return growth.summary(next);}
 undoInfo(){const op=[...this.state.undoLog].reverse().find(o=>!o.undone);return op?{id:op.id,label:op.label,at:op.at}:null;}
 undo(id){
  const next=this.list(),op=next.undoLog.find(o=>o.id===id&&!o.undone);if(!op||this.undoInfo()?.id!==id)throw new Error('Последнее действие изменилось. Обновите список.');
  if(!Array.isArray(next[op.collection]))throw new Error('Это действие больше нельзя отменить здесь.');
  const current=next[op.collection].find(r=>r.id===op.itemId)||null;
  if(JSON.stringify(current)!==JSON.stringify(op.after))throw new Error('Данные уже изменились после действия. Автоматическая отмена невозможна.');
  next[op.collection]=next[op.collection].filter(r=>r.id!==op.itemId);
  if(op.before)next[op.collection].push(op.before);
  op.undone=true;this.commit(next);return 'Отменено: '+op.label+'.';
 }

 putRule(input){const {rule,key}=require('./personal-dictionary.cjs');const value=rule(input),next=this.list();const same=next.dictionary.find(r=>r.id!==value.id&&r.kind===value.kind&&key(r.from)===key(value.from)&&key(r.scope)===key(value.scope));if(same)throw new Error('Для этой фразы и проекта уже есть правило. Измените существующее.');const at=next.dictionary.findIndex(r=>r.id===value.id);if(at<0){if(next.dictionary.length>=500)throw new Error('Максимум 500 правил.');next.dictionary.push(value);}else next.dictionary[at]=value;this.commitUser(next,'dictionary',value.id,'правило «'+value.from+'»');return value;}
 removeRule(id){const next=this.list();next.dictionary=next.dictionary.filter(r=>r.id!==id);this.commitUser(next,'dictionary',id,'удаление правила');}

 put(input){const skill=validate(input),next=this.list();const index=next.skills.findIndex(s=>s.id===skill.id);if(index<0){if(next.skills.length>=200)throw new Error('Максимум 200 навыков.');next.skills.push(skill);}else next.skills[index]=skill;this.commitUser(next,'skills',skill.id,'навык «'+skill.name+'»');return skill;}
 remove(id){const next=this.list();next.skills=next.skills.filter(s=>s.id!==id);this.commitUser(next,'skills',id,'удаление навыка');}
 preview(command,draft){const skills=draft?[validate(draft)]:this.state.skills.filter(s=>s.enabled);const found=[];
  for(const skill of skills){for(const pattern of skill.patterns){const c=compile(pattern),m=c.regex.exec(clean(command));if(!m)continue;const slots=Object.fromEntries(c.names.map((n,i)=>[n,m[i+1]]));found.push({skill:skill.name,id:skill.id,action:skill.action,slots,output:skill.output.replace(/\{([a-z]+)\}/g,(_,key)=>slots[key]||'')});break;}}
  if(found.length!==1)return {matched:false,...found.length?{error:'Совпало несколько навыков: '+found.map(f=>f.skill).join(', ')+'. Уточните их фразы в разделе «Обучение».',ambiguous:true}:{}};
  return {matched:true,...found[0]};
 }
 execute(command){const p=this.preview(command);if(!p.matched&&!p.error)return null;if(p.error)return {handled:true,error:true,text:p.error};
  if(p.action==='answer')return {handled:true,text:p.output};if(p.action==='command')return {command:p.output};return {action:p.action,output:p.output,slots:p.slots};
 }
 // An app that took over a kind of learned command rewrites it in place: same id, its growth is kept, no undo entry.
 replaceSkill(id,patch){const next=this.list(),index=next.skills.findIndex(s=>s.id===id);if(index<0)return null;const before=next.skills[index],after=validate({...before,...patch,id});next.skills[index]=after;growth.record(next,'skills',after,before,this.now());this.commit(next);return after;}
 // Hands a field Petya no longer owns (kept from older versions) to the app that owns it now, once: the value is
 // removed from the state together with its undo entries. Returns undefined when there is nothing to take.
 take(key){if(typeof key!=='string'||!/^[a-z][\w-]{0,40}$/i.test(key)||['version','skills','dictionary','undoLog','growth'].includes(key)||!(key in this.state))return undefined;const next=this.list(),value=next[key];delete next[key];next.undoLog=(next.undoLog||[]).filter(o=>o.collection!==key);this.commit(next);return value;}
}
module.exports={Learning,validate,duration};
