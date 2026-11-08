const terminal=new Set(['completed','failed','interrupted']);
class TaskMonitor{
 // Codex is polled every minute through its app server; Claude (macOS) through the Accessibility helper,
// at most one chat per tick and each chat every 10 minutes, and only while the check does not disturb the user.
 constructor({records,save,status,notify,enabled=()=>true,claude=()=>false,now=Date.now}){Object.assign(this,{records,save,status,notify,enabled,claude,now});this.busy=false;}
 due(){
  const now=this.now(),open=r=>r.state==='submitted'&&!terminal.has(r.executionState);
  const codex=this.records().filter(r=>r.target==='codex'&&open(r)&&r.threadId&&r.turnId&&now-(r.lastPoll||0)>=60000);
  const claude=this.claude()?this.records().filter(r=>r.target==='claude'&&open(r)&&r.url&&now-(r.at||0)<3*86400000&&now-(r.lastPoll||0)>=600000):[];
  const order=(a,b)=>(a.lastPoll||0)-(b.lastPoll||0);
  return [...codex.sort(order).slice(0,5),...claude.sort(order).slice(0,1)];
 }
 update(row,result){
  if(row.state==='expired'||(terminal.has(row.executionState)&&!terminal.has(result.status)))return;
  if(row.executionState==='needsAttention'&&result.status==='inProgress')result={...result,status:'needsAttention'};
  row.executionState=result.status;row.checkedAt=this.now();row.pollError='';
  if(typeof result.answer==='string'&&result.answer)row.resultText=result.answer.slice(-12000);
  const key=result.status;const changed=row.noticeState!==key;
  row.noticeState=key;this.save();
  if(changed&&this.enabled()&&['completed','failed','interrupted','needsAttention'].includes(key)){
   const label=(row.keys||[]).join(', ')||row.command||'Поручение';
   this.notify(label+': '+({completed:'исполнитель завершил работу',failed:'ошибка выполнения',interrupted:'работа прервана',needsAttention:'нужно ваше решение'})[key]+'. Результат — в разделе «Агенты».');
  }
 }
 async tick(){
  if(this.busy||!this.enabled())return;this.busy=true;
  try{
   const rows=this.due();
   for(const row of rows){if(!this.enabled())break;row.lastPoll=this.now();
    try{const result=await this.status(row,{background:true});if(!this.enabled())break;if(result?.status==='skipped'){this.save();continue;}this.update(row,result);}
    catch{const changed=row.pollError!=='unavailable';row.pollError='unavailable';this.save();const app=row.target==='claude'?'Claude':'Codex';if(changed&&this.enabled())this.notify('Не удалось проверить поручение '+((row.keys||[]).join(', ')||row.command||app)+'. Проверьте доступ к '+app+'.');}
   }
  }finally{this.busy=false;}
 }
}
module.exports={TaskMonitor};
