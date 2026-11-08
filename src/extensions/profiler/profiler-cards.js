// «Профайлер», renderer: the frame budget bar stacked by the top main-thread markers, the spikes timeline (one bar per
// frame or bucket, budget line, spikes and GC marked), ranked markers per thread, GC and memory, the before/after diff
// with ▲▼, explanations of the markers, and actions: «Что оптимизировать?», hand-off to a coding app (k.links
// code-fix) and a live FrameTimingManager reading from the Unity Editor app when it is added.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('profiler-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('profilerApp',method,...args);
 const loc=()=>window.petyaLocale||'ru-RU';
 const ms=n=>n===null||n===undefined||!Number.isFinite(+n)?'—':(+n).toLocaleString(loc(),{maximumFractionDigits:+n<10?2:1});
 const pct=n=>Math.round(n).toLocaleString(loc())+'%';
 const size=b=>{if(!Number.isFinite(b))return '—';const u=['Б','КБ','МБ','ГБ'];let i=0,v=b;while(v>=1024&&i<3){v/=1024;i++;}return v.toLocaleString(loc(),{maximumFractionDigits:v<10&&i?1:0})+' '+u[i];};
 const COLORS=['#7fb0e0','#c9a0dc','#9fd3b5','#e5ce8c','#e8a07a'];
 const GROUPS=[['main','Основной поток'],['render','Рендер'],['jobs','Jobs / воркеры'],['other','Другие потоки']];
 const SVG='http://www.w3.org/2000/svg';
 const svg=(tag,attrs)=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,v);return n;};
 const data=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};

 // Stacked budget bar: segments, «прочее», free room or the overflow past the budget line.
 function budgetBar(k,c,budget){
  const box=k.el('div','prof-budget');
  const frame=c.frame.ms;
  if(!Number.isFinite(frame))return null;
  const scale=Math.max(frame,budget)*1.04;
  const bar=k.el('div','prof-bar');bar.setAttribute('role','img');
  const legend=k.el('ul','prof-legend');
  const parts=c.bar.parts||[];
  parts.forEach((p,i)=>{
   const seg=k.el('span','prof-seg'+(p.wait?' wait':''));seg.style.width=(p.ms/scale*100)+'%';seg.style.background=COLORS[i%COLORS.length];seg.title=p.name+' · '+ms(p.ms)+' мс';bar.append(seg);
   const li=k.el('li');const dot=k.el('i');dot.style.background=COLORS[i%COLORS.length];li.append(dot,data(k,'span','prof-legend-name',p.name),k.el('b',null,ms(p.ms)+' мс · '+pct(p.ms/budget*100)));legend.append(li);
  });
  const rest=Math.max(0,frame-parts.reduce((a,p)=>a+p.ms,0));
  if(rest>0.05){const seg=k.el('span','prof-seg rest');seg.style.width=(rest/scale*100)+'%';seg.title='Прочее · '+ms(rest)+' мс';bar.append(seg);
   const li=k.el('li','muted');li.append(k.el('i','rest'),k.el('span','prof-legend-name','Прочее'),k.el('b',null,ms(rest)+' мс'));legend.append(li);}
  if(frame<budget){const free=k.el('span','prof-seg free');free.style.width=((budget-frame)/scale*100)+'%';free.title='Запас · '+ms(budget-frame)+' мс';bar.append(free);}
  const line=k.el('span','prof-line');line.style.left=(budget/scale*100)+'%';line.title='Бюджет '+ms(budget)+' мс';bar.append(line);
  bar.setAttribute('aria-label','Кадр '+ms(frame)+' мс при бюджете '+ms(budget)+' мс');
  const head=k.el('div','prof-bar-head');
  head.append(k.el('span',null,'Кадр '+ms(frame)+' мс'),k.el('span',frame>budget?'over':'ok',frame>budget?'+'+ms(frame-budget)+' мс сверх бюджета':'запас '+ms(budget-frame)+' мс'),k.el('span','muted','бюджет '+ms(budget)+' мс'));
  box.append(head,bar,legend);
  if(c.bar.approx&&parts.length)box.append(k.el('small','kit-meta','Маркеры без иерархии: части выбраны по времени и могут включать друг друга.'));
  return box;
 }
 // Frame timeline: bars over the budget line; spikes in the alert tone, frames with GC allocations marked below.
 function timeline(k,points,budget,limit,label){
  if(!points?.length)return null;
  const W=572,H=74,max=Math.max(budget*1.6,...points.map(p=>p.ms)),bw=W/points.length;
  const box=k.el('figure','prof-timeline');
  const root=svg('svg',{viewBox:'0 0 '+W+' '+(H+8),width:'100%',height:H+8,preserveAspectRatio:'none',role:'img','aria-label':label+': '+points.length+' точек, максимум '+ms(Math.max(...points.map(p=>p.ms)))+' мс'});
  points.forEach((p,i)=>{
   const h=Math.max(1,p.ms/max*H),bad=limit&&p.ms>limit,over=p.ms>budget;
   const r=svg('rect',{x:(i*bw).toFixed(2),y:(H-h).toFixed(2),width:Math.max(0.6,bw-0.4).toFixed(2),height:h.toFixed(2),class:bad?'spike':over?'over':'ok'});
   const t=svg('title');t.textContent='Кадр '+p.i+': '+ms(p.ms)+' мс'+(p.gc?' · GC '+size(p.gc):'');r.append(t);root.append(r);
   if(p.gc&&bad)root.append(svg('circle',{cx:(i*bw+bw/2).toFixed(2),cy:H+4,r:2,class:'gc'}));
  });
  const y=H-budget/max*H;root.append(svg('line',{x1:0,x2:W,y1:y.toFixed(2),y2:y.toFixed(2),class:'budget'}));
  box.append(k.el('figcaption',null,label),root);
  return box;
 }
 function ranked(k,c,budget,state){
  const present=GROUPS.filter(([g])=>c.groups[g]?.length);if(!present.length)return null;
  const box=k.el('div','prof-ranked');
  if(!present.some(([g])=>g===state.group))state.group=present[0][0];
  if(present.length>1){
   const tabs=k.el('div','prof-tabs');tabs.setAttribute('role','tablist');
   for(const [g,label] of present){const b=k.el('button',null,label+' · '+c.groups[g].length);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(g===state.group));b.onclick=e=>{e.stopPropagation();state.group=g;state.paint();};tabs.append(b);}
   box.append(tabs);
  }
  const rows=c.groups[state.group];
  const most=Math.max(...rows.map(r=>r.median||0),budget*0.25);
  const cols=[
   {label:'Маркер',value:r=>{const n=data(k,'span','prof-name',r.name);n.title=r.name+(r.thread?' · '+r.thread:'');return n;}},
   {label:c.perCall?'Среднее, мс':'Медиана, мс',value:r=>{const cell=k.el('span','prof-cell');const b=k.el('i','prof-mini');b.style.width=Math.min(100,(r.median||0)/most*100)+'%';cell.append(b,k.el('span',null,ms(r.median)));return cell;}},
   {label:'Макс, мс',value:r=>ms(r.max)},
   {label:'Вызовов',value:r=>r.count===null?'—':(+r.count).toLocaleString(loc(),{maximumFractionDigits:1})+(r.perFrame?'/кадр':'')}
  ];
  if(!c.perCall)cols.push({label:'% бюджета',value:r=>{const s=r.median/budget*100;return k.el('span',s>=25?'prof-share hot':'prof-share',pct(s));}});
  box.append(k.table(cols,rows));
  return box;
 }
 function diffTable(k,d){
  const cols=[
   {label:'Маркер',value:r=>data(k,'span','prof-name',r.name)},
   {label:'До, мс',value:r=>r.before===null?'—':ms(r.before)},
   {label:'После, мс',value:r=>r.after===null?'—':ms(r.after)},
   {label:'Δ',value:r=>{const up=r.delta>0,node=k.el('span','prof-delta '+r.kind,(r.kind==='same'?'≈ ':up?'▲ +':'▼ ')+ms(r.delta)+' мс'+(r.pct!==null&&r.kind!=='same'?' ('+(up?'+':'')+r.pct+'%)':''));
    if(r.added)node.append(k.el('small',null,' новый'));if(r.removed)node.append(k.el('small',null,' пропал'));return node;}}
  ];
  const changed=d.rows.filter(r=>r.kind!=='same'),same=d.rows.filter(r=>r.kind==='same');
  const box=k.el('div','prof-diff');box.append(k.table(cols,changed.length?changed:same.slice(0,5)));
  if(changed.length&&same.length)box.append(k.el('p','prof-same','Без заметных изменений (меньше 0,1 мс или 10%): '+same.length+' '+(same.length%10===1&&same.length%100!==11?'маркер':[2,3,4].includes(same.length%10)&&![12,13,14].includes(same.length%100)?'маркера':'маркеров')));
  return box;
 }
 function gcBlock(k,c){
  const g=c.gc;if(!g||(!g.allocs.length&&!g.collect&&g.frameMedian===null))return null;
  const box=k.el('div','prof-gc');box.append(k.el('h5',null,'Сборка мусора и аллокации'));
  const facts=[];
  if(g.collect)facts.push('GC.Collect: до '+ms(g.collect.max)+' мс');
  if(g.frameMedian!==null)facts.push('аллокаций в кадре (медиана): '+size(g.frameMedian));
  if(g.allocCalls!==null)facts.push('вызовов GC.Alloc в кадре: '+(+g.allocCalls).toLocaleString(loc()));
  if(facts.length)box.append(k.el('p','prof-facts',facts.join(' · ')));
  if(g.allocs.length){const ul=k.el('ul','prof-allocs');for(const a of g.allocs){const li=k.el('li');li.append(data(k,'span','prof-name',a.name),k.el('b',null,size(a.bytes)+'/кадр'));ul.append(li);}box.append(ul);}
  return box;
 }
 function memoryBlock(k,c){
  if(!c.memory?.length)return null;
  const box=k.el('div','prof-memory');box.append(k.el('h5',null,'Память'+(c.memoryTotal?' · всего '+size(c.memoryTotal):'')));
  const most=c.memory[0].bytes;
  for(const m of c.memory){const row=k.el('div','prof-mem-row');const b=k.el('i');b.style.width=(m.bytes/most*100)+'%';const bar=k.el('span','prof-mem-bar');bar.append(b);row.append(data(k,'span','prof-name',m.name),bar,k.el('b',null,size(m.bytes)));box.append(row);}
  return box;
 }
 function spikesBlock(k,c){
  if(!c.spikes?.length)return null;
  const box=k.el('div','prof-spikes');box.append(k.el('h5',null,'Пики (выше '+ms(c.spikeLimit)+' мс)'));
  const ul=k.el('ul');
  for(const s of c.spikes.slice(0,5)){const li=k.el('li');li.append(k.el('span',null,'кадр '+s.i),k.el('b',null,ms(s.ms)+' мс'),k.el('span','muted',s.gc?'GC '+size(s.gc):''));ul.append(li);}
  box.append(ul);return box;
 }
 function explainBlock(k,c){
  if(!c.explain?.length)return null;
  const box=k.el('div','prof-explain');box.append(k.el('h5',null,c.explainedBy==='model'?'Что это значит (локальная модель)':'Что это значит (справка по типичным маркерам)'));
  if(c.summary)box.append(data(k,'p','prof-summary',c.summary));
  const ul=k.el('ul');for(const x of c.explain){const li=k.el('li');li.append(data(k,'b',null,x.fact),data(k,'span',null,' — '+x.why));ul.append(li);}box.append(ul);return box;
 }
 function liveBlock(k,live,budget){
  const box=k.el('div','prof-live');box.append(k.el('h5',null,'Живой замер Unity (FrameTimingManager)'));
  if(live.frame!==null)box.append(k.el('p','prof-facts','Кадр CPU: '+ms(live.frame)+' мс · бюджет '+ms(budget)+' мс'));
  const most=Math.max(budget,...live.parts.map(p=>p.ms));
  for(const p of live.parts){const row=k.el('div','prof-mem-row');const b=k.el('i');b.style.width=(p.ms/most*100)+'%';if(p.ms>budget)b.className='over';const bar=k.el('span','prof-mem-bar');bar.append(b);row.append(k.el('span','prof-name',p.label),bar,k.el('b',null,ms(p.ms)+' мс'));box.append(row);}
  return box;
 }
 function fixText(c){
  const files=c.hints?.files?.length?' Возможные файлы: '+c.hints.files.join(', ')+'.':c.hints?.classes?.length?' Классы из маркеров: '+c.hints.classes.join(', ')+'.':'';
  if(c.mode==='diff'){const worse=c.rows.filter(r=>r.kind==='worse').slice(0,5);
   return 'Как программист, найди и исправь регрессию производительности по данным профайлера (бюджет кадра '+ms(c.budget)+' мс, '+c.fps+' fps): '+worse.map(r=>r.name+' '+(r.before===null?'новый':ms(r.before)+' мс')+' → '+ms(r.after)+' мс').join('; ')+'.'+files;}
  const top=(c.groups.main||c.groups.render||[]).slice(0,4);
  return 'Как программист, оптимизируй в коде проекта самые тяжёлые места кадра по данным профайлера (бюджет '+ms(c.budget)+' мс, '+c.fps+' fps): '+top.map(m=>m.name+' '+ms(m.median)+' мс ('+pct(m.median/c.budget*100)+' бюджета)').join('; ')+'.'+(c.gc?.collect?' Есть GC.Collect до '+ms(c.gc.collect.max)+' мс.':'')+files;
 }

 window.renderProfiler=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.prof-card'))return;
  const state={fps:c.fps||60,group:'main',live:null,paint:null};
  const slot=k.el('div','prof-slot');parent.append(slot);
  state.paint=()=>{
   const budget=1000/state.fps,body=k.el('div','prof-body');
   if(c.mode==='diff'){
    if(c.frame.before!==null&&c.frame.after!==null){const p=k.el('p','prof-facts');p.append(k.el('span',null,'Кадр: '+ms(c.frame.before)+' → '+ms(c.frame.after)+' мс '),k.el('b',c.frame.delta>0.1?'prof-delta worse':c.frame.delta<-0.1?'prof-delta better':'prof-delta same',c.frame.delta>0?'▲ +'+ms(c.frame.delta)+' мс':c.frame.delta<0?'▼ '+ms(c.frame.delta)+' мс':'≈'));body.append(p);}
    const names=k.el('p','prof-files');names.append(k.el('span',null,'До: '),data(k,'span',null,c.names[0]),k.el('span',null,' · После: '),data(k,'span',null,c.names[1]));body.append(names);
    const t0=timeline(k,c.timelines?.[0],budget,0,'До'),t1=timeline(k,c.timelines?.[1],budget,0,'После');if(t0)body.append(t0);if(t1)body.append(t1);
    body.append(c.rows.length?diffTable(k,c):k.el('p','kit-meta','Общих маркеров не нашлось.'));
   }else{
    const facts=[];
    if(c.frame.ms!==null)facts.push('Кадр '+ms(c.frame.ms)+' мс'+(c.frame.fps?' (~'+c.frame.fps+' fps)':''));
    if(c.frame.p95!==null)facts.push('p95 '+ms(c.frame.p95)+' мс');
    if(c.frame.count)facts.push('над бюджетом '+c.frame.over+' из '+c.frame.count+' кадров');
    if(c.meta?.janky!==undefined&&c.meta?.total)facts.push('janky '+c.meta.janky+' из '+c.meta.total);
    if(facts.length)body.append(k.el('p','prof-facts',facts.join(' · ')));
    const bar=budgetBar(k,c,budget);if(bar)body.append(bar);
    const t=timeline(k,c.timeline,budget,c.spikeLimit,'Время кадров');if(t)body.append(t);
    const r=ranked(k,c,budget,state);if(r)body.append(r);
    const sp=spikesBlock(k,c);if(sp)body.append(sp);
    const g=gcBlock(k,c);if(g)body.append(g);
    const m=memoryBlock(k,c);if(m)body.append(m);
   }
   const e=explainBlock(k,c);if(e)body.append(e);
   if(state.live)body.append(liveBlock(k,state.live,budget));
   for(const n of c.notes||[])body.append(k.el('p','prof-note',n));
   let status=null;
   if(c.mode==='diff')status=c.worse?{label:'регрессий: '+c.worse,tone:'alert'}:{label:'без регрессий',tone:'done'};
   else if(c.frame.ms!==null&&!c.perCall)status=c.frame.ms>budget?{label:'над бюджетом',tone:'alert'}:{label:'в бюджете',tone:'done'};
   const fpsChip={label:state.fps+' fps',title:'Целевая частота кадров',menu:async()=>[30,60,120].map(v=>({label:v+' fps',value:v,current:v===state.fps})),
    pick:async o=>{state.fps=o.value;state.paint();try{await call('setFps',o.value);}catch{/* the card still shows it */}}};
   const actions=[{label:'Что оптимизировать?',primary:true,run:()=>k.ask('Что оптимизировать по этому профайлу?',{send:true})},
    k.links('code-fix',()=>({text:fixText({...c,fps:state.fps,budget})}),{title:'Передать маркеры и подсказки по файлам — изменения только после вашего подтверждения'})];
   if(c.unity)actions.push({label:'Снять тайминги в Unity',title:'Один замер FrameTimingManager через «Unity Editor» (с подтверждением)',run:async()=>{state.live=await call('unityTiming');state.paint();}});
   const node=k.card({app:'Профайлер',initial:'ms',color:'#55688c',key:c.mode==='diff'?'Сравнение захватов':c.name,status,chips:[fpsChip],body,actions,className:'prof-card'});
   node.dataset.mode=c.mode;
   const keyNode=node.querySelector('.kit-key');if(keyNode&&c.mode!=='diff')keyNode.dataset.noI18n='';
   slot.replaceChildren(node);
  };
  state.paint();
 };
})();
