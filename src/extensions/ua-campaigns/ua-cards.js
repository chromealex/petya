// «Закупка трафика», renderer: spend, installs, CPI and ROAS tiles, spend per day as bars with installs as a line,
// networks with spend share bars and CPI, the most expensive campaigns, top countries. All values as text.
(()=>{
 if(window.renderUaCampaigns)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('ua-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const money=(v,c)=>{try{return Number(v||0).toLocaleString(locale(),{style:'currency',currency:c||'USD',maximumFractionDigits:Math.abs(v)>=1000?0:2});}catch{return Number(v||0).toFixed(2)+' '+c;}};
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const pct=v=>v==null?'—':(v*100).toLocaleString(locale(),{maximumFractionDigits:v<0.1?2:1})+'%';
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const region=c=>{try{return new Intl.DisplayNames([locale()],{type:'region'}).of(c)||c;}catch{return c;}};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 const COLORS=['#7fb2e5','#c9ed9d','#e5ce8c','#d8a8e8','#f0b4a8','#9fd8cf'];

 function chart(k,c){
  const box=k.el('div','ua-chart');
  const head=k.el('div','ua-chart-head');head.append(k.el('span',null,'Траты по дням'));
  const legend=k.el('span','ua-legend');legend.append(k.el('i','ua-key spend'),k.el('span',null,'траты'),k.el('i','ua-key installs'),k.el('span',null,'установки'));head.append(legend);
  const W=580,H=96,n=c.daily.length,gap=n>20?2:4,bw=Math.max(3,(W-gap*(n-1))/Math.max(1,n));
  const top=Math.max(...c.daily.map(d=>d.spend),1),topI=Math.max(...c.daily.map(d=>d.installs),1);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('class','ua-svg');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Траты по дням: '+c.daily.map(d=>day(d.date)+' '+money(d.spend,c.currency)).join(', '));
  const pts=[];
  c.daily.forEach((d,i)=>{
   const x=i*(bw+gap),h=Math.max(d.spend?2:0,(H-6)*d.spend/top);
   const r=document.createElementNS(ns,'rect');r.setAttribute('x',x.toFixed(1));r.setAttribute('y',(H-h).toFixed(1));r.setAttribute('width',bw.toFixed(1));r.setAttribute('height',h.toFixed(1));r.setAttribute('rx','2');r.setAttribute('class','ua-bar');
   const t=document.createElementNS(ns,'title');t.textContent=day(d.date)+': '+money(d.spend,c.currency)+', '+fmt(d.installs)+' '+plural(d.installs,['установка','установки','установок'])+(d.cpi!=null?', CPI '+money(d.cpi,c.currency):'');r.append(t);svg.append(r);
   pts.push([x+bw/2,H-4-(H-12)*d.installs/topI]);
  });
  if(pts.length>1){const l=document.createElementNS(ns,'polyline');l.setAttribute('points',pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' '));l.setAttribute('class','ua-line');svg.append(l);}
  const axis=k.el('div','ua-axis');axis.append(k.el('span',null,day(c.daily[0].date)),k.el('span',null,day(c.daily.at(-1).date)));
  box.append(head,svg,axis);
  return box;
 }
 function networks(k,c){
  const box=k.el('div','ua-networks');box.setAttribute('role','list');
  const total=c.totals.spend||1;
  c.networks.forEach((x,i)=>{
   const row=k.el('div','ua-net');row.setAttribute('role','listitem');row.style.setProperty('--c',COLORS[i%COLORS.length]);
   const name=k.el('div','ua-net-name');name.append(k.el('i'),raw(k,'span',null,x.network));
   const bar=k.el('span','ua-share');const fill=k.el('span');fill.style.width=Math.max(2,100*x.spend/total)+'%';bar.append(fill);
   const nums=k.el('div','ua-net-nums');nums.append(k.el('strong',null,money(x.spend,c.currency)),k.el('span',null,fmt(x.installs)+' уст.'),k.el('span','ua-cpi','CPI '+(x.cpi!=null?money(x.cpi,c.currency):'—')));
   row.append(name,bar,nums);box.append(row);
  });
  return box;
 }
 function campaigns(k,c){
  const cpis=c.campaigns.map(x=>x.cpi).filter(v=>v!=null).sort((a,b)=>a-b);const median=cpis.length?cpis[Math.floor(cpis.length/2)]:null;
  const rows=c.campaigns.map(x=>{
   const row=k.el('div','ua-camp');
   const who=k.el('div','ua-camp-who');who.append(raw(k,'span','ua-camp-name',x.campaign),raw(k,'span','ua-camp-net',x.network));
   const cpi=k.el('span','ua-camp-cpi'+(median&&x.cpi!=null&&x.cpi>median*1.5?' high':''),x.cpi!=null?money(x.cpi,c.currency):'—');if(median&&x.cpi>median*1.5)cpi.title='CPI в полтора раза выше медианы кампаний';
   row.append(who,k.el('span','ua-num',money(x.spend,c.currency)),k.el('span','ua-num',fmt(x.installs)),cpi);return row;
  });
  const head=k.el('div','ua-camp ua-camp-head');head.append(k.el('span',null,'Кампания'),k.el('span','ua-num','Траты'),k.el('span','ua-num','Установки'),k.el('span','ua-num','CPI'));
  const box=k.el('div','ua-camps');box.append(head,k.collapse(rows,6,'Ещё кампании'));
  return box;
 }

 window.renderUaCampaigns=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.ua-card'))return;
  const body=k.el('div','ua-body');
  if(c.empty)body.append(k.el('p','ua-muted','Расходов за этот период нет.'));
  else{
   const tiles=k.el('div','ua-tiles');
   const tile=(v,l,cls='')=>{const t=k.el('div','ua-tile'+(cls?' '+cls:''));t.append(k.el('strong',null,v),k.el('span',null,l));tiles.append(t);};
   tile(money(c.totals.spend,c.currency),'траты');tile(fmt(c.totals.installs),plural(c.totals.installs,['установка','установки','установок']));
   tile(c.totals.cpi!=null?money(c.totals.cpi,c.currency):'—','CPI');tile(pct(c.totals.ctr),'CTR');
   if(c.roas?.value!=null){tile(pct(c.roas.value),'ROAS по рекламе',c.roas.value>=1?'good':'low');tiles.lastChild.title='Выручка с рекламы '+money(c.roas.revenue,'USD')+' ('+c.roas.sources.join(', ')+') ÷ траты; без покупок';}
   body.append(tiles);
   if(c.daily.length>1)body.append(chart(k,c));
   if(c.networks.length)body.append(k.el('div','ua-section','Сети'),networks(k,c));
   if(c.campaigns.length)body.append(k.el('div','ua-section','Кампании'),campaigns(k,c));
   if(c.countries.length){const ul=k.el('div','ua-countries');for(const x of c.countries){const chip=k.el('span','ua-country');chip.append(raw(k,'b',null,region(x.country)),' '+money(x.spend,c.currency)+(x.cpi!=null?' · CPI '+money(x.cpi,c.currency):''));ul.append(chip);}body.append(k.el('div','ua-section','Страны'),ul);}
  }
  for(const n of c.notes||[])body.append(raw(k,'p','ua-note',n));
  const actions=[];
  if(c.period?.label!=='за 30 дней')actions.push({label:'За 30 дней',run:()=>k.ask('Сколько потратили на закупку за 30 дней',{send:true})});
  if(c.period?.label!=='вчера')actions.push({label:'Вчера',run:()=>k.ask('Расходы на закупку вчера',{send:true})});
  const status=c.empty?{label:'нет трат',tone:''}:c.roas?.value!=null?{label:'ROAS '+pct(c.roas.value),tone:c.roas.value>=1?'done':'alert'}:{label:'CPI '+(c.totals.cpi!=null?money(c.totals.cpi,c.currency):'—'),tone:'progress'};
  parent.append(k.card({app:'Закупка трафика',initial:'↗',color:'#4a5d3a',key:(c.sources||[]).join(' + '),status,subtitle:(c.period?.label||'')+(c.period?.partial?' · неполные данные':''),body,actions,className:'ua-card'}));
 };
})();
