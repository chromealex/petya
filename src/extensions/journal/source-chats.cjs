// Journal source: Petya's own chats. A chat where the user asked something in the period is one item (with the
// number of requests); messages Petya sent and tasks it created for the user (confirmed action receipts,
// src/action-evidence.cjs) are items of their own. Petya's automatic chats (reminders, morning brief, the journal)
// are not counted as help.
const AUTO=t=>t.reminders||t.journal||t.birthdays||/^(?:Утренняя сводка|По расписанию)/.test(String(t.title||''));
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
module.exports={
 id:'chats',name:'Чаты с Петей',icon:'chat',
 ready:()=>true,
 async collect(s,{from,to}){
  const state=s.dialogue?.state;if(!state)return {items:[]};
  const projects=new Map((state.projects||[]).map(p=>[p.id,p.name]));
  const items=[];
  for(const t of state.topics||[]){
   if(t.archived)continue;
   if(!AUTO(t)){
    const asked=(t.messages||[]).filter(m=>m.role==='user'&&!m.pending&&m.at>=from&&m.at<to);
    if(asked.length){
     items.push({at:asked[0].at,icon:'chat',kind:'chat',title:String(t.title||'Чат').slice(0,160),detail:asked.length+' '+plural(asked.length,['запрос','запроса','запросов'])+(projects.get(t.projectId)&&t.projectId!=='general'?' · '+projects.get(t.projectId):''),topicId:t.id});}
   }
   for(const r of t.actionReceipts||[]){
    if(r.status!=='confirmed'||!(r.at>=from&&r.at<to))continue;
    if(r.action==='send'){items.push({at:r.at,icon:'message',kind:'message',title:'Сообщение'+(r.channelName?' в #'+r.channelName:'')+(r.service==='mail'?' по почте':''),detail:String(r.summary||'').replace(/\s+/g,' ').slice(0,160),url:r.url||''});}
    else if(r.action==='create'&&r.service==='jira'){items.push({at:r.at,icon:'task',kind:'task',title:'Создана задача'+(r.key?' '+r.key:''),detail:String(r.summary||'').slice(0,160),url:r.url||''});}
   }
  }
  return {items};
 }
};
