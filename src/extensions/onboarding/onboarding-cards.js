// «Онбординг новичка», renderer. Three cards:
// - draft: the two-week plan as code built it — a strip of ten working days (a column per day, coloured by kind of
//   item), the items by day with their source (unchecking one leaves it out), the first day to choose, what is missing,
//   and the welcome message; «Начать онбординг» is the only thing that stores the plan;
// - plan: the stored plan with progress per day (the column fills as items are ticked, today is marked), a check per
//   item, the welcome message, and the red trash with «Отменить»;
// - list: every stored plan with its progress.
// The welcome message passes the outgoing review (k.outgoingReview) and is sent only through a messenger app's own
// confirmed flow (k.links('share-message')). Names, titles and the message are content: data-no-i18n.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('onboarding-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('onboarding',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const at=d=>new Date(d+'T12:00:00');
 const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const first=name=>String(name||'').split(/\s+/)[0];
 const KIND={access:'Доступ',doc:'Прочитать',person:'Знакомство',task:'Задача'};
 const ORDER=['access','doc','person','task'];
 function workdays(start,n=10){const out=[];const d=at(start);while(out.length<n){if(d.getDay()!==0&&d.getDay()!==6)out.push(ymd(d));d.setDate(d.getDate()+1);}return out;}
 const dayLabel=d=>at(d).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});

 // Ten columns: stacked segments per kind (draft) or the done share (plan); today outlined.
 function strip(k,{days,items,today,plan}){
  const box=k.el('div','onb-strip');box.setAttribute('role','img');
  const done=items.filter(i=>i.done).length;
  box.setAttribute('aria-label',plan?'Сделано '+done+' из '+items.length:'Пунктов в плане: '+items.length);
  const max=Math.max(1,...days.map((d,i)=>items.filter(x=>x.day===i+1).length));
  days.forEach((d,i)=>{
   const list=items.filter(x=>x.day===i+1),col=k.el('div','onb-day'+(d===today?' is-today':'')+(plan&&d<today&&list.some(x=>!x.done)?' is-late':''));
   col.title=dayLabel(d)+' · '+list.length;
   const bar=k.el('div','onb-bar');bar.style.height=Math.round(list.length/max*100)+'%';
   if(plan){const fill=k.el('span','onb-fill');fill.style.height=(list.length?Math.round(list.filter(x=>x.done).length/list.length*100):0)+'%';bar.append(fill);}
   else for(const kind of ORDER){const n=list.filter(x=>x.kind===kind).length;if(!n)continue;const seg=k.el('span','onb-seg kind-'+kind);seg.style.flexGrow=String(n);bar.append(seg);}
   col.append(bar,k.el('span','onb-day-n',String(i+1)),raw(k,'span','onb-day-date',at(d).toLocaleDateString(locale(),{day:'numeric',month:'numeric'})));
   box.append(col);
  });
  return box;
 }
 function legend(k){const row=k.el('div','onb-legend');for(const kind of ORDER){const i=k.el('span','onb-legend-item');i.append(k.el('span','onb-dot kind-'+kind),k.el('span',null,KIND[kind]));row.append(i);}return row;}

 function item(k,x,{plan,planId,onChange}){
  const li=k.el('li','onb-item kind-'+x.kind+(plan&&x.done?' is-done':'')+(!plan&&x.include===false?' is-off':''));
  const box=k.el('input','onb-check');box.type='checkbox';
  box.checked=plan?!!x.done:x.include!==false;
  box.setAttribute('aria-label',plan?'Сделано':'Оставить в плане');
  box.onchange=async()=>{
   if(!plan){x.include=box.checked;li.classList.toggle('is-off',!box.checked);onChange?.();return;}
   box.disabled=true;
   try{const r=await call('check',planId,x.id,box.checked);x.done=r.done;li.classList.toggle('is-done',x.done);onChange?.(r);}
   catch(e){box.checked=!box.checked;k.toast(e.message,{error:true});}finally{box.disabled=false;}
  };
  const main=k.el('div','onb-main');
  const head=k.el('div','onb-head');
  head.append(k.el('span','onb-kind kind-'+x.kind,KIND[x.kind]||x.kind));
  const url=k.safeUrl?.(x.source?.url)||'';
  const title=raw(k,url?'a':'span','onb-title selectable',x.title);if(url){title.href=url;title.target='_blank';title.rel='noopener';}
  head.append(title);
  if(x.role)head.append(raw(k,'span','onb-role',x.role));
  main.append(head);
  const sub=k.el('div','onb-sub');
  const from=k.el('span','onb-source');from.append(k.el('span',null,'Источник: '),raw(k,'span',null,x.source?.label||'—'));sub.append(from);
  if(x.source?.path)sub.append(raw(k,'span','onb-path selectable',x.source.path));
  if(x.note)sub.append(raw(k,'span','onb-note',x.note));
  main.append(sub);
  li.append(box,main);
  return li;
 }
 function days(k,data,{plan,onChange}){
  const box=k.el('div','onb-days');
  const current=plan?Math.max(1,data.day||1):1;
  data.days.forEach((d,i)=>{
   const list=data.items.filter(x=>x.day===i+1);if(!list.length)return;
   const det=k.el('details','onb-group');det.open=plan?i+1===Math.min(current,data.days.length):i<2;
   const sum=k.el('summary');sum.append(k.el('span','onb-group-day','День '+(i+1)),raw(k,'span','onb-group-date',dayLabel(d)));
   const count=k.el('span','onb-group-count');const paint=()=>{count.textContent=list.filter(x=>x.done).length+' / '+list.length;};
   if(plan){paint();sum.append(count);}
   det.append(sum);
   const changed=r=>{paint();onChange?.(r);};
   const ul=k.el('ul','onb-items');ul.append(...list.map(x=>item(k,x,{plan,planId:data.planId,onChange:changed})));det.append(ul);
   box.append(det);
  });
  return box;
 }
 // The welcome draft: exactly what is sent, reviewed, sent only through a messenger app's own confirmation.
 function welcome(k,data,{onEdit}={}){
  const box=k.el('div','onb-welcome kit-draft');
  const label=k.el('div','kit-draft-label');label.append(k.el('span',null,'Приветствие · '),raw(k,'span',null,data.name));box.append(label);
  const area=k.el('textarea','onb-welcome-text');area.dataset.noI18n='';area.rows=4;area.value=data.welcome||'';area.maxLength=2000;area.setAttribute('aria-label','Текст приветствия');
  let timer=null;area.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>onEdit?.(area.value),800);});
  box.append(area);
  if(k.outgoingReview)box.append(k.outgoingReview(area,{channel:{service:'messenger',target:data.name,audience:'direct'}}));
  const row=k.el('div','kit-actions');
  row.append(k.links('share-message',()=>({text:area.value,title:'Приветствие · '+data.name}),{label:p=>p.label,title:'Откроет отправку в мессенджере: там выберете чат и подтвердите'}));
  const copy=k.el('button',null,'Скопировать');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(area.value);k.toast('Текст скопирован');}catch{k.toast('Не удалось скопировать',{error:true});}};
  row.append(copy);
  box.append(row,k.el('small','onb-hint','Ничего не отправляется само: мессенджер покажет чат и текст и отправит только после вашего подтверждения.'));
  return box;
 }

 function draftCard(k,data){
  const body=k.el('div','onb-body');
  data.items.forEach(x=>{x.include=true;});
  const top=k.el('div','onb-top');
  const startRow=k.el('label','onb-start');startRow.append(k.el('span',null,'Первый день'));
  const start=k.el('input','onb-start-input');start.type='date';start.value=data.start;start.setAttribute('aria-label','Первый день');
  startRow.append(start);top.append(startRow,legend(k));
  body.append(top);
  let stripNode=strip(k,{...data,plan:false}),daysNode=days(k,data,{plan:false});
  body.append(stripNode,daysNode);
  start.onchange=()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(start.value))return;data.start=start.value;data.days=workdays(start.value,data.days.length);
   const s2=strip(k,{...data,plan:false}),d2=days(k,data,{plan:false});stripNode.replaceWith(s2);daysNode.replaceWith(d2);stripNode=s2;daysNode=d2;};
  if(data.gaps?.length){const gaps=k.el('div','onb-gaps');gaps.append(k.el('h5','onb-h','Чего не хватает'));const ul=k.el('ul');for(const g of data.gaps)ul.append(k.el('li',null,g));gaps.append(ul);body.append(gaps);}
  const w=welcome(k,data);body.append(w);
  let card;
  const finish=(label,tone)=>{card.querySelector(':scope>.kit-actions')?.remove();for(const i of card.querySelectorAll('.onb-check,.onb-start-input'))i.disabled=true;const chip=card.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent=label;chip.className='kit-chip'+(tone?' tone-'+tone:'');}};
  card=k.card({app:'Онбординг новичка',initial:'О',color:'#6d5a9c',status:{label:'черновик',tone:'progress'},title:'Онбординг · '+data.name,subtitle:data.role,body,className:'onb-card onb-draft',
   actions:[{label:'Начать онбординг',primary:true,run:async()=>{
     const res=await call('save',data.draftId,{start:data.start,skip:data.items.filter(x=>x.include===false).map(x=>x.id),welcome:w.querySelector('textarea').value});
     finish('сохранено','done');k.toast(res.text);}}]});
  call('state',data.draftId).then(st=>{if(st==='saved')finish('сохранено','done');else if(st==='expired')finish('устарело');}).catch(()=>{});
  return card;
 }

 function planCard(k,data){
  const body=k.el('div','onb-body');
  const total=data.items.length,count=()=>data.items.filter(x=>x.done).length;
  const facts=k.el('div','onb-facts');
  const paint=()=>{facts.replaceChildren(k.el('span',null,data.day?'День ':'Начало: '),raw(k,'b',null,data.day?Math.min(data.day,data.days.length)+' / '+data.days.length:dayLabel(data.start)),k.el('span',null,' · сделано '),raw(k,'b',null,count()+' / '+total));
   const chip=card?.querySelector('.kit-card-head .kit-chip');if(chip){const st=status();chip.textContent=st.label;chip.className='kit-chip tone-'+st.tone;}};
  let stripNode=strip(k,{...data,plan:true});
  const onChange=()=>{const s2=strip(k,{...data,plan:true});stripNode.replaceWith(s2);stripNode=s2;paint();};
  body.append(facts,stripNode,days(k,data,{plan:true,onChange}));
  body.append(welcome(k,data,{onEdit:v=>call('welcome',data.planId,v).catch(()=>{})}));
  const status=()=>{const late=data.items.filter(x=>!x.done&&x.day<=(data.day||0)).length;return count()===total?{label:'всё сделано',tone:'done'}:late?{label:'ждут отметки: '+late,tone:'alert'}:{label:Math.round(count()/Math.max(1,total)*100)+'%',tone:'progress'};};
  const trash=(window.deleteButton||((t,fn)=>{const b=k.el('button',null,t);b.onclick=fn;return b;}))('Удалить план онбординга',async()=>{
   try{const r=await call('remove',data.planId);card.classList.add('is-removed');
    k.toast('План удалён',{undo:async()=>{await call('restore',r.plan);card.classList.remove('is-removed');}});}catch(e){k.toast(e.message,{error:true});}
  });
  const card=k.card({app:'Онбординг новичка',initial:'О',color:'#6d5a9c',status:status(),title:'Онбординг · '+data.name,subtitle:data.role,body,className:'onb-card onb-plan',actions:[trash]});
  paint();
  return card;
 }

 function listCard(k,data){
  const body=k.el('div','onb-body'),ul=k.el('ul','onb-list');
  for(const p of data.plans||[]){
   const li=k.el('li','onb-row');
   const name=raw(k,'button','onb-row-name',p.name);name.type='button';name.onclick=()=>k.ask('Как идёт онбординг '+p.name,{send:true});
   const track=k.el('span','onb-row-track'),bar=k.el('span','onb-row-bar');bar.style.width=Math.round(p.done/Math.max(1,p.total)*100)+'%';track.append(bar);
   li.append(name,raw(k,'span','onb-row-role',p.role||''),track,raw(k,'span','onb-row-n',p.done+' / '+p.total),k.el('span','onb-row-day',p.day?'день '+Math.min(p.day,10):'ещё не начался'));
   ul.append(li);
  }
  body.append(ul);
  return k.card({app:'Онбординг новичка',initial:'О',color:'#6d5a9c',status:{label:'планов: '+(data.plans||[]).length,tone:'progress'},title:'Онбординги',body,className:'onb-card onb-listcard'});
 }

 window.renderOnboardingCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.onb-card'))return;
  parent.append(data.mode==='draft'?draftCard(k,data):data.mode==='plan'?planCard(k,data):listCard(k,data));
 };
})();
