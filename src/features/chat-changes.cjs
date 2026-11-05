const {randomUUID}=require('node:crypto');
const {scope}=require('./chat-results.cjs');
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'../extensions');
const adapters=Object.fromEntries(fs.readdirSync(root,{withFileTypes:true}).filter(r=>r.isDirectory()&&fs.existsSync(path.join(root,r.name,'change.cjs'))).map(r=>[r.name,require(path.join(root,r.name,'change.cjs'))]));
function setup(s){
  const running=new Set(),resources=new Set(),preparations=new Map();
  function topicFor(expected){
    require('../answer-cancel.cjs').check();
    const t=s.dialogue.active();
    if(!t||t.archived||scope(s,t)!==expected||!s.dialogue.state.projects.some(p=>p.id===(t.projectId||'general')&&!p.archived))throw Error('Чат или проект изменился. Откройте исходный чат.');
    return t;
  }
  function inProject(t,fn){return require('../modules.cjs').withProject(s.dialogue.state.projects.find(p=>p.id===(t.projectId||'general')),fn);}
  function view(r){return {id:r.id,title:r.title,state:r.state,editor:r.editor,people:r.people||[],rows:r.plan?.rows,receipt:r.receipt,error:r.error,undoOf:r.undoOf,undone:r.undone,index:r.index,canVerify:!!adapters[r.adapter]?.verify};}
  function notification(r){return {id:'change:'+r.id,title:r.title,text:r.error||r.receipt?.text||'Применяю подтверждённую правку…',busy:r.state==='applying',kind:r.state==='done'?'success':r.error?'error':'info',version:r.state};}
  function save(r){s.dialogue.persist();s.win?.webContents.send('chat-change-progress',notification(r));}
  function find(expected,id){const t=topicFor(expected),r=t.chatChanges?.find(r=>r.id===id&&r.scope===expected);if(!r)throw Error('Правка больше недоступна.');return r;}
  function idle(r){if(running.has(r.id))throw Error('Операция уже выполняется.');if(s.chatJobs?.busy(s.dialogue.active().id))throw Error('Дождитесь завершения ответа.');}
  function recover(r){if(r.state==='applying'&&!running.has(r.id)){r.state='uncertain';r.error='Приложение закрылось во время записи. Проверьте результат перед новой правкой.';s.dialogue.persist();}}
  function snapshot(){const t=s.dialogue.active();if(!t)return {scope:null,items:[]};const expected=scope(s,t);const rows=(t.chatChanges||[]).filter(r=>r.scope===expected);rows.forEach(recover);return {scope:expected,items:rows.map(r=>({...view(r),index:t.messages.findIndex(m=>m.changeId===r.id)})),messages:t.messages};}
  async function manualStart(row,expected){
    const t=topicFor(expected),adapter=adapters[row.adapter.id];if(!adapter)throw Error('Редактирование этого объекта недоступно.');
    const check=()=>topicFor(expected),data=await inProject(t,()=>adapter.load(row,s,check));check();
    const r={...data,id:randomUUID(),adapter:row.adapter.id,scope:expected,state:'editing',at:Date.now()};
    (t.chatChanges||=[]).push(r);t.currentChangeId=r.id;s.dialogue.persist();
    return {handled:true,text:'Подготовьте правку у поля ввода. Изменения сохранятся только после «Применить».',changeEditor:r.id};
  }
  function announce(item){preparations.set(item.id,item);s.win?.webContents.send('chat-change-progress',item);}
  function preview(t,r,plan){
    r.plan=plan;r.state='preview';r.error='';
    let message=t.messages.find(m=>m.changeId===r.id);
    if(!message){message={role:'assistant',text:'Предпросмотр изменения',at:Date.now(),changeId:r.id};t.messages.push(message);}
    s.dialogue.persist();return snapshot();
  }
  async function draft(row,expected,intent){
    const result=await manualStart(row,expected),t=topicFor(expected),r=find(expected,result.changeEditor),adapter=adapters[r.adapter],check=()=>topicFor(expected);
    r.intent=intent;r.sourceObjectId=row.objectId;
    const progress={id:'change-prepare:'+r.id,title:r.title,text:'Подготавливаю правку…',busy:true,kind:'info',version:'preparing'};announce(progress);
    running.add(r.id);
    try{
      if(intent.kind==='assignee'){
        r.people=await inProject(t,()=>adapter.people(r,intent.query,s,check));check();
        if(r.people.length!==1){r.editor={...r.editor,field:'assignee',query:intent.query};s.dialogue.persist();return {...result,question:true,text:r.people.length?'Выберите исполнителя у поля ввода.':'Исполнитель не найден. Уточните имя у поля ввода.'};}
        intent={...intent,accountId:r.people[0].id};
      }
      if(intent.kind==='append'&&!intent.value){r.editor={...r.editor,field:'append',value:'',heading:intent.heading};s.dialogue.persist();return {...result,question:true,text:'Какие критерии добавить? Введите их у поля сообщения — исходное описание сохранится.'};}
      const plan=await inProject(t,()=>adapter.natural(r,intent,s,check));check();preview(t,r,plan);
      return {...result,text:'Правка подготовлена. Проверьте изменения и нажмите «Применить».',messages:t.messages,topicId:t.id};
    }catch(e){r.state='failed';r.error=e.message;s.dialogue.persist();progress.kind='error';progress.text=e.message;throw e;}
    finally{running.delete(r.id);announce({...progress,busy:false,version:progress.kind==='error'?'error':'ready',text:progress.kind==='error'?progress.text:'Предпросмотр или уточнение готовы в чате.'});}
  }
  async function start(row,expected){
    const t=topicFor(expected),pending=t.pendingChangeIntent;
    if(pending?.scope===expected){
      if(pending.intent.service!==row.adapter.id)throw Error('Выберите объект нужного типа.');
      delete t.pendingChangeIntent;s.dialogue.persist();return draft(row,expected,pending.intent);
    }
    return manualStart(row,expected);
  }
  async function turn(command){
    const intent=require('../chat-change-intent.cjs').parse(command),t=s.dialogue.active();
    if(!t)return null;
    if(!intent){if(t.pendingChangeIntent){delete t.pendingChangeIntent;s.dialogue.persist();}return null;}
    const expected=scope(s,t),selected=s.chatResults.selected(t);
    const answer=result=>{s.dialogue.persist();return {...result,handled:true,topicId:t.id,messages:t.messages};};
    s.dialogue.rememberAction(command,'Подготавливаю правку…');
    const reply=t.messages.at(-1);
    try{
      if(intent.kind==='restrict'){
        const original=t.chatChanges?.find(r=>r.id===t.currentChangeId&&r.scope===expected&&r.state==='preview'&&!r.undoOf);
        if(!original||selected&&original.sourceObjectId&&selected.objectId!==original.sourceObjectId)throw Error('Выберите исходный объект с ещё не применённой правкой.');
        if(running.has(original.id))throw Error('Операция уже выполняется.');running.add(original.id);
        let plan;const check=()=>topicFor(expected);try{plan=await inProject(t,()=>adapters[original.adapter].natural({...original,plan:original.revisionBasePlan||original.plan},intent,s,check));check();}finally{running.delete(original.id);}
        const r={...original,id:randomUUID(),state:'preview',plan,revisionBasePlan:original.revisionBasePlan||original.plan};original.state='superseded';t.chatChanges.push(r);t.currentChangeId=r.id;reply.changeId=r.id;reply.text='Уточнил предпросмотр: только пункт '+intent.number+'.';s.dialogue.persist();
        return answer({text:reply.text,changeEditor:r.id});
      }
      if(intent.kind==='replace-help')throw Error('Укажите точные строки в кавычках: замени в файле «исходный текст» на «новый текст».');
      const rows=require('./chat-results.cjs').collect(t,s).filter(row=>row.adapter.id===intent.service&&row.actions.some(a=>a.id==='edit'));
      let row=selected?.adapter.id===intent.service?selected:null;
      if(intent.key||intent.file){const named=rows.filter(r=>intent.key?r.item?.key===intent.key:r.file?.name===intent.file);row=[...new Map(named.map(r=>[r.objectId,r])).values()].length===1?named.at(-1):null;if(!row)throw Error('Указанный объект не найден однозначно среди результатов этого чата.');}
      if(!row){
        if(!rows.length)throw Error('Сначала найдите задачу Jira или прикрепите исходный файл в этом чате.');
        const candidates=[...new Map(rows.map(r=>[r.objectId,r])).values()];t.pendingChangeIntent={scope:expected,intent};reply.text='К какому объекту применить правку?';
        return answer({text:reply.text,question:true,resultChoices:candidates.map(r=>r.id),resultAction:'edit'});
      }
      delete t.pendingChangeIntent;t.resultChoice={scope:expected,id:row.id};
      const result=await draft(row,expected,intent);reply.text=result.text;
      // Attach the preview to this request, rather than adding a second assistant turn.
      const r=find(expected,result.changeEditor),extra=t.messages.findIndex(m=>m.changeId===r.id);
      if(extra>=0&&t.messages[extra]!==reply)t.messages.splice(extra,1);if(r.state==='preview')reply.changeId=r.id;
      return answer({...result,text:reply.text});
    }catch(e){reply.text=e.message;return answer({text:e.message,error:true});}
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
    if(input.field==='append')r.intent={kind:'append',value:input.value,heading:input.heading||''};
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
      r.state='done';const message=s.dialogue.active()?.messages.find(m=>m.changeId===r.id);if(message)message.text=r.receipt.text;if(r.undoOf){r.receipt.canUndo=false;const original=s.dialogue.state.topics.flatMap(t=>t.chatChanges||[]).find(x=>x.id===r.undoOf);if(original)original.undone=true;}
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
  async function verify(expected,id){return locked(expected,id,async(r,check)=>{
    if(!['uncertain','failed','done'].includes(r.state)||!adapters[r.adapter].verify)throw Error('Проверка результата недоступна.');
    const progress={id:'verify:'+r.id,title:'Проверка · '+r.title,text:'Читаю текущее состояние…',busy:true,version:'running'};announce(progress);
    try{const receipt=await adapters[r.adapter].verify(r,s,check);check();r.receipt=receipt;r.state='done';r.error='';}catch(error){r.previousReceipt=r.receipt;r.receipt=undefined;r.state='uncertain';r.error=error.message;}announce({...progress,busy:false,text:r.error||r.receipt.text,kind:r.error?'error':'success',version:String(Date.now())});save(r);return snapshot();
  });}
  async function reveal(expected,id){return locked(expected,id,async(r,check)=>{if(r.adapter!=='files'||r.state!=='done')throw Error('Файл недоступен.');return require('../extensions/files/result.cjs').perform('reveal',{file:{localSourcePath:r.target.file}},s,check);});}
  function cancel(expected,id){const r=find(expected,id);idle(r);if(!['editing','preview'].includes(r.state))throw Error('Эту операцию уже нельзя отменить.');r.state='cancelled';s.dialogue.persist();return snapshot();}
  function progress(){return [...preparations.values(),...s.dialogue.state.topics.flatMap(t=>(t.chatChanges||[]).filter(r=>['applying','done','failed','uncertain'].includes(r.state)).map(r=>{recover(r);return notification(r);})).slice(-30)].slice(-30);}
  return {chatChanges:{start,turn},ipc:{snapshot,people,prepare,apply,undo,reveal,verify,cancel,progress}};
}
module.exports={name:'chatChanges',setup};
