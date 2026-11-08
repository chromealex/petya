// Scheduled local recordings of calendar events («Петя запишет встречу»), for meeting apps that provide
// `meeting-recording`: from the event's start Petya waits until the app's own meeting source sees the meeting on
// this computer and then starts Petya's recording (src/features/meeting-memory.cjs). Each app keeps its list in its
// own settings key and passes its own `detect`; this module knows no meeting app.
// Every item has a stable notification (`meeting-schedule:<app id>:<item id>`) that can be cancelled until it starts.
const {randomUUID}=require('node:crypto');
const MAX=8,EARLY=60000;
function parse(value){try{const list=JSON.parse(value||'[]');return Array.isArray(list)?list.filter(x=>x&&typeof x.id==='string'):[];}catch{return [];}}
// For the app's `validate`: the stored list is well-formed and not too long.
function validate(next,key){
 const list=parse(next[key]);
 if(list.length>MAX)throw Error('Слишком много запланированных записей.');
 next[key]=JSON.stringify(list);
}
const hm=iso=>{const d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

// `id`: the app (notification ids, cancel IPC), `app`: its name in the texts, `key`: its settings key,
// `enabled()`: whether the app is added, `detect()`: its meeting source's {active} now.
function create(s,{id,app,key,enabled,detect,now=()=>Date.now(),publish=()=>{}}){
 const list=()=>parse(s.settings[key]);
 const save=items=>s.saveSettings({[key]:JSON.stringify(items)},true);
 const noteId=item=>'meeting-schedule:'+id+':'+item.id;
 const note=(item,text,{busy=false,kind='info',cancellable=true}={})=>publish({id:noteId(item),title:'Запись встречи',text,busy,kind,version:kind+':'+text.slice(0,60),cancellable:cancellable?item.id:''});
 function add({title,start,end}={}){
  const a=Date.parse(start),b=Date.parse(end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw Error('Нет времени встречи.');
  if(b<=now())throw Error('Эта встреча уже закончилась.');
  const name=String(title||'Встреча').replace(/\s+/g,' ').trim().slice(0,80)||'Встреча';
  const items=list().filter(x=>Date.parse(x.end)>now());
  const same=items.find(x=>x.start===new Date(a).toISOString()&&x.title===name);
  if(same)return same;
  if(items.length>=MAX)throw Error('Уже запланировано '+MAX+' записей. Отмените одну из них в уведомлениях.');
  const item={id:randomUUID(),title:name,start:new Date(a).toISOString(),end:new Date(b).toISOString()};
  save([...items,item]);
  note(item,'Петя запишет встречу «'+item.title+'» в '+hm(item.start)+'.');
  return item;
 }
 function cancel(itemId){
  const items=list(),item=items.find(x=>x.id===itemId);if(!item)throw Error('Запись уже отменена или прошла.');
  save(items.filter(x=>x.id!==itemId));
  note(item,'Запись встречи «'+item.title+'» отменена.',{cancellable:false});
  return list();
 }
 let busy=false;
 async function tick(){
  if(busy||!enabled())return;busy=true;
  try{
   const items=list();let changed=false;
   for(const item of items){
    const a=Date.parse(item.start),b=Date.parse(item.end),t=now();
    if(t>=b){
     changed=true;item.done=true;
     if(!item.started)note(item,'Встреча «'+item.title+'» не записана: '+app+' не показал её на этом компьютере.',{kind:'error',cancellable:false});
     continue;
    }
    if(t<a-EARLY||item.started)continue;
    if(s.settings.meetingAutoRecord==='off'){changed=true;item.done=true;note(item,'Запись встреч выключена в настройках — встреча «'+item.title+'» не записана.',{kind:'error',cancellable:false});continue;}
    try{
     const seen=await detect();
     if(!seen?.active)throw Error('not yet');
     await s.meetingRecording('startCapture');
     item.started=true;changed=true;
     note(item,'Петя записывает встречу «'+item.title+'».',{kind:'success',cancellable:false});
    }catch{
     if(!item.waiting){item.waiting=true;changed=true;note(item,'Жду, когда встреча «'+item.title+'» начнётся в '+app+', чтобы начать запись.',{busy:true});}
    }
   }
   if(changed)save(items.filter(x=>!x.done));
  }finally{busy=false;}
 }
 // Pending items for the notification center after a window reload.
 const restore=()=>list().map(x=>({id:noteId(x),title:'Запись встречи',text:x.started?'Петя записывает встречу «'+x.title+'».':'Петя запишет встречу «'+x.title+'» в '+hm(x.start)+'.',busy:!!x.waiting&&!x.started,kind:'info',version:'restore',cancellable:x.started?'':x.id}));
 return {add,cancel,list,tick,restore};
}

// What a meeting app's feature `setup` returns for its schedule: the timer and the renderer's IPC
// (`schedules`, `cancelSchedule`) for its notifications.js.
function setup(s,options){
 const publish=item=>{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);};
 const schedule=create(s,{publish,...options});
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>schedule.tick().catch(()=>{}),20000);timer.unref?.();}
 return {schedule,ipc:{schedules:()=>schedule.restore(),cancelSchedule:itemId=>{schedule.cancel(String(itemId||''));return schedule.restore();}}};
}
module.exports={create,setup,validate,parse,MAX};
