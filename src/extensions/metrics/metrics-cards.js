// «Метрики игры», renderer: KPI tiles with the change against the previous period, a multi-series line chart
// (inline SVG, hover read-out, the previous period as dashed lines on «Сравнить с прошлым периодом», anomaly
// marks), the retention heatmap D1/D7/D30 by install week, and chips for the period, platform and version that
// ask the chat again. One block per connected source; several sources switch with chips.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('metrics-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const COLORS={dau:'#86c2ff',new:'#c9a8f0',revenue:'#9dd9c9'};
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(n,d=0)=>Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const compact=n=>Math.abs(n)>=10000?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:Math.abs(n)>=100000&&Math.abs(n)<1e6?0:1}).format(n):fmt(n,Math.abs(n)<100?2:0);
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const weekday=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{weekday:'short'});
 const CUR={'currency:RUB':'₽','currency:USD':'$','currency:EUR':'€'};
 const value=(v,unit,precise)=>v===null||v===undefined?'—':unit==='share'?fmt(v*100,1)+'%':CUR[unit]?(precise?fmt(v,2):compact(v))+' '+CUR[unit]:compact(v);
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const el=(name,attrs={})=>{const n=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const PLATFORM={android:'Android',ios:'iOS'};
 const METRIC={dau:'DAU',new:'новые игроки',revenue:'выручка'};

 function periodText(days){return days===1?'вчера':'за '+days+' '+plural(days,['день','дня','дней']);}
 // The same period for display: «за» is too short for the composed-text translator (periodText stays Russian for requests).
 function periodLabel(days){return days===1?'вчера':(window.t?window.t('за'):'за')+' '+days+' '+plural(days,['день','дня','дней']);}
 function askText(c,{days=c.period.days,platform=c.platform,version=c.version}={}){
  return 'Метрики игры '+periodText(days)+(platform?' на '+PLATFORM[platform]:'')+(version?' версии '+version:'');
 }

 function tile(k,kpi){
  const box=k.el('div','metrics-tile');box.dataset.kpi=kpi.id;
  // Money: the currency goes to the label so the number keeps the tile's width.
  const cur=CUR[kpi.unit],shown=kpi.value===null||kpi.value===undefined?'—':cur?(kpi.precise?fmt(kpi.value,2):compact(kpi.value)):value(kpi.value,kpi.unit,kpi.precise);
  box.append(k.el('span','metrics-label',cur?kpi.label+', '+cur:kpi.label),k.el('span','metrics-value',shown));
  if(kpi.change!==null&&kpi.change!==undefined){
   const up=kpi.change>0,flat=Math.abs(kpi.change)<(kpi.points?0.001:0.005);
   const text=(up?'▲ ':flat?'':'▼ ')+(kpi.points?fmt(Math.abs(kpi.change)*100,1)+' п.п.':fmt(Math.abs(kpi.change)*100,1)+'%');
   const ch=k.el('span','metrics-change '+(flat?'flat':up?'up':'down'),text);ch.title='Прошлый период: '+value(kpi.previous,kpi.unit,kpi.precise);box.append(ch);
  }else box.append(k.el('span','metrics-change flat','нет сравнения'));
  return box;
 }

 // Line chart: users on the left axis, money on the right; previous period dashed; anomalies circled.
 function chart(k,b,state){
  const box=k.el('div','metrics-chart');
  const lines=b.chart.lines;if(!lines.length)return box;
  const W=592,H=176,L=44,R=lines.some(l=>l.unit.startsWith('currency'))?48:12,T=10,B=22,n=b.chart.dates.length;
  const x=i=>L+(n>1?i*(W-L-R)/(n-1):0);
  const shown=lines.filter(l=>state.visible.has(l.metric));
  const scale=group=>{const list=shown.filter(l=>group(l.unit));const all=list.flatMap(l=>[...l.values,...(state.compare?l.previous:[])]).filter(v=>v!==null);const max=Math.max(1e-9,...all);const nice=Math.pow(10,Math.floor(Math.log10(max)));return Math.ceil(max/nice*1.1)*nice||1;};
  const maxUsers=scale(u=>!u.startsWith('currency')),maxMoney=scale(u=>u.startsWith('currency'));
  const y=(v,unit)=>T+(H-T-B)*(1-v/(unit.startsWith('currency')?maxMoney:maxUsers));
  const svg=el('svg',{viewBox:'0 0 '+W+' '+H,class:'metrics-svg',role:'img','aria-label':'График по дням'});
  // Grid and axes.
  for(let g=0;g<=4;g++){const gy=T+(H-T-B)*g/4;svg.append(el('line',{x1:L,x2:W-R,y1:gy,y2:gy,class:'grid'}));
   if(shown.some(l=>!l.unit.startsWith('currency'))){const t=el('text',{x:L-6,y:gy+3,class:'tick','text-anchor':'end'});t.textContent=compact(maxUsers*(1-g/4));svg.append(t);}
   if(shown.some(l=>l.unit.startsWith('currency'))){const t=el('text',{x:W-R+6,y:gy+3,class:'tick'});t.textContent=compact(maxMoney*(1-g/4));svg.append(t);}}
  // Days outside the asked period (before it) are shaded.
  const firstIn=b.chart.dates.indexOf(b.chart.from);
  if(firstIn>0)svg.append(el('rect',{x:L,y:T,width:x(firstIn)-L-(W-L-R)/(n-1)/2,height:H-T-B,class:'outside'}));
  const step=Math.max(1,Math.ceil(n/7));
  b.chart.dates.forEach((d,i)=>{if(i!==n-1&&(i%step||n-1-i<step*0.75))return;const t=el('text',{x:x(i),y:H-6,class:'tick','text-anchor':i===0?'start':i===n-1?'end':'middle'});t.textContent=day(d);svg.append(t);});
  const path=(values,unit)=>{let p='',pen=false;values.forEach((v,i)=>{if(v===null){pen=false;return;}p+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(v,unit).toFixed(1);pen=true;});return p;};
  for(const l of shown){
   if(state.compare&&l.previous.some(v=>v!==null))svg.append(el('path',{d:path(l.previous,l.unit),class:'line previous',stroke:COLORS[l.metric]}));
   svg.append(el('path',{d:path(l.values,l.unit),class:'line',stroke:COLORS[l.metric],'data-metric':l.metric}));
  }
  for(const a of b.anomalies){
   const l=shown.find(s=>s.metric===a.metric);const i=b.chart.dates.indexOf(a.date);if(!l||i<0)continue;
   const c=el('circle',{cx:x(i),cy:y(a.value,l.unit),r:5.5,class:'anomaly '+a.direction,'data-date':a.date,'data-metric':a.metric});
   const t=el('title');t.textContent=day(a.date)+': '+METRIC[a.metric]+' '+value(a.value,l.unit)+' — '+(a.direction==='up'?'выше':'ниже')+' нормы для дня недели ('+value(a.mean,l.unit)+' ± '+value(a.sd,l.unit)+', '+fmt(Math.abs(a.z),1)+'σ)';c.append(t);svg.append(c);
  }
  const guide=el('line',{y1:T,y2:H-B,class:'guide',visibility:'hidden'});svg.append(guide);
  const tip=k.el('div','metrics-tip','Наведите на день');
  // Hover columns: one transparent rect per day.
  b.chart.dates.forEach((d,i)=>{
   const half=n>1?(W-L-R)/(n-1)/2:(W-L-R)/2;
   const hit=el('rect',{x:x(i)-half,y:T,width:half*2,height:H-T-B,class:'hit','data-date':d});
   const show=()=>{guide.setAttribute('x1',x(i));guide.setAttribute('x2',x(i));guide.setAttribute('visibility','visible');
    tip.textContent=weekday(d)+', '+day(d)+': '+shown.map(l=>METRIC[l.metric]+' '+value(l.values[i],l.unit)+(state.compare&&l.previous[i]!==null?' (было '+value(l.previous[i],l.unit)+')':'')).join(' · ')+(b.anomalies.some(a=>a.date===d)?' · необычный день':'');};
   hit.addEventListener('pointerenter',show);hit.addEventListener('focus',show);
   hit.addEventListener('pointerleave',()=>{guide.setAttribute('visibility','hidden');tip.textContent='Наведите на день';});
   svg.append(hit);
  });
  const legend=k.el('div','metrics-legend');
  for(const l of lines){
   const b2=k.el('button','metrics-series'+(state.visible.has(l.metric)?' on':''));b2.type='button';b2.dataset.metric=l.metric;b2.setAttribute('aria-pressed',String(state.visible.has(l.metric)));
   const dot=k.el('i');dot.style.background=COLORS[l.metric];b2.append(dot,k.el('span',null,l.label));
   b2.onclick=()=>{if(state.visible.has(l.metric)){if(state.visible.size>1)state.visible.delete(l.metric);}else state.visible.add(l.metric);state.redraw();};
   legend.append(b2);
  }
  if(b.anomalies.length){const note=k.el('span','metrics-anomaly-note');note.append(k.el('i'),k.el('span',null,'необычный день (>3σ от того же дня недели за 4 недели)'));legend.append(note);}
  if(state.compare){const note=k.el('span','metrics-prev-note');note.append(k.el('i'),k.el('span',null,'прошлый период'));legend.append(note);}
  box.append(svg,tip,legend);return box;
 }

 function heatmap(k,r){
  const box=k.el('div','metrics-retention');
  box.append(k.el('div','metrics-section','Ретеншн по неделе установки'));
  const t=k.el('table','metrics-heat');const head=k.el('tr');for(const h of ['Неделя','Игроков','D1','D7','D30'])head.append(k.el('th',null,h));
  const thead=k.el('thead');thead.append(head);const body=k.el('tbody');
  const max={d1:Math.max(0.01,...r.rows.map(x=>x.d1?.value||0)),d7:Math.max(0.01,...r.rows.map(x=>x.d7?.value||0)),d30:Math.max(0.01,...r.rows.map(x=>x.d30?.value||0))};
  for(const row of r.rows){
   const tr=k.el('tr');tr.append(k.el('td',null,day(row.week)),k.el('td','num',compact(row.size)));
   for(const n of ['d1','d7','d30']){
    const cell=row[n],td=k.el('td','heat'+(cell?'':' empty'),cell?fmt(cell.value*100,1)+'%':'—');td.dataset.day=n;
    if(cell){td.style.setProperty('--heat',String(0.12+0.6*cell.value/max[n]));td.title=n.toUpperCase()+': '+fmt(cell.value*100,2)+'% из '+fmt(cell.size)+' игроков ('+cell.cohorts+' '+plural(cell.cohorts,['день установки','дня установки','дней установки'])+')';}
    else td.title='Этот день для когорты ещё не наступил';
    tr.append(td);
   }
   body.append(tr);
  }
  t.append(thead,body);box.append(t);return box;
 }

 function filters(k,c,b){
  const row=k.el('div','metrics-filters');
  const group=(label,items)=>{const g=k.el('div','metrics-filter');g.setAttribute('role','group');g.setAttribute('aria-label',label);
   for(const it of items){const chip=k.chip({label:it.label,tone:it.current?'accent':'',onClick:()=>k.ask(it.ask,{send:true}),title:it.current?'Сейчас':it.ask});chip.setAttribute('aria-pressed',String(!!it.current));if(it.raw)raw(chip);g.append(chip);}
   row.append(g);};
  group('Период',[7,30,90].map(d=>({label:d+' '+plural(d,['день','дня','дней']),current:c.period.days===d,ask:askText(c,{days:d})})));
  group('Платформа',[{label:'Все',current:!c.platform,ask:askText(c,{platform:null})},{label:'Android',current:c.platform==='android',ask:askText(c,{platform:'android'})},{label:'iOS',current:c.platform==='ios',ask:askText(c,{platform:'ios'})}]);
  const versions=[...new Set([...(c.version?[c.version]:[]),...(b.versions||[])])].slice(0,5);
  if(versions.length)group('Версия',[{label:'Все версии',current:!c.version,ask:askText(c,{version:null})},...versions.map(v=>({label:v,raw:true,current:c.version===v,ask:askText(c,{version:v})}))]);
  return row;
 }

 function block(k,c,b,state){
  const box=k.el('div','metrics-block');box.dataset.source=b.id;
  const tiles=k.el('div','metrics-tiles');for(const kpi of b.kpis)tiles.append(tile(k,kpi));
  box.append(tiles);
  const area=k.el('div','metrics-chart-area');box.append(area);
  state.redraw=()=>{area.replaceChildren(chart(k,b,state));};state.redraw();
  if(b.retention?.rows?.length)box.append(heatmap(k,b.retention));
  if(c.comment&&b===c.sources[0]){const p=k.el('p','metrics-comment');p.append(raw(k.el('span',null,c.comment)));p.title='Вывод локальной модели по цифрам карточки';box.append(p);}
  if(b.unavailable?.length){const ul=k.el('ul','metrics-notes');for(const u of b.unavailable)ul.append(raw(k.el('li',null,u.reason)));box.append(ul);}
  box.append(filters(k,c,b));
  return box;
 }

 // The main drop worth asking about: a KPI more than 5% (or 1 p.p.) down, or a day flagged below the norm.
 function drop(b){
  const kpi=b.kpis.filter(x=>x.change!==null&&x.change!==undefined&&(x.points?x.change<=-0.01:x.change<=-0.05)).sort((a,b2)=>a.change-b2.change)[0];
  if(kpi)return {text:kpi.label+' '+(kpi.points?'снизился на '+fmt(Math.abs(kpi.change)*100,1)+' п.п.':'упал на '+fmt(Math.abs(kpi.change)*100,1)+'%')+' к прошлому периоду ('+value(kpi.value,kpi.unit,kpi.precise)+' против '+value(kpi.previous,kpi.unit,kpi.precise)+')',label:kpi.label};
  const a=[...b.anomalies].reverse().find(x=>x.direction==='down');
  if(a){const l=b.chart.lines.find(x=>x.metric===a.metric);return {text:METRIC[a.metric]+' '+day(a.date)+' ниже нормы для дня недели: '+value(a.value,l?.unit||'users')+' при обычных '+value(a.mean,l?.unit||'users'),label:METRIC[a.metric]};}
  return null;
 }

 window.renderMetricsCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.sources?.length||parent.querySelector('.metrics-card'))return;
  let current=0;
  const state={compare:!!c.compare,visible:new Set()};
  const body=k.el('div','metrics-body');
  const holder=k.el('div','metrics-holder');
  const sourceRow=k.el('div','metrics-sources');
  const paint=()=>{
   const b=c.sources[current];
   const has=m=>b.chart.lines.some(l=>l.metric===m);
   state.visible=new Set(c.focus==='revenue'&&has('revenue')?['revenue']:['dau','new'].filter(has));
   if(!state.visible.size&&b.chart.lines[0])state.visible.add(b.chart.lines[0].metric);
   holder.replaceChildren(block(k,c,b,state));
   for(const chip of sourceRow.children)chip.setAttribute('aria-pressed',String(chip.dataset.source===b.id));
  };
  if(c.sources.length>1)c.sources.forEach((b,i)=>{const chip=k.chip({label:b.name+(b.app?' · '+b.app:''),onClick:()=>{current=i;paint();}});chip.dataset.source=b.id;raw(chip);sourceRow.append(chip);});
  if(sourceRow.children.length)body.append(sourceRow);
  body.append(holder);paint();
  if(c.failed?.length){const p=k.el('p','metrics-failed');p.append(k.el('span',null,'Не ответил: '),raw(k.el('span',null,c.failed.map(f=>f.name+' — '+f.error).join('; '))));body.append(p);}
  const b0=c.sources[0];
  const anomalies=c.sources.reduce((n,b)=>n+b.anomalies.length,0),fall=drop(b0);
  const status=anomalies?{label:anomalies+' '+plural(anomalies,['необычный день','необычных дня','необычных дней']),tone:'alert'}:fall?{label:'есть спад',tone:'progress'}:{label:'в норме',tone:'done'};
  const subtitle=[periodLabel(c.period.days),c.platform?PLATFORM[c.platform]:'',c.version?'версия '+c.version:''].filter(Boolean).join(' · ');
  const actions=[];
  const compareButton={label:state.compare?'Скрыть прошлый период':'Сравнить с прошлым периодом',run:b=>{state.compare=!state.compare;b.textContent=state.compare?'Скрыть прошлый период':'Сравнить с прошлым периодом';b.dataset.state=state.compare?'on':'off';state.redraw();}};
  actions.push(compareButton);
  if(fall)actions.push({label:'Почему упало?',run:()=>k.ask('Почему '+fall.text+'? Период '+periodText(c.period.days)+(c.platform?', '+PLATFORM[c.platform]:'')+'. Что проверить в первую очередь?',{send:true})});
  const summary=b0.kpis.map(x=>x.label+' '+value(x.value,x.unit,x.precise)+(x.change!==null&&x.change!==undefined?' ('+(x.change>0?'+':'−')+(x.points?fmt(Math.abs(x.change)*100,1)+' п.п.':fmt(Math.abs(x.change)*100,1)+'%')+')':'')).join(', ');
  actions.push(k.links('share-message',{text:'посмотреть метрики игры '+periodText(c.period.days)+' ('+b0.name+(b0.app?' · '+b0.app:'')+'): '+summary+(anomalies?'. Необычных дней: '+anomalies:'')}));
  const card=k.card({app:'Метрики',initial:'M',color:'#3d5a73',key:b0.name+(b0.app?' · '+b0.app:''),status,subtitle,body,actions,className:'metrics-card'});
  const keyNode=card.querySelector('.kit-key');if(keyNode)raw(keyNode);
  const compareNode=[...card.querySelectorAll('.kit-actions button')][0];if(compareNode){compareNode.dataset.action='compare';compareNode.dataset.state=state.compare?'on':'off';}
  parent.append(card);
 };
})();
