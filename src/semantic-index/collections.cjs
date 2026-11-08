// Petya's own collections, off by default: the company's chats and its meeting memory. They make «search all» and
// the mentor able to find a past conversation by meaning once the user switches them on in the index settings.
const {isTalk}=require('../meeting-talk.cjs');

const chats={
 id:'chats',name:'Чаты Пети',builtin:true,type:'chat',refresh:15,
 description:'Переписка с Петей в чатах этой компании',
 collects:'Тексты ваших сообщений и ответов Пети по всем чатам компании (без вложений).',
 async list(s){
  return (s.dialogue?.state?.topics||[]).filter(t=>Array.isArray(t.messages)&&t.messages.some(m=>m?.text)).map(t=>{
   const last=t.messages.at(-1);
   return {id:String(t.id),version:t.messages.length+':'+(last?.at||'')+':'+String(last?.text||'').length,meta:{title:String(t.title||'Чат').slice(0,200),projectId:String(t.projectId||''),type:'chat',at:Number(last?.at)||0}};
  });
 },
 async read(s,entry){
  const t=(s.dialogue?.state?.topics||[]).find(x=>String(x.id)===entry.id);
  if(!t)return null;
  return {type:'chat',title:entry.meta?.title,messages:t.messages.filter(m=>m?.text&&['user','assistant'].includes(m.role)).map(m=>({who:m.role==='user'?'Вы':'Петя',text:String(m.text),at:m.at}))};
 }
};

const meetings={
 id:'meetings',name:'Встречи',builtin:true,type:'chat',refresh:30,
 description:'Расшифровки записанных встреч компании',
 collects:'Расшифровки встреч, которые Петя записал (речь участников и ваш микрофон). Сводки и письма не входят.',
 async list(s){
  const rows=(s.memory?.items||[]).filter(isTalk),sessions=new Map();
  for(const r of rows){const x=sessions.get(r.sessionId)||{count:0,last:0,title:''};x.count++;x.last=Math.max(x.last,Number(r.at)||0);x.title||=String(r.title||'').replace(/ · .*$/,'');sessions.set(r.sessionId,x);}
  return [...sessions].map(([id,x])=>({id:String(id),version:x.count+':'+x.last,meta:{title:x.title||'Встреча',type:'meeting',at:x.last}}));
 },
 async read(s,entry){
  const rows=(s.memory?.items||[]).filter(r=>isTalk(r)&&String(r.sessionId)===entry.id).sort((a,b)=>(a.at||0)-(b.at||0));
  if(!rows.length)return null;
  return {type:'chat',title:entry.meta?.title,messages:rows.map(r=>({who:r.speaker||(r.source==='Микрофон'?'Вы':'Участник'),text:String(r.text||''),at:r.at}))};
 }
};

module.exports={builtin:[chats,meetings],chats,meetings};
