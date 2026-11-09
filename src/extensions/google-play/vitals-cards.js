// Google Play plugin, renderer: ANR card — the three Android vitals rates, Google's bad-behaviour threshold
// and a per-day chart. Follow-ups («все версии», «за вчера») go back to the chat as ordinary requests.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('vitals-cards.css',document.currentScript.src).href;document.head.append(style);
 // Google Play «bad behaviour» threshold for user-perceived ANR rate (overall).
 const THRESHOLD=0.0047;
 const pct=v=>v===null||v===undefined?'—':(v*100).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%';
 const short=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const tile=(k,label,value,hint,alert)=>k.kpi(pct(value),label,{tone:alert?'alert':'',title:hint});
 // Per-day user-perceived ANR rate against Google's threshold: one series, days over the line in the alert colour.
 function chart(k,days){
  const values=days.map(d=>d.perceived??0);
  return k.bars({labels:days.map(d=>short(d.date)),series:[{id:'perceived',color:'var(--info)',values}],threshold:{value:THRESHOLD,label:'порог '+pct(THRESHOLD)},
   text:i=>short(days[i].date)+'\n'+'заметные ANR '+pct(days[i].perceived)+' · все ANR '+pct(days[i].rate),ariaLabel:'Заметные пользователям ANR по дням',height:84});
 }
 window.renderPlayVitals=(parent,v)=>{
  const k=window.resultKit;if(!k||!v||parent.querySelector('.vitals-card'))return;
  const bad=(v.perceived??0)>=THRESHOLD;
  const body=k.el('div','vitals-body');
  const tiles=k.el('div','vitals-tiles kit-kpis');
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
