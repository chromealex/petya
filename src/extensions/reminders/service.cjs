// The reminders of one company: stored in <company data>/extensions/reminders/reminders.json (survives restarts),
// fired on time or when their trigger sees the event, as a notification plus a message in the chat the reminder
// was made in. Event triggers are polled with backoff, one at a time; checks only read services.
// Everything time-related takes `now` so tests run on a fake clock.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const when=require('./when.cjs');
const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
const EVENT_DAYS=30,MAX_ITEMS=300,ERROR_NOTICE=3;

function load(file){try{const d=JSON.parse(fs.readFileSync(file,'utf8'));return {items:Array.isArray(d.items)?d.items:[],trash:Array.isArray(d.trash)?d.trash:[],...d.note&&typeof d.note==='object'?{note:d.note}:{}};}catch{return {items:[],trash:[]};}}
function save(file,data){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,...data}),{mode:0o600});fs.renameSync(file+'.tmp',file);
}
const endOfDay=now=>{const d=new Date(now);d.setHours(23,59,59,999);return d.getTime();};

// One row for cards and chat text.
function view(item,now=Date.now()){
 const time=item.kind==='time';
 const group=item.status==='fired'?'fired':item.status==='done'?'done':time?(item.at<=endOfDay(now)?'today':'later'):'event';
 return {id:item.id,text:item.text,kind:item.kind,status:item.status,group,
  icon:time?(item.repeat?'repeat':'clock'):item.trigger?.icon||'event',
  at:time?item.at:item.trigger?.fireAt||null,repeat:item.repeat||null,
  words:time?when.describe(item,now):item.trigger?.label||'',absolute:time?when.absolute(item.at):'',
  trigger:item.trigger?{id:item.trigger.id,name:item.trigger.name,label:item.trigger.label,url:item.trigger.url||''}:null,
  nextCheck:item.kind==='event'&&item.status==='active'?item.nextCheck:null,checks:item.checks||0,lastError:item.lastError||'',
  firedAt:item.firedAt||null,firedText:item.firedText||'',firedUrl:item.firedUrl||'',missed:!!item.missed,
  snoozed:!!item.snoozed,topicId:item.topicId||'',projectId:item.projectId||'',createdAt:item.createdAt};
}

