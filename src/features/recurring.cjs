// Recurring commands made in the chat: «Проверяй почту каждые 5 минут», «каждое утро в 9 присылай сводку»,
// «перестань проверять почту». Each runs the command in its own chat «По расписанию · …» through the normal
// background pipeline, so the answer, notifications and «Требуют внимания» work as for any chat.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
// Imperfective verbs of a standing order become the one-off request Petya already understands.
const VERBS=[['проверяй','проверь'],['смотри','посмотри'],['просматривай','просмотри'],['присылай','пришли'],['показывай','покажи'],['обновляй','обнови'],['собирай','собери'],['пиши','напиши'],['читай','прочитай'],['делай','сделай'],['запускай','запусти'],['напоминай','напомни'],['рассказывай','расскажи'],['следи за','проверь'],['отслеживай','проверь'],['мониторь','проверь']];
const UNITS=[[/^секунд/u,1000],[/^минут/u,MIN],[/^час/u,HOUR],[/^(?:день|дня|дней|сутки|суток)/u,DAY],[/^недел/u,7*DAY]];
const NUM={одну:1,одна:1,один:1,две:2,два:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,пятнадцать:15,двадцать:20,тридцать:30,полчаса:30};
function unit(word){return UNITS.find(([re])=>re.test(word))?.[1]||0;}
function command(text){let s=String(text).trim().replace(/^[,\s]+|[,.!\s]+$/gu,'');for(const [from,to] of VERBS){const re=new RegExp('^'+from+'(?=\\s|$)','iu');if(re.test(s)){s=s.replace(re,to);break;}}return s?s[0].toLocaleUpperCase('ru')+s.slice(1):'';}
// «каждые 5 минут», «каждый час», «каждую минуту», «раз в 10 минут», «каждый день в 9:30», «каждое утро».
const EVERY=/(?:^|\s)(?:кажды[ейх]|каждую|каждое|каждый|раз\s+в)\s+(?:(\d{1,4}|[а-яё]+)\s+)?(секунд[а-яё]*|минут[а-яё]*|час[а-яё]*|день|дня|дней|сутки|суток|недел[а-яё]*|полчаса|утро|вечер)(?:\s+в\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:утра|вечера|часов|ч))?)?(?=[\s,.!]|$)/iu;
function parse(text,now=Date.now()){
 const s=String(text||'').replace(/^петя[,!\s]+/iu,'').trim();
 if(!s||s.length>500||/^(?:как|почему|можно ли|можешь ли|умеешь)\b|\?$/iu.test(s)||/(?:^|\s)не\s+(?:надо|нужно|проверяй|присылай)/iu.test(s))return null;
 const m=EVERY.exec(s);if(!m)return null;
 const word=m[2].toLocaleLowerCase('ru');let every=0,daily=null;
 if(word==='полчаса')every=30*MIN;
 else if(/^(?:утро|вечер)$/.test(word)||/^(?:день|дня|дней|сутки|суток)$/.test(word)&&m[3]!==undefined)daily={h:m[3]!==undefined?Number(m[3])+(word==='вечер'&&Number(m[3])<12?12:0):word==='утро'?9:19,m:Number(m[4]||0)};
 else{const n=m[1]===undefined?1:/^\d+$/.test(m[1])?Number(m[1]):NUM[m[1].toLocaleLowerCase('ru')];if(!n)return null;every=n*unit(word);}
 if(daily&&(daily.h>23||daily.m>59))return null;
 if(!daily&&(every<MIN||every>30*DAY))return {error:'Повторять можно не чаще раза в минуту и не реже раза в 30 дней.'};
 const rest=(s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)).replace(/\s+/g,' ').trim();
 const cmd=command(rest);if(!cmd||cmd.split(/\s+/).length<2&&!/^(?:почту|слак|сводку)$/iu.test(cmd))return null;
 const item={command:cmd,original:s,...daily?{daily}:{every}};
 return {...item,next:next(item,now)};
}
function next(item,now=Date.now()){
 if(!item.daily)return now+item.every;
 const d=new Date(now);d.setHours(item.daily.h,item.daily.m,0,0);if(d.getTime()<=now)d.setDate(d.getDate()+1);return d.getTime();
}
function describe(item){
 if(item.daily)return 'каждый день в '+String(item.daily.h).padStart(2,'0')+':'+String(item.daily.m).padStart(2,'0');
 const e=item.every,[n,one,forms]=e%DAY===0?[e/DAY,'каждый день',['день','дня','дней']]:e%HOUR===0?[e/HOUR,'каждый час',['час','часа','часов']]:[Math.round(e/MIN),'каждую минуту',['минуту','минуты','минут']];
 if(n===1)return one;const a=n%10,b=n%100;return 'каждые '+n+' '+(a===1&&b!==11?forms[0]:a>=2&&a<=4&&(b<10||b>=20)?forms[1]:forms[2]);
}
const STOP=/^(?:петя[,!\s]+)?(?:перестань|прекрати|хватит|больше не надо|не надо больше|отмени|останови|убери|выключи)\s+(?:повтор[а-яё]*\s+|таймер[а-яё]*\s+|расписание\s+)?(.*)$/iu;
const LIST=/^(?:петя[,!\s]+)?(?:какие|покажи|список)\s+(?:у меня\s+)?(?:повтор[а-яё]*|таймер[а-яё]*|расписани[а-яё]*|регулярн[а-яё]*\s+команд[а-яё]*)[?.!]*$/iu;
const stem=w=>w.toLocaleLowerCase('ru').replace(/ё/g,'е').slice(0,5);
function matchStop(text,items){const m=STOP.exec(String(text).trim());if(!m)return null;const words=(m[1]||'').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3).map(stem);
 if(!words.length)return items.length===1?items:[];
 return items.filter(i=>{const own=i.command.split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3).map(stem);return words.filter(w=>!['пров','смот','прис','прове'].includes(w)).every(w=>own.includes(w))&&words.some(w=>own.includes(w));});}
