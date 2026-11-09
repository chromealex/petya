// «Найм», renderer. Cards:
// - add: the candidate as understood (name, role, email editable), saved only by «Добавить в воронку»;
// - pipeline: the stages as a funnel (a bar per stage) and the candidates per stage with a stage menu and the red
//   trash (with «Отменить»);
// - prep: the role's skills with questions per skill, the earlier rounds' notes and the doubts to come back to;
// - note: the dictated notes with round and interviewer, saved only by «Сохранить»;
// - summary: a criteria × notes grid (a dot where a note has a quote for that criterion) and the verbatim quotes with
//   who wrote them — no score, no verdict, no comparison;
// - schedule: free slots from the calendar, the invitation text (outgoing review) and «Отправить приглашение», which
//   hands the event to «Календарь»'s own confirmation.
// Names, notes and quotes are content: data-no-i18n.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('hiring-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('hiring',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const APP={app:'Найм',initial:'Н',color:'#5f6f9c'};
 const STAGES=[['applied','Отклик'],['screen','Скрининг'],['tech','Техническое интервью'],['final','Финальное интервью'],['offer','Оффер'],['hired','Вышел'],['rejected','Отказ']];
 const STAGE=Object.fromEntries(STAGES);
 const day=d=>d?new Date(d+'T12:00:00').toLocaleDateString(locale(),{day:'numeric',month:'short'}):'';
 const slotText=x=>new Date(x.start).toLocaleString(locale(),{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'–'+new Date(x.end).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const field=(k,label,value,{type='text',max=120,placeholder=''}={})=>{const l=k.el('label','hr-field');l.append(k.el('span',null,label));const i=k.el('input');i.type=type;i.value=value||'';i.maxLength=max;i.placeholder=placeholder;i.setAttribute('aria-label',label);l.append(i);return {label:l,input:i};};
 const setChip=(card,label,tone)=>{const chip=card.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent=label;chip.className='kit-chip'+(tone?' tone-'+tone:'');}};
 const finish=(card,label,tone)=>{card.querySelector(':scope>.kit-actions')?.remove();for(const i of card.querySelectorAll('input,select,textarea'))i.disabled=true;setChip(card,label,tone);};
 const watch=(card,draftId)=>call('state',draftId).then(st=>{if(st==='saved')finish(card,'сохранено','done');else if(st==='expired')finish(card,'устарело');}).catch(()=>{});

 function addCard(k,data){
  const body=k.el('div','hr-body'),c=data.candidate;
  const name=field(k,'Имя',c.name,{max:80}),role=field(k,'Роль',c.role,{max:60}),email=field(k,'Email',c.email,{type:'email',placeholder:'name@example.com'});
  name.input.dataset.noI18n='';
  if(data.roles?.length){const list=k.el('datalist');list.id='hr-roles-'+data.draftId;for(const r of data.roles)list.append(Object.assign(document.createElement('option'),{value:r}));role.input.setAttribute('list',list.id);body.append(list);}
  const grid=k.el('div','hr-grid');grid.append(name.label,role.label,email.label);body.append(grid);
  if(data.skills?.length){const sk=k.el('div','hr-skills');sk.append(k.el('span','hr-h','Навыки роли'));for(const s of data.skills)sk.append(raw(k,'span','hr-skill',s));body.append(sk);}
  else body.append(k.el('p','hr-muted','Навыки этой роли не заданы — перечислите их в настройках «Найма», чтобы готовить вопросы и сводки.'));
  if(data.known)body.append(k.el('p','hr-warn','Кандидат с таким именем уже есть в воронке.'));
  body.append(k.el('p','hr-muted','Данные кандидата хранятся только на этом компьютере и не попадают в другие приложения.'));
  const card=k.card({...APP,status:{label:'ждёт подтверждения',tone:'progress'},title:'Новый кандидат',body,className:'hr-card hr-add',
   actions:[{label:'Добавить в воронку',primary:true,run:async()=>{const r=await call('add',data.draftId,{name:name.input.value,role:role.input.value,email:email.input.value});finish(card,'в воронке','done');k.toast(r.text);}}]});
  watch(card,data.draftId);
  return card;
 }

 function pipelineCard(k,data){
  const body=k.el('div','hr-body'),list=data.candidates||[];
  const funnel=k.el('ul','hr-funnel');funnel.setAttribute('role','img');funnel.setAttribute('aria-label','Кандидатов по этапам');
  const max=Math.max(1,...data.stages.map(x=>x.count));
  const paintFunnel=()=>{funnel.replaceChildren();for(const st of data.stages){const n=list.filter(c=>c.stage===st.id).length;st.count=n;const li=k.el('li','hr-stage st-'+st.id);const track=k.el('span','hr-track'),bar=k.el('span','hr-bar');bar.style.width=Math.round(n/Math.max(max,1)*100)+'%';track.append(bar);li.append(k.el('span','hr-stage-name',st.label),track,raw(k,'span','hr-stage-n',String(n)));funnel.append(li);}};
  paintFunnel();body.append(funnel);
  const rows=k.el('ul','hr-people');
  for(const c of list){
   const li=k.el('li','hr-person');
   const main=k.el('div','hr-person-main');main.append(raw(k,'span','hr-person-name',c.name),raw(k,'span','hr-person-role',c.role||'—'));
   const meta=k.el('span','hr-person-meta');meta.append(k.el('span',null,'заметок: '),raw(k,'span',null,String(c.notes)));
   const stage=k.chip({label:STAGE[c.stage]||c.stage,tone:c.stage==='rejected'?'alert':c.stage==='hired'?'done':'progress',menu:async()=>STAGES.map(([id,label])=>({id,label,current:id===c.stage})),
    pick:async option=>{try{const r=await call('move',c.id,option.id);const prev=c.stage;c.stage=option.id;stage.firstChild.textContent=STAGE[option.id]+' ▾';paintFunnel();
     k.toast(r.text,{undo:async()=>{await call('move',c.id,prev);c.stage=prev;stage.firstChild.textContent=STAGE[prev]+' ▾';paintFunnel();}});}catch(e){k.toast(e.message,{error:true});}}});
   const trash=(window.deleteButton||((t,fn)=>{const b=k.el('button',null,t);b.onclick=fn;return b;}))('Удалить кандидата',async()=>{
    if(!confirm('Удалить кандидата и все его заметки с этого компьютера?'))return;
    try{const r=await call('remove',c.id);li.classList.add('is-removed');const at=list.indexOf(c);list.splice(at,1);paintFunnel();
     k.toast(r.text,{undo:async()=>{await call('restore',r.candidate);li.classList.remove('is-removed');list.splice(at,0,c);paintFunnel();}});}catch(e){k.toast(e.message,{error:true});}
   });
   const prep=k.el('button','hr-link','Интервью');prep.type='button';prep.title='Подготовить интервью';prep.onclick=()=>k.ask('Подготовь интервью с '+c.name,{send:true});
   li.append(main,meta,stage,prep,trash);rows.append(li);
  }
  if(list.length)body.append(rows);else body.append(k.el('p','hr-muted','Кандидатов пока нет.'));
  const active=list.filter(c=>!['hired','rejected'].includes(c.stage)).length;
  return k.card({...APP,status:{label:'в работе: '+active,tone:active?'progress':'done'},title:data.role?'Найм · '+data.role:'Воронка найма',body,className:'hr-card hr-pipeline',
   actions:[{label:'Добавить кандидата',run:()=>k.ask('Добавь кандидата ')}]});
 }

 function notesList(k,notes,title){
  const det=k.el('details','hr-notes');det.append(k.el('summary',null,title+' · '+notes.length));
  for(const n of notes){const item=k.el('div','hr-note');const head=k.el('div','hr-note-head');head.append(raw(k,'b',null,n.interviewer),k.el('span',null,STAGE[n.round]||n.roundLabel||''),raw(k,'span',null,day(n.date)));item.append(head,raw(k,'p','selectable',n.text));det.append(item);}
  return det;
 }
 function prepCard(k,data){
  const body=k.el('div','hr-body');
  const by=new Map(data.skills.map(s=>[s,[]]));for(const q of data.questions||[])(by.get(q.skill)||by.set(q.skill,[]).get(q.skill)).push(q);
  const grid=k.el('div','hr-qgrid');
  for(const [skill,qs] of by){
   const box=k.el('div','hr-qskill');
   const head=k.el('div','hr-qhead');head.append(raw(k,'span','hr-skill',skill),k.el('span','hr-qn','вопросов: '+qs.length));box.append(head);
   const ol=k.el('ol','hr-qs selectable');ol.dataset.noI18n='';for(const q of qs)ol.append(k.el('li',null,q.text));box.append(ol);grid.append(box);
  }
  body.append(grid);
  if(data.doubts?.length){
   const back=k.el('div','hr-doubts');back.append(k.el('h5','hr-h','Вернуться к (из заметок прошлых раундов)'));
   for(const d of data.doubts){const q=k.el('blockquote','hr-quote selectable');q.append(raw(k,'span',null,'«'+d.text+'»'),raw(k,'cite',null,d.interviewer+' · '+(STAGE[d.round]||'')));back.append(q);}
   body.append(back);
  }
  if(data.previous?.length)body.append(notesList(k,data.previous,'Заметки прошлых раундов'));
  body.append(k.el('p','hr-muted',data.by==='model'?'Вопросы предложила локальная модель — только по навыкам роли.':'Вопросы по шаблону: модель не выбрана или ничего не предложила.'));
  const c=data.candidate;
  return k.card({...APP,status:{label:'навыков: '+data.skills.length,tone:'progress'},title:'Интервью'+(c?' · '+c.name:'')+' · '+data.role,subtitle:c?STAGE[c.stage]||'':'',body,className:'hr-card hr-prep',
   actions:[{label:'Скопировать вопросы',run:async()=>{try{await navigator.clipboard.writeText([...by].map(([s,qs])=>s+':\n'+qs.map(q=>'- '+q.text).join('\n')).join('\n\n'));k.toast('Вопросы скопированы');}catch{k.toast('Не удалось скопировать',{error:true});}}},
    ...c?[{label:'Записать заметки',primary:true,run:()=>k.ask('Запиши заметки интервью с '+c.name+': ')}]:[]]});
 }

 function noteCard(k,data){
  const body=k.el('div','hr-body');
  body.append(raw(k,'blockquote','hr-quote hr-draft selectable',data.text));
  if(data.flagged)body.append(k.el('p','hr-warn','В заметках есть фразы о личных характеристиках ('+data.flagged+') — в сводках и вопросах они не используются. Лучше их убрать.'));
  const row=k.el('div','hr-grid');
  const l=k.el('label','hr-field');l.append(k.el('span',null,'Раунд'));const sel=k.el('select');for(const s of data.stages||STAGES.map(([id,label])=>({id,label}))){const o=document.createElement('option');o.value=s.id;o.textContent=s.label;sel.append(o);}sel.value=data.round;l.append(sel);
  const who=field(k,'Интервьюер',data.interviewer,{max:80});who.input.dataset.noI18n='';
  row.append(l,who.label);body.append(row);
  const card=k.card({...APP,status:{label:'ждёт подтверждения',tone:'progress'},title:'Заметки интервью · '+data.candidate.name,body,className:'hr-card hr-note-card',
   actions:[{label:'Сохранить',primary:true,run:async()=>{const r=await call('saveNote',data.draftId,{round:sel.value,interviewer:who.input.value});finish(card,'сохранено','done');k.toast(r.text);}}]});
  watch(card,data.draftId);
  return card;
 }

 function summaryCard(k,data){
  const body=k.el('div','hr-body'),notes=data.notes||[];
  body.append(k.el('p','hr-rule','Без оценок и сравнения кандидатов — только дословные слова интервьюеров по критериям роли.'));
  // Grid: a row per criterion, a column per note; a dot where that note has a quote for the criterion.
  if(data.criteria?.length&&notes.length){
   const grid=k.el('div','hr-matrix');grid.style.gridTemplateColumns='minmax(120px,1.4fr) repeat('+notes.length+',minmax(34px,1fr))';grid.setAttribute('role','img');grid.setAttribute('aria-label','Цитаты по критериям и заметкам');
   grid.append(k.el('span','hr-mx-corner',''));
   for(const n of notes){const h=raw(k,'span','hr-mx-head',(n.interviewer||'').split(/\s+/)[0]);h.title=n.interviewer+' · '+(STAGE[n.round]||'')+' · '+day(n.date);grid.append(h);}
   for(const c of data.criteria){
    grid.append(raw(k,'span','hr-mx-row',c.criterion));
    for(const n of notes){const has=c.quotes.filter(q=>q.note===n.id).length;const cell=k.el('span','hr-mx-cell'+(has?' has':''));if(has){const dot=k.el('span','hr-mx-dot');dot.style.setProperty('--n',String(Math.min(3,has)));cell.append(dot);cell.title='цитат: '+has;}grid.append(cell);}
   }
   body.append(grid);
  }
  for(const c of data.criteria||[]){
   const box=k.el('div','hr-crit');box.append(raw(k,'h5','hr-crit-name',c.criterion));
   if(!c.quotes.length)box.append(k.el('p','hr-muted','нет данных в заметках'));
   for(const q of c.quotes){const b=k.el('blockquote','hr-quote selectable');b.append(raw(k,'span',null,'«'+q.text+'»'),raw(k,'cite',null,q.interviewer+' · '+(STAGE[q.round]||'')+' · '+day(q.date)));box.append(b);}
   body.append(box);
  }
  if(data.other?.length){const box=k.el('div','hr-crit');box.append(k.el('h5','hr-crit-name','Вне критериев роли'));for(const q of data.other){const b=k.el('blockquote','hr-quote selectable');b.append(raw(k,'span',null,'«'+q.text+'»'),raw(k,'cite',null,q.interviewer+' · '+(STAGE[q.round]||'')));box.append(b);}body.append(box);}
  if(data.noRole)body.append(k.el('p','hr-warn','Для роли кандидата не заданы критерии — перечислите навыки в настройках «Найма».'));
  if(data.dropped)body.append(k.el('p','hr-warn','Фраз о личных характеристиках не учтено: '+data.dropped+'.'));
  body.append(k.el('p','hr-muted',data.by==='model'?'Цитаты подобрала локальная модель; каждая проверена — она дословно есть в заметке.':'Цитаты подобраны по словам критериев, без модели.'));
  const covered=(data.criteria||[]).filter(c=>c.quotes.length).length;
  return k.card({...APP,status:{label:'критериев с цитатами: '+covered+' / '+(data.criteria||[]).length,tone:'progress'},title:'Сводка · '+data.candidate.name,subtitle:data.role||'',body,className:'hr-card hr-summary'});
 }

 function scheduleCard(k,data){
  const body=k.el('div','hr-body'),c=data.candidate;
  let chosen=0;
  const list=k.el('div','hr-slots');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','Время интервью');
  const area=k.el('textarea','hr-invite');area.dataset.noI18n='';area.rows=4;area.maxLength=2000;area.setAttribute('aria-label','Текст приглашения');
  const fill=()=>{const x=data.slots[chosen];area.value=data.invitation.replace('{время}',x?slotText(x):'—');area.dispatchEvent(new Event('input',{bubbles:true}));};
  data.slots.forEach((x,i)=>{
   const b=k.el('button','hr-slot'+(i===0?' is-on':''));b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(i===0));
   b.append(raw(k,'span','hr-slot-time',slotText(x)),raw(k,'span','hr-slot-note',x.note||''));
   b.onclick=()=>{chosen=i;for(const o of list.children){o.classList.toggle('is-on',o===b);o.setAttribute('aria-checked',String(o===b));}fill();};
   list.append(b);
  });
  if(data.slots.length)body.append(list);else body.append(k.el('p','hr-muted','Свободных слотов в ближайшие пять рабочих дней нет.'));
  const unknown=(data.people||[]).filter(p=>p.error);
  if(unknown.length)body.append(raw(k,'p','hr-warn','Не видно календарь: '+unknown.map(p=>p.name+' — '+p.error).join('; ')));
  if(data.missing?.length)body.append(raw(k,'p','hr-warn','Нет email в «Команде»: '+data.missing.join(', ')+' — их занятость не учтена.'));
  const email=field(k,'Email кандидата',c.email,{type:'email',placeholder:'name@example.com'});
  const draft=k.el('div','kit-draft hr-draftbox');draft.append(email.label,k.el('div','kit-draft-label','Текст приглашения'),area);
  if(k.outgoingReview)draft.append(k.outgoingReview(area,{channel:{service:'calendar',target:c.email||c.name,audience:'direct'}}));
  body.append(draft);
  fill();
  body.append(k.el('p','hr-muted','Встреча и приглашение создаются только в «Календаре» после «Поставить встречу». Текст приглашения скопируется — вставьте его в письмо или описание встречи.'));
  const card=k.card({...APP,status:{label:'слотов: '+data.slots.length,tone:data.slots.length?'progress':'alert'},title:'Интервью · '+c.name,subtitle:(STAGE[c.stage]||'')+' · '+data.duration+' мин',body,className:'hr-card hr-schedule',
   actions:data.slots.length?[{label:'Отправить приглашение',primary:true,run:async()=>{
    const x=data.slots[chosen];
    const r=await call('invite',c.id,{start:x.start,duration:data.duration,email:email.input.value,interviewers:data.interviewers||[]});
    try{await navigator.clipboard.writeText(area.value);}catch{/* the text stays on the card */}
    setChip(card,'передано в календарь','done');
    await k.ask(r.ask,{send:true});
   }}]:[]});
  return card;
 }

 window.renderHiringCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.hr-card'))return;
  const make={add:addCard,pipeline:pipelineCard,prep:prepCard,note:noteCard,summary:summaryCard,schedule:scheduleCard}[data.mode];
  if(make)parent.append(make(k,data));
 };
})();
