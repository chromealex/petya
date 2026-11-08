// Jira plugin, renderer: issue cards with quick edits (status, assignee, priority, due date), a board and batch edits.
// Data: message.jiraItems (result.cjs). Writes go through the plugin's adapter (quick.cjs) via the chat results API.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('issue-cards.css',document.currentScript.src).href;document.head.append(style);
 const kit=()=>window.resultKit;
 const key=item=>JSON.stringify([item.site,item.key]);
 const tone=category=>category==='done'?'done':category==='indeterminate'?'progress':'';
 const day=date=>date?new Date(date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'';
 const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
 function dueOptions(current){
  const now=new Date(),add=n=>{const d=new Date(now);d.setDate(d.getDate()+n);return d;};
  const friday=add((5-now.getDay()+7)%7||7),nextMonday=add((8-now.getDay())%7||7);
  return [['Сегодня',now],['Завтра',add(1)],['В пятницу',friday],['В понедельник',nextMonday],['Через неделю',add(7)]].map(([label,d])=>({label,hint:d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),date:iso(d),current:current===iso(d)})).concat([{label:'Без срока',date:'',current:!current}]);
 }
 // Quick edits are always offered for Jira cards; the adapter re-checks the connection and project on every call.
 const can=item=>!!item?.site&&!!window.chatResultsApi;

 function chips(item,node){
  const k=kit(),pk=key(item),edit=()=>can(item);
  const run=async(action,args,chip,label)=>{const result=await k.quick(pk,action,args,{busy:chip});if(label!==undefined)chip.firstChild.textContent=label+' ▾';return result;};
  const status=k.chip({label:item.status||'Статус',tone:tone(item.category),title:'Статус в Jira',
   menu:edit('transitions')?async()=>(await window.chatResultsApi.perform(pk,'transitions')).options:null,
   pick:async option=>{const r=await run('status',{id:option.id},status,option.label);status.className='kit-chip'+(tone(option.category)?' tone-'+tone(option.category):'');return r;}});
  const assignee=k.chip({label:item.assignee||'Не назначен',title:'Исполнитель',
   menu:edit('people')?async()=>(await window.chatResultsApi.perform(pk,'people')).options:null,
   pick:option=>run('assignee',{id:option.id,label:option.label},assignee,option.label)});
  const priority=item.priority||edit('priorities')?k.chip({label:item.priority||'Приоритет',title:'Приоритет',
   menu:edit('priorities')?async()=>(await window.chatResultsApi.perform(pk,'priorities')).options:null,
   pick:option=>run('priority',{id:option.id},priority,option.label)}):null;
  const due=edit('due')||item.due?k.chip({label:item.due?'Срок: '+day(item.due):'Срок',title:'Срок',
   menu:edit('due')?async()=>dueOptions(item.due):null,
   pick:option=>run('due',{date:option.date},due,option.date?'Срок: '+day(option.date):'Срок')}):null;
  return {status,assignee,priority,due};
 }

 function issueCard(item,{compact=false,select}={}){
  const k=kit(),c=chips(item);
  const bug=/bug|баг|ошибк|дефект/i.test(item.type||'');
  // «Выполнить» / «Исправить» hands the task to the task runner: a separate chat with a plan to approve.
  const runAction={label:bug?'Исправить':'Выполнить',title:'Petya составит план работ в отдельном чате, после утверждения раздаст шаги агентам',run:async()=>{const r=await k.quick(key(item),'execute');if(r?.topicId&&typeof selectDialogueTopic==='function')await selectDialogueTopic(r.topicId);}};
  const node=k.card({app:'Jira',initial:'J',color:'#2684ff',key:item.key,href:item.site+'/browse/'+encodeURIComponent(item.key),status:compact?null:c.status,
   subtitle:compact?'':item.type,title:item.summary,presentation:key(item),
   chips:compact?[c.assignee]:[c.assignee,c.priority,c.due],actions:compact||item.category==='done'?[]:[runAction],className:'jira-card'});
  if(select)node.querySelector('.kit-card-head').prepend(select);
  return node;
 }

 window.renderJiraIssues=(parent,items)=>{
  const k=kit();
  if(!Array.isArray(items)||!items.length||parent.querySelector('.jira-issue-list'))return;
  if(!k){return;}
  const keys=new Set(items.map(i=>i.key));
  // Replace only exact issue-list lines; keep the report's explanation and totals.
  k.dropLines(parent,text=>keys.has(text.match(/^([A-Z][A-Z0-9_]*-\d+)\s+[—–-]/)?.[1]));
  const batch=k.batch(null,{actions:[
   {label:'Назначить…',run:async chosen=>{const first=items.find(i=>key(i)===chosen[0]);const anchor=batch.bar.querySelector('button');await k.menu(anchor,async()=>(await window.chatResultsApi.perform(chosen[0],'people')).options,async option=>{for(const pk of chosen)await k.quick(pk,'assignee',{id:option.id,label:option.label});batch.clear();});}},
   {label:'Статус…',run:async chosen=>{const anchor=batch.bar.querySelectorAll('button')[1];await k.menu(anchor,async()=>(await window.chatResultsApi.perform(chosen[0],'transitions')).options,async option=>{for(const pk of chosen)await k.quick(pk,'status',{to:option.label});batch.clear();});}}
  ]});
  const selectable=items.length>1&&can(items[0]);
  const card=(item,opts)=>issueCard(item,{...opts,select:selectable?batch.box(key(item)):null});
  const columns=[['new','К выполнению'],['indeterminate','В работе'],['done','Готово']];
  const list=k.views(parent,{id:'jira',label:items.length+' '+(items.length===1?'задача':items.length<5?'задачи':'задач'),items,limit:5,modes:{
   cards:rows=>k.collapse(rows.map(item=>card(item)),5),
   board:rows=>k.board(columns.map(([category,label])=>({label,category,items:rows.filter(i=>(i.category||'new')===category).map(item=>({key:key(item),node:card(item,{compact:true})}))})).filter(c=>c.items.length||c.category!=='done'),
    {onDrop:can(items[0])?async(pk,column)=>{const r=await k.quick(pk,'status',{category:column.category});if(r?.status){const item=items.find(i=>key(i)===pk);item.status=r.status;item.category=column.category;list.querySelector('[aria-pressed="true"]')?.click();}}:null}),
   table:rows=>k.table([{label:'Задача',value:i=>{const a=document.createElement('a');a.textContent=i.key;a.href=i.site+'/browse/'+encodeURIComponent(i.key);a.target='_blank';a.rel='noopener';return a;}},{label:'Название',value:i=>i.summary},{label:'Статус',value:i=>chips(i).status},{label:'Исполнитель',value:i=>chips(i).assignee},{label:'Приоритет',value:i=>i.priority||''}],rows)
  }});
  list.classList.add('jira-issue-list');list.append(batch.bar);
 };
})();
