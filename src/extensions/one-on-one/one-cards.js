// «Встречи 1:1», renderer. Three cards:
// - prep: a half-year line of past 1:1s (a dot per meeting, today on the right), open follow-ups of both sides with
//   their dates (overdue in red, a check to close one), the agenda draft, the person's recent Jira issues and PRs,
//   upcoming absences and the last notes folded;
// - confirm: the dictated outcome with the follow-ups code found — each can be unchecked, given to the other side,
//   reworded or re-dated — saved only by «Сохранить»;
// - list: open follow-ups (yours to someone, theirs, or all yours) with due dates and a check to close them.
// Notes and follow-ups are the user's content: marked data-no-i18n and selectable.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('one-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('oneOnOne',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const DAY=86400000;
 const at=d=>new Date(d+'T12:00:00');
 const short=d=>at(d).toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const first=name=>String(name||'').split(/\s+/)[0];
 const KIND={vacation:'отпуск',sick:'больничный',dayoff:'отгул',away:'нет на месте'};
 const STATE={open:'открыт',draft:'черновик',merged:'влит',closed:'закрыт'};

 // A half-year line with a dot for each 1:1.
 function history(k,dates,today){
  const end=at(today).getTime(),start=end-182*DAY;
  const box=k.el('div','one-history');box.setAttribute('role','img');
  box.setAttribute('aria-label',dates.length?'Встреч за полгода: '+dates.filter(d=>at(d).getTime()>=start).length:'Встреч ещё не было');
  const line=k.el('div','one-history-line');
  for(let m=0;m<=6;m++){const t=end-(6-m)*30.33*DAY;const tick=k.el('span','one-history-tick',new Date(t).toLocaleDateString(locale(),{month:'short'}));tick.style.left=((t-start)/(end-start)*100)+'%';line.append(tick);}
  for(const d of dates){const t=at(d).getTime();if(t<start)continue;const dot=k.el('span','one-history-dot');dot.style.left=((t-start)/(end-start)*100)+'%';dot.title=at(d).toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'});line.append(dot);}
  const now=k.el('span','one-history-now');now.title='Сегодня';line.append(now);
  box.append(line);
  return box;
 }
 const dueChip=(k,f,today)=>{
  if(!f.due)return null;
  const late=!f.done&&f.due<today;
  const chip=k.el('span','one-due'+(late?' is-late':f.due===today?' is-today':''));
  chip.append(k.el('span',null,late?'просрочено':'до'),raw(k,'span',null,short(f.due)));chip.title=at(f.due).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'});
  return chip;
 };
 // One follow-up with a check that closes it (and «Отменить» to reopen).
 function followup(k,f,today,{member,showName=false}={}){
  const li=k.el('li','one-fu'+(f.done?' is-done':''));
  const check=k.el('button','one-check');check.type='button';check.setAttribute('aria-label',f.done?'Снова открыть':'Отметить выполненным');check.title=check.getAttribute('aria-label');
  check.setAttribute('aria-pressed',String(!!f.done));
  check.onclick=async()=>{
   check.disabled=true;
   try{
    const res=await call('done',member||f.member,f.id,!f.done);f.done=res.done;li.classList.toggle('is-done',f.done);check.setAttribute('aria-pressed',String(f.done));
    if(f.done)k.toast(res.text,{undo:async()=>{const r=await call('done',member||f.member,f.id,false);f.done=r.done;li.classList.toggle('is-done',f.done);check.setAttribute('aria-pressed','false');}});
   }catch(e){k.toast(e.message,{error:true});}finally{check.disabled=false;}
  };
  const main=k.el('div','one-fu-main');
  const t=raw(k,'span','one-fu-text selectable',f.text);
  main.append(t);
  const sub=k.el('div','one-fu-sub');
  if(showName&&f.name)sub.append(raw(k,'span','one-fu-name',f.name));
  const due=dueChip(k,f,today);if(due)sub.append(due);
  if(sub.childNodes.length)main.append(sub);
  li.append(check,main);
  return li;
 }
 function column(k,title,list,today,member,empty){
  const box=k.el('div','one-col');box.append(k.el('h5','one-h',title));
  if(!list.length){box.append(k.el('p','one-empty',empty));return box;}
  const ul=k.el('ul','one-fus');ul.append(...list.map(f=>followup(k,f,today,{member})));box.append(ul);return box;
 }

 function prep(k,data){
  const p=data.person,body=k.el('div','one-body');
  const top=k.el('div','one-top');
  top.append(history(k,data.history||[],data.today));
  const facts=k.el('div','one-facts');
  facts.append(k.el('span',null,'Встреч за полгода: '),raw(k,'b',null,String((data.history||[]).filter(d=>at(d)>=new Date(at(data.today).getTime()-182*DAY)).length)));
  // A meeting day is a date, not a moment.
  if(data.notes?.[0]){const last=k.el('span','one-last');last.append(k.el('span',null,' · последняя: '),raw(k,'b',null,data.notes[0].date===data.today?window.t?.('сегодня')||'сегодня':short(data.notes[0].date)));facts.append(last);}
  if(data.closed){facts.append(k.el('span',null,' · закрыто договорённостей: '),raw(k,'b',null,String(data.closed)));}
  top.append(facts);
  body.append(top);
  const cols=k.el('div','one-cols');
  cols.append(column(k,'Мои обещания',data.mine||[],data.today,p.member,'Открытых нет'),column(k,'Обещания: '+first(p.name),data.theirs||[],data.today,p.member,'Открытых нет'));
  body.append(cols);
  // Agenda draft.
  const ag=k.el('div','one-agenda');ag.append(k.el('h5','one-h','Повестка'));
  const ol=k.el('ol','one-agenda-list selectable');ol.dataset.noI18n='';for(const a of data.agenda||[])ol.append(k.el('li',null,a));ag.append(ol);
  body.append(ag);
  // Recent work.
  const work=[];
  for(const i of data.jira?.items||[]){
   const row=k.el('li','one-work');const key=k.el(i.url?'a':'span','one-key',i.key);if(i.url){key.href=i.url;key.target='_blank';key.rel='noopener';}
   row.append(key,raw(k,'span','one-work-title',i.title),raw(k,'span','one-state cat-'+i.category,i.status));work.push(row);
  }
  for(const pr of data.prs?.items||[]){
   const row=k.el('li','one-work');const key=k.el(pr.url?'a':'span','one-key','#'+pr.number);if(pr.url){key.href=pr.url;key.target='_blank';key.rel='noopener';}key.title=pr.repo;
   row.append(key,raw(k,'span','one-work-title',pr.title),k.el('span','one-state pr-'+pr.state,STATE[pr.state]||pr.state));work.push(row);
  }
  if(work.length||data.jira?.connected||data.prs?.connected){
   const box=k.el('div','one-workbox');box.append(k.el('h5','one-h','Работа за две недели'));
   if(work.length){const ul=k.el('ul','one-works');const c=k.collapse(work,5);ul.append(c);box.append(ul);}else box.append(k.el('p','one-empty','Задач и PR за две недели нет'));
   body.append(box);
  }
  if(data.absences?.length){
   const a=k.el('p','one-away');a.append(k.el('span',null,'Отсутствия: '));
   data.absences.forEach((x,i)=>{if(i)a.append(raw(k,'span',null,', '));a.append(k.el('span',null,KIND[x.kind]||x.kind),raw(k,'span',null,' '+(x.from===x.to?short(x.from):short(x.from)+' – '+short(x.to))));});
   body.append(a);
  }
  if(data.notes?.length){
   const more=k.el('details','one-notes');more.append(k.el('summary',null,'Прошлые заметки · '+data.notes.length));
   for(const n of data.notes){const item=k.el('div','one-note');item.append(raw(k,'b',null,at(n.date).toLocaleDateString(locale(),{day:'numeric',month:'long'})),raw(k,'p','selectable',n.text));more.append(item);}
   body.append(more);
  }
  for(const n of data.notices||[])body.append(k.el('p','one-notice',n));
  const open=(data.mine?.length||0)+(data.theirs?.length||0);
  return k.card({app:'Встречи 1:1',initial:'1:1',color:'#7a5f8a',status:open?{label:'открыто: '+open,tone:'progress'}:{label:'всё закрыто',tone:'done'},
   title:'1:1 · '+p.name,subtitle:p.role||'',body,className:'one-card one-prep',
   actions:[{label:'Скопировать повестку',run:async()=>{try{await navigator.clipboard.writeText((data.agenda||[]).map((a,i)=>(i+1)+'. '+a).join('\n'));k.toast('Повестка скопирована');}catch{k.toast('Не удалось скопировать',{error:true});}}},
    {label:'Записать итоги',primary:true,run:()=>k.ask('Запиши итоги 1:1 с '+p.name+': ')}]});
 }

 function confirmCard(k,data){
  const p=data.person,d=data.draft,body=k.el('div','one-body');
  const quote=raw(k,'blockquote','one-quote selectable',d.text);body.append(quote);
  const rows=d.followups.map(f=>({...f,include:true}));
  const list=k.el('ul','one-edit');
  const owner=f=>f.owner==='me'?'я':first(p.name);
  for(const f of rows){
   const li=k.el('li','one-edit-row');
   const box=k.el('input');box.type='checkbox';box.checked=true;box.setAttribute('aria-label','Сохранить эту договорённость');box.onchange=()=>{f.include=box.checked;li.classList.toggle('is-off',!box.checked);};
   const who=k.el('button','one-owner owner-'+f.owner);who.type='button';who.title='Чья это договорённость — нажмите, чтобы поменять';
   const paintWho=()=>{who.replaceChildren(f.owner==='me'?k.el('span',null,'я'):raw(k,'span',null,owner(f)));who.className='one-owner owner-'+f.owner;};paintWho();
   who.onclick=()=>{f.owner=f.owner==='me'?'them':'me';paintWho();};
   const input=k.el('input','one-edit-text');input.type='text';input.value=f.text;input.maxLength=300;input.setAttribute('aria-label','Текст договорённости');input.oninput=()=>{f.text=input.value;};
   const due=k.el('input','one-edit-due');due.type='date';due.value=f.due||'';due.setAttribute('aria-label','Срок');due.oninput=()=>{f.due=due.value;};
   li.append(box,who,input,due);list.append(li);
  }
  if(rows.length){body.append(k.el('h5','one-h','Договорённости'),list);}
  else body.append(k.el('p','one-empty','Договорённостей с понятным исполнителем нет — сохранится только заметка.'));
  const status={label:'ждёт подтверждения',tone:'progress'};
  let card;
  const finish=(label,tone)=>{card.querySelector('.kit-actions')?.remove();for(const i of card.querySelectorAll('input,.one-owner'))i.disabled=true;const chip=card.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent=label;chip.className='kit-chip'+(tone?' tone-'+tone:'');}};
  card=k.card({app:'Встречи 1:1',initial:'1:1',color:'#7a5f8a',status,title:'Итоги 1:1 · '+p.name,subtitle:at(d.date).toLocaleDateString(locale(),{day:'numeric',month:'long'}),body,className:'one-card one-confirm',
   actions:[{label:'Сохранить',primary:true,run:async()=>{const res=await call('confirm',d.id,rows.filter(f=>f.include).map(({text,owner,due})=>({text,owner,due})));finish('сохранено','done');k.toast(res.text);}},
    {label:'Отмена',run:async()=>{await call('cancel',d.id);finish('не сохранено');}}]});
  call('state',d.id).then(st=>{if(st==='saved')finish('сохранено','done');else if(st==='expired')finish('устарело');}).catch(()=>{});
  return card;
 }

 function listCard(k,data){
  const body=k.el('div','one-body'),items=data.items||[],p=data.person;
  const late=items.filter(f=>f.due&&f.due<data.today).length;
  if(!p&&items.length){
   // Everything yours: a bar per colleague.
   const by=new Map();for(const f of items)by.set(f.name,(by.get(f.name)||0)+1);
   const max=Math.max(...by.values()),bars=k.el('ul','one-bars');
   for(const [name,n] of by){const li=k.el('li');li.append(raw(k,'span','one-bar-name',name));const track=k.el('span','one-bar-track'),bar=k.el('span','one-bar');bar.style.width=Math.round(n/max*100)+'%';track.append(bar);li.append(track,raw(k,'span','one-bar-n',String(n)));bars.append(li);}
   body.append(bars);
  }
  if(items.length){const ul=k.el('ul','one-fus');ul.append(...items.map(f=>followup(k,f,data.today,{showName:!p})));body.append(ul);}
  else body.append(k.el('p','one-empty','Открытых договорённостей нет'));
  const title=data.owner==='me'?(p?'Мои обещания · '+first(p.name):'Мои обещания на 1:1'):data.owner==='them'?'Обещания · '+(p?p.name:''):'Договорённости · '+(p?p.name:'');
  return k.card({app:'Встречи 1:1',initial:'1:1',color:'#7a5f8a',status:late?{label:'просрочено: '+late,tone:'alert'}:{label:'открыто: '+items.length,tone:items.length?'progress':'done'},title,body,className:'one-card one-list',
   actions:p?[{label:'Подготовить 1:1',run:()=>k.ask('Подготовь 1:1 с '+p.name,{send:true})}]:[]});
 }

 window.renderOneOnOneCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.one-card'))return;
  const card=data.mode==='prep'?prep(k,data):data.mode==='confirm'&&data.draft?confirmCard(k,data):listCard(k,data);
  parent.append(card);
 };
})();
