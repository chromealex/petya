// «Планирование спринта», renderer: velocity bars with the average line, a gauge of capacity against carry-over and
// the proposed scope, people lanes with load bars (carry-over, already planned, proposed, capacity mark), absences,
// and the proposed issues with include/exclude switches — totals, the gauge and the lanes are recomputed on the
// card as the user toggles. «Перенести в Jira…» sends a prepared chat request (the app previews it and asks before
// writing); «Отправить план в Slack» goes through the share-message link (the Slack flow picks the channel and confirms).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('sprint-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=n=>Number(n||0).toLocaleString(locale(),{maximumFractionDigits:1});
 const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'});};
 const day=ymd=>date(ymd+'T12:00:00');
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(Math.round(n))%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const unit=(mode,n)=>mode==='count'?plural(n,['задача','задачи','задач']):mode==='hours'?(window.petyaLanguage&&window.petyaLanguage!=='ru'?'h':'ч'):'SP';
 const svg=(tag,attrs={})=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const r1=n=>Math.round(n*10)/10;

 function velocityChart(k,c){
  const box=k.el('div','sprint-velocity');
  const v=c.velocity,mode=c.estimation.mode;
  const head=k.el('div','sprint-panel-head');head.append(k.el('span',null,'Скорость'),k.el('span','sprint-muted','в среднем '+num(v.average)+' '+unit(mode,v.average)));
  box.append(head);
  if(!v.sprints.length){box.append(k.el('p','sprint-empty','Закрытых спринтов ещё нет.'));return box;}
  const W=300,H=118,top=12,bottom=24,max=Math.max(1,...v.sprints.map(s=>Math.max(s.completed,s.committed))),gap=10,bw=(W-gap*(v.sprints.length+1))/v.sprints.length;
  const y=val=>top+(H-top-bottom)*(1-val/max);
  // Sprint names usually share a prefix («GAME Sprint 10», «GAME Sprint 11»): the bars show what differs.
  const names=v.sprints.map(s=>s.name);let common=names.length>1?names[0]:'';for(const n of names)while(common&&!n.startsWith(common))common=common.slice(0,-1);
  common=common.replace(/[^\s._-]*$/u,'');
  const short=n=>{const t=(n.slice(common.length)||n).trim();return t.length>9?t.slice(0,8)+'…':t;};
  const chart=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'sprint-velocity-chart',role:'img','aria-label':'Скорость по спринтам, в среднем '+num(v.average)});
  v.sprints.forEach((s,i)=>{
   const x=gap+i*(bw+gap);
   const g=svg('g',{class:'sprint-bar'});
   const title=svg('title');title.textContent=s.name+': сделано '+num(s.completed)+' из '+num(s.committed);g.append(title);
   g.append(svg('rect',{x,y:y(s.committed),width:bw,height:Math.max(0,H-bottom-y(s.committed)),rx:3,class:'committed'}));
   g.append(svg('rect',{x:x+3,y:y(s.completed),width:Math.max(2,bw-6),height:Math.max(1,H-bottom-y(s.completed)),rx:2,class:'completed'}));
   const inside=H-bottom-y(s.completed)>16;
   const value=svg('text',{x:x+bw/2,y:inside?y(s.completed)+12:y(s.completed)-3,class:'value'+(inside?' inside':''),'text-anchor':'middle'});value.textContent=num(s.completed);g.append(value);
   const label=svg('text',{x:x+bw/2,y:H-8,class:'label','text-anchor':'middle','data-no-i18n':''});label.textContent=short(s.name);g.append(label);
   chart.append(g);
  });
  const ay=y(v.average);
  chart.append(svg('line',{x1:4,x2:W-4,y1:ay,y2:ay,class:'average'}));
  box.append(chart);
  const legend=k.el('div','sprint-legend');
  const key=(cls,label)=>{const s=k.el('span');s.append(k.el('i',cls),label);return s;};
  legend.append(key('completed','сделано'),key('committed','взяли'),key('average','среднее'));
  box.append(legend);
  return box;
 }

 // Semicircle: carry-over and already planned, then the proposed scope, against the team's capacity.
 function gauge(k,days){
  const box=k.el('div','sprint-gauge');
  const L=Math.PI*56,arc='M14 70 A56 56 0 0 1 126 70';
  const chart=svg('svg',{viewBox:'0 0 140 78',class:'sprint-gauge-chart','aria-hidden':'true'});
  const track=svg('path',{d:arc,class:'track'}),base=svg('path',{d:arc,class:'base'}),add=svg('path',{d:arc,class:'add'}),tick=svg('line',{class:'tick'});
  chart.append(track,base,add,tick);
  const value=k.el('div','sprint-gauge-value'),label=k.el('div','sprint-gauge-label'),parts=k.el('div','sprint-gauge-parts');
  box.append(chart,value,label,parts);
  function paint({capacity,committed,proposed,mode}){
   const total=committed+proposed,max=Math.max(capacity,total,1);
   base.setAttribute('stroke-dasharray',(L*committed/max)+' '+L);
   add.setAttribute('stroke-dasharray',(L*proposed/max)+' '+L);add.setAttribute('stroke-dashoffset',String(-L*committed/max));
   const a=Math.PI*(1-capacity/max),cx=70,cy=70;
   tick.setAttribute('x1',cx+48*Math.cos(a));tick.setAttribute('y1',cy-48*Math.sin(a));tick.setAttribute('x2',cx+64*Math.cos(a));tick.setAttribute('y2',cy-64*Math.sin(a));
   box.classList.toggle('over',total>capacity+0.05);
   value.textContent=num(total)+' / '+num(capacity);
   label.textContent=unit(mode,capacity)+' · '+(total>capacity+0.05?'перебор '+num(r1(total-capacity)):'свободно '+num(r1(capacity-total)))+(days?' · '+days+' '+plural(days,['рабочий день','рабочих дня','рабочих дней']):'');
   parts.replaceChildren();
   const key=(cls,text)=>{const s=k.el('span');s.append(k.el('i',cls),text);return s;};
   parts.append(key('base','перенос и в спринте '+num(committed)),key('add','новое '+num(proposed)));
  }
  return {box,paint};
 }

 function lanes(k,c){
  const box=k.el('div','sprint-lanes');
  const rows=new Map();
  for(const p of c.people){
   const row=k.el('div','sprint-lane');row.dataset.person=p.jiraId;
   const who=k.el('div','sprint-who');who.append(k.avatar(p.name,{size:22}));
   const name=raw(k.el('span','sprint-name',p.name));who.append(name);
   const bar=k.el('div','sprint-track');
   const segs={carry:k.el('span','seg carry'),planned:k.el('span','seg planned'),proposed:k.el('span','seg proposed')};
   const mark=k.el('span','sprint-cap');
   bar.append(segs.carry,segs.planned,segs.proposed,mark);
   const figure=k.el('span','sprint-figure');
   const chips=k.el('span','sprint-lane-chips');
   if(p.absent){const off=k.chip({label:'−'+p.absent+' '+plural(p.absent,['день','дня','дней']),tone:'progress',title:'Отсутствует в спринте: '+p.absent+' из '+p.days+' рабочих дней'});chips.append(off);}
   const over=k.chip({label:'перегруз',tone:'alert',title:'Нагрузка больше ёмкости'});over.classList.add('sprint-over');chips.append(over);
   row.append(who,bar,figure,chips);box.append(row);rows.set(p.jiraId,{p,segs,mark,figure,row,over});
  }
  function paint(load,mode){
   const scale=Math.max(1,...[...rows.values()].map(r=>Math.max(r.p.capacity,load(r.p).total)))*1.08;
   for(const r of rows.values()){
    const l=load(r.p);
    for(const part of ['carry','planned','proposed'])r.segs[part].style.width=(100*l[part]/scale)+'%';
    r.mark.style.left=(100*r.p.capacity/scale)+'%';
    r.figure.textContent=num(l.total)+' / '+num(r.p.capacity)+' '+unit(mode,r.p.capacity);
    const over=l.total>r.p.capacity+0.05;r.row.classList.toggle('over',over);r.over.hidden=!over;
    r.row.title=r.p.name+': перенос '+num(l.carry)+', уже в спринте '+num(l.planned)+', новое '+num(l.proposed)+', ёмкость '+num(r.p.capacity);
   }
   return [...rows.values()].filter(r=>!r.row.hidden&&r.row.classList.contains('over')).map(r=>r.p.name);
  }
  return {box,paint};
 }

 function absenceRow(k,c,onRemoved){
  const box=k.el('div','sprint-absences');
  box.append(k.el('span','sprint-muted','Отсутствуют:'));
  for(const a of c.absences){
   const chip=k.el('span','sprint-absence');
   chip.append(raw(k.el('span',null,a.name)),k.el('span','sprint-muted',' '+(a.from===a.to?day(a.from):day(a.from)+'–'+day(a.to))));
   chip.title=(a.source==='calendar'?'Из календаря':'Отмечено в чате')+(a.title?': '+a.title:'');
   chip.append(k.el('span','sprint-source',a.source==='calendar'?'календарь':'заметка'));
   if(a.source==='note'&&a.id&&window.deleteButton){
    const del=window.deleteButton('Удалить отметку об отсутствии',async e=>{e.stopPropagation();del.disabled=true;try{const r=await window.petya.feature('sprintPlanning','removeAbsence',c.project,a.id);chip.remove();k.toast(r?.text||'Отметка удалена');onRemoved?.();}catch(err){del.disabled=false;k.toast(err.message,{error:true});}});
    chip.append(del);
   }
   box.append(chip);
  }
  return box;
 }

 const REASON={unestimated:'не оценена','no-room':'не влезает','person-full':'нет ёмкости'};
 function issueRow(k,c,item,onToggle){
  const row=k.el('label','sprint-issue'+(item.include?' on':''));row.dataset.key=item.key;
  const box=k.el('input');box.type='checkbox';box.checked=!!item.include;
  const fixed=item.estimate==null;box.disabled=fixed;
  box.setAttribute('aria-label',(item.include?'Убрать из плана ':'Добавить в план ')+item.key);
  box.onchange=()=>{item.include=box.checked;row.classList.toggle('on',box.checked);onToggle();};
  const key=raw(k.el('a','sprint-key',item.key));const safe=k.safeUrl(item.url);if(safe){key.href=safe;key.target='_blank';key.rel='noopener';}
  key.onclick=e=>e.stopPropagation();
  const title=raw(k.el('span','sprint-summary',item.summary||item.key));title.title=item.summary||'';
  const est=k.el('span','sprint-est',item.estimate==null?'—':num(item.estimate));est.title=item.estimate==null?'Нет оценки':c.estimation.label;
  const who=k.el('span','sprint-assignee');
  const name=item.assignee||item.proposed||'';
  if(name){who.append(k.avatar(name,{size:18}));const n=raw(k.el('span',null,name));who.append(n);if(!item.assignee&&item.proposed){who.classList.add('proposed');who.title='Предложено: у этого человека больше всего свободной ёмкости';who.prepend(k.el('span','sprint-arrow','→'));}}
  else who.append(k.el('span','sprint-muted','не назначена'));
  const note=k.el('span','sprint-reason',item.include?'':REASON[item.reason]||'');if(item.reason==='person-full'&&item.person)note.title='У '+item.person+' нет свободной ёмкости';
  row.append(box,key,title,note,who,est);
  return row;
 }
 function list(k,title,items,mode){
  const d=k.el('details','sprint-list');const total=items.reduce((n,i)=>n+(i.estimate||0),0);
  const s=k.el('summary');s.append(k.el('span',null,title),k.el('span','sprint-muted',' · '+items.length+' · '+num(total)+' '+unit(mode,total)));d.append(s);
  for(const i of items){const r=k.el('div','sprint-issue static');const a=raw(k.el('a','sprint-key',i.key));const u=k.safeUrl(i.url);if(u){a.href=u;a.target='_blank';a.rel='noopener';}
   r.append(a,raw(k.el('span','sprint-summary',i.summary)),raw(k.el('span','sprint-status',i.status||'')),raw(k.el('span','sprint-assignee',i.assignee||'')),k.el('span','sprint-est',i.estimate==null?'—':num(i.estimate)));d.append(r);}
  return d;
 }

 window.renderSprintPlan=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.velocity||parent.querySelector('.sprint-card'))return;
  const mode=c.estimation?.mode||'points';
  const items=(c.proposal||[]).map(p=>({...p}));
  const base=[...(c.carryOver||[]),...(c.planned||[])];
  const body=k.el('div','sprint-body');
  const top=k.el('div','sprint-top');
  const g=gauge(k,c.next.workdays);
  const cap=k.el('div','sprint-capacity');
  const capHead=k.el('div','sprint-panel-head');capHead.append(k.el('span',null,'Ёмкость спринта'));
  cap.append(capHead,g.box);
  top.append(velocityChart(k,c),cap);body.append(top);
  if(c.absences?.length)body.append(absenceRow(k,c));
  const people=lanes(k,c);
  if(c.people?.length){const h=k.el('div','sprint-panel-head');const legend=k.el('span','sprint-legend');const key=(cls,label)=>{const s=k.el('span');s.append(k.el('i',cls),label);return s;};legend.append(key('carry','перенос'),key('planned','уже в спринте'),key('proposed','новое'),key('cap','ёмкость'));h.append(k.el('span',null,'Люди'),legend);body.append(h,people.box);}
  const listBox=k.el('div','sprint-proposal');
  const count=k.el('span','sprint-muted');
  const head=k.el('div','sprint-panel-head');head.append(k.el('span',null,'Предлагаю взять из бэклога'),count);
  listBox.append(head);
  const status=k.el('span');
  let overNames=[];
  const recompute=()=>{
   const chosen=items.filter(i=>i.include);
   const proposed=r1(chosen.reduce((n,i)=>n+(i.estimate||0),0));
   const committed=r1(base.reduce((n,i)=>n+(i.estimate||0),0));
   g.paint({capacity:c.capacity.team,committed,proposed,mode});
   const sum=(rows,p)=>r1(rows.filter(i=>i.assigneeId===p.jiraId||(!i.assigneeId&&i.proposedId===p.jiraId)).reduce((n,i)=>n+(i.estimate||0),0));
   overNames=people.paint(p=>{const carry=sum(c.carryOver||[],p),planned=sum(c.planned||[],p),add=sum(chosen,p);return {carry,planned,proposed:add,total:r1(carry+planned+add)};},mode);
   count.textContent=chosen.length+' '+plural(chosen.length,['задача','задачи','задач'])+' · '+num(proposed)+' '+unit(mode,proposed);
   const over=committed+proposed>c.capacity.team+0.05;
   status.replaceChildren(k.chip(over?{label:'перебор',tone:'alert',title:'Больше ёмкости команды'}:overNames.length?{label:'перегружены: '+overNames.length,tone:'alert',title:overNames.join(', ')}:{label:'влезает',tone:'done',title:'Объём в пределах ёмкости'}));
   status.dataset.state=over?'over':overNames.length?'people':'fits';
  };
  if(items.length)for(const i of items)listBox.append(issueRow(k,c,i,recompute));
  else listBox.append(k.el('p','sprint-empty','В бэклоге нет оценённых задач, которые влезают.'));
  body.append(listBox);
  if(c.carryOver?.length)body.append(list(k,'Перенос из «'+(c.active?.name||'текущего спринта')+'»',c.carryOver,mode));
  if(c.planned?.length)body.append(list(k,'Уже в «'+c.next.name+'»',c.planned,mode));
  if(c.rationale?.length){const r=k.el('div','sprint-rationale');r.title='Вывод локальной модели по расчёту';for(const line of c.rationale)r.append(raw(k.el('p',null,line)));body.append(r);}
  if(c.warnings?.length){const w=k.el('ul','sprint-warnings');for(const line of c.warnings)w.append(k.el('li',null,line));body.append(w);}
  recompute();
  for(const n of body.querySelectorAll('.sprint-velocity-chart text.label'))raw(n);
  const chosen=()=>items.filter(i=>i.include);
  const request=()=>'Перенеси в спринт «'+c.next.name+'» (доска '+c.board.id+', '+c.project+'): '+chosen().map(i=>i.key+(!i.assigneeId&&i.proposed?' → '+i.proposed:'')).join('; ');
  const planText=()=>{
   const rows=chosen(),proposed=r1(rows.reduce((n,i)=>n+(i.estimate||0),0)),committed=r1(base.reduce((n,i)=>n+(i.estimate||0),0));
   return 'План спринта «'+c.next.name+'» ('+c.project+'): ёмкость '+num(c.capacity.team)+' '+unit(mode,c.capacity.team)+', перенос и уже в спринте '+num(committed)+', новое '+num(proposed)+'. '+
    (rows.length?'Берём: '+rows.map(i=>i.key+' '+i.summary+' ('+(i.estimate==null?'—':num(i.estimate))+(i.assignee||i.proposed?', '+(i.assignee||i.proposed):'')+')').join('; ')+'.':'Новых задач не берём.')+
    (overNames.length?' Перегружены: '+overNames.join(', ')+'.':'')+' '+c.board.url;
  };
  const actions=[
   {label:'Перенести в Jira…',primary:true,title:c.next.exists?'Подготовить перенос — Петя покажет изменения и спросит подтверждение':'Сначала создайте следующий спринт в Jira',run:async()=>{
    if(!c.next.exists)throw Error('Следующий спринт в Jira ещё не создан — переносить некуда.');
    if(!chosen().length)throw Error('Отметьте задачи для переноса.');
    await k.ask(request(),{send:true});
   }},
   k.links('share-message',()=>({text:planText()}),{label:'Отправить план в Slack'}),
   k.links('spreadsheet-export',()=>({title:'План спринта «'+c.next.name+'» · '+c.project,sheet:c.next.name,app:'Планирование спринта',header:['Задача','Название','Оценка','Исполнитель','Статус','Откуда'],
    rows:[...(c.carryOver||[]).map(i=>[i.key,i.summary,i.estimate??'',i.assignee||'',i.status||'','перенос']),...(c.planned||[]).map(i=>[i.key,i.summary,i.estimate??'',i.assignee||'',i.status||'','уже в спринте']),...chosen().map(i=>[i.key,i.summary,i.estimate??'',i.assignee||i.proposed||'',i.status||'','новое'])]}),{label:'Выгрузить в Google Таблицы'}),
   {label:'Пересчитать',run:()=>k.ask('Спланируй спринт',{send:true})}
  ];
  const subtitle=c.next.name+' · '+date(c.next.start)+' – '+date(c.next.end);
  const card=k.card({app:'Jira',initial:'J',color:'#2f5fb3',key:c.project+' · '+c.board.name,href:c.board.url,status,subtitle,body,actions,className:'sprint-card'});
  const keyNode=card.querySelector('.kit-key');if(keyNode)raw(keyNode);
  const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  parent.append(card);
 };
})();
