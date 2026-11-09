// «Аномалии», renderer: each anomaly with a sparkline of the last 35 days — the baseline band (median ± k·σ of the
// same weekdays), the baseline days marked, the anomalous day as a red (bad) or green (good) point — its impact, the
// source, «Почему?» (asks the app that owns the data) and «Не показывать такое» (a mute rule, with «Отменить»).
// Days without data are listed as missing data, never drawn as zeros.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('anomaly-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('anomalies',method,...args);
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const NS='http://www.w3.org/2000/svg';
 const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const locale=()=>window.petyaLocale||'ru-RU';
 function value(v,unit){
  if(v===null||v===undefined||!Number.isFinite(v))return '—';
  if(unit==='stars')return v.toLocaleString(locale(),{maximumFractionDigits:1})+'★';
  const cur=/^currency:([A-Z]{3})$/.exec(unit||'')?.[1];
  if(cur){try{return v.toLocaleString(locale(),{style:'currency',currency:cur,maximumFractionDigits:0});}catch{/* unknown currency */}}
  return Math.round(v).toLocaleString(locale());
 }
 const dayText=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'});

 // Sparkline 200×48: band, line with gaps, baseline days, the anomalous point.
 function sparkline(x){
  const W=200,H=48,P=4,s=x.spark,vals=s.values;
  const nums=vals.filter(v=>v!==null);const lo=Math.min(...nums,s.band[0]),hi=Math.max(...nums,s.band[1]);
  const span=hi-lo||1,X=i=>P+i*(W-2*P)/Math.max(1,vals.length-1),Y=v=>H-P-(v-lo)/span*(H-2*P);
  const root=svg('svg',{viewBox:'0 0 '+W+' '+H,width:W,height:H,class:'an-spark',role:'img'});
  root.setAttribute('aria-label',(window.t?window.t('Обычный диапазон'):'Обычный диапазон')+' '+value(Math.max(0,s.band[0]),x.unit)+'–'+value(s.band[1],x.unit));
  const top=Y(Math.min(hi,s.band[1])),bottom=Y(Math.max(lo,s.band[0]));
  root.append(svg('rect',{x:P,y:top,width:W-2*P,height:Math.max(1,bottom-top),class:'an-band',rx:2}));
  root.append(svg('line',{x1:P,x2:W-P,y1:Y(x.median),y2:Y(x.median),class:'an-median'}));
  let d='',pen=false;
  vals.forEach((v,i)=>{if(v===null){pen=false;return;}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)+' ';pen=true;});
  root.append(svg('path',{d:d.trim(),class:'an-line'}));
  vals.forEach((v,i)=>{if(v!==null&&s.baseline[i])root.append(svg('circle',{cx:X(i),cy:Y(v),r:2.2,class:'an-base'}));});
  const i=s.index;if(vals[i]!==null)root.append(svg('circle',{cx:X(i),cy:Y(vals[i]),r:3.6,class:'an-point '+(x.bad?'bad':'good')}));
  return root;
 }

 function item(k,x,card){
  const li=k.el('li','an-item'+(x.bad?' bad':' good'));li.dataset.key=x.id;
  const text=k.el('div','an-text');
  const head=raw(k.el('div','an-headline',x.headline));
  const facts=k.el('div','an-facts');
  facts.append(raw(k.el('span','an-delta '+(x.bad?'bad':'good'),x.delta)));
  facts.append(k.el('span','an-usual','обычно'),raw(k.el('span','an-usual-value',value(x.median,x.unit))));
  if(x.context&&x.context.change!==null&&x.context.change!==undefined)facts.append(k.el('span','an-context','в целом'),raw(k.el('span','an-context-value',(x.context.change<0?'−':'+')+Math.abs(Math.round(x.context.change*100))+'%')));
  const chips=k.el('div','an-chips');
  chips.append(raw(k.chip({label:x.sourceName})));
  if(x.also?.length)chips.append(raw(k.chip({label:'+ '+x.also.join(', ')})));
  if(x.related?.length)chips.append(k.el('span','an-related','также:'),raw(k.el('span','an-related-list',x.related.join(', '))));
  if(x.baselineKind==='recent')chips.append(k.chip({label:'короткая история',title:'Сравнение с предыдущими днями: одинаковых дней недели в истории меньше трёх'}));
  if(card.mode==='week')chips.append(raw(k.el('span','an-day',dayText(x.day))));
  text.append(head,facts,chips);
  const actions=k.el('div','an-actions');
  if(x.ask){const b=k.el('button',null,'Почему?');b.type='button';b.onclick=()=>k.ask(x.ask,{send:true});actions.append(b);}
  const mute=k.el('button','quiet','Не показывать такое');mute.type='button';mute.title=x.muteLabel||'';
  mute.onclick=async()=>{mute.disabled=true;
   try{await call('mute',x.mute,x.muteLabel);li.hidden=true;
    k.toast('Скрыл: '+(x.muteLabel||''),{undo:async()=>{await call('unmute',x.mute);li.hidden=false;mute.disabled=false;}});}
   catch(e){mute.disabled=false;k.toast(e.message,{error:true});}};
  actions.append(mute);text.append(actions);
  li.append(text,sparkline(x));
  return li;
 }

 window.renderAnomalies=(parent,card)=>{
  const k=window.resultKit;if(!k||!card||!Array.isArray(card.items)||parent.querySelector('.an-card'))return;
  const body=k.el('div','an-body');
  if(card.items.length){const list=k.el('ul','an-list');for(const x of card.items)list.append(item(k,x,card));body.append(list);}
  else if(card.sources?.length)body.append(k.el('p','an-calm',card.mode==='week'?'За неделю всё в пределах обычного.':'Вчера всё в пределах обычного.'));
  const missing=(card.notes||[]).filter(n=>n.missing),other=(card.notes||[]).filter(n=>!n.missing);
  if(missing.length||other.length){
   const box=k.el('div','an-notes');
   if(missing.length){box.append(k.el('div','an-notes-title','Нет данных — это не аномалия'));const ul=raw(k.el('ul'));for(const n of missing)ul.append(k.el('li',null,n.text));box.append(ul);}
   if(other.length){const ul=raw(k.el('ul','an-other'));for(const n of other)ul.append(k.el('li',n.error?'error':null,n.text));box.append(ul);}
   body.append(box);
  }
  const SENS={low:'низкая',normal:'обычная',high:'высокая'};
  const meta=k.el('div','an-meta');
  if(card.sources?.length){meta.append(k.el('span',null,'Проверено:'),raw(k.el('span',null,card.sources.map(x=>x.name).join(', '))));}
  meta.append(k.el('span',null,'Чувствительность: '+(SENS[card.sensitivity]||SENS.normal)));
  if(card.hidden)meta.append(k.el('span',null,'Скрыто правилами: '+card.hidden));
  body.append(meta);
  const n=card.items.length;
  const status=n?{label:'Аномалий: '+n,tone:card.items.some(x=>x.bad)?'alert':'progress'}:card.sources?.length?{label:'всё спокойно',tone:'done'}:{label:'нет данных'};
  const actions=[];
  if(card.mode!=='week')actions.push({label:'За неделю',run:()=>k.ask('есть аномалии за неделю?',{send:true})});
  actions.push({label:'Настроить',run:async()=>{if(typeof view==='function')view('settings');const el=document.querySelector('[data-extension="anomalies"]');if(el)window.revealSettings?.(el);else await window.extensionHost?.open?.('anomalies');}});
  const range=card.mode==='week'?dayText(card.from)+' — '+dayText(card.to):dayText(card.day);
  parent.append(k.card({app:'Аномалии',initial:'≈',color:'#5d4d86',key:card.mode==='week'?'Аномалии за неделю':'Аномалии за вчера',status,subtitle:range,body,actions,className:'an-card'}));
 };
})();
