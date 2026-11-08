// Meetings plugin, renderer: the meeting summary (message.extensionData.meetingSummary) as a card.
// Tasks go to the connected tracker through cross-app links (Jira or Asana: their own flows preview and confirm),
// the summary to the team through «share-message», and «Назначить следующую встречу» prepares a calendar request.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('summary-cards.css',document.currentScript.src).href;document.head.append(style);
 const list=(k,title,rows,render)=>{if(!rows?.length)return null;const box=k.el('section','meeting-section');box.append(k.el('h5',null,title+' · '+rows.length));const ul=k.el('ul');for(const row of rows)ul.append(render(row));box.append(ul);return box;};
 const taskText=t=>t.what+(t.who?', исполнитель '+t.who:'')+(t.due?', срок '+t.due:'');
 // Whether «Календарь» is added: asked once per window.
 let calendar=null;
 const calendarAdded=()=>calendar||(calendar=(window.petya?.feature?window.petya.feature('extensionUI','catalog'):Promise.resolve([])).then(list=>!!list.find(d=>d.id==='calendar')?.installed).catch(()=>false));
 window.renderMeetingSummary=(parent,m)=>{
  const k=window.resultKit;if(!k||!m||parent.querySelector('.meeting-card'))return;
  // The card repeats the text answer: keep only the heading line of the text.
  for(const node of parent.querySelectorAll(':scope>p,:scope>ul,:scope>ol'))if(node.textContent.trim()!==m.title)node.remove();
  const body=k.el('div','meeting-body');
  const chosen=new Set();
  const decisions=list(k,'Решили',m.decisions,d=>k.el('li','meeting-decision',d));
  const tasks=list(k,'Задачи',m.tasks,t=>{
   const li=k.el('li','meeting-task');const box=k.el('input','kit-check');box.type='checkbox';box.setAttribute('aria-label','Выбрать задачу');box.onchange=()=>{box.checked?chosen.add(t):chosen.delete(t);};
   const text=k.el('div','meeting-task-text');text.append(k.el('span',null,t.what));
   const chips=k.el('div','kit-chips');if(t.who)chips.append(k.chip({label:t.who,who:t.who}));if(t.due)chips.append(k.chip({label:'Срок: '+t.due,tone:'progress'}));text.append(chips);
   const one=k.links('task-tracker',{title:t.what,description:[t.who?'Исполнитель: '+t.who:'',t.due?'срок: '+t.due:'',m.title?'по встрече «'+m.title+'»':''].filter(Boolean).join(', ')},{className:'meeting-task-link',title:'Подготовить задачу — Петя покажет её перед созданием'});
   li.append(box,text,one);return li;});
  const open=list(k,'Не обсудили',m.notDiscussed,d=>k.el('li',null,d));
  const discussed=m.discussed?.length?(()=>{const d=k.el('details','meeting-more');d.append(k.el('summary',null,'Обсудили · '+m.discussed.length));const ul=k.el('ul');for(const x of m.discussed)ul.append(k.el('li',null,x));d.append(ul);return d;})():null;
  body.append(...[decisions,tasks,open,discussed].filter(Boolean));
  const actions=[];
  // All tasks (or the checked ones) as one batch request to the tracker.
  if(m.tasks?.length)actions.push(k.links('task-tracker',()=>({title:m.title,tasks:(chosen.size?[...chosen]:m.tasks).map(taskText)}),{primary:true,label:p=>'Создать все: '+p.name}));
  const summary=[m.decisions?.length?'решили — '+m.decisions.slice(0,5).join('; '):'',m.tasks?.length?'задачи — '+m.tasks.slice(0,8).map(taskText).join('; '):''].filter(Boolean).join('. ');
  actions.push(k.links('share-message',{text:'посмотреть сводку встречи «'+m.title+'»'+(summary?': '+summary:'')+'.'}));
  if(m.notDiscussed?.length)actions.push({label:'В повестку следующей',run:()=>k.ask('Запомни повестку следующей встречи: '+m.notDiscussed.join('; '),{send:true})});
  // The next meeting through «Календарь»: the request is put into the composer with the people from the tasks.
  const next=k.el('span','kit-links');actions.push(next);
  actions.push({label:'Обновить',title:'Пересобрать сводку',run:()=>k.ask('Обнови сводку встречи',{send:true})});
  const card=k.card({app:'Встреча',initial:'◎',color:'#2d8cff',key:m.title,subtitle:m.basis==='mail'?(m.mailFrom?'с письмом '+m.mailFrom:'с письмом сервиса встреч'):'по записи',body,actions,className:'meeting-card'});
  calendarAdded().then(added=>{
   if(!added)return;
   const people=[...new Set((m.tasks||[]).map(t=>String(t.who||'').trim()).filter(Boolean))].slice(0,8);
   const b=k.el('button',null,'Назначить следующую встречу');b.type='button';b.title='Календарь подберёт общее время; встреча создаётся только после подтверждения';
   b.onclick=e=>{e.stopPropagation();k.ask('Найди время для встречи «'+m.title+': продолжение»'+(people.length?' с '+people.join(', '):' с ')+' на следующей неделе');};
   next.append(b);
  });
  parent.append(card);
 };
})();
