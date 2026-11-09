// «Симуляция баланса», renderer: the economy found in the configs (rewards, prices, XP curve with files and lines),
// the loop the user confirms (actions per day, win rate, players, days, spending, how the XP table is read), then
// percentile bands per day for the level and each currency, milestones as percentiles over players and a before /
// after of a «what if». «Запустить симуляцию» calls ipc `run` with the card id and the loop; the economy stays in the
// main process. Charts are inline SVG built node by node.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('sim-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(n,d=0)=>n===null||n===undefined?'—':Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const english=()=>!!window.petyaLanguage&&window.petyaLanguage!=='ru';
 const plural=(n,[a,b,c])=>{if(english())return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('balanceSim',method,...args);
 const tt=v=>window.t?window.t(v):v;
 const NAMES={gold:'золото',coin:'монеты',gem:'кристаллы',crystal:'кристаллы',diamond:'алмазы',soft:'софт-валюта',hard:'хард-валюта',xp:'опыт',energy:'энергия',token:'жетоны',ticket:'билеты',key:'ключи',star:'звёзды',silver:'серебро',ruby:'рубины',money:'деньги',cash:'деньги'};
 const nameOf=r=>NAMES[r]?tt(NAMES[r]):r;
 const TRIGGER={win:'за победу',loss:'за поражение',action:'за бой',daily:'в день'};
 const where=x=>x.file?x.file.split('/').pop()+(x.line?':'+x.line:''):'';
 const SVG='http://www.w3.org/2000/svg';
 const svg=(tag,attrs={})=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};

 // Percentile bands over days: p10–p90 and p25–p75 areas, the median line; a variant drawn on top.
 function chart(k,series,{label,variant,unit=''}){
  const W=580,H=170,L=46,R=10,T=10,B=24;
  const all=[...series,...(variant||[])];
  // Round axis steps (1, 2, 2.5, 5 × 10ⁿ) up to the top of the widest band.
  const top=Math.max(1,...all.map(b=>b.p90)),min=Math.min(0,...all.map(b=>b.p10));
  const raw0=(top-min)/4,mag=10**Math.floor(Math.log10(raw0)),step=[1,2,2.5,5,10].map(m=>m*mag).find(v=>v>=raw0)||10*mag;
  const lines=Math.ceil((top-min)/step),max=min+lines*step;
  const n=series.length;
  const x=i=>L+(n<=1?0:i/(n-1))*(W-L-R),y=v=>T+(1-(v-min)/(max-min||1))*(H-T-B);
  const root=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'sim-chart',role:'img'});
  root.setAttribute('aria-label',label);
  // Grid: 4 horizontal lines with values.
  for(let g=0;g<=lines;g++){const v=min+step*g,yy=y(v);root.append(svg('line',{x1:L,x2:W-R,y1:yy,y2:yy,class:'sim-grid'}));const t=svg('text',{x:L-6,y:yy+3,class:'sim-axis','text-anchor':'end'});t.textContent=fmt(v,step<1?1:0)+unit;root.append(t);}
  const ticks=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i);
  for(const i of ticks){const t=svg('text',{x:x(i),y:H-6,class:'sim-axis','text-anchor':i===0?'start':i===n-1?'end':'middle'});t.textContent=(english()?'day ':'день ')+(i+1);root.append(t);}
  const area=(list,lo,hi,cls)=>{const top=list.map((b,i)=>x(i)+','+y(b[hi])).join(' '),bottom=list.map((b,i)=>x(i)+','+y(b[lo])).reverse().join(' ');root.append(svg('polygon',{points:top+' '+bottom,class:cls}));};
  const line=(list,cls)=>root.append(svg('polyline',{points:list.map((b,i)=>x(i)+','+y(b.p50)).join(' '),class:cls}));
  if(variant){area(series,'p10','p90','sim-band-base');line(series,'sim-median-base');area(variant,'p10','p90','sim-band-outer');area(variant,'p25','p75','sim-band-inner');line(variant,'sim-median');}
  else{area(series,'p10','p90','sim-band-outer');area(series,'p25','p75','sim-band-inner');line(series,'sim-median');}
  return root;
 }
 function legend(k,variant){
  const box=k.el('div','sim-legend');
  const item=(cls,text)=>{const s=k.el('span','sim-key');s.append(k.el('i',cls),k.el('span',null,text));box.append(s);};
  item('k-median','медиана');item('k-inner','25–75%');item('k-outer','10–90%');
  if(variant)item('k-base','до изменения');
  return box;
 }

 function economyBlock(k,c,state){
  const e=c.economy,box=k.el('div','sim-economy');
  const src=k.el('div','sim-sources');src.append(k.el('div','sim-section','Награды'));
  for(const x of e.sources.slice(0,12)){
   const row=k.el('div','sim-src');row.dataset.trigger=x.trigger;
   const changed=c.change?.ids?.includes(x.id);if(changed)row.classList.add('changed');
   row.append(raw(k.el('span','sim-field',x.label+(x.object?' · '+x.object:''))),k.el('span','sim-trig',TRIGGER[x.trigger]||x.trigger));
   const amt=raw(k.el('span','sim-amt','+'+fmt(x.amount,1)+' '+nameOf(x.resource)));
   if(changed)amt.append(raw(k.el('b','sim-new',' → '+fmt(c.change.op==='set'?c.change.value:x.amount*c.change.value,1))));
   row.append(amt,raw(k.el('span','sim-where',where(x))));src.append(row);
  }
  if(e.sources.length>12)src.append(k.el('p','sim-note',(english()?'and ':'и ещё ')+(e.sources.length-12)));
  box.append(src);
  if(e.sinks.length){
   const sk=k.el('div','sim-sinks');sk.append(k.el('div','sim-section','Траты'));
   const by={};for(const x of e.sinks)(by[x.resource]=by[x.resource]||[]).push(x);
   for(const [res,list] of Object.entries(by)){
    const earn=e.sources.some(x=>x.resource===res);
    const row=k.el('div','sim-sink-row');
    const head=k.el('div','sim-sink-head');head.append(raw(k.el('b',null,nameOf(res))),raw(k.el('span',null,list.length+' '+plural(list.length,['покупка','покупки','покупок'])+' · '+fmt(list[0].price)+(list.length>1?'–'+fmt(list[list.length-1].price):''))));
    if(!earn)head.append(k.el('span','sim-warn','бесплатно не заработать'));
    row.append(head);
    // Price ladder: one tick per item on a common scale.
    const ladder=k.el('div','sim-ladder'),max=Math.max(...list.map(x=>x.price));
    for(const x of list.slice(0,40)){const t=k.el('span','sim-tick'+(c.change?.ids?.includes(x.id)?' changed':''));t.style.left=(x.price/max*100).toFixed(2)+'%';t.title=x.label+': '+fmt(x.price)+' · '+where(x);ladder.append(t);}
    row.append(ladder);sk.append(row);
   }
   box.append(sk);
  }
  const cv=k.el('div','sim-curve');cv.append(k.el('div','sim-section','Кривая опыта'));
  if(e.curve){
   const p=k.el('div','sim-curve-row');
   p.append(raw(k.el('span','sim-field',e.curve.field)),raw(k.el('span','sim-where',where(e.curve))),raw(k.el('span',null,e.curve.levels+' '+plural(e.curve.levels,['значение','значения','значений']))));
   const sel=k.el('select','sim-curve-kind');sel.setAttribute('aria-label','Как читать таблицу опыта');
   for(const [v,l] of [['cumulative','опыт всего до уровня'],['per-level','опыт до следующего уровня']]){const o=k.el('option',null,l);o.value=v;if(state.params.curveKind===v)o.selected=true;sel.append(o);}
   sel.onchange=()=>{state.params.curveKind=sel.value;};
   p.append(sel);cv.append(p);
  }else cv.append(k.el('p','sim-note','Не нашлась — уровень не моделируется, только валюта.'));
  box.append(cv);
  if(e.notes?.some(n=>n.kind==='action-cost'))box.append(k.el('p','sim-note','Стоимость боя (энергия) не ограничивает число боёв: оно задаётся ниже.'));
  return box;
 }

 function loopForm(k,c,state){
  const box=k.el('div','sim-loop');box.append(k.el('div','sim-section','Модель цикла'));
  const grid=k.el('div','sim-form');
  const field=(key,label,{min,max,step,scale=1,from})=>{
   const lab=k.el('label','sim-input');lab.append(k.el('span',null,label));
   const input=k.el('input');input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(Math.round(state.params[key]*scale*1000)/1000);input.dataset.key=key;
   input.oninput=()=>{const v=Number(input.value);if(Number.isFinite(v))state.params[key]=v/scale;};
   lab.append(input);
   if(from){const f=from.kind==='config'?where(from):from.kind==='metrics'?from.source:'';const hint=k.el('small','sim-from',from.kind==='config'?'из конфига':from.kind==='metrics'?'из метрик':'предположение');if(f){hint.title=f;}lab.append(hint);}
   grid.append(lab);return input;
  };
  state.inputs={
   actionsPerDay:field('actionsPerDay','Боёв в день',{min:0,max:500,step:0.5,from:state.from.actionsPerDay}),
   winRate:field('winRate','Побед, %',{min:0,max:100,step:1,scale:100,from:state.from.winRate}),
   players:field('players','Игроков',{min:10,max:5000,step:100}),
   days:field('days','Дней',{min:1,max:365,step:1}),
   seed:field('seed','Seed',{min:1,max:2147483647,step:1})
  };
  const spend=k.el('label','sim-check');const cb=k.el('input');cb.type='checkbox';cb.checked=state.params.spend!==false;cb.onchange=()=>{state.params.spend=cb.checked;};spend.append(cb,k.el('span',null,'Тратит на покупки, как только хватает'));
  grid.append(spend);
  box.append(grid);
  if(c.calibration){const m=c.calibration;const p=k.el('p','sim-note');p.append(k.el('span',null,'Из метрик: '),raw(k.el('span',null,m.source+' · '+m.from+' – '+m.to+' · '+fmt(m.players)+' '+plural(m.players,['игрок','игрока','игроков'])+', '+fmt(m.battles)+' '+plural(m.battles,['бой','боя','боёв']))));box.append(p);}
  if(c.change){const p=k.el('p','sim-change');p.append(k.el('span',null,'Что если: '),raw(k.el('b',null,c.change.labels.join(', ')+' '+(c.change.op==='set'?'= '+fmt(c.change.value,2):'× '+fmt(c.change.value,2)))));box.append(p);}
  return box;
 }

 function results(k,c){
  const r=c.result.base,v=c.result.variant,box=k.el('div','sim-results');
  const main=c.economy.main;
  const tabs=[];if(r.level)tabs.push(['level','Уровень']);for(const res of Object.keys(r.currency))if(r.currency[res].some(b=>b.p90>0))tabs.push([res,nameOf(res)]);
  let current=tabs[0]?.[0];
  const chips=k.el('div','sim-tabs');chips.setAttribute('role','group');
  const holder=k.el('div','sim-chart-box');
  const paint=()=>{
   const isLevel=current==='level',series=isLevel?r.level:r.currency[current],vs=v?(isLevel?v.level:v.currency[current]):null;
   holder.replaceChildren(chart(k,series,{label:isLevel?'Уровень по дням':nameOf(current)+' по дням',variant:vs}),legend(k,!!vs));
   for(const b of chips.children)b.setAttribute('aria-pressed',String(b.dataset.tab===current));
  };
  for(const [id,label] of tabs){const b=k.chip({label,onClick:()=>{current=id;paint();}});b.dataset.tab=id;chips.append(b);}
  if(tabs.length>1)box.append(chips);
  box.append(holder);paint();
  // Milestones: percentiles of the day it is reached, before → after for a «what if».
  if(r.milestones.length){
   const t=k.el('table','sim-milestones');const head=k.el('tr');
   for(const h of ['Цель','10%','Медиана','90%','Дошли'])head.append(k.el('th',null,h));
   const thead=k.el('thead');thead.append(head);const tbody=k.el('tbody');
   r.milestones.forEach((m,i)=>{
    const tr=k.el('tr');tr.dataset.goal=m.label+(m.level?':'+m.level:'');
    const what=m.label==='level'?fmt(m.level)+' '+tt('уровень'):m.label==='earn'?fmt(m.amount)+' '+nameOf(m.resource):tt('все покупки')+' ('+m.count+')';
    tr.append(raw(k.el('td','goal',what)));
    const n=v?.milestones[i];
    const cell=(a,b)=>{const td=k.el('td','num');td.append(raw(k.el('span',null,a===null?'—':fmt(a)+' '+plural(a,['д.','д.','д.']))));if(n!==undefined&&b!==a){const d=raw(k.el('span','sim-after','→ '+(b===null?'—':fmt(b))));if(a!==null&&b!==null)d.classList.add(b<a?'better':'worse');td.append(d);}return td;};
    tr.append(cell(m.p10,n?.p10??null),cell(m.p50,n?.p50??null),cell(m.p90,n?.p90??null));
    const reach=k.el('td','num');const bar=k.el('span','sim-reach');const fill=k.el('span','sim-reach-fill');fill.style.width=Math.round(m.reached*100)+'%';bar.append(fill);reach.append(bar,raw(k.el('span',null,fmt(m.reached*100)+'%')));
    if(n&&n.reached!==m.reached)reach.append(raw(k.el('span','sim-after '+(n.reached>m.reached?'better':'worse'),'→ '+fmt(n.reached*100)+'%')));
    tr.append(reach);tbody.append(tr);
   });
   t.append(thead,tbody);box.append(t);
  }
  const foot=k.el('p','sim-note');
  foot.append(raw(k.el('span',null,fmt(r.players)+' '+plural(r.players,['игрок','игрока','игроков'])+' · '+r.days+' '+plural(r.days,['день','дня','дней'])+' · seed '+r.seed+' · ')),
   k.el('span',null,'в среднем '),raw(k.el('span',null,fmt(r.realised.actionsPerDay,1)+' '+plural(Math.round(r.realised.actionsPerDay),['бой','боя','боёв'])+(english()?' a day':' в день')+(r.realised.winRate!==null?', '+fmt(r.realised.winRate*100)+'%':''))),
   k.el('span',null,r.realised.winRate!==null?' побед':''));
  box.append(foot);
  if(main&&r.spent?.[main]){const p=k.el('p','sim-note');p.append(k.el('span',null,'Потрачено на покупки в среднем на игрока: '),raw(k.el('span',null,fmt(r.spent[main])+' ('+nameOf(main)+')')));box.append(p);}
  return box;
 }

 function exportPayload(c){
  const r=c.result.base,v=c.result.variant,main=c.economy.main;
  const header=['День'];const cols=[];
  const add=(name,list)=>{if(!list)return;for(const p of ['p10','p50','p90']){header.push(name+' '+p);cols.push(d=>list[d][p]);}};
  add('Уровень',r.level);if(main)add(nameOf(main),r.currency[main]);
  if(v){add('Уровень (после)',v.level);if(main)add(nameOf(main)+' (после)',v.currency[main]);}
  return {title:'Симуляция баланса · '+(c.project||'проект')+' · '+r.days+' дн.',sheet:'Симуляция',app:'Симуляция баланса',header,rows:Array.from({length:r.days},(_,d)=>[d+1,...cols.map(f=>f(d))])};
 }

 function render(parent,c,before){
  const k=window.resultKit;
  const state={params:{...c.params},from:{...c.from}};
  const body=k.el('div','sim-body');
  const econ=economyBlock(k,c,state);
  if(c.state==='done'){body.append(results(k,c));const d=k.el('details','sim-model');d.append(k.el('summary',null,'Экономика и модель цикла'),econ,loopForm(k,c,state));body.append(d);}
  else body.append(econ,loopForm(k,c,state));
  const go=async(b)=>{b.textContent=tt('Считаю…');const next=await feature('run',c.id,state.params);const holder=document.createElement('div');card.replaceWith(holder);render(holder.parentNode,next,holder);holder.remove();};
  const actions=[{label:c.state==='done'?'Пересчитать':'Запустить симуляцию',primary:true,run:go}];
  if(c.canCalibrate)actions.push({label:'Взять из метрик',run:async()=>{const m=await feature('calibrate',c.id);state.params.actionsPerDay=m.actionsPerDay;state.from.actionsPerDay={kind:'metrics',source:m.source};if(m.winRate!==null){state.params.winRate=m.winRate;state.from.winRate={kind:'metrics',source:m.source};}
   c.calibration=m;c.params={...state.params};c.from={...state.from};const holder=document.createElement('div');card.replaceWith(holder);render(holder.parentNode,c,holder);holder.remove();k.toast(tt('Взял из метрик — проверьте и запустите'));}});
  if(c.state==='done')actions.push(k.links('spreadsheet-export',()=>exportPayload(c),{label:'Выгрузить в Google Таблицы'}));
  const r=c.result?.base,goal=r?.milestones.find(m=>m.label==='level')||r?.milestones[0];
  const delta=()=>{const res=c.economy.main,a=r.currency[res]?.at(-1)?.p50,b=c.result.variant.currency[res]?.at(-1)?.p50;return a>0&&b!==undefined?nameOf(res)+' '+(b>=a?'+':'−')+fmt(Math.abs(b/a-1)*100)+'%':tt('что если');};
  const status=c.state==='done'&&c.result.variant?{label:delta(),tone:'done'}:c.state!=='done'?{label:'ждёт запуска',tone:'progress'}:goal&&goal.p50!==null?{label:(goal.label==='level'?goal.level+' '+tt('ур.')+' · ':'')+tt('медиана')+' '+goal.p50+' '+plural(goal.p50,['день','дня','дней']),tone:'done'}:{label:fmt(r.players)+' × '+r.days+' '+plural(r.days,['день','дня','дней']),tone:'done'};
  const subtitle=[c.project,c.change?tt('что если'):'',c.economy.files?.length?c.economy.files.length+' '+plural(c.economy.files.length,['файл','файла','файлов']):''].filter(Boolean).join(' · ');
  const card=k.card({app:'Симуляция баланса',initial:'С',color:'#6a5a8e',key:c.change?tt('Что если'):tt('Прогрессия'),status,subtitle,body,actions,className:'sim-card'});
  card.dataset.state=c.state;card.dataset.card=c.id;
  const sub=card.querySelector('.kit-subtitle');if(sub)raw(sub);
  const btn=card.querySelector('.kit-actions button.primary');if(btn)btn.dataset.action='run';
  card.append(k.el('p','sim-disclaimer','Все числа посчитаны кодом по конфигам; модель цикла — ваши допущения.'));
  if(before)parent.insertBefore(card,before);else parent.append(card);
  return card;
 }
 window.renderSimCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.sim-card'))return;
  render(parent,c);
 };
})();
