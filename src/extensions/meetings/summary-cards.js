// Meetings plugin, renderer: the meeting summary (message.extensionData.meetingSummary) as a card.
// Tasks become Jira tasks through the usual chat request, so creation still goes through Petya's preview.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('summary-cards.css',document.currentScript.src).href;document.head.append(style);
 const list=(k,title,rows,render)=>{if(!rows?.length)return null;const box=k.el('section','meeting-section');box.append(k.el('h5',null,title+' · '+rows.length));const ul=k.el('ul');for(const row of rows)ul.append(render(row));box.append(ul);return box;};
 const taskText=t=>t.what+(t.who?', исполнитель '+t.who:'')+(t.due?', срок '+t.due:'');
 window.renderMeetingSummary=(parent,m)=>{
  const k=window.resultKit;if(!k||!m||parent.querySelector('.meeting-card'))return;
  // The card repeats the text answer: keep only the heading line of the text.
  for(const node of parent.querySelectorAll(':scope>p,:scope>ul,:scope>ol'))if(node.textContent.trim()!==m.title)node.remove();
  const body=k.el('div','meeting-body');
  const chosen=new Set();let createButton=null;
  const decisions=list(k,'Решили',m.decisions,d=>k.el('li','meeting-decision',d));
  const tasks=list(k,'Задачи',m.tasks,t=>{
   const li=k.el('li','meeting-task');const box=k.el('input','kit-check');box.type='checkbox';box.setAttribute('aria-label','Выбрать задачу');box.onchange=()=>{box.checked?chosen.add(t):chosen.delete(t);if(createButton)createButton.textContent=chosen.size?'Создать в Jira · '+chosen.size:'Создать все в Jira';};
   const text=k.el('div','meeting-task-text');text.append(k.el('span',null,t.what));
   const chips=k.el('div','kit-chips');if(t.who)chips.append(k.chip({label:t.who,who:t.who}));if(t.due)chips.append(k.chip({label:'Срок: '+t.due,tone:'progress'}));text.append(chips);
   const one=k.el('button',null,'В Jira');one.type='button';one.title='Подготовить задачу в Jira — Петя покажет её перед созданием';one.onclick=()=>k.ask('Создай задачу в Jira: '+taskText(t),{send:true});
   li.append(box,text,one);return li;});
  const open=list(k,'Не обсудили',m.notDiscussed,d=>k.el('li',null,d));
  const discussed=m.discussed?.length?(()=>{const d=k.el('details','meeting-more');d.append(k.el('summary',null,'Обсудили · '+m.discussed.length));const ul=k.el('ul');for(const x of m.discussed)ul.append(k.el('li',null,x));d.append(ul);return d;})():null;
  body.append(...[decisions,tasks,open,discussed].filter(Boolean));
  const actions=[];
  if(m.tasks?.length)actions.push({label:'Создать все в Jira',primary:true,run:()=>{const rows=chosen.size?[...chosen]:m.tasks;return k.ask('Создай задачи в Jira по встрече:\n'+rows.map(t=>'- '+taskText(t)).join('\n'),{send:true});}});
  actions.push({label:'Отправить в Slack…',title:'Подготовить сообщение со сводкой; канал выберете вы',run:()=>k.ask('Отправь сводку последней встречи в Slack в канал ')});
  if(m.notDiscussed?.length)actions.push({label:'В повестку следующей',run:()=>k.ask('Запомни повестку следующей встречи: '+m.notDiscussed.join('; '),{send:true})});
  actions.push({label:'Обновить',title:'Пересобрать сводку',run:()=>k.ask('Обнови сводку встречи',{send:true})});
  const card=k.card({app:'Встреча',initial:'◎',color:'#2d8cff',key:m.title,subtitle:m.basis==='mail'?'с письмом Zoom':'по записи',body,actions,className:'meeting-card'});
  createButton=[...card.querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Создать все в Jira')||null;
  parent.append(card);
 };
})();
