const {randomUUID,createHash}=require('node:crypto');
const {snapshot,changes,adfText}=require('../../history.cjs');
const {adf}=require('../../core.cjs');
function signature(s){return createHash('sha256').update(JSON.stringify([s.jiraUrl,s.jiraEmail,s.jiraToken,s.atlassianCredential,s.module_jira])).digest('hex');}
function connection(target,s,check){
  check();
  const allowed=require('./desktop-reply.cjs').scope(s,s.dialogue.active());
  if(new URL(s.settings.jiraUrl).origin!==target.site||!allowed.projects.includes(target.key.split('-')[0])||target.signature!==signature(s.settings))throw Error('Подключение или проект Jira изменились. Подготовьте правку заново.');
  return {...s.workspace.settings(),jiraProject:target.key.split('-')[0]};
}
async function load(row,s,check){
  const target={...row.item,signature:signature(s.settings)},settings=connection(target,s,check);
  const before=await snapshot(s.workspace,target.key,settings);check();
  return {target,before,title:target.key,editor:{kind:'jira',summary:before.summary,description:adfText(before.description),assignee:before.assigneeName}};
}
async function people(record,query,s,check){
  if(typeof query!=='string'||!query.trim()||query.length>200)throw Error('Введите имя исполнителя.');
  const settings=connection(record.target,s,check),rows=await s.workspace.people(query,settings);
  connection(record.target,s,check);return rows.slice(0,100);
}
async function prepare(record,input,s,check){
  const settings=connection(record.target,s,check),patch={};
  if(input.field==='summary'){
    if(typeof input.value!=='string'||!input.value.trim()||input.value.length>200)throw Error('Название должно содержать от 1 до 200 символов.');
    patch.summary=input.value.trim();
  }else if(input.field==='description'){
    if(typeof input.value!=='string'||input.value.length>50000)throw Error('Описание должно быть не длиннее 50 000 символов.');
    patch.description=input.value?adf(input.value):null;
  }else if(input.field==='append'){
    if(typeof input.value!=='string'||!input.value.trim()||input.value.length>50000)throw Error('Укажите текст дополнения, до 50 000 символов.');
    patch.description=structuredClone(record.before.description||{type:'doc',version:1,content:[]});
    patch.description.content.push(...adf((input.heading?input.heading+'\n':'')+input.value).content);
  }else if(input.field==='assignee'){
    if(typeof input.accountId!=='string'||!record.people?.some(p=>p.id===input.accountId))throw Error('Выберите исполнителя из результатов Jira.');
    patch.assigneeId=input.accountId;
  }else throw Error('Выберите поле для изменения.');
  const rows=changes(record.before,patch,{people:record.people||[]});
  if(!rows.length)throw Error('Выбранное значение уже установлено.');
  const entry={id:randomUUID(),schema:2,kind:'edit-existing',at:Date.now(),project:settings.jiraProject,url:settings.jiraUrl,rows:[{key:record.target.key,title:record.before.summary,state:'observed',canDelete:false,snapshot:record.before}]};
  const preview=s.workspace.actions.stage(entry,'edit',[{key:record.target.key,before:record.before,patch,changes:rows}],'Правка из чата');
  const staged=s.workspace.actions.previews.get(preview.id);
  return {rows,entry,staged};
}
async function apply(record,s,check,starting){
  connection(record.target,s,check);
  const w=s.workspace,plan=record.plan;
  if(Date.now()-plan.staged.at>10*60e3)throw Error('Предпросмотр устарел. Подготовьте правку заново.');
  let entry=w.history.find(row=>row.id===plan.entry.id);
  if(!entry){entry=structuredClone(plan.entry);w.history.push(entry);w.actions.persist();}
  if(entry.operations?.some(row=>row.id===plan.staged.id))throw Error('Эта операция уже отправлялась. Проверьте историю Jira.');
  w.actions.previews.set(plan.staged.id,structuredClone(plan.staged));
  const result=await w.actions.apply(plan.staged.id,false,()=>connection(record.target,s,check),starting);
  const operation=result.operations.find(row=>row.id===plan.staged.id),row=operation?.rows[0];
  if(row?.state!=='done')throw Error(row?.error||'Jira не подтвердила изменение. Проверьте историю.');
  const details=plan.rows.map(change=>change.field==='description'?'Описание обновлено':change.label+' → '+String(change.after).slice(0,160)).join('; ');
  return {text:record.target.key+' · '+details,url:record.target.site+'/browse/'+record.target.key,canUndo:operation.kind==='edit',historyId:entry.id,operationId:operation.id};
}
async function undo(record,s,check){
  connection(record.target,s,check);
  const w=s.workspace,p=await w.actions.previewUndo(record.receipt.historyId,record.receipt.operationId,[record.target.key]);
  connection(record.target,s,check);
  return {target:record.target,before:record.before,title:record.title,plan:{rows:p.rows.flatMap(row=>row.changes),entry:structuredClone(w.history.find(e=>e.id===record.receipt.historyId)),staged:structuredClone(w.actions.previews.get(p.id))}};
}
async function natural(record,intent,s,check){
 if(intent.kind==='summary')return prepare(record,{field:'summary',value:intent.value},s,check);
 if(intent.kind==='append')return prepare(record,{field:'append',value:intent.value,heading:intent.heading},s,check);
 if(intent.kind==='assignee')return prepare(record,{field:'assignee',accountId:intent.accountId},s,check);
 if(intent.kind==='restrict'&&record.intent?.kind==='append'){
  const lines=record.intent.value.split(/\r?\n/),starts=lines.flatMap((line,i)=>/^\s*(?:\d+[.)]|[-*•])\s+/.test(line)?[i]:[]);
  if(!Number.isInteger(intent.number)||intent.number<1||intent.number>starts.length)throw Error('Укажите текст пункта, который нужно добавить.');
  return prepare(record,{field:'append',value:lines.slice(starts[intent.number-1],starts[intent.number]??lines.length).join('\n'),heading:record.intent.heading},s,check);
 }
 throw Error('Уточните поле и новое значение задачи.');
}
module.exports={load,people,prepare,apply,undo,natural};
