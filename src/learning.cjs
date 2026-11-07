const growth=require('./growth.cjs');
const {randomUUID}=require('node:crypto');
const ACTIONS=['reminder','answer','bugs','anr'];
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
 if(!ACTIONS.includes(input.action))throw new Error('Выберите доступное действие.');
 const output=String(input.output||'').trim();if(output.length>4000)throw new Error('Текст слишком длинный.');
 for(const p of patterns){const {names}=compile(p);if(input.action==='reminder'&&(!names.includes('delay')||!names.includes('message')))throw new Error('Для напоминания в каждой фразе нужны {delay} и {message}.');for(const m of output.matchAll(/\{([a-z]+)\}/g))if(!names.includes(m[1]))throw new Error('В ответе есть переменная, которой нет во фразе.');}
 if(input.action!=='reminder'&&!output)throw new Error('Укажите текст ответа или запрос к сервису.');
 return {id:typeof input.id==='string'&&input.id?input.id:randomUUID(),name,patterns:[...new Set(patterns)],action:input.action,output,enabled:input.enabled!==false};
}
class Learning{
 constructor({state={version:1,skills:[],reminders:[]},save=()=>{},notify=()=>{},now=Date.now}){if(state.version!==1||!Array.isArray(state.skills)||!Array.isArray(state.reminders))throw new Error('Неизвестный формат обучения.');this.state=structuredClone(state);this.state.dictionary ||= [];this.state.recipes ||= [];this.state.undoLog ||= [];growth.initialize(this.state);this.save=save;this.notify=notify;this.now=now;}
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
  const current=next[op.collection].find(r=>r.id===op.itemId)||null;
  if(JSON.stringify(current)!==JSON.stringify(op.after))throw new Error('Данные уже изменились после действия. Автоматическая отмена невозможна.');
  if(op.collection==='reminders'&&op.before?.state==='pending'&&op.before.due<=this.now())throw new Error('Время напоминания уже прошло; отмену нельзя откатить.');
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
  const result=found[0];if(result.action==='reminder'){result.delay=duration(result.slots.delay);if(!result.delay)result.error='Укажите время от 1 секунды до 365 дней, например «10 минут» или «1 час 20 минут». Повторите фразу целиком с этим временем.';}
  return {matched:true,...result};
 }
 execute(command){const p=this.preview(command);if(!p.matched&&!p.error)return null;if(p.error)return {handled:true,error:true,text:p.error};
  if(p.action==='reminder'){const next=this.list();if(next.reminders.filter(r=>r.state==='pending').length>=500)throw new Error('Слишком много активных напоминаний.');const reminder={id:randomUUID(),text:p.slots.message,due:this.now()+p.delay,state:'pending',skill:p.skill};next.reminders=next.reminders.filter(r=>r.state==='pending'||r.due>this.now()-30*86400000);next.reminders.push(reminder);this.commitUser(next,'reminders',reminder.id,'напоминание «'+reminder.text+'»');return {handled:true,text:'Напомню '+new Date(reminder.due).toLocaleString('ru-RU')+': '+reminder.text,reminderId:reminder.id};}
  if(p.action==='answer')return {handled:true,text:p.output};return {query:p.output,kind:p.action};
 }
 cancel(id){const next=this.list(),r=next.reminders.find(r=>r.id===id);if(!r||r.state!=='pending')throw new Error('Напоминание уже завершено.');r.state='cancelled';this.commitUser(next,'reminders',id,'отмена напоминания «'+r.text+'»');}
 tick(){const due=this.state.reminders.filter(r=>r.state==='pending'&&r.due<=this.now());for(const r of due){const next=this.list();next.reminders.find(v=>v.id===r.id).state='delivered';this.commit(next);this.notify('Напоминание: '+r.text);}}
}
module.exports={Learning,validate,duration};