function create({s,file,now=()=>Date.now(),triggers,publish=()=>{},post=()=>{},system=()=>{}}){
 let data=load(file);
 const persist=()=>save(file,data);
 const find=id=>{const item=data.items.find(i=>i.id===id);if(!item)throw Error('Напоминание не найдено — возможно, его уже удалили.');return item;};
 const rows=()=>data.items.filter(i=>i.status!=='done').map(i=>view(i,now())).sort((a,b)=>(a.group==='fired'?0:1)-(b.group==='fired'?0:1)||(a.at||Infinity)-(b.at||Infinity)||a.createdAt-b.createdAt);
 // The notification of a fired reminder carries what the renderer needs for its actions (reminder-notifications.js).
 function notice(item,extra={}){
  publish({id:'reminder:'+item.id,title:'Напоминание',text:item.text+(item.firedText?' — '+item.firedText:''),kind:'attention',version:'fired:'+item.firedAt,
   reminder:{id:item.id,topicId:item.topicId||'',projectId:item.projectId||'',url:item.firedUrl||'',repeat:!!item.repeat},...extra});
 }
 function settle(item,text,kind='success'){publish({id:'reminder:'+item.id,title:'Напоминание',text,kind,version:'settled:'+now()});}

 function add({text,original='',topicId='',projectId='',time,trigger}){
  if(data.items.filter(i=>i.status!=='done').length>=MAX_ITEMS)throw Error('Напоминаний уже '+MAX_ITEMS+'. Удалите ненужные в карточке «Напоминания».');
  const clean=String(text||'').replace(/\s+/g,' ').trim().slice(0,300);if(!clean)throw Error('О чём напомнить?');
  const t=now();
  const item={id:randomUUID(),text:clean,original:String(original).slice(0,500),topicId,projectId,createdAt:t,status:'active'};
  if(time){item.kind='time';item.at=time.at;if(time.repeat)item.repeat=time.repeat;}
  else{item.kind='event';item.trigger={...trigger,fireAt:trigger.fireAt||null};item.expiresAt=t+EVENT_DAYS*DAY;item.checks=0;item.errors=0;item.state={};
   item.nextCheck=t+Math.min(HOUR,Math.max(30000,schedule(item,t)));}
  data.items.push(item);persist();return view(item,t);
 }
 // When an event trigger looks next: its own backoff, then error backoff, never past its fire moment.
 function schedule(item,t){
  const x=triggers.get(item.trigger.id);let wait=5*MIN;
  try{if(x?.trigger.every)wait=Number(x.trigger.every(item.checks||0,item.trigger.params,t))||wait;}catch{wait=5*MIN;}
  if(item.errors)wait=Math.max(wait,Math.min(HOUR,MIN*Math.pow(2,item.errors)));
  return Math.max(30000,Math.min(HOUR,wait));
 }
 function fire(item,{text='',url='',missed=false}={}){
  const t=now();
  item.firedAt=t;item.firedText=String(text||'').slice(0,400);item.firedUrl=url||item.trigger?.url||'';item.missed=missed;
  if(item.repeat){item.status='active';item.lastFiredAt=t;item.at=when.nextRepeat(item.repeat,Math.max(t,item.at));}
  else item.status='fired';
  persist();
  try{post(item,view(item,t));}catch(e){console.error('Reminder chat message:',e.message);}
  notice(item);
  try{system(item);}catch{/* no system notifications here */}
 }
 let busy=false;
 // Fires what is due and checks event triggers whose time has come. Returns the ids fired in this tick.
 async function tick(){
  const t=now(),fired=[];
  for(const item of data.items){
   if(item.kind!=='time'||item.status!=='active'||item.at>t)continue;
   // A reminder missed while the computer slept or Petya was closed fires once, marked as missed.
   fire(item,{missed:t-item.at>5*MIN});fired.push(item.id);
  }
  if(busy)return fired;busy=true;
  try{
   for(const item of data.items.filter(i=>i.kind==='event'&&i.status==='active'&&i.nextCheck<=t)){
    if(!data.items.includes(item)||item.status!=='active')continue;
    if(item.expiresAt<=t){item.status='done';item.doneAt=t;item.expired=true;persist();settle(item,'Перестал ждать: «'+item.text+'» — прошло '+EVENT_DAYS+' дней, событие не произошло.','info');continue;}
    const x=triggers.get(item.trigger.id);
    if(!x||!triggers.ready(item.trigger.id)){item.nextCheck=t+30*MIN;item.lastError='Приложение для этого события не добавлено или не подключено.';persist();continue;}
    let result;
    try{result=await x.trigger.check(s,item.trigger.params,{now:t,state:item.state||{}});}
    catch(e){
     if(!data.items.includes(item)||item.status!=='active')continue;
     if(e.name==='TriggerError'&&e.code==='not-found'){item.status='done';item.doneAt=now();item.lastError=e.message;persist();settle(item,'«'+item.text+'»: '+e.message,'error');continue;}
     item.errors=(item.errors||0)+1;item.lastError=String(e.message||e).slice(0,300);item.nextCheck=now()+schedule(item,now());persist();
     if(item.errors===ERROR_NOTICE)publish({id:'reminder-check:'+item.id,title:'Напоминание · не могу проверить',text:'«'+item.text+'»: '+item.lastError,kind:'error',version:'errors:'+item.checks});
     continue;
    }
    // The reminder may have been deleted, edited or snoozed while the service answered.
    if(!data.items.includes(item)||item.status!=='active'||item.kind!=='event')continue;
    item.checks=(item.checks||0)+1;item.errors=0;item.lastError='';
    if(result?.params)item.trigger.params={...item.trigger.params,...result.params};
    if(result?.state)item.state=result.state;
    if(result?.fireAt)item.trigger.fireAt=result.fireAt;
    if(result?.gone){item.status='done';item.doneAt=now();persist();settle(item,'«'+item.text+'»: '+(result.text||'событие больше не ожидается.'),'info');continue;}
    if(result?.fired){fire(item,{text:result.text,url:result.url});fired.push(item.id);continue;}
    item.nextCheck=now()+schedule(item,now());persist();
   }
  }finally{busy=false;}
  return fired;
 }
 function done(id){const item=find(id);item.status='done';item.doneAt=now();persist();settle(item,'Готово: «'+item.text+'»');return rows();}
 // Snooze: minutes from now, or {until: ms}. An event reminder that already fired comes back as a time reminder.
 function snooze(id,{minutes,until}={}){
  const item=find(id),t=now();
  const at=Number.isFinite(until)?until:t+Math.max(1,Math.min(60*24*30,Number(minutes)||10))*MIN;
  if(at<=t)throw Error('Это время уже прошло.');
  if(item.kind==='event'&&item.status==='active')throw Error('Это напоминание ещё ждёт события. Отложить можно сработавшее.');
  // A repeating reminder keeps its schedule: the snoozed occurrence becomes a one-off copy.
  if(item.repeat){
   const copy={...item,id:randomUUID(),kind:'time',at,status:'active',snoozed:true,createdAt:t};delete copy.repeat;delete copy.firedAt;delete copy.lastFiredAt;
   data.items.push(copy);persist();settle(item,'Отложено до '+when.describe(copy,t)+': «'+item.text+'»','info');return view(copy,t);
  }
  item.kind='time';item.at=at;item.status='active';item.snoozed=true;delete item.repeat;
  persist();settle(item,'Отложено до '+when.describe(item,t)+': «'+item.text+'»','info');return view(item,t);
 }
 function edit(id,{text,at}={}){
  const item=find(id),t=now();
  if(text!==undefined){const clean=String(text).replace(/\s+/g,' ').trim().slice(0,300);if(!clean)throw Error('Текст напоминания пустой.');item.text=clean;}
  if(at!==undefined){
   const ms=Number(at);if(!Number.isFinite(ms)||ms<=t)throw Error('Выберите время в будущем.');
   if(item.kind!=='time')throw Error('Это напоминание ждёт события — у него нет времени.');
   item.at=ms;item.status='active';
   if(item.repeat){const d=new Date(ms);item.repeat={...item.repeat,h:d.getHours(),m:d.getMinutes()};item.at=when.nextRepeat(item.repeat,t);}
  }
  persist();return view(item,t);
 }
 function remove(id){
  const item=find(id);data.items=data.items.filter(i=>i!==item);data.trash=[{...item,deletedAt:now()},...data.trash].slice(0,20);persist();
  settle(item,'Удалено: «'+item.text+'»','info');return view(item,now());
 }
 function restore(id){
  const item=data.trash.find(i=>i.id===id);if(!item)throw Error('Это напоминание уже нельзя вернуть.');
  data.trash=data.trash.filter(i=>i!==item);delete item.deletedAt;
  if(item.kind==='time'&&item.status==='active'&&item.at<=now()&&item.repeat)item.at=when.nextRepeat(item.repeat,now());
  data.items.push(item);persist();return view(item,now());
 }
 // Check an event reminder right away (card button «Проверить сейчас»).
 async function checkNow(id){const item=find(id);if(item.kind!=='event'||item.status!=='active')return view(item,now());item.nextCheck=now();item.errors=0;await tick();return view(find(id),now());}
 const notices=()=>data.items.filter(i=>i.status==='fired').map(i=>({id:'reminder:'+i.id,title:'Напоминание',text:i.text+(i.firedText?' — '+i.firedText:''),kind:'attention',version:'fired:'+i.firedAt,reminder:{id:i.id,topicId:i.topicId||'',projectId:i.projectId||'',url:i.firedUrl||'',repeat:!!i.repeat}}));
 // For the journal: what was done in a period and what is still open.
 const history=({from,to})=>data.items.filter(i=>i.doneAt>=from&&i.doneAt<to&&!i.expired||i.firedAt>=from&&i.firedAt<to).map(i=>view(i,now()));
 const items=()=>data.items.map(i=>view(i,now()));
 // Words of a request («про отчёт») against reminder texts.
 function search(words){
  const stems=String(words||'').toLocaleLowerCase('ru').replace(/ё/g,'е').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3&&!['про','насчет','это','мне','все','всех'].includes(w)).map(w=>w.slice(0,Math.max(3,w.length-2)));
  const open=data.items.filter(i=>i.status!=='done');
  if(!stems.length)return open;
  return open.filter(i=>{const own=i.text.toLocaleLowerCase('ru').replace(/ё/g,'е').split(/[^\p{L}\p{N}]+/u);return stems.every(st=>own.some(w=>w.startsWith(st)));});
 }
 // Reminders brought from elsewhere (Petya's core before 0.15, see migrate.cjs): time reminders, the same id is never
 // added twice. rows: [{id, text, at, status:'active'|'done', original?, topicId?, projectId?, repeat?}].
 function adopt(list){
  let added=0;const t=now();
  for(const r of list){
   if(!r||data.items.some(i=>i.id===r.id))continue;
   const clean=String(r.text||'').replace(/\s+/g,' ').trim().slice(0,300);if(!clean||!Number.isFinite(r.at))continue;
   const item={id:typeof r.id==='string'&&r.id?r.id:randomUUID(),text:clean,original:String(r.original||'').slice(0,500),topicId:r.topicId||'',projectId:r.projectId||'',createdAt:Number.isFinite(r.createdAt)?r.createdAt:t,kind:'time',at:r.at,status:r.status==='done'?'done':'active'};
   if(r.repeat)item.repeat=r.repeat;
   if(item.status==='done'){item.firedAt=r.at;item.doneAt=r.at;}
   data.items.push(item);added++;
  }
  if(added)persist();return added;
 }
 // A one-time note kept with the reminders (e.g. «reminders moved here»): shown once in the notification center.
 const note=value=>{if(value!==undefined){data.note=value;persist();}return data.note||null;};
 return {add,adopt,note,tick,fire,done,snooze,edit,remove,restore,checkNow,list:rows,items,notices,history,search,view:id=>view(find(id),now()),reload(){data=load(file);},file};
}
module.exports={create,view,load};
