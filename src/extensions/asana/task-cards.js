// Asana plugin, renderer: my tasks as cards — done checkbox and due date apply at once with undo,
// «Выполнить» / «Исправить» opens the task runner's plan chat. Data: message.extensionData.asanaItems.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('task-cards.css',document.currentScript.src).href;document.head.append(style);
 const key=item=>JSON.stringify(['asana',item.gid]);
 const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
 const today=()=>iso(new Date());
 const day=d=>d?new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'';
 const bug=name=>/(?:^|\s)(?:баг|ошибк\S*|bug|fix|исправ\S*|почин\S*|вылет\S*|падает|крэш|краш|crash)/iu.test(name);
 function dueOptions(current){
  const now=new Date(),add=n=>{const d=new Date(now);d.setDate(d.getDate()+n);return d;};
  return [['Сегодня',now],['Завтра',add(1)],['В пятницу',add((5-now.getDay()+7)%7||7)],['Через неделю',add(7)]].map(([label,d])=>({label,hint:d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),date:iso(d),current:current===iso(d)})).concat([{label:'Без срока',date:'',current:!current}]);
 }
 function card(k,item,refresh){
  const pk=key(item);
  const done=k.el('input','kit-check');done.type='checkbox';done.checked=item.completed;done.setAttribute('aria-label',item.completed?'Вернуть в работу':'Отметить выполненной');
  done.onchange=async()=>{try{const r=await k.quick(pk,done.checked?'complete':'reopen',{},{busy:done});if(r?.item)Object.assign(item,r.item);refresh();}catch{done.checked=!done.checked;}};
  const late=item.due&&item.due<today()&&!item.completed;
  const due=k.chip({label:item.due?'Срок: '+day(item.due):'Срок',tone:late?'alert':'',title:late?'Просрочено':'Срок',menu:async()=>dueOptions(item.due),
   pick:async option=>{const r=await k.quick(pk,'due',{date:option.date},{busy:due});if(r?.item)Object.assign(item,r.item);refresh();}});
  const actions=item.completed?[]:[{label:bug(item.name)?'Исправить':'Выполнить',title:'Петя составит план работ в отдельном чате, после утверждения раздаст шаги агентам',
   run:async()=>{const r=await k.quick(pk,'execute');if(r?.topicId&&typeof selectDialogueTopic==='function')await selectDialogueTopic(r.topicId);}}];
  const node=k.card({app:'Asana',initial:'A',color:'#f06a6a',key:item.project||'Asana',href:item.url,subtitle:'',title:item.name,presentation:pk,chips:[due],actions,className:'asana-card'+(item.completed?' done':'')});
  node.querySelector('.kit-card-head').prepend(done);
  return node;
 }
 // A week strip: how many open tasks fall on each of the next 7 days (and overdue), a click filters the list.
 function week(k,items,filter,onPick){
  const strip=k.el('div','asana-week');strip.setAttribute('role','group');strip.setAttribute('aria-label','Срок');
  const days=[{id:'all',label:'Все',count:items.length}];
  const late=items.filter(i=>i.due&&i.due<today()&&!i.completed).length;if(late)days.push({id:'late',label:'Просрочено',count:late,alert:true});
  for(let n=0;n<7;n++){const d=new Date();d.setDate(d.getDate()+n);const id=iso(d);days.push({id,label:n===0?'Сегодня':d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric'}),count:items.filter(i=>i.due===id).length});}
  days.push({id:'none',label:'Без срока',count:items.filter(i=>!i.due).length});
  for(const d of days){if(!d.count&&d.id!=='all'&&d.id!==today())continue;const b=k.el('button',d.alert?'alert':'');b.type='button';b.append(k.el('span',null,d.label),k.el('b',null,d.count||'·'));b.setAttribute('aria-pressed',String(filter===d.id));b.onclick=()=>onPick(d.id);strip.append(b);}
  return strip;
 }
 window.renderAsanaTasks=(parent,items)=>{
  const k=window.resultKit;if(!k||!Array.isArray(items)||!items.length||parent.querySelector('.asana-list'))return;
  const root=k.el('div','kit-list asana-list');let filter='all';
  const match=i=>filter==='all'||(filter==='late'?i.due&&i.due<today()&&!i.completed:filter==='none'?!i.due:i.due===filter);
  const paint=()=>{
   const rows=items.filter(match);
   root.replaceChildren(week(k,items,filter,id=>{filter=id;paint();}),rows.length?k.collapse(rows.map(i=>card(k,i,paint)),6,'Ещё задачи'):k.el('div','kit-meta','Нет задач на этот день.'));
  };
  paint();parent.append(root);
 };
})();
