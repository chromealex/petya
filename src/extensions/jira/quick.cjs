// Jira quick edits from the chat card: one field at a time, applied at once, each with an undo.
// Options (statuses, people, priorities) are read live from Jira for the selected issue.
const actions=['transitions','status','people','assignee','priorities','priority','due','execute','full','summary','description','comment','uncomment'];
function connection(row,s,check){
 check();s.modules.assertEnabled(s.settings,'jira');
 const item=row.item,scope=require('./desktop-reply.cjs').scope(s,s.dialogue.active());
 if(new URL(s.settings.jiraUrl).origin!==item.site||!scope.projects.includes(item.key.split('-')[0]))throw Error('Подключение Jira изменилось. Выберите задачу из нового ответа.');
 const settings={...s.workspace.settings(),jiraProject:item.key.split('-')[0]};
 const api=async(route,options={})=>{check();const result=await s.workspace.api(route,options,settings);check();return result;};
 return {item,api,issue:'/rest/api/3/issue/'+encodeURIComponent(item.key)};
}
const text=(value,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Некорректное значение.');return value.trim();};
async function current(api,issue){const data=await api(issue+'?fields=status,assignee,priority,duedate');const f=data.fields||{};return {status:f.status?.name||'',category:f.status?.statusCategory?.key||'',assigneeId:f.assignee?.accountId||'',assignee:f.assignee?.displayName||'',priorityId:f.priority?.id||'',priority:f.priority?.name||'',due:f.duedate||''};}
function update(row,s,patch){
 // Keep the card's copy in sync so a re-render shows the new value.
 const topic=s.dialogue.active();for(const m of topic?.messages||[])for(const it of m.jiraItems||[])if(it.key===row.item.key&&it.site===row.item.site)Object.assign(it,patch);
 s.dialogue.persist();
}
async function perform(action,row,s,check,args){
 const {item,api,issue}=connection(row,s,check);
 if(action==='transitions'){const [now,data]=await Promise.all([current(api,issue),api(issue+'/transitions')]);return {options:(data.transitions||[]).map(t=>({id:t.id,label:t.to?.name||t.name,category:t.to?.statusCategory?.key||'',current:t.to?.name===now.status})).concat(now.status&&!(data.transitions||[]).some(t=>t.to?.name===now.status)?[{id:'',label:now.status,category:now.category,current:true}]:[])};}
 if(action==='status'){
  const before=await current(api,issue),data=await api(issue+'/transitions');
  const wanted=args.id?String(args.id):'',name=args.to?text(args.to,100):'',category=args.category?String(args.category):'';
  const transition=(data.transitions||[]).find(t=>wanted?t.id===wanted:name?(t.to?.name||t.name)===name:category&&t.to?.statusCategory?.key===category);
  if(!transition)throw Error('Такой переход сейчас недоступен для '+item.key+'.');
  await api(issue+'/transitions',{method:'POST',body:JSON.stringify({transition:{id:transition.id}})});
  const to=transition.to?.name||transition.name;update(row,s,{status:to,category:transition.to?.statusCategory?.key||''});
  return {handled:true,text:item.key+' · статус: '+before.status+' → '+to,status:to,undo:{action:'status',args:{to:before.status}}};
 }
 // People come from «Команда»: team members linked to Jira (Russian names, photos, roles) who can be assigned
 // to this issue. Jira's assignable list is cached per project in the plugin's folder (it rarely changes).
 if(action==='people'){
  const project=item.key.split('-')[0],cache=require('../../extension-cache.cjs').store(s.dataRoot,'jira');
  const assignable=await cache.get('assignable:'+item.site+':'+project,async()=>{const out=[];for(let start=0;start<1000;start+=100){const page=await api('/rest/api/3/user/assignable/search?'+new URLSearchParams({project,maxResults:'100',startAt:String(start)}));out.push(...(page||[]).filter(u=>u.active!==false&&u.accountType!=='app').map(u=>({id:u.accountId,name:u.displayName||''})));if(!page||page.length<100)break;}return out;});
  const now=await current(api,issue),ids=new Set(assignable.map(u=>u.id));
  const team=require('../../team.cjs').members(s.settings).filter(m=>m.jiraId&&ids.has(m.jiraId));
  const options=[{id:'',label:'Не назначен',current:!now.assigneeId},...team.map(m=>({id:m.jiraId,label:m.name,who:m.name,hint:m.role||'',current:m.jiraId===now.assigneeId}))];
  if(now.assigneeId&&!team.some(m=>m.jiraId===now.assigneeId))options.push({id:now.assigneeId,label:now.assignee,who:now.assignee,hint:'не в команде',current:true});
  // Nobody of the team is linked to Jira yet: show Jira's list, and say how to make it the team's.
  if(!team.length)options.push(...assignable.filter(u=>u.id!==now.assigneeId).slice(0,30).map(u=>({id:u.id,label:u.name,who:u.name})),{id:'',label:'Связать команду с Jira — «Обнови команду»',note:true,disabled:true});
  return {options};
 }
 if(action==='assignee'){
  const before=await current(api,issue),id=args.id?text(args.id,128):null;
  if(id){const list=await api('/rest/api/3/user/assignable/search?'+new URLSearchParams({issueKey:item.key,accountId:id}));if(!(list||[]).some(u=>u.accountId===id)){require('../../extension-cache.cjs').store(s.dataRoot,'jira').forget('assignable:'+item.site+':'+item.key.split('-')[0]);throw Error('Этого человека нельзя назначить на '+item.key+'.');}}
  await api(issue+'/assignee',{method:'PUT',body:JSON.stringify({accountId:id})});
  const name=args.label?String(args.label).slice(0,100):id?'выбранный исполнитель':'не назначен';update(row,s,{assignee:id?name:''});
  return {handled:true,text:item.key+' · исполнитель: '+(before.assignee||'не назначен')+' → '+name,undo:{action:'assignee',args:{id:before.assigneeId||'',label:before.assignee||'не назначен'}}};
 }
 if(action==='priorities'){const cache=require('../../extension-cache.cjs').store(s.dataRoot,'jira');const [list,now]=await Promise.all([cache.get('priorities:'+item.site,()=>api('/rest/api/3/priority'),{ttl:7*86400000}),current(api,issue)]);return {options:(list||[]).map(p=>({id:p.id,label:p.name,current:p.id===now.priorityId}))};}
 if(action==='priority'){
  const before=await current(api,issue),id=text(String(args.id||''),32),list=await api('/rest/api/3/priority'),priority=(list||[]).find(p=>p.id===id);
  if(!priority)throw Error('Приоритет не найден.');
  await api(issue,{method:'PUT',body:JSON.stringify({fields:{priority:{id}}})});update(row,s,{priority:priority.name});
  return {handled:true,text:item.key+' · приоритет: '+(before.priority||'—')+' → '+priority.name,undo:before.priorityId?{action:'priority',args:{id:before.priorityId}}:undefined};
 }
 if(action==='due'){
  const before=await current(api,issue),value=args.date?String(args.date):'';
  if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Дата в формате ГГГГ-ММ-ДД.');
  await api(issue,{method:'PUT',body:JSON.stringify({fields:{duedate:value||null}})});update(row,s,{due:value});
  const show=v=>v?new Date(v+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'без срока';
  return {handled:true,text:item.key+' · срок: '+show(before.due)+' → '+show(value),undo:{action:'due',args:{date:before.due}}};
 }
 // The expanded card: description, people, dates, labels and the latest comments.
 if(action==='full'){
  const {adfText}=require('../../history.cjs');
  const data=await api(issue+'?'+new URLSearchParams({fields:'summary,description,reporter,assignee,created,updated,labels,components,issuetype,parent,attachment,comment',expand:'renderedFields'}));
  const f=data.fields||{},comments=(f.comment?.comments||[]).slice(-30);
  return {details:{key:item.key,summary:f.summary||'',description:adfText(f.description)||'',reporter:f.reporter?.displayName||'',assignee:f.assignee?.displayName||'',
   created:f.created||'',updated:f.updated||'',type:f.issuetype?.name||'',parent:f.parent?{key:f.parent.key,summary:f.parent.fields?.summary||''}:null,
   labels:(f.labels||[]).slice(0,20),components:(f.components||[]).map(c=>c.name).slice(0,20),attachments:(f.attachment||[]).slice(0,20).map(a=>({name:a.filename,size:a.size})),
   comments:comments.map(c=>({id:c.id,author:c.author?.displayName||'',created:c.created||'',text:adfText(c.body)||''})),commentTotal:f.comment?.total||comments.length}};
 }
 // In-place edits from the expanded card; each returns the previous value as its undo.
 if(action==='summary'){
  const value=text(String(args.value||''),255),data=await api(issue+'?fields=summary'),before=data.fields?.summary||'';
  await api(issue,{method:'PUT',body:JSON.stringify({fields:{summary:value}})});update(row,s,{summary:value});
  return {handled:true,text:item.key+' · название изменено',summary:value,undo:before?{action:'summary',args:{value:before}}:undefined};
 }
 if(action==='description'){
  const value=String(args.value??'');if(value.length>30000)throw Error('Описание длиннее 30 000 символов.');
  const {adfText}=require('../../history.cjs'),data=await api(issue+'?fields=description'),before=adfText(data.fields?.description)||'';
  await api(issue,{method:'PUT',body:JSON.stringify({fields:{description:value.trim()?require('../../core.cjs').adf(value):null}})});
  return {handled:true,text:item.key+' · описание изменено',description:value,undo:{action:'description',args:{value:before}}};
 }
 if(action==='comment'){
  const value=text(String(args.value||''),20000);
  const made=await api(issue+'/comment',{method:'POST',body:JSON.stringify({body:require('../../core.cjs').adf(value)})});
  if(!made?.id)throw Error('Jira не подтвердила комментарий.');
  return {handled:true,text:item.key+' · комментарий добавлен',comment:{id:made.id,author:made.author?.displayName||'',created:made.created||'',text:value},undo:{action:'uncomment',args:{id:made.id}}};
 }
 if(action==='uncomment'){
  const id=text(String(args.id||''),32);if(!/^\d+$/.test(id))throw Error('Некорректный комментарий.');
  await api(issue+'/comment/'+id,{method:'DELETE'});return {handled:true,text:item.key+' · комментарий удалён',removed:id};
 }
 if(action==='execute'){
  // «Реализовать» / «Исправить»: the task runner plugin opens a work chat with a plan for approval.
  if(!s.taskRunner)throw Error('Расширение «Выполнение задач» недоступно.');
  const data=await api(issue+'?fields=summary,description,issuetype');
  const {adfText}=require('../../history.cjs');
  return s.taskRunner.start({app:'jira',key:item.key,title:data.fields?.summary||item.summary,type:data.fields?.issuetype?.name||item.type,description:adfText(data.fields?.description)||'',url:item.site+'/browse/'+encodeURIComponent(item.key)});
 }
 throw Error('Неизвестное действие Jira.');
}
module.exports={actions,perform};