// Whether the text is one of this feature's commands (for the meaning router, src/capabilities.cjs).
const matches=t=>{t=String(t||'').trim();return !!parse(t)||LIST.test(t)||STOP.test(t)&&/повтор|таймер|расписан|кажды|регулярн|проверя|присыла|смотре/iu.test(t);};
module.exports={name:'recurring',defaults:{},validate(){},parse,next,describe,matchStop,command,matches,
 setup(s){
  const file=()=>path.join(s.dataRoot,'recurring.json');
  let items=[];try{items=JSON.parse(fs.readFileSync(file(),'utf8')).items||[];}catch{items=[];}
  const save=()=>{fs.writeFileSync(file()+'.tmp',JSON.stringify({version:1,items}),{mode:0o600});fs.renameSync(file()+'.tmp',file());};
  const view=()=>items.map(i=>({id:i.id,createdAt:i.createdAt||null,command:i.command,original:i.original,schedule:describe(i),next:i.next,lastRun:i.lastRun||null,lastState:i.lastState||'',topicId:i.topicId,enabled:i.enabled!==false}));
  const emit=()=>{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('petya-recurring',view());};
  function chat(item){const d=s.dialogue;let topic=d.state.topics.find(t=>t.id===item.topicId&&!t.archived);
   if(!topic){topic={id:randomUUID(),projectId:item.projectId&&d.state.projects.some(p=>p.id===item.projectId&&!p.archived)?item.projectId:'general',title:'По расписанию · '+item.command.slice(0,60),kind:'chat',messages:[],at:Date.now()};d.state.topics.push(topic);item.topicId=topic.id;d.persist();}
   return topic;}
  function run(item){
   const topic=chat(item);item.lastRun=Date.now();item.next=next(item,Date.now());
   try{if(s.chatJobs.busy(topic.id)){item.lastState='Пропущено: прошлый запуск ещё идёт';}else{const r=s.chatJobs.start(topic.id,topic.projectId,item.command);item.lastState=r?.foreground?'Нужно открыть чат: это действие Петя делает только при вас':'Запущено';}}
   catch(e){item.lastState=e.message;}
   save();emit();
  }
  if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>{const now=Date.now();for(const item of items)if(item.enabled!==false&&item.next<=now)run(item);},5000);timer.unref();
   require('electron').powerMonitor?.on?.('resume',()=>{const now=Date.now();for(const item of items)if(item.enabled!==false&&item.next<now-MIN)item.next=next(item,now-1);save();});}
  const remove=id=>{const before=items.length;items=items.filter(i=>i.id!==id);if(items.length!==before){save();emit();}return view();};
  const toggle=(id,enabled)=>{const i=items.find(i=>i.id===id);if(!i)throw Error('Повтор не найден.');i.enabled=!!enabled;if(i.enabled)i.next=next(i,Date.now());save();emit();return view();};
  // The chat side: create, list and stop.
  const turn=text=>{
   const d=s.dialogue;
   if(LIST.test(String(text).trim())){const rows=view();const answer=rows.length?'Повторяю:\n'+rows.map(r=>'• '+r.command+' — '+r.schedule+(r.enabled?', следующий раз '+new Date(r.next).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):' (на паузе)')).join('\n'):'Повторяющихся команд нет. Скажи, например: «Проверяй почту каждые 5 минут».';d.rememberAction(text,answer);return {handled:true,text:answer,by:'повторяющиеся команды'};}
   const stop=matchStop(text,items);
   if(stop&&stop.length){for(const i of stop)items=items.filter(v=>v!==i);save();emit();const answer='Больше не повторяю: '+stop.map(i=>'«'+i.command+'»').join(', ')+'.';d.rememberAction(text,answer);return {handled:true,text:answer,by:'повторяющиеся команды'};}
   const parsed=parse(text);if(!parsed)return null;
   if(parsed.error){d.rememberAction(text,parsed.error);return {handled:true,text:parsed.error};}
   if(items.length>=50)throw Error('Повторяющихся команд уже 50. Удалите ненужные в «Обучение → Повторяющиеся команды».');
   const item={id:randomUUID(),command:parsed.command,original:parsed.original,...parsed.daily?{daily:parsed.daily}:{every:parsed.every},next:parsed.next,projectId:d.state.activeProjectId||'general',createdAt:Date.now(),enabled:true};
   items.push(item);chat(item);save();emit();
   const answer='Хорошо: «'+item.command+'» '+describe(item)+'. Первый раз — '+new Date(item.next).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'. Ответы будут в чате «По расписанию», список и остановка — в «Обучение → Повторяющиеся команды» или фразой «перестань '+item.command.toLocaleLowerCase('ru')+'».';
   d.rememberAction(text,answer);const t=d.active();return {handled:true,text:answer,by:'повторяющиеся команды',topicId:t?.id,messages:t?.messages};
  };
  return {recurring:{turn,list:view},ipc:{list:view,remove,toggle,runNow:id=>{const i=items.find(i=>i.id===id);if(!i)throw Error('Повтор не найден.');run(i);return view();}}};
 }
};
