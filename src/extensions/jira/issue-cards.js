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
  const assignee=k.chip({label:item.assignee||'Не назначен',title:'Исполнитель',who:item.assignee||'',
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
  // «Реализовать» / «Исправить» hands the task to the task runner: a separate chat with a plan to approve.
  const side=compact||item.category==='done'?null:{label:bug?'Исправить':'Реализовать',hint:'план →\nClaude · Codex',icon:bug?k.icons.fix:k.icons.run,tone:bug?'fix':'',
   title:'Петя составит план работ в отдельном чате. После вашего «Утвердить» код напишут Claude или Codex (или локальная модель для кода), прогресс — в карточке плана.',
   run:async()=>{const r=await k.quick(key(item),'execute');if(r?.topicId&&typeof selectDialogueTopic==='function')await selectDialogueTopic(r.topicId);}};
  const node=k.card({app:'Jira',initial:'J',color:'#2684ff',key:item.key,href:item.site+'/browse/'+encodeURIComponent(item.key),status:compact?null:c.status,
   subtitle:compact?'':item.type,title:item.summary,presentation:key(item),
   chips:compact?[c.assignee]:[c.assignee,c.priority,c.due],side,className:'jira-card jira-issue-card'});
  if(select)node.querySelector('.kit-card-head').prepend(select);
  if(!compact)expandable(node,item);
  return node;
 }

 // Expanded card: the whole task right here — description, comments, attachments — and edits in place
 // (title, description, a new comment). Every change goes to Jira at once with «Отменить».
 const when=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString(window.petyaLocale||'ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';};
 function paragraphs(k,text,className){const box=k.el('div',className);const parts=String(text||'').split(/\n{2,}/);for(const part of parts){const p=k.el('p');const lines=part.split('\n');lines.forEach((line,i)=>{if(i)p.append(document.createElement('br'));p.append(document.createTextNode(line));});box.append(p);}return box;}
 function editor(k,{value,multiline,label,save,done}){
  const box=k.el('div','jira-edit');const input=k.el(multiline?'textarea':'input');input.value=value||'';input.setAttribute('aria-label',label);if(multiline)input.rows=Math.min(18,Math.max(7,String(value||'').split('\n').length+3));
  const ok=k.el('button','primary','Сохранить');ok.type='button';const cancel=k.el('button',null,'Отмена');cancel.type='button';const row=k.el('div','kit-actions');row.append(ok,cancel);box.append(input,row);
  const finish=v=>{box.remove();done(v);};
  ok.onclick=async()=>{if(input.value===value){finish(null);return;}ok.disabled=true;try{const r=await save(input.value);finish(r);}catch{ok.disabled=false;}};
  cancel.onclick=()=>finish(null);
  input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish(null);}if(e.key==='Enter'&&(!multiline||e.metaKey||e.ctrlKey)){e.preventDefault();ok.click();}});
  setTimeout(()=>{input.focus();if(!multiline)input.select();},0);return box;
 }
 function expandable(node,item){
  const k=kit(),pk=key(item),main=node.querySelector(':scope>.kit-card-main')||node;
  // Title: edit in place.
  const title=main.querySelector('.kit-title');
  if(title&&window.chatResultsApi){const pen=k.el('button','jira-title-edit');pen.type='button';pen.title='Изменить название';pen.setAttribute('aria-label','Изменить название '+item.key);pen.textContent='✎';
   pen.onclick=e=>{e.stopPropagation();const box=editor(k,{value:item.summary,label:'Название '+item.key,save:v=>k.quick(pk,'summary',{value:v}),done:r=>{title.hidden=false;pen.hidden=false;if(r?.summary){item.summary=r.summary;title.firstChild.textContent=r.summary;}}});title.hidden=true;pen.hidden=true;title.after(box);};
   title.append(pen);}
  const toggle=k.el('button','jira-expand','Описание и комментарии');toggle.type='button';toggle.setAttribute('aria-expanded','false');
  const panel=k.el('div','jira-details');panel.hidden=true;
  toggle.onclick=async e=>{e.stopPropagation();const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));panel.hidden=!open;toggle.textContent=open?'Свернуть':'Описание и комментарии';if(open&&!panel.dataset.loaded)await load();};
  async function load(){
   panel.replaceChildren(k.el('div','kit-meta','Загружаю из Jira…'));
   let d;try{d=(await window.chatResultsApi.perform(pk,'full')).details;}catch(e){panel.replaceChildren(k.el('div','kit-meta error',e.message));return;}
   panel.dataset.loaded='1';panel.replaceChildren();
   const meta=[d.type,d.reporter&&'автор: '+d.reporter,d.created&&'создана '+when(d.created),d.updated&&'обновлена '+when(d.updated)].filter(Boolean).join(' · ');
   if(meta)panel.append(k.el('div','kit-meta',meta));
   if(d.parent)panel.append(k.el('div','kit-meta','Родитель: '+d.parent.key+(d.parent.summary?' · '+d.parent.summary:'')));
   if(d.labels.length||d.components.length){const tags=k.el('div','kit-chips');for(const t of [...d.components,...d.labels])tags.append(k.chip({label:t}));panel.append(tags);}
   // Description.
   const section=k.el('section','jira-section'),head=k.el('div','jira-section-head');head.append(k.el('h5',null,'Описание'));
   const editDesc=k.el('button','quiet','Изменить');editDesc.type='button';head.append(editDesc);section.append(head);
   let body=d.description?paragraphs(k,d.description,'jira-description'):k.el('p','kit-meta','Описания нет.');section.append(body);
   editDesc.onclick=()=>{editDesc.hidden=true;body.hidden=true;section.append(editor(k,{value:d.description,multiline:true,label:'Описание '+item.key,save:v=>k.quick(pk,'description',{value:v}),
    done:r=>{editDesc.hidden=false;if(r&&'description' in r){d.description=r.description;const next=d.description?paragraphs(k,d.description,'jira-description'):k.el('p','kit-meta','Описания нет.');body.replaceWith(next);body=next;}body.hidden=false;}}));};
   panel.append(section);
   if(d.attachments.length){const files=k.el('section','jira-section');files.append(k.el('h5',null,'Вложения · '+d.attachments.length));const ul=k.el('ul','jira-files');for(const a of d.attachments)ul.append(k.el('li',null,a.name));files.append(ul);panel.append(files);}
   // Comments.
   const comments=k.el('section','jira-section');comments.append(k.el('h5',null,'Комментарии · '+d.commentTotal));
   const list=k.el('ul','jira-comments');const add=c=>{const li=k.el('li');li.dataset.comment=c.id;const top=k.el('div','jira-comment-head');top.append(k.avatar(c.author,{size:20}),k.el('strong',null,c.author||'—'),k.el('span','kit-meta',when(c.created)));li.append(top,paragraphs(k,c.text,'jira-comment-text'));list.append(li);};
   d.comments.forEach(add);if(!d.comments.length)list.append(k.el('li','kit-meta','Комментариев пока нет.'));
   if(d.commentTotal>d.comments.length)comments.append(k.el('div','kit-meta','Показаны последние '+d.comments.length+'. Остальные — в Jira.'));
   const write=k.el('textarea');write.rows=2;write.placeholder='Написать комментарий…';write.setAttribute('aria-label','Комментарий к '+item.key);write.addEventListener('keydown',e=>e.stopPropagation());
   const send=k.el('button','primary','Отправить');send.type='button';send.disabled=true;write.oninput=()=>{send.disabled=!write.value.trim();};
   send.onclick=async()=>{send.disabled=true;try{const r=await k.quick(pk,'comment',{value:write.value});if(r?.comment){list.querySelector(':scope>.kit-meta')?.remove();add(r.comment);write.value='';}}catch{}finally{send.disabled=!write.value.trim();}};
   const box=k.el('div','jira-comment-new');box.append(write,send);comments.append(list,box);panel.append(comments);
  }
  const row=main.querySelector('.kit-chips');(row||main).after(toggle);toggle.after(panel);
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
