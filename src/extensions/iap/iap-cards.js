// «Покупки в игре», renderer: one currency at a time (chips switch between currencies — they are never added up):
// KPI tiles (paid, purchases, refunds, net; payers, new payers, ARPPU, conversion when a source knows buyers), daily
// bars with refunds below the axis, revenue by product as bars with shares, first-purchase products, ROAS with
// purchases per spend currency, the sources and what they said. A database query waits for «Выполнить» (ipc `run`,
// the SQL stored on the card).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('iap-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=(n,d=0)=>Number(n).toLocaleString(locale(),{maximumFractionDigits:d});
 const english=()=>!!window.petyaLanguage&&window.petyaLanguage!=='ru';
 const plural=(n,[a,b,c])=>{if(english())return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const SVG='http://www.w3.org/2000/svg';
 const svg=(tag,attrs={})=>{const n=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 function money(v,code,compact=false){
  if(v===null||v===undefined)return '—';
  if(!code)return fmt(v,2);
  try{return Number(v).toLocaleString(locale(),{style:'currency',currency:code,notation:compact&&Math.abs(v)>=100000?'compact':'standard',maximumFractionDigits:compact&&Math.abs(v)>=100000?1:Math.abs(v)>=1000?0:2});}catch{return fmt(v,2)+' '+code;}
 }
 const pct=v=>v===null||v===undefined?'—':fmt(v*100,v<0.1?2:1)+'%';
 const STORE={appstore:'App Store',googleplay:'Google Play','sql-purchases':'База'};
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});

 function tile(k,label,value,sub,id){const t=k.el('div','iap-tile');if(id)t.dataset.kpi=id;t.append(k.el('span','iap-label',label),raw(k.el('span','iap-value',value)));if(sub)t.append(raw(k.el('span','iap-sub',sub)));return t;}
 function tiles(k,c,b){
  const box=k.el('div','iap-tiles');
  box.append(tile(k,'Оплачено',money(b.amount,b.currency,true),fmt(b.units)+' '+plural(b.units,['покупка','покупки','покупок']),'amount'),
   tile(k,'Возвраты',fmt(b.refunds),b.refunds?pct(b.refundRate)+' · '+money(b.refunded,b.currency,true):'нет','refunds'),
   tile(k,'Нетто',money(b.net,b.currency,true),'',  'net'));
  const p=c.payers;
  if(p){
   const cur=p.byCurrency.find(x=>x.currency===b.currency);
   box.append(tile(k,'Платящих',fmt(p.total),p.newPayers!==null?(english()?'new ':'впервые ')+fmt(p.newPayers):'','payers'),
    tile(k,'ARPPU',cur?.arppu!=null?money(cur.arppu,b.currency):'—',cur?fmt(cur.payers)+' '+plural(cur.payers,['платящий','платящих','платящих']):'','arppu'));
   if(p.conversion)box.append(tile(k,'Конверсия в платящих',pct(p.conversion.value),(english()?'per day · DAU ':'в день · DAU ')+fmt(p.conversion.dau),'conversion'));
  }
  return box;
 }
 function daily(k,b){
  const box=k.el('div','iap-daily');
  const W=592,H=120,L=8,R=8,T=8,mid=92,n=b.days.length,max=Math.max(1e-9,...b.days.map(d=>d.amount)),maxR=Math.max(1e-9,...b.days.map(d=>d.refunded));
  const w=(W-L-R)/Math.max(1,n),bw=Math.max(2,w*0.7);
  const s=svg('svg',{viewBox:'0 0 '+W+' '+H,class:'iap-svg',role:'img','aria-label':'Оплачено по дням'});
  s.append(svg('line',{x1:L,x2:W-R,y1:mid,y2:mid,class:'axis'}));
  const tip=k.el('div','iap-tip','Наведите на день');
  b.days.forEach((d,i)=>{
   const x=L+i*w+(w-bw)/2,h=(mid-T)*d.amount/max;
   const bar=svg('rect',{x,y:mid-h,width:bw,height:Math.max(h,d.amount?1:0),class:'bar','data-date':d.date,rx:1.5});s.append(bar);
   if(d.refunded){const rh=Math.max(1.5,(H-mid-14)*d.refunded/maxR);s.append(svg('rect',{x,y:mid+1,width:bw,height:rh,class:'refund',rx:1}));}
   const hit=svg('rect',{x:L+i*w,y:0,width:w,height:H,class:'hit','data-date':d.date});
   hit.addEventListener('pointerenter',()=>{tip.textContent=day(d.date)+': '+money(d.amount,b.currency)+' · '+fmt(d.units)+' '+plural(d.units,['покупка','покупки','покупок'])+(d.refunded?' · '+(english()?'refunds ':'возвраты ')+money(d.refunded,b.currency):'');});
   s.append(hit);
  });
  const step=Math.max(1,Math.ceil(n/6));
  b.days.forEach((d,i)=>{if(i%step&&i!==n-1)return;const t=svg('text',{x:L+i*w+w/2,y:H-2,class:'tick','text-anchor':i===0?'start':i===n-1?'end':'middle'});t.textContent=day(d.date);s.append(t);});
  raw(tip);box.append(s,tip);return box;
 }
 function bars(k,list,{label,value,share,extra,cls='iap-bars',limit=8}){
  const nodes=list.map(p=>{
   const li=k.el('li');const name=raw(k.el('span','iap-name',label(p)));name.title=p.product||'';
   const track=k.el('span','iap-track'),bar=k.el('span','iap-bar');bar.style.width=Math.max(1,Math.round((share(p)||0)*100))+'%';track.append(bar);
   li.append(name,track,raw(k.el('span','iap-amount',value(p))));
   if(extra){const more=extra(p);li.append(more||k.el('span','iap-refund'));}
   return li;
  });
  const ul=k.el('ul',cls);ul.append(...nodes.slice(0,limit));
  if(nodes.length<=limit)return ul;
  const wrap=k.el('div');const d=k.el('details','iap-more');d.append(k.el('summary',null,(english()?'More':'Ещё')+' · '+(nodes.length-limit)));const rest=k.el('ul',cls);rest.append(...nodes.slice(limit));d.append(rest);wrap.append(ul,d);return wrap;
 }
 function blend(k,c){
  const box=k.el('div','iap-blend');box.append(k.el('div','iap-section','ROAS с покупками'));
  const t=k.el('table','iap-blend-table');const h=k.el('tr');for(const x of ['Валюта','Закупка','Покупки','Реклама','ROAS'])h.append(k.el('th',null,x));
  const thead=k.el('thead');thead.append(h);const tb=k.el('tbody');
  for(const r of c.blend.rows){const tr=k.el('tr');tr.dataset.currency=r.currency;for(const v of [r.currency,money(r.spend,r.currency,true),money(r.iap,r.currency,true),r.ads?money(r.ads,r.currency,true):'—',pct(r.roas)])tr.append(raw(k.el('td',null,v)));tb.append(tr);}
  t.append(thead,tb);box.append(t);
  if(c.blend.spendLeft?.length){const p=k.el('p','iap-note');p.append(k.el('span',null,'Закупка в валюте без покупок: '),raw(k.el('span',null,c.blend.spendLeft.join(', '))));box.append(p);}
  if(c.blend.left.length){const p=k.el('p','iap-note');p.append(k.el('span',null,'Не вошли (другая валюта, курсы не применяю): '),raw(k.el('span',null,c.blend.left.join(', '))));box.append(p);}
  return box;
 }
 function sqlBlock(k,c){
  const box=k.el('div','iap-sql');
  const p=k.el('p','iap-what');p.append(k.el('span',null,'Платящие и первые покупки — из таблицы '),raw(k.el('b',null,c.plan.table||'')),k.el('span',null,' в базе '),raw(k.el('b',null,c.plan.connection.name)));box.append(p);
  box.append(raw(k.el('pre','iap-code selectable',c.plan.sql)));
  const e=c.plan.estimate,est=k.el('p','iap-note');
  if(e?.kind==='bytes')est.append(k.el('span',null,'Прочитает ≈ '),raw(k.el('b',null,fmt(e.value/1024**3,2)+' '+(english()?'GB':'ГБ'))));
  else if(e?.kind==='rows')est.append(k.el('span',null,'Прочитает ≈ '),raw(k.el('b',null,fmt(e.value)+' '+plural(Math.round(e.value),['строку','строки','строк']))));
  else est.append(k.el('span',null,'Стоимость заранее не известна'));
  box.append(est);return box;
 }

 function render(parent,c,before){
  const k=window.resultKit;
  const state={currency:(c.filter?.currency&&c.currencies.find(b=>b.currency===c.filter.currency)?.currency)??c.currencies[0]?.currency};
  const body=k.el('div','iap-body');
  const holder=k.el('div','iap-holder');
  const chips=k.el('div','iap-currencies');chips.setAttribute('role','group');
  const paint=()=>{
   const b=c.currencies.find(x=>x.currency===state.currency);
   const out=[];
   if(b){
    out.push(tiles(k,c,b),daily(k,b));
    out.push(k.el('div','iap-section','По продуктам'),bars(k,b.products,{label:p=>p.title||p.product,value:p=>money(p.amount,b.currency,true),share:p=>p.share,
     extra:p=>{if(!p.refunds)return null;const r=raw(k.el('span','iap-refund',(english()?'refunds ':'возвр. ')+fmt(p.refunds)));r.title=money(p.refunded,b.currency);return r;}}));
   }
   if(c.payers?.first?.length){out.push(k.el('div','iap-section','Первая покупка'),bars(k,c.payers.first,{label:p=>p.title||p.product,value:p=>fmt(p.payers)+' · '+pct(p.share),share:p=>p.share,cls:'iap-bars first',limit:6}));}
   if(c.blend)out.push(blend(k,c));
   holder.replaceChildren(...out);
   for(const chip of chips.children)chip.setAttribute('aria-pressed',String(chip.dataset.currency===state.currency));
  };
  if(c.currencies.length>1){for(const b of c.currencies){const chip=raw(k.chip({label:(b.currency||'—')+' · '+money(b.amount,b.currency,true),onClick:()=>{state.currency=b.currency;paint();}}));chip.dataset.currency=b.currency;chips.append(chip);}body.append(chips);}
  body.append(holder);paint();
  if(c.state==='pending'&&c.plan)body.append(sqlBlock(k,c));
  if(!c.payers&&c.state!=='pending'&&['payers','first'].includes(c.view))body.append(k.el('p','iap-note','Платящих и первые покупки сторы не сообщают — нужна таблица покупок в базе («SQL по словам»).'));
  const notes=k.el('ul','iap-sources');
  for(const x of c.sources){const li=k.el('li',x.ok?'ok':'failed');li.append(raw(k.el('b',null,STORE[x.id]||x.name)),raw(k.el('span',null,x.ok?' — '+fmt(x.rows)+' '+plural(x.rows,['строка','строки','строк'])+(x.truncated?' (обрезано)':''):' — '+x.error)));notes.append(li);for(const n of x.notes||[]){const m=raw(k.el('li','note',n));notes.append(m);}}
  if(c.dauSource&&c.payers?.conversion){const li=k.el('li','note');li.append(k.el('span',null,'DAU для конверсии: '),raw(k.el('span',null,c.dauSource)));notes.append(li);}
  body.append(notes);
  const b0=c.currencies.find(x=>x.currency===state.currency);
  const status=c.state==='pending'?{label:'ждёт запуска',tone:'progress'}:c.empty?{label:'нет покупок',tone:'progress'}:b0&&b0.refundRate>=0.05?{label:'возвраты '+pct(b0.refundRate),tone:'alert'}:{label:'готово',tone:'done'};
  const actions=[];
  if(c.state==='pending')actions.push({label:'Выполнить',primary:true,run:async btn=>{btn.textContent=window.t?window.t('Выполняю…'):'Выполняю…';const next=await window.petya.feature('iap','run',c.id);const h=document.createElement('div');card.replaceWith(h);render(h.parentNode,next,h);h.remove();}});
  if(!c.empty){
   actions.push(k.links('spreadsheet-export',()=>{const b=c.currencies.find(x=>x.currency===state.currency);return {title:'Покупки в игре · '+c.period.from+' – '+c.period.to+' · '+(b.currency||'валюта не указана'),sheet:'Покупки '+(b.currency||''),app:'Покупки в игре',
    header:['Продукт','Название','Тип','Покупок','Оплачено','Возвратов','Возвращено','Нетто','Валюта'],rows:b.products.map(p=>[p.product,p.title,p.type==='subscription'?'подписка':'покупка',p.units,p.amount,p.refunds,p.refunded,p.net,b.currency])};},{label:'Выгрузить в Google Таблицы'}));
   if(b0)actions.push(k.links('share-message',{text:'покупки в игре '+c.period.label+': '+fmt(b0.units)+' покупок на '+money(b0.amount,b0.currency)+(b0.refunds?', возвратов '+fmt(b0.refunds):'')+(b0.products[0]?'; лучший продукт — '+(b0.products[0].title||b0.products[0].product):'')}));
  }
  const card=k.card({app:'Покупки в игре',initial:'П',color:'#6b5a3d',key:c.sources.filter(x=>x.ok).map(x=>STORE[x.id]||x.name).join(' · ')||'Покупки',status,subtitle:c.period.label,body,actions,className:'iap-card'});
  card.dataset.state=c.state;card.dataset.card=c.id;
  const key=card.querySelector('.kit-key');if(key)raw(key);
  if(before)parent.insertBefore(card,before);else parent.append(card);
  return card;
 }
 window.renderIapCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||!c.id||parent.querySelector('.iap-card'))return;
  render(parent,c);
 };
})();
