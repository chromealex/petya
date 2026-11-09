// «Идеи для ивентов», renderer. Ideas: a timeline of the period with each idea's dates as a bar and holidays as
// marks, then every idea with its evidence (the holiday, competitors' release-note lines quoted as written, our past
// event's DAU / revenue change) and its cost in the game currency — the terms with their config file:line and a gauge
// of how many days of an average player's income it gives away. «Запланировать» sends «Запланируй ивент N». The plan
// card creates a task only through the cross-app kind `task-tracker` (the tracker previews and confirms) and keeps the
// event in the project's plan on «Сохранить в план». A past event: its metrics and «Запомнить ивент».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('event-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const english=()=>!!window.petyaLanguage&&window.petyaLanguage!=='ru';
 const plural=(n,[a,b,c])=>{if(english())return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const tt=v=>window.t?window.t(v):v;
 const feature=(method,...args)=>window.petya.feature('eventIdeas',method,...args);
 const fmt=(n,d=0)=>Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const day=d=>Date.parse(d+'T00:00:00Z');
 const short=d=>new Date(day(d)).toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'});
 const range=(a,b)=>short(a)+' – '+short(b);
 const NAMES={gold:'золото',coin:'монеты',gem:'кристаллы',crystal:'кристаллы',diamond:'алмазы',soft:'софт-валюта',hard:'хард-валюта'};
 const cur=r=>NAMES[r]?tt(NAMES[r]):r;
 const REGION={global:'весь мир',RU:'Россия',US:'США',GB:'Великобритания',DE:'Германия',FR:'Франция',BR:'Бразилия',MX:'Мексика',CN:'Китай',TW:'Тайвань',KR:'Корея',JP:'Япония',IN:'Индия',TR:'Турция',SA:'Саудовская Аравия',AE:'ОАЭ',EG:'Египет',ID:'Индонезия',VN:'Вьетнам'};
 const MECH={login:'Календарь входа',collect:'Сбор предметов',double:'Двойные награды',sale:'Распродажа',tournament:'Турнир',pass:'Мини-пропуск',pair:'Парные задания'};
 const pct=v=>(v>0?'+':v<0?'−':'')+fmt(Math.abs(v*100),1)+'%';

 function timeline(k,c){
  const box=k.el('div','ei-timeline');
  const t0=day(c.from),t1=Math.max(day(c.to),...c.ideas.map(i=>day(i.end)))+86400000;
  const x=d=>((day(d)-t0)/(t1-t0)*100).toFixed(2)+'%',w=(a,b)=>((day(b)-day(a)+86400000)/(t1-t0)*100).toFixed(2)+'%';
  const axis=k.el('div','ei-axis');
  // Month starts as ticks.
  const d=new Date(t0);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
  while(d.getTime()<t1){const tick=k.el('span','ei-tick');tick.style.left=((d.getTime()-t0)/(t1-t0)*100).toFixed(2)+'%';tick.append(raw(k.el('span',null,d.toLocaleDateString(locale(),{month:'short',timeZone:'UTC'}))));axis.append(tick);d.setUTCMonth(d.getUTCMonth()+1);}
  box.append(axis);
  c.ideas.forEach((i,n)=>{
   const row=k.el('div','ei-row');row.dataset.i=String(n+1);
   row.append(k.el('span','ei-row-n',String(n+1)));
   const lane=k.el('div','ei-lane');const bar=k.el('span','ei-bar m-'+i.mechanic);bar.style.left=x(i.start);bar.style.width=w(i.start,i.end);bar.title=i.title+' · '+range(i.start,i.end);
   lane.append(bar);
   const h=i.evidence.find(e=>e.kind==='holiday');if(h&&day(h.date)>=t0&&day(h.date)<t1){const m=k.el('span','ei-mark');m.style.left=x(h.date);m.title=h.text;lane.append(m);}
   row.append(lane);box.append(row);
  });
  return box;
 }
 function evidence(k,i){
  const list=k.el('ul','ei-evidence');
  for(const e of i.evidence){
   const li=k.el('li','ei-ev '+e.kind);li.dataset.kind=e.kind;
   if(e.kind==='holiday'){li.append(k.el('span','ei-ev-kind','Праздник'),raw(k.el('span',null,e.text.replace(/ — \d{4}-\d{2}-\d{2}$/,'')+' — '+short(e.date))));if(e.approx)li.append(k.el('span','ei-approx','± 1 день'));const r=k.el('span','ei-regions');for(const code of e.regions.slice(0,5))r.append(k.el('span','ei-region',REGION[code]||code));li.append(r);}
   else if(e.kind==='competitor'){li.append(k.el('span','ei-ev-kind','Конкурент'),raw(k.el('b',null,e.game)),raw(k.el('span','ei-date',short(e.date))));li.append(raw(k.el('blockquote','ei-quote selectable',e.quote)));}
   else if(e.kind==='past'){li.append(k.el('span','ei-ev-kind','Наш ивент'),raw(k.el('b',null,e.name)),raw(k.el('span','ei-date',range(e.start,e.end))));
    if(e.uplift){const u=k.el('span','ei-uplift');if(e.uplift.dau!==null)u.append(k.el('span',null,'DAU '),raw(k.el('b',e.uplift.dau>=0?'up':'down',pct(e.uplift.dau))));if(e.uplift.revenue!==null)u.append(k.el('span',null,' · выручка '),raw(k.el('b',e.uplift.revenue>=0?'up':'down',pct(e.uplift.revenue))));li.append(u);}
    else li.append(k.el('span','ei-note','метрик нет'));}
   list.append(li);
  }
  return list;
 }
 function costBox(k,c,i){
  const box=k.el('div','ei-cost');
  if(!i.cost){box.append(k.el('span','ei-note',c.economy?'Для этой механики в конфигах нет нужных значений.':'Стоимость не посчитана: подключите папку проекта с конфигами экономики.'));return box;}
  const head=k.el('div','ei-cost-head');
  head.append(k.el('span','ei-cost-label','Стоимость на игрока'),raw(k.el('b','ei-cost-total',fmt(i.cost.total)+' '+cur(i.cost.currency))));
  const gauge=k.el('div','ei-gauge '+i.cost.level);const fill=k.el('span','ei-gauge-fill');fill.style.width=Math.min(100,i.cost.incomeDays/10*100).toFixed(1)+'%';gauge.append(fill);
  gauge.title=tt('Доход среднего игрока в день')+': '+fmt(i.cost.income)+' '+cur(i.cost.currency);
  const days=raw(k.el('span','ei-days',fmt(i.cost.incomeDays,1)+' '+plural(Math.round(i.cost.incomeDays),['день','дня','дней'])));
  const lvl=k.el('span','ei-level',{low:'мягко для экономики',medium:'заметная инфляция',high:'сильная инфляция'}[i.cost.level]);
  const row=k.el('div','ei-gauge-row');row.append(gauge,days,k.el('span','ei-of','дохода'),lvl);
  box.append(head,row);
  const terms=k.el('ul','ei-terms');
  for(const t of i.cost.terms){const li=k.el('li');li.append(raw(k.el('span','ei-term',t.label)),raw(k.el('b',null,fmt(t.value))));if(t.from)li.append(raw(k.el('span','ei-where',t.from.file.split('/').pop()+':'+t.from.line)));terms.append(li);}
  box.append(terms);
  return box;
 }
 function ideaBlock(k,c,i,n,{plan=false}={}){
  const box=k.el('section','ei-idea');box.dataset.i=String(n+1);box.dataset.mechanic=i.mechanic;
  const head=k.el('div','ei-idea-head');
  head.append(k.el('span','ei-n',String(n+1)),raw(k.el('b','ei-title',i.title)),raw(k.el('span','ei-when',range(i.start,i.end)+' · '+i.days+' '+plural(i.days,['день','дня','дней']))));
  box.append(head);
  const mech=k.el('div','ei-mech');mech.append(k.el('span','ei-mech-name',MECH[i.mechanic]||i.mechanic));if(i.about)mech.append(k.el('span','ei-about',i.about));if(i.pitch)mech.append(raw(k.el('span','ei-pitch',i.pitch)));box.append(mech);
  box.append(evidence(k,i),costBox(k,c,i));
  if(!plan){const b=k.el('button','ei-plan','Запланировать');b.type='button';b.onclick=()=>k.ask('Запланируй ивент '+(n+1),{send:true});box.append(b);}
  return box;
 }
 function taskPayload(c){
  const i=c.idea;
  const lines=[MECH[i.mechanic]+', '+i.start+' – '+i.end+' ('+i.days+' дн.).'];
  if(i.cost)lines.push('Стоимость на игрока: '+i.cost.total+' ('+i.cost.currency+'), '+i.cost.incomeDays+' дн. дохода: '+i.cost.terms.map(t=>t.label+' = '+t.value+(t.from?' ['+t.from.file+':'+t.from.line+']':'')).join('; ')+'.');
  for(const e of i.evidence)lines.push(e.kind==='holiday'?'Повод: '+e.text+'.':e.kind==='competitor'?'Конкурент '+e.game+' ('+e.date+'): «'+e.quote+'».':'Наш ивент «'+e.name+'» ('+e.start+' – '+e.end+')'+(e.uplift?.dau!=null?': DAU '+Math.round(e.uplift.dau*1000)/10+'%':'')+'.');
  return {title:'Ивент: '+i.title,description:lines.join(' ')};
 }
 function render(parent,c){
  const k=window.resultKit;
  const body=k.el('div','ei-body');
  let status,key,actions=[],subtitle='';
  if(c.mode==='ideas'){
   if(c.ideas.length)body.append(timeline(k,c));
   c.ideas.forEach((i,n)=>body.append(ideaBlock(k,c,i,n)));
   if(!c.ideas.length)body.append(k.el('p','ei-note','Поводов для ивентов в этом периоде не нашлось.'));
   const src=k.el('p','ei-note');
   src.append(k.el('span',null,c.sources.competitors?'Конкуренты: строк о событиях в патчноутах — ':'«Конкуренты» не добавлены — события конкурентов не учтены.'));
   if(c.sources.competitors)src.append(raw(k.el('span',null,String(c.ideas.reduce((n,i)=>n+i.evidence.filter(e=>e.kind==='competitor').length,0)))));
   if(c.economy){src.append(k.el('span',null,' · расчёт дохода: '),raw(k.el('span',null,fmt(c.economy.loop.actionsPerDay,1)+' '+plural(Math.round(c.economy.loop.actionsPerDay),['бой','боя','боёв'])+(english()?' a day, ':' в день, ')+fmt(c.economy.loop.winRate*100)+'%')),k.el('span',null,' побед'));}
   body.append(src);
   status={label:c.ideas.length+' '+plural(c.ideas.length,['идея','идеи','идей']),tone:c.ideas.length?'done':'progress'};
   key=range(c.from,c.to);subtitle=[c.project,c.regions.length?c.regions.map(r=>tt(REGION[r]||r)).join(', '):''].filter(Boolean).join(' · ');
  }else if(c.mode==='plan'){
   body.append(ideaBlock(k,c,c.idea,0,{plan:true}));
   const note=k.el('p','ei-note','Задача создаётся в трекере после его подтверждения; в план проекта ивент попадёт после «Создать задачу» или «Сохранить в план».');body.append(note);
   const save=async b=>{const r=await feature('planned',c.id);c.saved=true;b.textContent=tt('В плане');b.dataset.saved='true';if(!r.already)k.toast(tt('Ивент сохранён в план проекта')+' «'+r.project+'»');};
   const saveBtn={label:c.saved?'В плане':'Сохранить в план',run:save};
   actions.push(k.links('task-tracker',()=>taskPayload(c),{label:'Создать задачу',primary:true,onDone:async()=>{try{await feature('planned',c.id);c.saved=true;}catch{/* the plan stays unsaved */}}}),saveBtn);
   (window.resultKit.availableLinks)('task-tracker').then(list=>{if(!list?.length)note.textContent=tt('Чтобы завести задачу, добавьте «Jira» или «Asana»; пока можно сохранить ивент в план проекта.');});
   status={label:c.saved?'в плане':'черновик плана',tone:c.saved?'done':'progress'};key=c.idea.title;subtitle=c.project||'';
  }else{
   const e=c.event,box=k.el('div','ei-past');
   box.append(raw(k.el('b','ei-title',e.name)),raw(k.el('span','ei-when',range(e.start,e.end))));
   if(c.uplift){const u=k.el('div','ei-uplift big');for(const [m,l] of [['dau','DAU'],['revenue','Выручка в день']])if(c.uplift[m]!==null){const x=k.el('span','ei-metric');x.append(k.el('span',null,l),raw(k.el('b',c.uplift[m]>=0?'up':'down',pct(c.uplift[m]))));u.append(x);}box.append(u,k.el('p','ei-note','К средним значениям за 14 дней до ивента.'));}
   else box.append(k.el('p','ei-note',c.error?tt('Метрики не прочитались: ')+c.error:'Метрики не подключены: «Метрики игры» с AppMetrica покажут DAU и выручку.'));
   body.append(box);
   actions.push({label:c.saved?'Запомнено':'Запомнить ивент',primary:!c.saved,run:async b=>{const r=await feature('remember',c.id);c.saved=true;b.textContent=tt('Запомнено');b.dataset.saved='true';if(!r.already)k.toast(tt('Ивент записан в проект')+' «'+r.project+'»');}});
   status={label:c.saved?'запомнен':'прошлый ивент',tone:c.saved?'done':'progress'};key=tt('Прошлый ивент');subtitle=c.project||'';
  }
  const card=k.card({app:'Идеи для ивентов',initial:'И',color:'#8a5a4a',key,status,subtitle,body,actions,className:'event-card'});
  card.dataset.mode=c.mode;card.dataset.card=c.id;
  const kk=card.querySelector('.kit-key');if(kk)raw(kk);const sub=card.querySelector('.kit-subtitle');if(sub&&c.mode!=='ideas')raw(sub);
  parent.append(card);
 }
 window.renderEventCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.event-card'))return;
  render(parent,c);
 };
})();
