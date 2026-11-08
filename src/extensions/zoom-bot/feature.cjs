// «Петя в Zoom»: settings of the local meeting capture (system audio and, optionally, the microphone), the user's
// Zoom personal room link, and scheduled recordings («Петя запишет встречу» from the calendar).
// The capture itself runs in src/features/meeting-memory.cjs (LocalMeeting); there is no meeting bot and no Zoom
// sign-in. Profiles saved with the removed bot mode keep their start mode and are recorded locally.
const {randomUUID}=require('node:crypto');
const room=require('./personal-room.cjs');
const MODES=['off','ask','auto'];
const MAX=8,EARLY=60000;
function parseSchedule(value){try{const list=JSON.parse(value||'[]');return Array.isArray(list)?list.filter(x=>x&&typeof x.id==='string'):[];}catch{return [];}}
function validate(next){
 if(!MODES.includes(next.zoomBotMode))throw Error('Проверьте режим записи встреч.');
 if(next.zoomPersonalLink){const link=room.valid(next.zoomPersonalLink);if(!link)throw Error('Ссылка на личную комнату Zoom — вида https://…zoom.us/j/1234567890.');next.zoomPersonalLink=link;}
 const list=parseSchedule(next.meetingRecordingSchedule);
 if(list.length>MAX)throw Error('Слишком много запланированных записей.');
 next.meetingRecordingSchedule=JSON.stringify(list);
}
const hm=iso=>{const d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

// Scheduled recordings: at the start the local capture is started (and retried while the meeting has not yet
// appeared in Zoom); each one has a stable notification that can be cancelled.
function scheduler(s,{now=()=>Date.now(),publish=()=>{}}={}){
 const list=()=>parseSchedule(s.settings.meetingRecordingSchedule);
 const save=items=>s.saveSettings({meetingRecordingSchedule:JSON.stringify(items)},true);
 const note=(item,text,{busy=false,kind='info',cancellable=true}={})=>publish({id:'meeting-schedule:'+item.id,title:'Запись встречи',text,busy,kind,version:kind+':'+text.slice(0,60),cancellable:cancellable?item.id:''});
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
 function cancel(id){
  const items=list(),item=items.find(x=>x.id===id);if(!item)throw Error('Запись уже отменена или прошла.');
  save(items.filter(x=>x.id!==id));
  note(item,'Запись встречи «'+item.title+'» отменена.',{cancellable:false});
  return list();
 }
 let busy=false;
 async function tick(){
  if(busy)return;busy=true;
  try{
   const items=list();let changed=false;
   for(const item of items){
    const a=Date.parse(item.start),b=Date.parse(item.end),t=now();
    if(t>=b){
     changed=true;item.done=true;
     if(!item.started)note(item,'Встреча «'+item.title+'» не записана: Zoom не показал её на этом компьютере.',{kind:'error',cancellable:false});
     continue;
    }
    if(t<a-EARLY||item.started)continue;
    if(s.settings.zoomBotMode==='off'){changed=true;item.done=true;note(item,'Запись встреч выключена в настройках — встреча «'+item.title+'» не записана.',{kind:'error',cancellable:false});continue;}
    try{
     await s.meetingRecording('startCapture');
     item.started=true;changed=true;
     note(item,'Петя записывает встречу «'+item.title+'».',{kind:'success',cancellable:false});
    }catch{
     if(!item.waiting){item.waiting=true;changed=true;note(item,'Жду встречу «'+item.title+'» в Zoom, чтобы начать запись.',{busy:true});}
    }
   }
   if(changed)save(items.filter(x=>!x.done));
  }finally{busy=false;}
 }
 return {add,cancel,list,tick};
}

module.exports={name:'zoomBot',defaults:{zoomBotMode:'auto',zoomPersonalLink:'',meetingRecordingSchedule:'[]'},validate,scheduler,
 setup(s){
  const publish=item=>{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);};
  const schedule=scheduler(s,{publish});
  if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>schedule.tick().catch(()=>{}),20000);timer.unref?.();}
  const status=()=>({mode:s.settings.zoomBotMode,microphone:s.settings.zoomCaptureMic!=='false',personalLink:room.valid(s.settings.zoomPersonalLink),zoomInstalled:room.installed()});
  const configure=input=>{
   if(s.meetingRecording?.('captureStatus')?.busy&&input?.mode!==undefined&&input.mode!==s.settings.zoomBotMode)throw Error('Сначала завершите текущую запись встречи.');
   const values={};
   if(input?.mode!==undefined)values.zoomBotMode=input.mode;
   if(typeof input?.microphone==='boolean')values.zoomCaptureMic=String(input.microphone);
   if(typeof input?.personalLink==='string')values.zoomPersonalLink=input.personalLink.trim();
   s.saveSettings(values,true);return status();
  };
  // Pending schedules for the notification center after a window reload.
  const schedules=()=>schedule.list().map(x=>({id:'meeting-schedule:'+x.id,title:'Запись встречи',text:x.started?'Петя записывает встречу «'+x.title+'».':'Петя запишет встречу «'+x.title+'» в '+hm(x.start)+'.',busy:!!x.waiting&&!x.started,kind:'info',version:'restore',cancellable:x.started?'':x.id}));
  return {meetingSchedule:schedule,ipc:{status,configure,schedules,cancelSchedule:id=>{schedule.cancel(String(id||''));return schedules();}}};
 }
};
