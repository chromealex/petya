const {randomUUID}=require('node:crypto');
const {scope}=require('./chat-results.cjs');
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'../extensions');
const adapters=Object.fromEntries(fs.readdirSync(root,{withFileTypes:true}).filter(r=>r.isDirectory()&&fs.existsSync(path.join(root,r.name,'change.cjs'))).map(r=>[r.name,require(path.join(root,r.name,'change.cjs'))]));
function setup(s){
  const running=new Set(),resources=new Set();
  function topicFor(expected){
    const t=s.dialogue.active();
    if(!t||t.archived||scope(s,t)!==expected||!s.dialogue.state.projects.some(p=>p.id===(t.projectId||'general')&&!p.archived))throw Error('Чат или проект изменился. Откройте исходный чат.');
    return t;
  }
  function inProject(t,fn){return require('../modules.cjs').withProject(s.dialogue.state.projects.find(p=>p.id===(t.projectId||'general')),fn);}
  function view(r){return {id:r.id,title:r.title,state:r.state,editor:r.editor,rows:r.plan?.rows,receipt:r.receipt,error:r.error,undoOf:r.undoOf,undone:r.undone,index:r.index};}
  function notification(r){return {id:'change:'+r.id,title:r.title,text:r.error||r.receipt?.text||'Применяю подтверждённую правку…',busy:r.state==='applying',kind:r.state==='done'?'success':r.error?'error':'info',version:r.state};}
  function save(r){s.dialogue.persist();s.win?.webContents.send('chat-change-progress',notification(r));}
  function find(expected,id){const t=topicFor(expected),r=t.chatChanges?.find(r=>r.id===id&&r.scope===expected);if(!r)throw Error('Правка больше недоступна.');return r;}
  function idle(r){if(running.has(r.id))throw Error('Операция уже выполняется.');if(s.chatJobs?.busy(s.dialogue.active().id))throw Error('Дождитесь завершения ответа.');}
  function recover(r){if(r.state==='applying'&&!running.has(r.id)){r.state='uncertain';r.error='Приложение закрылось во время записи. Проверьте результат перед новой правкой.';s.dialogue.persist();}}
  function snapshot(){const t=s.dialogue.active();if(!t)return {scope:null,items:[]};const expected=scope(s,t);const rows=(t.chatChanges||[]).filter(r=>r.scope===expected);rows.forEach(recover);return {scope:expected,items:rows.map(r=>({...view(r),index:t.messages.findIndex(m=>m.changeId===r.id)})),messages:t.messages};}
  async function start(row,expected){
    const t=topicFor(expected),adapter=adapters[row.adapter.id];if(!adapter)throw Error('Редактирование этого объекта недоступно.');
    const check=()=>topicFor(expected),data=await inProject(t,()=>adapter.load(row,s,check));check();
    const r={...data,id:randomUUID(),adapter:row.adapter.id,scope:expected,state:'editing',at:Date.now()};
    (t.chatChanges||=[]).push(r);s.dialogue.persist();
    return {handled:true,text:'Подготовьте правку у поля ввода. Изменения сохранятся только после «Применить».',changeEditor:r.id};
  }
  async function locked(expected,id,fn){
    const r=find(expected,id);idle(r);running.add(id);
    try{return await inProject(topicFor(expected),()=>fn(r,()=>topicFor(expected)));}finally{running.delete(id);}
  }
  async function people(expected,id,query){return locked(expected,id,async(r,check)=>{
    if(r.state!=='editing'||!adapters[r.adapter].people)throw Error('Поиск исполнителя недоступен.');
    r.people=await adapters[r.adapter].people(r,query,s,check);check();s.dialogue.persist();return r.people;
  });}
  async function prepare(expected,id,input){return locked(expected,id,async(r,check)=>{
    if(r.state!=='editing')throw Error('Подготовьте новую правку.');
    r.plan=await adapters[r.adapter].prepare(r,input,s,check);check();r.state='preview';r.error='';const t=topicFor(expected);r.index=t.messages.length;t.messages.push({role:'assistant',text:'Предпросмотр изменения',at:Date.now(),changeId:r.id});s.dialogue.persist();return snapshot();
  });}
  async function apply(expected,id){return locked(expected,id,async(r,check)=>{
    if(r.state==='done')return snapshot();
    if(r.state!=='preview')throw Error('Сначала подготовьте предпросмотр.');
    const key=JSON.stringify([r.adapter,r.target.file||r.target.site,r.target.key]);
    if(resources.has(key))throw Error('Этот объект уже изменяется.');resources.add(key);
    r.state='applying';r.error='';let started=false;
    try{
      save(r);
      r.receipt=await adapters[r.adapter].apply(r,s,check,()=>{started=true;});
      r.state='done';if(r.undoOf){r.receipt.canUndo=false;const original=s.dialogue.state.topics.flatMap(t=>t.chatChanges||[]).find(x=>x.id===r.undoOf);if(original)original.undone=true;}
    }catch(e){r.state=started?'uncertain':'failed';r.error=e.message;}
    finally{resources.delete(key);save(r);}
    return snapshot();
  });}
  async function undo(expected,id){return locked(expected,id,async(r,check)=>{
    if(r.state!=='done'||!r.receipt?.canUndo||r.undone)throw Error('Откат недоступен.');
    const t=topicFor(expected);
    if(t.chatChanges.some(x=>x.undoOf===id&&['preview','applying'].includes(x.state)))throw Error('Предпросмотр отката уже открыт.');
    const data=await adapters[r.adapter].undo(r,s,check);check();
    const newId=randomUUID(),index=t.messages.length;t.messages.push({role:'assistant',text:'Предпросмотр отката',at:Date.now(),changeId:newId});
    t.chatChanges.push({...data,index,id:newId,adapter:r.adapter,scope:expected,state:'preview',undoOf:id,at:Date.now()});s.dialogue.persist();return snapshot();
  });}
  async function reveal(expected,id){return locked(expected,id,async(r,check)=>{if(r.adapter!=='files'||r.state!=='done')throw Error('Файл недоступен.');return require('../extensions/files/result.cjs').perform('reveal',{file:{localSourcePath:r.target.file}},s,check);});}
  function cancel(expected,id){const r=find(expected,id);idle(r);if(!['editing','preview'].includes(r.state))throw Error('Эту операцию уже нельзя отменить.');r.state='cancelled';s.dialogue.persist();return snapshot();}
  function progress(){return s.dialogue.state.topics.flatMap(t=>(t.chatChanges||[]).filter(r=>['applying','done','failed','uncertain'].includes(r.state)).map(r=>{recover(r);return notification(r);})).slice(-30);}
  return {chatChanges:{start},ipc:{snapshot,people,prepare,apply,undo,reveal,cancel,progress}};
}
module.exports={name:'chatChanges',setup};
