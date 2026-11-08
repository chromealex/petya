// Google Play plugin, renderer: ANR card — the three Android vitals rates, Google's bad-behaviour threshold
// and a per-day chart. Follow-ups («все версии», «за вчера») go back to the chat as ordinary requests.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('vitals-cards.css',document.currentScript.src).href;document.head.append(style);
 // Google Play «bad behaviour» threshold for user-perceived ANR rate (overall).
 const THRESHOLD=0.0047;
 const pct=v=>v===null||v===undefined?'—':(v*100).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%';
 const short=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 function tile(k,label,value,hint,alert){const box=k.el('div','vitals-tile'+(alert?' alert':''));box.append(k.el('span','vitals-value',pct(value)),k.el('span','vitals-label',label));if(hint)box.title=hint;return box;}
 function chart(k,days){
  const box=k.el('div','vitals-chart');const values=days.map(d=>d.perceived??0);const max=Math.max(THRESHOLD*1.25,...values)||1;
  const tip=k.el('div','vitals-tip','Наведите на день');
  const bars=k.el('div','vitals-bars');bars.setAttribute('role','list');
  const line=k.el('div','vitals-threshold');line.style.bottom=(100*THRESHOLD/max)+'%';line.title='Порог Google Play: '+pct(THRESHOLD);line.append(k.el('span',null,'порог '+pct(THRESHOLD)));
  for(const d of days){
   const bar=k.el('button','vitals-bar'+((d.perceived??0)>=THRESHOLD?' alert':''));bar.type='button';bar.setAttribute('role','listitem');
   bar.style.height=Math.max(2,100*(d.perceived??0)/max)+'%';
   const text=short(d.date)+': заметные ANR '+pct(d.perceived)+', все ANR '+pct(d.rate);bar.setAttribute('aria-label',text);
   bar.onpointerenter=bar.onfocus=()=>{tip.textContent=text;};bar.onpointerleave=bar.onblur=()=>{tip.textContent='Наведите на день';};
   bars.append(bar);
  }
  const axis=k.el('div','vitals-axis');axis.append(k.el('span',null,short(days[0].date)),k.el('span',null,short(days.at(-1).date)));
  const plot=k.el('div','vitals-plot');plot.append(bars,line);
  box.append(plot,axis,tip);return box;
 }
 window.renderPlayVitals=(parent,v)=>{
  const k=window.resultKit;if(!k||!v||parent.querySelector('.vitals-card'))return;
  const bad=(v.perceived??0)>=THRESHOLD;
  const body=k.el('div','vitals-body');
  const tiles=k.el('div','vitals-tiles');
  tiles.append(tile(k,'заметные пользователям',v.perceived,'User-perceived ANR rate: доля пользователей с заметным зависанием',bad),tile(k,'все ANR',v.rate,'ANR rate'),tile(k,'заметные за 7 дней',v.week,'Средневзвешенный по пользователям показатель за 7 дней',(v.week??0)>=THRESHOLD));
  body.append(tiles);
  if(v.days?.length>1)body.append(chart(k,v.days));
  const actions=[];
  if(v.versionCode)actions.push({label:'Все версии',run:()=>k.ask('ANR '+v.app+' по всем версиям',{send:true})});
  else actions.push({label:'По версии…',run:()=>k.ask('ANR '+v.app+' для versionCode ')});
  actions.push({label:'За вчера',run:()=>k.ask('ANR '+v.app+' за вчера',{send:true})});
  actions.push({label:'Что делать?',title:'Петя предложит, что проверить',run:()=>k.ask('Что проверить, чтобы снизить ANR '+v.app+'?')});
  const card=k.card({app:'Google Play',initial:'▶',color:'#01875f',key:v.app,status:{label:bad?'выше порога Google':'в норме',tone:bad?'alert':'done',title:'Порог плохого поведения Google Play — '+pct(THRESHOLD)},
   subtitle:(v.versionCode?'versionCode '+v.versionCode+' · ':'')+'данные за '+short(v.date),body,actions,className:'vitals-card'});
  parent.append(card);
 };
})();
