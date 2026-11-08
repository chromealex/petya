// Charts plugin, renderer: interactive donut, bar and line charts and KPI tiles for message.extensionData.charts
// and ```chart blocks. Line charts and KPI tiles are what analytics apps answer with (DAU, revenue, retention).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('chart-cards.css',document.currentScript.src).href;document.head.append(style);
 // Distinct in lightness as well as hue, readable on the dark chat background.
 const colors=['#d0f596','#86c2ff','#ffd07d','#ba9bff','#ff9daf','#83dcbb','#f0b4a8','#94dbea','#c9b8a0','#9aa5ff'];
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
 const svgEl=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const number=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});

 const locale=()=>window.petyaLocale||'ru-RU';
 const compact=v=>Math.abs(v)>=10000?Number(v).toLocaleString(locale(),{notation:'compact',maximumFractionDigits:1}):number(v);
 // A value with its unit: «$12 840», «41,3 %», «48 210 игроков».
 const withUnit=(v,unit,short=false)=>{const n=short?compact(v):number(v);if(!unit)return n;if(unit==='%')return n+'%';if(/^[$€£₽¥]$/.test(unit))return unit==='₽'?n+' ₽':unit+n;return n+' '+unit;};
 const text=(v,max)=>String(v??'').slice(0,max);
 // Accepts {type|kind, title, unit, rows:[{label, value|count}]} (donut, bars),
 // {type:'line', title, unit, labels:[x…], series:[{label, values:[…]}]} and
 // {type:'kpi', title, items:[{label, value, unit, delta, trend:[…], better:'up'|'down'}]}; null for anything malformed.
 function normalize(chart){
  if(!chart||typeof chart!=='object')return null;
  const kind=chart.type||chart.kind;
  if(kind==='line'){
   const labels=(Array.isArray(chart.labels)?chart.labels:[]).slice(0,400).map(l=>text(l,40));
   const series=(Array.isArray(chart.series)?chart.series:[]).slice(0,6).map(s=>({label:text(s?.label,60),values:labels.map((_,i)=>{const v=s?.values?.[i];return v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v);})})).filter(s=>s.values.some(v=>v!==null));
   if(labels.length<2||!series.length)return null;
   return {type:'line',title:text(chart.title,160),unit:text(chart.unit,16),labels,series};
  }
  if(kind==='kpi'){
   const items=(Array.isArray(chart.items)?chart.items:[]).slice(0,8).map(k=>({label:text(k?.label,60),value:Number(k?.value),unit:text(k?.unit,16),delta:Number.isFinite(Number(k?.delta))?Number(k.delta):null,deltaUnit:k?.deltaUnit==='pp'?'pp':'%',
    trend:(Array.isArray(k?.trend)?k.trend:[]).slice(0,120).map(Number).filter(Number.isFinite),better:k?.better==='down'?'down':'up',hint:text(k?.hint,120)})).filter(k=>k.label&&Number.isFinite(k.value));
   if(!items.length)return null;
   return {type:'kpi',title:text(chart.title,160),items};
  }
  const type=['donut','bars','pie'].includes(kind)?kind==='pie'?'donut':kind:'donut';
  const rows=(Array.isArray(chart.rows)?chart.rows:[]).slice(0,40).map(r=>({label:String(r?.label??'').slice(0,80),value:Number(r?.value??r?.count)})).filter(r=>r.label&&Number.isFinite(r.value)&&r.value>=0);
  if(!rows.length)return null;
  return {type,title:text(chart.title,160),unit:text(chart.unit,16),rows};
 }

 function donut(chart){
  const box=el('figure','chart-card');const hidden=new Set();
  if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const body=el('div','chart-donut');const size=168,r=62,stroke=22,c=2*Math.PI*r;
  const svg=svgEl('svg',{viewBox:`0 0 ${size} ${size}`,width:size,height:size,role:'img'});
  const ring=svgEl('g',{transform:`rotate(-90 ${size/2} ${size/2})`});svg.append(svgEl('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:'#ffffff0d','stroke-width':stroke}),ring);
  const center=svgEl('text',{x:size/2,y:size/2-2,'text-anchor':'middle',class:'chart-center-value'}),caption=svgEl('text',{x:size/2,y:size/2+18,'text-anchor':'middle',class:'chart-center-label'});svg.append(center,caption);
  const legend=el('ul','chart-legend');
  let focused=null;
  function paint(){
   ring.replaceChildren();const visible=chart.rows.map((row,i)=>({...row,i})).filter(row=>!hidden.has(row.i));const total=visible.reduce((s,row)=>s+row.value,0);
   let offset=0;
   for(const row of visible){
    const share=total?row.value/total:0,length=share*c;
    const arc=svgEl('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:colors[row.i%colors.length],'stroke-width':focused===row.i?stroke+6:stroke,'stroke-dasharray':`${Math.max(0,length-(visible.length>1?1.5:0))} ${c}`,'stroke-dashoffset':String(-offset),class:'chart-arc'});
    arc.addEventListener('pointerenter',()=>{focused=row.i;paint();});arc.addEventListener('pointerleave',()=>{focused=null;paint();});
    ring.append(arc);offset+=length;
   }
   const current=focused!==null&&!hidden.has(focused)?chart.rows[focused]:null;
   center.textContent=current?Math.round(100*current.value/(total||1))+'%':withUnit(total,chart.unit,true);
   caption.textContent=current?current.label.slice(0,18):'всего';
   svg.setAttribute('aria-label',(chart.title?chart.title+': ':'')+chart.rows.map(row=>row.label+' '+number(row.value)).join(', '));
   for(const item of legend.children){const i=Number(item.dataset.index),on=!hidden.has(i);item.querySelector('button').setAttribute('aria-pressed',String(on));item.classList.toggle('focused',focused===i);const share=item.querySelector('.chart-share');share.textContent=on&&total?Math.round(100*chart.rows[i].value/total)+'%':'—';}
  }
  chart.rows.forEach((row,i)=>{
   const item=el('li');item.dataset.index=i;
   const toggle=el('button','chart-legend-item');toggle.type='button';toggle.title='Скрыть или показать «'+row.label+'»';
   const dot=el('span','chart-dot');dot.style.background=colors[i%colors.length];
   toggle.append(dot,el('span','chart-label',row.label),el('span','chart-value',withUnit(row.value,chart.unit)),el('span','chart-share'));
   toggle.onclick=()=>{hidden.has(i)?hidden.delete(i):hidden.add(i);if(hidden.size===chart.rows.length)hidden.delete(i);paint();};
   toggle.onfocus=toggle.onpointerenter=()=>{focused=i;paint();};toggle.onblur=toggle.onpointerleave=()=>{focused=null;paint();};
   item.append(toggle);legend.append(item);
  });
  body.append(svg,legend);box.append(body);paint();return box;
 }

 function bars(chart){
  const box=el('figure','chart-card');if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const max=Math.max(...chart.rows.map(r=>r.value),0)||1,list=el('ul','chart-bars');
  chart.rows.forEach((row,i)=>{const item=el('li'),bar=el('span','chart-bar-track'),fill=el('span','chart-bar-fill');fill.style.width=(100*row.value/max)+'%';fill.style.background=colors[i%colors.length];bar.append(fill);item.append(el('span','chart-label',row.label),bar,el('span','chart-value',withUnit(row.value,chart.unit)));list.append(item);});
  box.setAttribute('aria-label',(chart.title?chart.title+': ':'')+chart.rows.map(r=>r.label+' '+number(r.value)).join(', '));
  box.append(list);return box;
 }
 // Line chart: series over x labels, drawn at the card's real width (redrawn when it changes), a hover ruler with
 // the values of every series, legend toggles when there are several.
 const nice=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),n=v/p;return ([1,1.2,1.5,2,2.5,3,4,5,6,8,10].find(s=>n<=s+1e-9)||10)*p;};
 function line(chart){
  const box=el('figure','chart-card chart-line');if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const hidden=new Set(),plot=el('div','chart-line-plot'),tip=el('div','chart-tip');tip.hidden=true;plot.append(tip);
  let legend=null;
  if(chart.series.length>1){legend=el('div','chart-line-legend');chart.series.forEach((s,i)=>{const b=el('button','chart-line-key');b.type='button';b.setAttribute('aria-pressed','true');const dot=el('span','chart-dot');dot.style.background=colors[i%colors.length];b.append(dot,el('span',null,s.label));b.onclick=()=>{hidden.has(i)?hidden.delete(i):hidden.add(i);if(hidden.size===chart.series.length)hidden.delete(i);b.setAttribute('aria-pressed',String(!hidden.has(i)));draw();};legend.append(b);});}
  box.append(...(legend?[legend]:[]),plot);
  const H=190,pad={l:44,r:12,t:10,b:24};let width=0,svg=null;
  function draw(){
   width=Math.max(240,Math.round(plot.clientWidth||560));
   const visible=chart.series.map((s,i)=>({...s,i})).filter(s=>!hidden.has(s.i));
   const values=visible.flatMap(s=>s.values).filter(v=>v!==null),lo=Math.min(0,...values),hi=nice(Math.max(...values,0)*1.05);
   const n=chart.labels.length,x=i=>pad.l+(width-pad.l-pad.r)*(n===1?0.5:i/(n-1)),y=v=>pad.t+(H-pad.t-pad.b)*(1-(v-lo)/((hi-lo)||1));
   const next=svgEl('svg',{viewBox:`0 0 ${width} ${H}`,width,height:H,role:'img',class:'chart-line-svg'});
   const defs=svgEl('defs',{});next.append(defs);
   for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4,yy=y(v);next.append(svgEl('line',{x1:pad.l,x2:width-pad.r,y1:yy,y2:yy,class:'chart-grid'}));const label=svgEl('text',{x:pad.l-8,y:yy+4,'text-anchor':'end',class:'chart-axis'});label.textContent=withUnit(v,chart.unit,true);next.append(label);}
   const every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor((width-pad.l)/70))));
   chart.labels.forEach((l,i)=>{if(i%every&&i!==n-1)return;if(i!==n-1&&n-1-i<every*0.6)return;const label=svgEl('text',{x:x(i),y:H-6,'text-anchor':i===0?'start':i===n-1?'end':'middle',class:'chart-axis'});label.textContent=l;next.append(label);});
   visible.forEach((s,k)=>{
    const color=colors[s.i%colors.length],pts=s.values.map((v,i)=>v===null?null:[x(i),y(v)]);
    const d=pts.reduce((acc,p,i)=>p?acc+(acc&&pts[i-1]?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1):acc,'');
    if(k===0&&visible.length<=2){const id='g'+Math.random().toString(36).slice(2);const g=svgEl('linearGradient',{id,x1:0,x2:0,y1:0,y2:1});g.append(svgEl('stop',{offset:'0%','stop-color':color,'stop-opacity':.28}),svgEl('stop',{offset:'100%','stop-color':color,'stop-opacity':0}));defs.append(g);
     const first=pts.findIndex(Boolean),last=pts.length-1-[...pts].reverse().findIndex(Boolean);next.append(svgEl('path',{d:d+`L${x(last).toFixed(1)} ${y(lo)}L${x(first).toFixed(1)} ${y(lo)}Z`,fill:`url(#${id})`,stroke:'none'}));}
    next.append(svgEl('path',{d,fill:'none',stroke:color,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'}));
   });
   const ruler=svgEl('line',{y1:pad.t,y2:H-pad.b,class:'chart-ruler',visibility:'hidden'}),dots=svgEl('g',{});next.append(ruler,dots);
   next.setAttribute('aria-label',(chart.title?chart.title+': ':'')+visible.map(s=>s.label+' '+chart.labels.at(-1)+' '+number(s.values.at(-1)??0)).join(', '));
   next.addEventListener('pointermove',e=>{const r=next.getBoundingClientRect(),px=(e.clientX-r.left)*(width/r.width),i=Math.max(0,Math.min(n-1,Math.round((px-pad.l)/((width-pad.l-pad.r)||1)*(n-1))));
    ruler.setAttribute('x1',x(i));ruler.setAttribute('x2',x(i));ruler.setAttribute('visibility','visible');dots.replaceChildren();
    tip.replaceChildren(el('b',null,chart.labels[i]));
    for(const s of visible){const v=s.values[i];if(v===null)continue;dots.append(svgEl('circle',{cx:x(i),cy:y(v),r:4,fill:colors[s.i%colors.length],class:'chart-point'}));const row=el('span','chart-tip-row'),dot=el('span','chart-dot');dot.style.background=colors[s.i%colors.length];row.append(dot,el('span',null,(visible.length>1?s.label+': ':'')+withUnit(v,chart.unit)));tip.append(row);}
    tip.hidden=false;const left=x(i)/width*r.width;tip.style.left=Math.min(Math.max(left,60),r.width-60)+'px';});
   next.addEventListener('pointerleave',()=>{ruler.setAttribute('visibility','hidden');dots.replaceChildren();tip.hidden=true;});
   svg?.remove();svg=next;plot.prepend(svg);
  }
  draw();
  let last=0;new ResizeObserver(()=>{const w=Math.round(plot.clientWidth);if(w&&Math.abs(w-last)>4){last=w;draw();}}).observe(plot);
  return box;
 }
 // KPI tiles: the number, its change (green when it moves the good way) and a small trend line.
 function spark(values,color){
  const w=96,h=28,lo=Math.min(...values),hi=Math.max(...values),y=v=>h-2-(h-4)*((v-lo)/((hi-lo)||1)),x=i=>values.length===1?w/2:i*(w/(values.length-1));
  const svg=svgEl('svg',{viewBox:`0 0 ${w} ${h}`,width:w,height:h,class:'chart-spark','aria-hidden':'true'});
  const d=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join('');
  svg.append(svgEl('path',{d:d+`L${w} ${h}L0 ${h}Z`,fill:color,'fill-opacity':.12,stroke:'none'}),svgEl('path',{d,fill:'none',stroke:color,'stroke-width':1.6,'stroke-linejoin':'round'}));return svg;
 }
 function kpi(chart){
  const box=el('figure','chart-card chart-kpi');if(chart.title)box.append(el('figcaption','chart-title',chart.title));
  const grid=el('div','chart-kpi-grid');
  for(const k of chart.items){
   const tile=el('div','chart-kpi-tile');if(k.hint)tile.title=k.hint;
   tile.append(el('span','chart-kpi-label',k.label),el('strong','chart-kpi-value',withUnit(k.value,k.unit)));
   const foot=el('div','chart-kpi-foot');
   if(k.delta!==null){const good=k.delta===0?null:(k.delta>0)===(k.better==='up');const d=el('span','chart-kpi-delta'+(good===null?'':good?' good':' bad'),(k.delta>0?'▲ ':k.delta<0?'▼ ':'')+number(Math.abs(k.delta))+(k.deltaUnit==='pp'?' п.п.':'%'));foot.append(d);}
   if(k.trend.length>1)foot.append(spark(k.trend,k.delta===null||k.delta===0?'#86c2ff':((k.delta>0)===(k.better==='up')?'#83dcbb':'#ff9daf')));
   tile.append(foot);grid.append(tile);
  }
  box.setAttribute('aria-label',(chart.title?chart.title+': ':'')+chart.items.map(k=>k.label+' '+withUnit(k.value,k.unit)).join(', '));
  box.append(grid);return box;
 }
 const render=chart=>{const data=normalize(chart);return data?({bars,line,kpi}[data.type]||donut)(data):null;};

 // Result renderer: charts attached by other plugins replace their static picture and the plain-text legend.
 window.renderCharts=(parent,charts)=>{
  if(!Array.isArray(charts)||parent.querySelector(':scope>.chart-card'))return;
  const nodes=charts.map(render).filter(Boolean);if(!nodes.length)return;
  for(const img of parent.querySelectorAll(':scope>.extension-reply-image'))img.remove();
  const labels=new Set(charts.flatMap(c=>(c.rows||[]).map(r=>String(r.label))));
  window.resultKit?.dropLines(parent,text=>{const m=text.match(/^(.+?)\s+[—–-]\s+[\d\s,.]+$/u);return !!m&&labels.has(m[1].trim());});
  parent.append(...nodes);
 };
 // ```chart blocks written by the model.
 (window.petyaFenceRenderers||={}).chart=text=>{let data;try{data=JSON.parse(text);}catch{return null;}return render(data);};
 window.petyaCharts={render,normalize};
})();
