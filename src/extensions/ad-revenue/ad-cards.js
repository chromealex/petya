// «Реклама и монетизация», renderer: KPI tiles (revenue, impressions, eCPM, change), revenue by day stacked by
// network with an eCPM line, anomalies against the 4-week baseline, networks with share, eCPM trend and fill rate,
// a format × network table and the top countries. Actions: compare with the previous week (a follow-up request)
// and sharing the summary through a messaging app (cross-app link; that app's own flow confirms).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('ad-cards.css',document.currentScript.src).href;document.head.append(style);
 const COLORS=['#9dd9c9','#86c2ff','#e5ce8c','#c9a8f0','#f0b4a8'],REST='#5d6863';
 const SVG='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const usd=(v,{compact=false}={})=>{const n=Number(v||0);return new Intl.NumberFormat(locale(),{style:'currency',currency:'USD',notation:compact&&n>=10000?'compact':'standard',maximumFractionDigits:compact&&n>=10000?1:n>=100?0:n>0&&n<1?3:2}).format(n);};
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const short=n=>n>=10000?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(n):fmt(n);
 const pct=v=>(v*100).toLocaleString(locale(),{maximumFractionDigits:Math.abs(v)<0.1?1:0})+'%';
 const signed=v=>(v>0?'+':v<0?'−':'')+pct(Math.abs(v));
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'});
 const weekday=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{weekday:'short',timeZone:'UTC'});
 const country=code=>{try{return new Intl.DisplayNames([locale()],{type:'region'}).of(code)||code;}catch{return code;}};
 const FORMAT={rewarded:'Rewarded',interstitial:'Interstitial',banner:'Banner',mrec:'MREC',native:'Native',appopen:'App Open',rewarded_interstitial:'Rewarded Interstitial',offerwall:'Offerwall'};
 const formatName=f=>FORMAT[f]||String(f||'');
 // Service names (networks, apps, formats) are never machine-translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};

 function tile(k,value,label,{delta,note,title,tone}={}){
  const box=k.el('div','ad-tile'+(tone?' '+tone:''));box.append(k.el('span','ad-value',value),k.el('span','ad-label',label));
  if(delta!=null){const d=k.el('span','ad-delta '+(delta>0.005?'up':delta<-0.005?'down':'flat'),(delta>0.005?'▲ ':delta<-0.005?'▼ ':'')+signed(delta));box.append(d);}
  if(note)box.append(k.el('span','ad-note',note));
  if(title)box.title=title;return box;
 }

 function line(values,{w=96,h=24,cls='ad-spark',centered=false}={}){
  const list=values.map(v=>v==null?null:Number(v)),known=list.filter(v=>v!=null);
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('class',cls);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
  if(known.length<2)return svg;
  const min=Math.min(...known),max=Math.max(...known),span=max-min||1,step=list.length>1?w/(list.length-1):w;
  const x=i=>centered?(i+0.5)*w/list.length:i*step;
  const pts=list.map((v,i)=>v==null?null:[+x(i).toFixed(1),+(h-2-(h-4)*(v-min)/span).toFixed(1)]).filter(Boolean);
  const pl=document.createElementNS(SVG,'polyline');pl.setAttribute('points',pts.map(p=>p.join(',')).join(' '));pl.setAttribute('class','line');
  const dot=document.createElementNS(SVG,'circle');dot.setAttribute('cx',pts.at(-1)[0]);dot.setAttribute('cy',pts.at(-1)[1]);dot.setAttribute('r','2');dot.setAttribute('class','dot');
  svg.append(pl,dot);return svg;
 }

 function chart(k,c,colorOf){
  const box=k.el('div','ad-chart');
  const totals=c.days.map((_,i)=>c.series.reduce((n,s)=>n+(s.values[i]||0),0)),max=Math.max(0.01,...totals);
  const head=k.el('div','ad-chart-head');head.append(k.el('span',null,'Выручка по дням'),k.el('span',null,'макс. '+usd(Math.max(...totals),{compact:true})+' в день'));
  const tip=k.el('div','ad-tip','Наведите на день');
  const plot=k.el('div','ad-plot');
  const bars=k.el('div','ad-bars');bars.setAttribute('role','list');
  c.days.forEach((d,i)=>{
   const inside=d>=c.from&&d<=c.to;
   const col=k.el('button','ad-col'+(inside?'':' outside'));col.type='button';col.setAttribute('role','listitem');
   const stack=k.el('div','ad-stack');stack.style.height=(totals[i]?Math.max(2,100*totals[i]/max):0)+'%';
   for(const s of c.series){const v=s.values[i]||0;if(!v)continue;const seg=k.el('span','ad-seg');seg.style.flexGrow=String(v);seg.style.background=colorOf(s.id);stack.append(seg);}
   col.append(stack);
   const parts=c.series.filter(s=>s.values[i]).map(s=>(s.id==='rest'?'остальные':s.label)+' — '+usd(s.values[i]));
   const text=weekday(d)+', '+day(d)+': '+usd(totals[i])+(c.ecpm?.[i]!=null?' · eCPM '+usd(c.ecpm[i]):'')+(inside?'':' (вне периода)');
   col.setAttribute('aria-label',text+(parts.length?'. '+parts.join('; '):''));col.title=text+(parts.length?'\n'+parts.join('\n'):'');
   col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent='Наведите на день';};
   bars.append(col);
  });
  plot.append(bars);
  // eCPM per day over the bars: its own scale, drawn across the same columns.
  if((c.ecpm||[]).filter(v=>v!=null).length>1){const l=line(c.ecpm,{w:600,h:80,cls:'ad-ecpm-line',centered:true});l.removeAttribute('width');l.removeAttribute('height');plot.append(l);}
  const axis=k.el('div','ad-axis');axis.append(k.el('span',null,day(c.days[0])),k.el('span',null,day(c.days.at(-1))));
  const legend=k.el('ul','ad-legend');
  for(const s of c.series){const li=k.el('li');const dot=k.el('i');dot.style.background=colorOf(s.id);li.append(dot,s.id==='rest'?k.el('span',null,'остальные'):raw(k.el('span',null,s.label)));legend.append(li);}
  if((c.ecpm||[]).filter(v=>v!=null).length>1){const li=k.el('li','ecpm');li.append(k.el('i'),k.el('span',null,'eCPM'));legend.append(li);}
  box.append(head,plot,axis,tip,legend);return box;
 }

 function anomalies(k,list){
  const box=k.el('div','ad-anomalies');box.append(k.el('div','ad-section','Отклонения от нормы за 4 недели'));
  for(const a of list){
   const row=k.el('div','ad-anomaly '+(a.change<0?'down':'up'));
   const name=a.dimension==='total'?k.el('span','ad-anomaly-name','Вся реклама'):raw(k.el('span','ad-anomaly-name',a.dimension==='format'?formatName(a.label):a.label));
   row.append(k.el('span','ad-arrow',a.change<0?'▼':'▲'),name,k.el('span','ad-anomaly-day',weekday(a.day)+', '+day(a.day)),
    k.el('span','ad-anomaly-value',usd(a.revenue)+' вместо ~'+usd(a.baseline)),k.el('strong','ad-anomaly-change',signed(a.change)));
   row.title='Норма — среднее за тот же день недели в предыдущие недели ('+a.weeks+')';
   box.append(row);
  }
  return box;
 }

 function networks(k,list,colorOf){
  const box=k.el('div','ad-networks');
  const head=k.el('div','ad-net head');head.append(k.el('span',null,'Сеть'),k.el('span',null,'Доля'),k.el('span','num','Выручка'),k.el('span','num','eCPM'),k.el('span',null,'eCPM по дням'),k.el('span','num','Fill rate'));
  box.append(k.el('div','ad-section','Сети'),head);
  const rows=list.map(n=>{
   const row=k.el('div','ad-net');row.style.setProperty('--c',colorOf(n.name));
   const name=k.el('span','ad-net-name');const dot=k.el('i');name.append(dot,raw(k.el('span',null,n.name)));
   const share=k.el('span','ad-share');const bar=k.el('span');bar.style.width=Math.max(2,n.share*100)+'%';share.append(bar);share.title=pct(n.share);
   const rev=k.el('span','num ad-net-rev');rev.append(k.el('strong',null,usd(n.revenue,{compact:true})));if(n.change!=null)rev.append(k.el('small','ad-delta '+(n.change>0.005?'up':n.change<-0.005?'down':'flat'),signed(n.change)));
   const trend=k.el('span','ad-net-trend');trend.append(line(n.ecpmTrend||[],{w:96,h:22}));
   row.append(name,share,rev,k.el('span','num',n.ecpm!=null?usd(n.ecpm):'—'),trend,k.el('span','num muted',n.fill!=null?pct(n.fill):'—'));
   return row;
  });
  box.append(k.collapse(rows,6,'Ещё сети'));
  return box;
 }

 function matrix(k,m,colorOf){
  const box=k.el('div','ad-matrix');const title=k.el('div','ad-section');title.append(k.el('span',null,'Формат × сеть'),k.el('span','ad-section-note','в ячейке: выручка и eCPM'));box.append(title);
  const cell=(f,n)=>m.cells.find(c=>c.format===f&&c.network===n);
  const max=Math.max(0.01,...m.cells.map(c=>c.revenue));
  const wrap=k.el('div','ad-table-wrap'),t=k.el('table','ad-table'),head=k.el('tr');
  head.append(k.el('th',null,'Формат'));
  for(const n of m.networks){const th=n==='rest'?k.el('th',null,'остальные'):raw(k.el('th',null,n));th.style.setProperty('--c',colorOf(n));head.append(th);}
  head.append(k.el('th',null,'Всего'));
  const body=k.el('tbody');
  for(const f of m.formats){
   const tr=k.el('tr');tr.append(raw(k.el('th',null,formatName(f))));
   let total=0;
   for(const n of m.networks){
    const c=cell(f,n),td=k.el('td');
    if(c&&c.revenue>0){total+=c.revenue;td.append(k.el('span','ad-cell-rev',usd(c.revenue,{compact:true})));if(c.ecpm!=null)td.append(k.el('small',null,usd(c.ecpm)));td.style.setProperty('--heat',String(Math.min(1,c.revenue/max)));td.classList.add('heat');}
    else td.append(k.el('span','muted','—'));
    tr.append(td);
   }
   tr.append(k.el('td','total',usd(total,{compact:true})));body.append(tr);
  }
  const cols=k.el('colgroup');cols.append(k.el('col','first'));for(let i=0;i<=m.networks.length;i++)cols.append(k.el('col'));
  const thead=k.el('thead');thead.append(head);t.append(cols,thead,body);wrap.append(t);box.append(wrap);return box;
 }

 function countries(k,list,focus){
  const box=k.el('div','ad-countries');box.append(k.el('div','ad-section','Страны'));
  const max=Math.max(0.0001,...list.map(c=>c.share));
  for(const c of list){
   const row=k.el('div','ad-country'+(focus===c.country?' focus':''));
   const bar=k.el('span','ad-country-bar');const fill=k.el('span');fill.style.width=Math.max(2,100*c.share/max)+'%';bar.append(fill);
   row.append(raw(k.el('span','ad-country-name',country(c.country))),bar,k.el('span','num',usd(c.revenue,{compact:true})),k.el('span','num muted',pct(c.share)),k.el('span','num muted',c.ecpm!=null?'eCPM '+usd(c.ecpm):''));
   box.append(row);
  }
  return box;
 }

 window.renderAdRevenue=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.ad-card'))return;
  const ids=(c.chart?.series||[]).map(s=>s.id);
  const colorOf=id=>id==='rest'?REST:ids.includes(id)?COLORS[ids.indexOf(id)%COLORS.length]:REST;
  const t=c.totals||{};
  const body=k.el('div','ad-body');
  const tiles=k.el('div','ad-tiles');
  const changeValue=t.weekday?t.weekday.change:t.change;
  tiles.append(
   tile(k,usd(t.revenue),'выручка'),
   tile(k,short(t.impressions),'показов',{delta:t.impressionsChange}),
   tile(k,t.ecpm!=null?usd(t.ecpm):'—','eCPM',{delta:t.ecpmChange}),
   tile(k,changeValue!=null?signed(changeValue):'—',t.weekday?'к обычному дню недели':'к прошлому периоду',{tone:changeValue==null?'':changeValue<-0.05?'alert':changeValue>0.05?'good':'',
    note:t.weekday?'норма '+usd(t.weekday.baseline):t.previous?usd(t.previous.revenue)+' · '+day(t.previous.from)+(t.previous.from!==t.previous.to?' — '+day(t.previous.to):''):'',title:t.weekday?'Среднее за тот же день недели в предыдущие недели: '+t.weekday.weeks:''}));
  if(t.fill!=null)tiles.append(tile(k,pct(t.fill),'fill rate'));
  if(t.arpdau!=null)tiles.append(tile(k,usd(t.arpdau),'ARPDAU',{note:'DAU ~'+short(t.dau)}));
  body.append(tiles);
  if(c.empty)body.append(k.el('p','ad-empty','Отчёт за этот период пуст.'));
  if(c.chart?.days?.length&&c.chart.series?.length)body.append(chart(k,c.chart,colorOf));
  if(c.anomalies?.length)body.append(anomalies(k,c.anomalies));
  if(c.networks?.length)body.append(networks(k,c.networks,colorOf));
  if(c.matrix?.formats?.length&&c.matrix.networks?.length)body.append(matrix(k,c.matrix,colorOf));
  if(c.countries?.length)body.append(countries(k,c.countries,c.filters?.country));
  else if(c.countriesNarrowed)body.append(k.el('p','ad-note-line','Страны показываются для всей рекламы, без фильтра по формату или сети.'));
  if(c.notes?.length){const notes=k.el('ul','ad-notes');for(const n of c.notes)notes.append(k.el('li',null,n));body.append(notes);}
  const f=c.filters||{};
  const scope=[f.format?formatName(f.format):'',f.network||'',f.platform==='ios'?'iOS':f.platform==='android'?'Android':'',...(f.apps||[])].filter(Boolean);
  const down=(c.anomalies||[]).some(a=>a.change<0);
  const status=c.empty?{label:'нет данных',tone:''}:down?{label:'просадка',tone:'alert'}:changeValue!=null&&changeValue>0.05?{label:'рост',tone:'done'}:{label:'в норме',tone:'done'};
  const subtitle=[c.period?.label,...scope].filter(Boolean).join(' · ');
  const filterText=scope.length?' ('+scope.join(', ')+')':'';
  const actions=[];
  if(!c.compare||c.period?.kind!=='week')actions.push({label:'Сравнить с прошлой неделей',run:()=>k.ask('Сравни выручку с рекламы за 7 дней с прошлой неделей'+filterText,{send:true})});
  if(c.view!=='format'&&c.formats?.length>1)actions.push({label:'По форматам',run:()=>k.ask('Какой формат рекламы приносит больше '+(c.period?.label||'за 7 дней')+filterText,{send:true})});
  const top=c.networks?.[0];
  const share=()=>'посмотреть выручку с рекламы '+(c.period?.label||'')+filterText+': '+usd(t.revenue)+(changeValue!=null?' ('+signed(changeValue)+')':'')+', eCPM '+(t.ecpm!=null?usd(t.ecpm):'—')+(top?', больше всего — '+top.name+' ('+pct(top.share)+')':'')+((c.anomalies||[]).find(a=>a.change<0)?'. Просадка: '+(x=>(x.dimension==='total'?'вся реклама':x.dimension==='format'?formatName(x.label):x.label)+' '+day(x.day)+' '+signed(x.change))(c.anomalies.find(a=>a.change<0)):'')+'.';
  if(!c.empty)actions.push(k.links('share-message',()=>({text:share()})));
  const card=k.card({app:'Реклама',initial:'$',color:'#2f5d50',key:(c.sources||[]).join(' + '),status,subtitle,body,actions,className:'ad-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
