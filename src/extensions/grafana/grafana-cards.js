// «Grafana», renderer: a dashboard card (title with folder, time range chips, the variables, a grid of up to 8 panels
// drawn natively — time series as inline SVG lines with legend and hover, stat / gauge tiles colored by the panel's
// thresholds, bar gauges as bars, tables through k.table with column units; other panel types as a title with
// «Открыть в Grafana») and a dashboard list card. Grafana's HTML is never rendered; a panel picture comes only from
// the Image Renderer plugin when it is enabled in settings. Values are formatted with the panel's units and decimals.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('grafana-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const PALETTE=['#73bf69','#8ab8ff','#ff9830','#b877d9','#f2495c','#f2cc0c','#5794f2','#96d98d','#ffb357','#ca95e5'];
 // A palette color too close to a series' fixed color (e.g. «yellow» set for one series) is skipped for the others.
 const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 const near=(a,b)=>{if(!/^#[0-9a-f]{6}$/i.test(a)||!/^#[0-9a-f]{6}$/i.test(b))return false;const x=rgb(a),y=rgb(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])<90;};
 const locale=()=>window.petyaLocale||'ru-RU';
 const ru=()=>/^ru/.test(locale());
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const svgEl=(name,attrs={})=>{const n=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const okColor=c=>/^#[0-9a-f]{3,8}$/i.test(String(c||''))?c:null;

 // --- Units (Grafana unit ids) ------------------------------------------------------------------------
 const num=(v,d)=>Number(v).toLocaleString(locale(),Number.isInteger(d)?{minimumFractionDigits:d,maximumFractionDigits:d}:{maximumFractionDigits:Math.abs(v)>=100?0:Math.abs(v)>=10?1:2});
 // Large numbers shortened (15,4 тыс.) like Grafana's scaled units; tables keep full numbers up to a billion.
 let FULL=false;
 const compact=(v,d)=>Math.abs(v)>=(FULL?1e9:10000)?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:Number.isInteger(d)?Math.min(d,2):1}).format(v):num(v,d);
 const CUR={USD:'$',EUR:'€',RUB:'₽',GBP:'£',JPY:'¥',CNY:'¥',KRW:'₩',INR:'₹',TRY:'₺',BRL:'R$'};
 function scaled(v,d,base,units){let i=0,x=Math.abs(v);while(x>=base&&i<units.length-1){x/=base;i++;}return num(Math.sign(v)*x,Number.isInteger(d)?d:x>=100?0:1)+' '+units[i];}
 function duration(v,unitMs,d){
  const ms=v*unitMs,a=Math.abs(ms);
  const U=ru()?{ms:'мс',s:'с',m:'мин',h:'ч',d:'д'}:{ms:'ms',s:'s',m:'min',h:'h',d:'d'};
  if(a<1000)return num(ms,d)+' '+U.ms;if(a<60000)return num(ms/1000,d)+' '+U.s;if(a<3600000)return num(ms/60000,d)+' '+U.m;if(a<86400000)return num(ms/3600000,d)+' '+U.h;return num(ms/86400000,d)+' '+U.d;
 }
 function value(v,unit='',d=null){
  if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';
  v=Number(v);const u=String(unit||'');
  if(u==='percent')return num(v,d)+'%';
  if(u==='percentunit')return num(v*100,d)+'%';
  const cur=u.match(/^currency([A-Z]{3})$/);if(cur)return (CUR[cur[1]]?'':'')+compact(v,d)+' '+(CUR[cur[1]]||cur[1]);
  if(u==='bytes'||u==='decbytes'||u==='kbytes'||u==='mbytes')return scaled(v*({kbytes:1024,mbytes:1048576}[u]||1),d,u==='decbytes'?1000:1024,['B','KB','MB','GB','TB','PB']);
  if(u==='bps'||u==='Bps'||u==='binBps')return scaled(v,d,1000,u==='bps'?['b/s','Kb/s','Mb/s','Gb/s']:['B/s','KB/s','MB/s','GB/s']);
  if(u==='ms'||u==='dtdurationms')return duration(v,1,d);if(u==='s'||u==='dtdurations')return duration(v,1000,d);
  if(u==='m')return duration(v,60000,d);if(u==='h')return duration(v,3600000,d);if(u==='d')return duration(v,86400000,d);
  if(u==='reqps'||u==='rps')return compact(v,d)+' req/s';if(u==='ops')return compact(v,d)+' ops/s';if(u==='celsius')return num(v,d)+' °C';
  if(u.startsWith('suffix:'))return compact(v,d)+u.slice(7);if(u.startsWith('prefix:'))return u.slice(7)+compact(v,d);
  if(!u||u==='short'||u==='none'||u==='locale'||u==='sishort')return compact(v,d);
  return compact(v,d)+' '+u;
 }
 const timeText=(t,span)=>new Date(t).toLocaleString(locale(),span<=36*3600000?{hour:'2-digit',minute:'2-digit'}:{day:'numeric',month:'short'});
 const fullTime=t=>new Date(t).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

 // --- Panels --------------------------------------------------------------------------------------------
 function timeseries(k,p){
  const box=k.el('div','gf-ts');
  const fixed=p.series.map(x=>okColor(x.color)).filter(Boolean);
  const free=PALETTE.filter(c=>!fixed.some(f=>near(c,f)));let next=0;
  const series=p.series.map(x=>({...x,color:okColor(x.color)||free[next++%free.length]||PALETTE[0]}));
  const hidden=new Set();
  const W=592,H=168,L=50,R=10,T=8,B=20;
  const tip=k.el('div','gf-tip');raw(tip);tip.textContent=' ';
  const area=k.el('div','gf-ts-area');
  const draw=()=>{
   const shown=series.filter(x=>!hidden.has(x.name));
   const all=shown.flatMap(x=>x.points);
   const xs=all.map(q=>q[0]);const x0=Math.min(p.from,...xs),x1=Math.max(p.to,...xs);
   const ys=all.map(q=>q[1]).filter(v=>v!==null);
   let lo=p.min??Math.min(0,...ys),hi=p.max??Math.max(...ys,lo+1);if(!ys.length){lo=0;hi=1;}
   if(hi<=lo)hi=lo+1;
   const pad=(hi-lo)*0.08;if(p.max===null||p.max===undefined)hi+=pad;if((p.min===null||p.min===undefined)&&lo<0)lo-=pad;
   const X=t=>L+(x1>x0?(t-x0)/(x1-x0):0.5)*(W-L-R),Y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
   const svg=svgEl('svg',{viewBox:'0 0 '+W+' '+H,class:'gf-svg',role:'img','aria-label':p.title||'График'});
   for(let g=0;g<=3;g++){const v=lo+(hi-lo)*(1-g/3),gy=Y(v);svg.append(svgEl('line',{x1:L,x2:W-R,y1:gy,y2:gy,class:'grid'}));const t=svgEl('text',{x:L-6,y:gy+3,class:'tick','text-anchor':'end'});t.textContent=value(v,p.unit,null);svg.append(t);}
   for(const th of p.thresholds||[])if(th.value!==null&&th.value>lo&&th.value<hi)svg.append(svgEl('line',{x1:L,x2:W-R,y1:Y(th.value),y2:Y(th.value),class:'threshold',stroke:okColor(th.color)||'#f2495c'}));
   for(let i=0;i<=4;i++){const t=x0+(x1-x0)*i/4,tx=svgEl('text',{x:X(t),y:H-5,class:'tick','text-anchor':i===0?'start':i===4?'end':'middle'});tx.textContent=timeText(t,x1-x0);svg.append(tx);}
   for(const x of shown){
    let d='',pen=false;for(const [t,v] of x.points){if(v===null){pen=false;continue;}d+=(pen?'L':'M')+X(t).toFixed(1)+' '+Y(v).toFixed(1);pen=true;}
    svg.append(svgEl('path',{d,class:'line',stroke:x.color,'data-series':x.name}));
   }
   const guide=svgEl('line',{y1:T,y2:H-B,class:'guide',visibility:'hidden'});svg.append(guide);
   const hit=svgEl('rect',{x:L,y:T,width:W-L-R,height:H-T-B,class:'hit'});svg.append(hit);
   const near=(pts,t)=>{let a=0,b=pts.length-1;if(b<0)return null;while(b-a>1){const m=(a+b)>>1;if(pts[m][0]<t)a=m;else b=m;}return Math.abs(pts[a][0]-t)<=Math.abs(pts[b][0]-t)?pts[a]:pts[b];};
   const show=e=>{
    const r=svg.getBoundingClientRect();const sx=(e.clientX-r.left)/r.width*W;const t=x0+(Math.min(Math.max(sx,L),W-R)-L)/(W-L-R)*(x1-x0);
    const at=shown.map(x=>({x,pt:near(x.points,t)})).filter(z=>z.pt);if(!at.length)return;
    const tt=at[0].pt[0];guide.setAttribute('x1',X(tt));guide.setAttribute('x2',X(tt));guide.setAttribute('visibility','visible');
    tip.textContent=fullTime(tt)+': '+at.map(z=>z.x.name+' '+value(z.pt[1],z.x.unit||p.unit,z.x.decimals??p.decimals)).join(' · ');
   };
   hit.addEventListener('pointermove',show);hit.addEventListener('pointerenter',show);
   hit.addEventListener('pointerleave',()=>{guide.setAttribute('visibility','hidden');tip.textContent=' ';});
   area.replaceChildren(svg);
  };
  draw();
  const legend=k.el('div','gf-legend');
  for(const x of series){
   const b=k.el('button','gf-series on');b.type='button';b.dataset.series=x.name;b.setAttribute('aria-pressed','true');
   const dot=k.el('i');dot.style.background=x.color;b.append(dot,raw(k.el('span',null,x.name)));
   b.onclick=()=>{if(hidden.has(x.name))hidden.delete(x.name);else if(hidden.size<series.length-1)hidden.add(x.name);for(const n of legend.querySelectorAll('.gf-series')){const on=!hidden.has(n.dataset.series);n.classList.toggle('on',on);n.setAttribute('aria-pressed',String(on));}draw();};
   legend.append(b);
  }
  if(p.more)legend.append(k.el('span','gf-more','ещё рядов: '+p.more));
  // One series needs no legend: the panel title names it.
  box.append(area,tip);if(series.length>1||p.more)box.append(legend);
  return box;
 }
 function spark(values,color){
  const v=values.filter(x=>x!==null&&x!==undefined);if(v.length<2)return null;
  const lo=Math.min(...v),hi=Math.max(...v),W=100,H=28;
  const d=values.map((x,i)=>x===null?null:[(i/(values.length-1))*W,H-2-(hi>lo?(x-lo)/(hi-lo):0.5)*(H-4)]).filter(Boolean).map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join('');
  const svg=svgEl('svg',{viewBox:'0 0 '+W+' '+H,class:'gf-spark',preserveAspectRatio:'none','aria-hidden':'true'});
  svg.append(svgEl('path',{d:d+'L'+W+' '+H+'L0 '+H+'Z',class:'area',fill:color}),svgEl('path',{d,class:'edge',stroke:color}));
  return svg;
 }
 function stat(k,p){
  const box=k.el('div','gf-stats');
  for(const it of p.items){
   const c=okColor(it.color);
   const tile=k.el('div','gf-stat');tile.dataset.color=c||'';
   if(c)tile.style.setProperty('--tone',c);
   if(p.items.length>1)tile.append(raw(k.el('span','gf-stat-name',it.name)));
   const val=raw(k.el('span','gf-stat-value',it.text??value(it.value,it.unit,it.decimals)));tile.append(val);
   if(p.gauge){
    const lo=it.min??0,hi=it.max??100,share=it.value===null?0:Math.max(0,Math.min(1,(it.value-lo)/((hi-lo)||1)));
    const bar=k.el('div','gf-gauge');bar.setAttribute('role','meter');bar.setAttribute('aria-valuemin',String(lo));bar.setAttribute('aria-valuemax',String(hi));if(it.value!==null)bar.setAttribute('aria-valuenow',String(it.value));
    const fill=k.el('i');fill.style.width=(share*100).toFixed(1)+'%';bar.append(fill);
    for(const th of it.thresholds||[])if(th.value!==null&&th.value>lo&&th.value<hi){const m=k.el('b');m.style.left=((th.value-lo)/(hi-lo)*100).toFixed(1)+'%';m.style.background=okColor(th.color)||'#fff';bar.append(m);}
    tile.append(bar,raw(k.el('span','gf-gauge-range',value(lo,it.unit,0)+' — '+value(hi,it.unit,0))));
   }else if(it.spark){const s=spark(it.spark,c||'#8ab8ff');if(s)tile.append(s);}
   box.append(tile);
  }
  if(p.more)box.append(k.el('span','gf-more','ещё значений: '+p.more));
  return box;
 }
 function bars(k,p){
  const box=k.el('div','gf-bars');
  const hi=Math.max(...p.items.map(i=>i.max??0),...p.items.map(i=>i.value||0),1e-9);
  for(const it of p.items){
   const row=k.el('div','gf-bar');
   const label=raw(k.el('span','gf-bar-name',it.name));label.title=it.name;
   const track=k.el('span','gf-bar-track'),fill=k.el('i');fill.style.width=(Math.max(0,(it.value||0))/hi*100).toFixed(1)+'%';fill.style.background=okColor(it.color)||'#8ab8ff';track.append(fill);
   FULL=true;let shown;try{shown=it.text??value(it.value,it.unit,it.decimals);}finally{FULL=false;}
   row.append(label,track,raw(k.el('span','gf-bar-value',shown+(it.share!==null&&it.share!==undefined?' · '+num(it.share*100,1)+'%':''))));
   box.append(row);
  }
  if(p.more)box.append(k.el('span','gf-more','ещё значений: '+p.more));
  return box;
 }
 function table(k,p){
  const box=k.el('div','gf-table');
  const rows=p.rows.slice(0,20).map(r=>({r}));
  const cols=p.columns.map((c,i)=>({label:c.name,value:x=>{const v=x.r[i];const s=v===null?'—':c.type==='time'?fullTime(v):c.type==='number'?(FULL=true,(()=>{try{return value(v,c.unit,c.decimals);}finally{FULL=false;}})()):String(v);const n=k.el('span',c.type==='number'?'gf-num':null,s);return raw(n);}}));
  const t=k.table(cols,rows);raw(t.querySelector('thead'));box.append(t);
  if(p.total>rows.length)box.append(k.el('span','gf-more','Показано '+rows.length+' из '+p.total));
  return box;
 }
 function picture(k,c,p,box){
  const b=k.el('button','gf-picture','Картинка панели');b.type='button';
  b.onclick=async()=>{b.disabled=true;try{const r=await window.petya.feature('grafana','render',{uid:c.uid,slug:c.slug,panelId:p.id,from:c.range.raw.from,to:c.range.raw.to,orgId:c.orgId});
   if(!/^data:image\/png;base64,/.test(r?.src||''))throw Error('Grafana не вернула картинку.');const img=document.createElement('img');img.className='gf-img';img.alt=p.title||'';img.src=r.src;b.replaceWith(img);}
   catch(e){k.toast(e.message,{error:true});b.disabled=false;}};
  box.append(b);
 }
 function panel(k,c,p){
  const wide=p.kind==='timeseries'||p.kind==='table'||p.kind==='bars'&&p.items?.length>4;
  const span=wide?4:p.kind==='stat'?Math.min(4,Math.max(1,p.items?.length||1)):2;
  const box=k.el('section','gf-panel kind-'+p.kind);box.dataset.panel=String(p.id);box.dataset.kind=p.kind;box.style.gridColumn='span '+span;
  const head=k.el('div','gf-panel-head');
  const title=raw(k.el('span','gf-panel-title',p.title||'Без названия'));if(p.description)title.title=p.description;head.append(title);
  if(p.time?.timeFrom)head.append(raw(k.el('span','gf-panel-time',p.time.timeFrom)));
  const url=k.safeUrl(p.url);
  if(url){const a=k.el('a','gf-open','↗');a.href=url;a.target='_blank';a.rel='noopener';a.title='Открыть в Grafana';a.setAttribute('aria-label','Открыть в Grafana');head.append(a);}
  box.append(head);
  if(p.error){box.append(raw(k.el('p','gf-error',p.error)));return box;}
  if(p.kind==='unsupported'){
   box.classList.add('muted');box.append(k.el('p','gf-unsupported',p.reason||'Этот тип панели не рисуется в чате.'));
   const row=k.el('div','gf-panel-actions');
   if(url){const a=k.el('a','gf-open-text','Открыть в Grafana');a.href=url;a.target='_blank';a.rel='noopener';row.append(a);}
   if(c.render)picture(k,c,p,row);
   box.append(row);return box;
  }
  if(p.empty){box.append(k.el('p','gf-empty','Нет данных за этот период'));return box;}
  box.append(p.kind==='timeseries'?timeseries(k,p):p.kind==='stat'?stat(k,p):p.kind==='bars'?bars(k,p):table(k,p));
  for(const n of [...(p.notes||[]),...(p.warning?[p.warning]:[])])box.append(raw(k.el('p','gf-note',n)));
  return box;
 }

 // The same request for another range: the shown link with new from/to (keeps panel and variables), or the title.
 const RANGES=[{id:'now-24h',label:'Сутки',ask:'за сутки'},{id:'now-7d',label:'Неделя',ask:'за неделю'},{id:'now-30d',label:'Месяц',ask:'за месяц'}];
 function again(c,from){
  const keep=c.viewPanel!==null&&c.viewPanel!==undefined||c.vars.some(v=>v.from!=='dashboard');
  if(keep){try{const u=new URL(c.url);u.searchParams.set('from',from);u.searchParams.set('to','now');return 'Покажи '+u.href;}catch{/* title below */}}
  return 'Покажи дашборд «'+c.title+'» '+(RANGES.find(r=>r.id===from)?.ask||'');
 }
 function dashboardCard(k,c){
  const body=k.el('div','gf-body');
  const bar=k.el('div','gf-toolbar');
  const ranges=k.el('div','gf-ranges');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','Период');
  const current=c.range.raw.to==='now'?c.range.raw.from:null;
  for(const r of RANGES){const chip=k.chip({label:r.label,onClick:()=>k.ask(again(c,r.id),{send:true}),title:current===r.id?'Сейчас':'Показать '+r.ask});chip.dataset.range=r.id;chip.setAttribute('aria-pressed',String(current===r.id||current==='now-1d'&&r.id==='now-24h'));ranges.append(chip);}
  if(!RANGES.some(r=>r.id===current)&&current!=='now-1d'){const own=raw(k.chip({label:c.range.label,title:fullTime(c.range.from)+' — '+fullTime(c.range.to)}));own.setAttribute('aria-pressed','true');own.dataset.range='current';ranges.prepend(own);}
  bar.append(ranges);
  const vars=c.vars.filter(v=>v.text.length);
  if(vars.length){const row=k.el('div','gf-vars');for(const v of vars.slice(0,6)){const chip=k.el('span','gf-var'+(v.from!=='dashboard'?' set':''));chip.append(raw(k.el('span','gf-var-name',v.label)),raw(k.el('span',null,v.text.join(', '))));chip.dataset.var=v.name;row.append(chip);}bar.append(row);}
  body.append(bar);
  const grid=k.el('div','gf-grid');for(const p of c.panels)grid.append(panel(k,c,p));body.append(grid);
  if(c.total>c.panels.length&&c.viewPanel===null)body.append(k.el('p','gf-more-panels','Ещё панелей в Grafana: '+(c.total-c.panels.length)));
  const failed=c.panels.filter(p=>p.error).length;
  const status=failed?{label:'не загрузилось: '+failed,tone:'alert'}:{label:c.viewPanel!==null?'панель':c.panels.length+' '+plural(c.panels.length,['панель','панели','панелей']),tone:'done'};
  const facts=c.panels.filter(p=>p.kind==='stat'&&p.items?.length).slice(0,4).map(p=>(p.title||p.items[0].name)+' '+(p.items[0].text??value(p.items[0].value,p.items[0].unit,p.items[0].decimals)));
  const open=k.el('a','kit-link gf-open-dashboard','Открыть в Grafana');const href=k.safeUrl(c.url);if(href){open.href=href;open.target='_blank';open.rel='noopener';}
  const actions=[open,
   {label:'Обновить',run:()=>k.ask(c.viewPanel!==null||c.range.source==='link'?'Покажи '+c.url:'Покажи дашборд «'+c.title+'» '+(RANGES.find(r=>r.id===current)?.ask||''),{send:true})},
   k.links('share-message',{text:'посмотреть дашборд Grafana «'+c.title+'» ('+c.range.label+')'+(facts.length?': '+facts.join(', '):'')+' — '+c.dashboardUrl})];
  const card=k.card({app:'Grafana',initial:'G',color:'#8a4b17',key:c.title+(c.folder?' · '+c.folder:''),href:c.dashboardUrl,status,subtitle:c.range.label,body,actions,className:'grafana-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  return card;
 }
 function listCard(k,c){
  const body=k.el('div','gf-body');
  const ul=k.el('ul','gf-list');
  let folder=null;
  for(const d of c.items){
   if(d.folder!==folder){folder=d.folder;ul.append(raw(k.el('li','gf-folder',folder||'Без папки')));}
   const li=k.el('li','gf-item');li.dataset.uid=d.uid;
   const name=raw(k.el('button','gf-item-name',d.title));name.type='button';name.title='Показать в чате';name.onclick=()=>k.ask('Покажи дашборд «'+d.title+'»',{send:true});
   li.append(name);
   if(d.tags?.length)li.append(raw(k.el('span','gf-tags',d.tags.join(' · '))));
   const url=k.safeUrl(d.url);if(url){const a=k.el('a','gf-open','↗');a.href=url;a.target='_blank';a.rel='noopener';a.title='Открыть в Grafana';a.setAttribute('aria-label','Открыть в Grafana');li.append(a);}
   ul.append(li);
  }
  body.append(ul);
  if(c.total>c.items.length)body.append(k.el('p','gf-more-panels','Показано '+c.items.length+' из '+c.total));
  const status=c.notFound?{label:'не найдено',tone:'progress'}:{label:c.total+' '+plural(c.total,['дашборд','дашборда','дашбордов']),tone:'done'};
  const card=k.card({app:'Grafana',initial:'G',color:'#8a4b17',key:c.query?'«'+c.query+'»':'Дашборды',href:c.base,status,subtitle:c.notFound?'похожих нет — вот что есть':c.query?'поиск':'',body,className:'grafana-card grafana-list'});
  const key=card.querySelector('.kit-key');if(key&&c.query)raw(key);
  return card;
 }
 window.renderGrafanaCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.grafana-card'))return;
  if(c.kind==='list'&&Array.isArray(c.items))parent.append(listCard(k,c));
  else if(c.kind==='dashboard'&&Array.isArray(c.panels))parent.append(dashboardCard(k,c));
 };
})();
