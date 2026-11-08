// «Подписки и продления», renderer: the monthly total per currency, the services with amount and period, the next
// charge (highlighted within a week) and a sparkline of past charges, renewals of domains, certificates and licenses
// by expiry, and actions: «Напомнить перед списанием» (a request to «Напоминания» when it is added), «Открыть письмо»,
// «Не подписка» (with «Отменить») and «Обновить из почты».
(()=>{
 if(window.renderSubscriptionsCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('subs-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('subscriptionsApp',method,...args);
 const NS='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const money=(n,c)=>{try{return new Intl.NumberFormat(locale(),{style:'currency',currency:c,maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);}catch{return n+' '+c;}};
 const date=(d,opts={day:'numeric',month:'long'})=>new Date(d+'T12:00:00').toLocaleDateString(locale(),opts);
 const inDays=n=>{try{return new Intl.RelativeTimeFormat(locale(),{numeric:'auto'}).format(n,'day');}catch{return n+' дн.';}};
 const PER={month:'в месяц',year:'в год',week:'в неделю',quarter:'в квартал'};
 const KIND={domain:'Домен',certificate:'Сертификат',license:'Лицензия',subscription:'Подписка'};
 const open=url=>{if(typeof window.openChatBrowser==='function')window.openChatBrowser(url);else window.open(url,'_blank','noopener');};
 // Static stroke icons for the row tools (never data).
 const ICONS={
  remind:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  mail:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
  hide:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 20L20 4"/></svg>'};
 const tool=(k,icon,label,run)=>{const b=k.el('button','subs-tool');b.type='button';b.innerHTML=ICONS[icon];b.title=label;b.setAttribute('aria-label',label);b.dataset.tool=icon;b.onclick=run;return b;};
 const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};

 // Past charges as a sparkline: amounts over time, one dot per charge, the last one stressed.
 function sparkline(charges,currency){
  const W=96,H=26,P=3;
  const s=svg('svg',{viewBox:'0 0 '+W+' '+H,width:W,height:H,class:'subs-spark',role:'img'});
  const pts=charges.slice(-12);
  if(!pts.length)return s;
  const t=pts.map(c=>new Date(c.date+'T12:00:00').getTime()),a=pts.map(c=>c.amount);
  const t0=Math.min(...t),t1=Math.max(...t),lo=Math.min(...a),hi=Math.max(...a);
  const x=v=>pts.length===1?W-P:P+(t1===t0?0:(v-t0)/(t1-t0))*(W-2*P);
  const y=v=>hi===lo?H/2:H-P-(v-lo)/(hi-lo)*(H-2*P);
  if(pts.length>1)s.append(svg('polyline',{points:pts.map((c,i)=>x(t[i]).toFixed(1)+','+y(a[i]).toFixed(1)).join(' '),fill:'none',stroke:'currentColor','stroke-width':1.4,'stroke-linejoin':'round',opacity:.55}));
  pts.forEach((c,i)=>s.append(svg('circle',{cx:x(t[i]).toFixed(1),cy:y(a[i]).toFixed(1),r:i===pts.length-1?2.6:1.7,fill:i===pts.length-1?'#c9ed9d':'currentColor'})));
  s.setAttribute('aria-label',pts.map(c=>date(c.date,{day:'numeric',month:'short'})+' '+money(c.amount,currency)).join(', '));
  const title=svg('title',{});title.textContent=s.getAttribute('aria-label');s.prepend(title);
  return s;
 }
 function totals(k,c){
  const box=k.el('div','subs-totals');
  for(const t of c.totals){
   const tile=k.el('div','subs-tile');const v=k.el('strong',null,money(t.monthly,t.currency));v.dataset.noI18n='';
   const y=k.el('small',null,money(t.yearly,t.currency)+' в год');y.dataset.noI18n='';
   tile.append(v,k.el('small',null,'в месяц'),y);box.append(tile);
  }
  const week=k.el('div','subs-tile'+(c.week?' is-soon':''));week.append(k.el('strong',null,String(c.week)),k.el('small',null,'спишется или истечёт за 7 дней'));box.append(week);
  return box;
 }
 function service(k,c,sv,repaint){
  const li=k.el('li','subs-row'+(sv.days!==null&&sv.days<=7?' is-soon':'')+(sv.status==='lapsed'?' is-lapsed':''));
  const name=k.el('div','subs-name');
  const title=k.el('b',null,sv.merchant);title.dataset.noI18n='';name.append(title);
  const sub=[sv.platform?'через '+sv.platform:'',sv.periodSource==='history'?'период по истории платежей':''].filter(Boolean).join(' · ');
  if(sub)name.append(k.el('small',null,sub));
  const price=k.el('div','subs-price');const amount=k.el('span',null,money(sv.amount,sv.currency));amount.dataset.noI18n='';
  if(sv.evidence?.amount)amount.title=sv.evidence.amount;
  price.append(amount);if(sv.period)price.append(k.el('small',null,PER[sv.period]));
  const next=k.el('div','subs-next');
  if(sv.status==='lapsed')next.append(k.el('small',null,'платежей давно не было'));
  else if(sv.next){next.append(k.el('span',null,inDays(sv.days)));next.append(k.el('small',null,date(sv.next)));if(sv.evidence?.nextCharge)next.title=sv.evidence.nextCharge;}
  else next.append(k.el('small',null,'дата неизвестна'));
  const tools=k.el('div','subs-tools');
  if(c.reminders&&sv.remind&&sv.status==='active')tools.append(tool(k,'remind','Напомнить перед списанием',()=>k.ask(sv.remind,{send:true})));
  if(sv.url)tools.append(tool(k,'mail','Открыть письмо',()=>open(sv.url)));
  const hide=tool(k,'hide','Не подписка — скрыть',null);
  hide.onclick=async()=>{hide.disabled=true;try{await call('hide',sv.merchant);li.remove();k.toast('«'+sv.merchant+'» скрыт',{undo:async()=>{await call('hide',sv.merchant,true);repaint();}});}catch(e){k.toast(e.message,{error:true});hide.disabled=false;}};
  tools.append(hide);
  li.append(name,price,sparkline(sv.charges,sv.currency),next,tools);
  return li;
 }
 function renewal(k,r){
  const li=k.el('li','subs-renewal'+(r.days<=14?' is-soon':'')+(r.days<0?' is-over':''));
  const name=k.el('b',null,r.name);name.dataset.noI18n='';
  const left=Math.max(0,Math.min(1,1-r.days/90));
  const bar=k.el('div','subs-life');const fill=k.el('span');fill.style.width=(left*100)+'%';bar.append(fill);bar.title='Осталось '+r.days+' дн.';
  li.append(k.el('span','subs-kind',KIND[r.kind]||r.kind),name,bar,k.el('span','subs-when',r.days<0?'истёк '+date(r.expires):'до '+date(r.expires)+' · '+inDays(r.days)));
  li.append(r.url?tool(k,'mail','Открыть письмо',()=>open(r.url)):k.el('span'));
  return li;
 }
 window.renderSubscriptionsCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.subs-card'))return;
  const body=k.el('div','subs-body');
  const paint=data=>{
   body.replaceChildren();
   if(!data.services.length&&!data.renewals.length){body.append(k.el('p','kit-meta',data.status?.records?'Все найденные сервисы скрыты.':'В почте пока не нашлось подписок и продлений. Петя читает только письма, похожие на чеки, подписки и продления.'));return;}
   if(data.totals.length||data.week)body.append(totals(k,data));
   const active=data.services.filter(s=>s.status==='active'),lapsed=data.services.filter(s=>s.status==='lapsed');
   if(active.length){body.append(k.el('h5','subs-h','Подписки'));const ul=k.el('ul','subs-list');for(const sv of active)ul.append(service(k,data,sv,()=>refresh()));body.append(ul);}
   if(data.renewals.length){body.append(k.el('h5','subs-h','Продления'));const ul=k.el('ul','subs-list renewals');for(const r of data.renewals)ul.append(renewal(k,r));body.append(ul);}
   if(lapsed.length){const more=k.el('details','subs-more');more.append(k.el('summary',null,'Похоже, отменены · '+lapsed.length));const ul=k.el('ul','subs-list');for(const sv of lapsed)ul.append(service(k,data,sv,()=>refresh()));more.append(ul);body.append(more);}
   body.append(k.el('small','kit-meta','Суммы — из писем, без пересчёта валют. Наведите на сумму или дату, чтобы увидеть строку письма.'));
  };
  let data=c;paint(data);
  const refresh=async()=>{const r=await call('refresh');data=r.subscriptionsCard||data;paint(data);k.toast('Прочитано писем: '+r.read+', новых записей: '+r.added);};
  const count=c.services.filter(s=>s.status==='active').length;
  const status=count?{label:count+' активн.',tone:'done'}:{label:'нет подписок',tone:'accent'};
  parent.append(k.card({app:'Подписки',initial:'↻',color:'#5a6a8a',key:'Подписки и продления',status,body,actions:[{label:'Обновить из почты',run:refresh}],className:'subs-card'}));
 };
})();
