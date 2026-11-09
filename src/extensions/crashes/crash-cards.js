// «Крэши», renderer: totals for the period and per crash source, a stacked daily events chart (by source or by the
// top five issues and the rest), and the top issues grouped by source with a source chip, level, «новый» mark,
// events/users and a 14-day sparkline. Per issue: open it in its service, a task in the connected tracker and a
// Programmer request (cross-app links: their own flows confirm), and «Решено» for sources that can resolve, which
// changes the service only when pressed and can be undone from the toast.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('crash-cards.css',document.currentScript.src).href;document.head.append(style);
 const COLORS=['#f0b4a8','#e5ce8c','#86c2ff','#c9a8f0','#9dd9c9'],REST='#5d6863',NEUTRAL='#8d9893';
 const SVG='http://www.w3.org/2000/svg';
 // Numbers and dates follow the interface language.
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const short=n=>n>=1000?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:n>=10000?0:1}).format(n):fmt(n);
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const date=iso=>{const d=new Date(iso);return !iso||isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'});};
 const pct=v=>(v*100).toLocaleString(locale(),{maximumFractionDigits:2})+'%';
 // Service, user and model text (crash titles, culprits, slugs, source names) is never machine-translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const LEVEL={fatal:{label:'fatal',tone:'alert'},error:{label:'error',tone:'alert'},warning:{label:'warning',tone:'progress'},info:{label:'info',tone:''},debug:{label:'debug',tone:''}};
 const feature=(method,...args)=>window.petya.feature('crashes',method,...args);
 const open=url=>{const safe=window.resultKit.safeUrl(url);if(safe)window.open(safe,'_blank','noopener');};

 const tile=(k,value,label,{alert=false,title,note}={})=>{const box=k.kpi(value,label,{tone:alert?'alert':'',title,note});box.classList.add('crash-tile');return box;};
 function sourceChip(k,src){const chip=k.el('span','crash-source',src?.name||'');raw(chip);chip.style.setProperty('--source',src?.color||NEUTRAL);chip.title='Источник: '+(src?.name||'');return chip;}

 function sparkline(values){
  const w=96,h=26,max=Math.max(1,...values),step=values.length>1?w/(values.length-1):w;
  const pts=values.map((v,i)=>[+(i*step).toFixed(1),+(h-2-(h-4)*v/max).toFixed(1)]);
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('class','crash-spark');svg.setAttribute('aria-hidden','true');
  const area=document.createElementNS(SVG,'polygon');area.setAttribute('points',[...pts,[w,h],[0,h]].map(p=>p.join(',')).join(' '));area.setAttribute('class','area');
  const line=document.createElementNS(SVG,'polyline');line.setAttribute('points',pts.map(p=>p.join(',')).join(' '));line.setAttribute('class','line');
  const last=document.createElementNS(SVG,'circle');last.setAttribute('cx',pts.at(-1)[0]);last.setAttribute('cy',pts.at(-1)[1]);last.setAttribute('r','2');last.setAttribute('class','dot');
  svg.append(area,line,last);return svg;
 }

 // Per-source strip: each source's share of the events, its counts, and a click asks for that source only.
 function sourceStrip(k,c){
  const box=k.el('div','crash-sources');box.setAttribute('role','list');
  const total=Math.max(1,c.totals?.events||0);
  for(const x of c.sources){
   const item=k.el('button','crash-src'+(x.error?' failed':''));item.type='button';item.setAttribute('role','listitem');item.dataset.source=x.id;item.style.setProperty('--source',x.color||NEUTRAL);
   const head=k.el('span','crash-src-head');head.append(k.el('i'),raw(k.el('b',null,x.name)));
   const nums=k.el('span','crash-src-nums',x.error?'ошибка':fmt(x.issues)+(x.more?'+':'')+' '+plural(x.issues,['крэш','крэша','крэшей'])+' · '+short(x.events)+' '+plural(x.events,['событие','события','событий']));
   const bar=k.el('span','crash-src-bar');const fill=k.el('span');fill.style.width=(x.error?0:Math.max(x.events?2:0,100*x.events/total)).toFixed(1)+'%';bar.append(fill);
   item.append(head,nums,bar);
   if(x.scope)item.title=x.scope;
   item.onclick=()=>k.ask('Крэши только '+x.name+' '+(c.period?.kind==='release'&&c.release?'после релиза '+c.release.name:c.period?.label||'за неделю'),{send:true});
   box.append(item);
  }
  return box;
 }

 // Events per day: by source when there are several (the sources' colours), else one series — the total; «По крэшам»
 // stacks the top issues on demand.
 function chart(k,c,colorOf,sourceOf){
  const box=k.el('div','crash-chart');
  const split=(c.bySource?.length||0)>1;
  let mode=split?'source':'total';
  const head=k.el('div','crash-chart-head');head.append(k.el('span','crash-chart-title','События по дням'));
  const toggle=k.el('div','crash-toggle');toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Разбивка графика');
  const modes=[['total','Всего'],...(split?[['source','По источникам']]:[]),['issue','По крэшам']].map(([id,label])=>{const b=k.el('button',null,label);b.type='button';b.dataset.mode=id;b.onclick=()=>{mode=id;draw();};toggle.append(b);return b;});
  head.append(toggle);
  const seriesOf=()=>mode==='source'?c.bySource.map(s=>({...s,color:s.color||NEUTRAL})):mode==='issue'?c.series.map(s=>({...s,color:colorOf(s.id)})):[{id:'total',label:'События',color:'var(--muted)',values:c.days.map((_,i)=>c.series.reduce((n,s)=>n+(s.values[i]||0),0))}];
  const totals=c.days.map((_,i)=>c.series.reduce((n,s)=>n+(s.values[i]||0),0));
  const plot=k.bars({labels:c.days.map(day),series:seriesOf(),inside:i=>c.days[i]>=c.from&&c.days[i]<=c.to,ariaLabel:'События по дням',height:84,
   text:i=>{const parts=(mode==='total'?c.series:seriesOf()).filter(s=>s.values[i]).slice(0,5).map(s=>(s.label.length>40?s.label.slice(0,39)+'…':s.label)+' — '+fmt(s.values[i]));
    return day(c.days[i])+': '+fmt(totals[i])+' '+plural(totals[i],['событие','события','событий'])+(c.days[i]>=c.from&&c.days[i]<=c.to?'':' (вне периода)')+(parts.length?'\n'+parts.join('\n'):'');}});
  const legendBox=k.el('div','crash-legend-box');
  function draw(){
   for(const b of modes)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));box.dataset.mode=mode;
   const series=seriesOf();plot.draw(series);legendBox.replaceChildren();
   if(mode!=='total')legendBox.append(k.legend(series.map(s=>{const node=k.el('span','crash-legend-item');node.append(s.id==='rest'?k.el('span',null,'остальные'):raw(k.el('span',null,s.label)));
    const src=mode==='issue'&&split&&s.source?sourceOf(s.source):null;if(src)node.append(sourceChip(k,src));return {color:s.color,title:s.label,node};})));
  }
  draw();
  box.append(head,plot,legendBox);return box;
 }

 function issueRow(k,r,color,ctx){
  const src=ctx.sourceOf(r.source);
  const li=k.el('article','crash-row');li.dataset.issue=r.id;li.dataset.source=r.source;if(color)li.style.setProperty('--stripe',color);
  const main=k.el('div','crash-main');
  const top=k.el('div','crash-line');
  if(ctx.multi)top.append(sourceChip(k,src));
  const level=LEVEL[r.level]||{label:r.level||'error',tone:'alert'};
  if(level.label!=='error'&&level.label!=='fatal'||r.level==='fatal')top.append(k.el('span','crash-level'+(level.tone?' '+level.tone:''),level.label));
  if(r.isNew){const fresh=k.chip({label:'новый',title:(r.firstSeen?'Впервые '+date(r.firstSeen):'Впервые')+(ctx.release?' — после релиза '+ctx.release.name:' — в этом периоде')});fresh.classList.add('crash-new');top.append(fresh);}
  const title=raw(k.el(r.url?'a':'span','crash-title',r.title));if(r.url){title.href=k.safeUrl(r.url);title.target='_blank';title.rel='noopener';}title.title=r.title;top.append(title);
  const meta=k.el('div','crash-meta');
  if(r.culprit)meta.append(raw(k.el('code','crash-culprit',r.culprit)));
  const seen=k.el('span','crash-seen');
  const ids=[r.shortId,r.project&&!ctx.single.includes(r.project)?r.project:'',...(r.versions||[]).slice(-1)].filter(Boolean).join(' · ');
  if(ids)seen.append(raw(k.el('span',null,ids)),' · ');
  if(r.unhandled)seen.append(k.el('span',null,'необработан'),' · ');
  const span=[date(r.firstSeen),date(r.lastSeen)].filter(Boolean).join(' — ');
  seen.append(span||'');
  seen.title=(r.firstSeen?'Впервые '+date(r.firstSeen)+', ':'')+'последний раз '+date(r.lastSeen);meta.append(seen);
  main.append(meta);
  const numbers=k.el('div','crash-numbers');
  const ev=k.el('div','crash-count');ev.append(k.el('strong',null,short(r.events)),k.el('small',null,plural(r.events,['событие','события','событий'])));
  const us=k.el('div','crash-count users');us.append(k.el('strong',null,short(r.users)),k.el('small',null,plural(r.users,['польз.','польз.','польз.'])));
  const spark=k.el('div','crash-spark-box');spark.title='14 дней: '+(r.spark||[]).map(fmt).join(', ');spark.append(sparkline(r.spark?.length?r.spark:[0,0]));spark.title='14 дней: '+(r.spark||[]).map(fmt).join(', ');
  numbers.append(ev,us,spark);
  const actions=k.el('div','crash-actions');
  const button=(label,run,cls='')=>{const b=k.el('button',cls,label);b.type='button';b.onclick=async e=>{e.stopPropagation();if(b.disabled)return;b.disabled=true;try{await run(b);}catch(err){k.toast(err.message,{error:true});}finally{if(!b.dataset.keep)b.disabled=false;}};actions.append(b);return b;};
  const name=src?.name||'';
  if(r.url){const b=button(ctx.multi?'Открыть в '+name:'Открыть',()=>open(r.url));b.dataset.action='open';b.title='Открыть в '+name;}
  const facts=fmt(r.events)+' '+plural(r.events,['событие','события','событий'])+', '+fmt(r.users)+' '+plural(r.users,['пользователь','пользователя','пользователей'])+' '+ctx.period;
  actions.append(k.links('task-tracker',{title:'Крэш '+(r.shortId?r.shortId+' ':'')+'— '+r.title+(r.culprit?' в '+r.culprit:''),description:facts+(name?' ('+name+')':''),link:r.url||'',type:'bug'}),
   k.links('code-fix',{text:'Исправь баг в коде — крэш из '+name+': '+r.title+(r.culprit?' в '+r.culprit:'')+'. Ссылка: '+(r.url||'')+'. Это '+facts+(r.platform?', платформа '+r.platform:'')+'.'}));
  // «Решено» only where the source can resolve; state lives in data-state, not in the button's text.
  if(r.canResolve){
   const resolve=button('Решено',async b=>{
    const done=await feature('resolve',r.source,r.id);
    li.classList.add('resolved');b.dataset.state='resolved';b.textContent='Решено ✓';b.dataset.keep='1';
    k.toast(done?.text||'Отмечено решённым',{timeout:10000,undo:async()=>{const back=await feature('reopen',r.source,r.id);li.classList.remove('resolved');resolve.dataset.state='open';resolve.textContent='Решено';delete resolve.dataset.keep;resolve.disabled=false;k.toast(back?.text||'Снова открыто');}});
   },'resolve');
   resolve.dataset.state='open';
   resolve.title='Отметить решённым в '+name+' (можно отменить)';
  }
  li.append(top,main,numbers,actions);return li;
 }

 window.renderCrashCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.crash-card'))return;
  const sources=Array.isArray(c.sources)?c.sources:[];
  const sourceOf=id=>sources.find(x=>x.id===id)||{id,name:id,color:NEUTRAL};
  const multi=sources.length>1;
  const ids=(c.chart?.series||[]).map(s=>s.id),colorOf=id=>id==='rest'?REST:COLORS[ids.indexOf(id)%COLORS.length]||REST;
  const body=k.el('div','crash-body');
  const t=c.totals||{issues:0,events:0,users:0};
  const tiles=k.el('div','crash-tiles kit-kpis');
  tiles.append(tile(k,fmt(t.issues)+(t.more?'+':''),plural(t.issues,c.onlyNew?['новый крэш','новых крэша','новых крэшей']:['крэш','крэша','крэшей']),{alert:!!t.fresh,note:t.fresh&&!c.onlyNew?'новых: '+t.fresh:''}),
   tile(k,short(t.events),plural(t.events,['событие','события','событий'])),
   tile(k,short(t.users),'затронуто пользователей',{title:'Сумма по крэшам: один человек может попасть в несколько'}));
  for(const x of sources){
   const cf=x.crashFree;if(!cf)continue;
   const main=cf.sessions!=null?cf.sessions:cf.users,label=cf.sessions!=null?'crash-free сессий':'crash-free пользователей';
   tiles.append(tile(k,pct(main),label+(multi?' · '+x.name:''),{alert:main<0.99,note:cf.sessions!=null&&cf.users!=null?'пользователей: '+pct(cf.users):'',title:x.name+(cf.total?', сессий: '+fmt(cf.total):'')}));
  }
  body.append(tiles);
  if(multi)body.append(sourceStrip(k,c));
  if(c.chart?.days?.length&&t.events)body.append(chart(k,c.chart,colorOf,sourceOf));
  if(c.common){const p=k.el('p','crash-common');p.append(k.el('span',null,'Общее: '),raw(k.el('span','crash-common-text',c.common)));p.title='Вывод локальной модели по названиям крэшей';body.append(p);}
  for(const n of c.notes||[]){const p=k.el('p','crash-note-line'+(n.error?' error':''));p.append(raw(k.el('span',null,n.text)));body.append(p);}
  const single=sources.flatMap(x=>(x.scope||'').split(/[,/]\s*/)).map(v=>v.trim()).filter(Boolean);
  const ctx={release:c.release,single,period:c.period?.label||'',sourceOf,multi};
  // Several sources: the stripe and sparkline take the source's colour (the chart's default split); one source: the issue's.
  const rowOf=r=>issueRow(k,r,multi?sourceOf(r.source).color||NEUTRAL:ids.includes(r.source+':'+r.id)?colorOf(r.source+':'+r.id):'',ctx);
  if(c.issues?.length){
   if(multi){
    // Grouped by source, in the order of the strip; each group shows its first four and folds the rest.
    for(const x of sources){
     const own=c.issues.filter(r=>r.source===x.id);if(!own.length)continue;
     const group=k.el('section','crash-group');group.dataset.source=x.id;group.style.setProperty('--source',x.color||NEUTRAL);
     const head=k.el('h4','crash-group-head');head.append(k.el('i'),raw(k.el('span',null,x.name)),k.el('small',null,fmt(x.issues)+(x.more?'+':'')+' '+plural(x.issues,['крэш','крэша','крэшей'])+(own.length<x.issues?', показаны '+own.length:'')));
     group.append(head,k.collapse(own.map(rowOf),4,'Ещё крэши '+x.name));body.append(group);
    }
   }else body.append(k.collapse(c.issues.map(rowOf),5,'Ещё крэши'));
  }else body.append(k.el('p','crash-empty',c.onlyNew?'Новых крэшей нет.':'Крэшей нет — источники ничего не прислали за этот период.'));
  const status=!t.issues?{label:'чисто',tone:'done'}:t.fresh?{label:t.fresh+' '+plural(t.fresh,['новый','новых','новых']),tone:'alert'}:{label:'без новых',tone:'done'};
  const scope=!multi&&sources[0]?.scope?String(sources[0].scope):'';
  const subtitle=[c.period?.label,c.platform,c.environment,c.release&&c.period?.kind!=='release'?'релиз '+c.release.name:'',scope.length>60?scope.slice(0,57)+'…':scope].filter(Boolean).join(' · ');
  const actions=[];
  const linked=sources.filter(x=>x.url);
  if(linked.length===1)actions.push({label:'Открыть список в '+linked[0].name,run:()=>open(linked[0].url)});
  if(!c.onlyNew&&t.fresh)actions.push({label:'Только новые',run:()=>k.ask('Новые крэши '+(c.release?'после релиза '+c.release.name:c.period?.label||'за неделю')+(c.platform?' на '+c.platform:''),{send:true})});
  // A spike of new crashes is worth telling the team; the Slack flow asks for the channel and confirms.
  if(t.fresh&&c.issues?.length){const top=c.issues.find(r=>r.isNew)||c.issues[0];const src=sourceOf(top.source);
   actions.push(k.links('share-message',{text:'посмотреть новые крэши ('+t.fresh+' '+plural(t.fresh,['новый','новых','новых'])+', '+(c.period?.label||'')+'), самый частый в '+src.name+': '+top.title+' — '+fmt(top.events)+' '+plural(top.events,['событие','события','событий'])+'. '+(top.url||src.url||'')}));}
  if(c.period?.kind!=='yesterday')actions.push({label:'За вчера',run:()=>k.ask('Сколько крэшей вчера'+(c.platform?' на '+c.platform:''),{send:true})});
  const href=linked.length===1?linked[0].url:'';
  const card=k.card({app:'Крэши',initial:'⚡',color:'#6b3f36',key:sources.map(x=>x.name).join(' + '),href,status,subtitle,body,actions,className:'crash-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  card.dataset.sources=String(sources.length);
  parent.append(card);
 };
})();
