const terminal=new Set(['completed','failed','interrupted']);
class TaskMonitor{
 constructor({records,save,status,notify,enabled=()=>true,now=Date.now}){Object.assign(this,{records,save,status,notify,enabled,now});this.busy=false;}
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
   const rows=this.records().filter(r=>r.target==='codex'&&r.state==='submitted'&&r.threadId&&r.turnId&&!terminal.has(r.executionState)&&this.now()-(r.lastPoll||0)>=60000).sort((a,b)=>(a.lastPoll||0)-(b.lastPoll||0)).slice(0,5);
   for(const row of rows){if(!this.enabled())break;row.lastPoll=this.now();
    try{const result=await this.status(row);if(!this.enabled())break;this.update(row,result);}
    catch{const changed=row.pollError!=='unavailable';row.pollError='unavailable';this.save();if(changed&&this.enabled())this.notify('Не удалось проверить поручение '+((row.keys||[]).join(', ')||row.command||'Codex')+'. Проверьте доступ к Codex.');}
   }
  }finally{this.busy=false;}
 }
}
module.exports={TaskMonitor};
