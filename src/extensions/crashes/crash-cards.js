// «Крэши», renderer: totals for the period, a stacked daily events chart (top five issues and the rest),
// and the top Sentry issues with level, «новый» mark, events/users and a 14-day sparkline.
// Per issue: open in Sentry, a Jira task and a Programmer request through the chat (their own flows confirm),
// and «Решено», which changes Sentry only when pressed and can be undone from the toast.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('crash-cards.css',document.currentScript.src).href;document.head.append(style);
 const COLORS=['#f0b4a8','#e5ce8c','#86c2ff','#c9a8f0','#9dd9c9'],REST='#5d6863';
 const SVG='http://www.w3.org/2000/svg';
 // Numbers and dates follow the interface language.
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const short=n=>n>=1000?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:n>=10000?0:1}).format(n):fmt(n);
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'});};
 const pct=v=>(v*100).toLocaleString(locale(),{maximumFractionDigits:2})+'%';
 // Service, user and model text (crash titles, culprits, slugs) is never machine-translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 const LEVEL={fatal:{label:'fatal',tone:'alert'},error:{label:'error',tone:'alert'},warning:{label:'warning',tone:'progress'},info:{label:'info',tone:''},debug:{label:'debug',tone:''}};
 const feature=(method,...args)=>window.petya.feature('crashes',method,...args);
 const open=url=>{const safe=window.resultKit.safeUrl(url);if(safe)window.open(safe,'_blank','noopener');};

 function tile(k,value,label,{alert=false,title,note}={}){const box=k.el('div','crash-tile'+(alert?' alert':''));box.append(k.el('span','crash-value',value),k.el('span','crash-label',label));if(note)box.append(k.el('span','crash-note',note));if(title)box.title=title;return box;}

 function sparkline(values){
  const w=96,h=26,max=Math.max(1,...values),step=values.length>1?w/(values.length-1):w;
  const pts=values.map((v,i)=>[+(i*step).toFixed(1),+(h-2-(h-4)*v/max).toFixed(1)]);
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('class','crash-spark');svg.setAttribute('aria-hidden','true');
  const area=document.createElementNS(SVG,'polygon');area.setAttribute('points',[...pts,[w,h],[0,h]].map(p=>p.join(',')).join(' '));area.setAttribute('class','area');
  const line=document.createElementNS(SVG,'polyline');line.setAttribute('points',pts.map(p=>p.join(',')).join(' '));line.setAttribute('class','line');
  const last=document.createElementNS(SVG,'circle');last.setAttribute('cx',pts.at(-1)[0]);last.setAttribute('cy',pts.at(-1)[1]);last.setAttribute('r','2');last.setAttribute('class','dot');
  svg.append(area,line,last);return svg;
 }

 function chart(k,c,colorOf){
  const box=k.el('div','crash-chart');
  const totals=c.days.map((_,i)=>c.series.reduce((n,s)=>n+(s.values[i]||0),0)),max=Math.max(1,...totals);
  const head=k.el('div','crash-chart-head');head.append(k.el('span',null,'События по дням'),k.el('span','crash-chart-max','макс. '+fmt(Math.max(...totals))+' в день'));
  const tip=k.el('div','crash-tip','Наведите на день');
  const bars=k.el('div','crash-bars');bars.setAttribute('role','list');
  c.days.forEach((d,i)=>{
   const inside=d>=c.from&&d<=c.to;
   const col=k.el('button','crash-col'+(inside?'':' outside'));col.type='button';col.setAttribute('role','listitem');
   const stack=k.el('div','crash-stack');stack.style.height=(totals[i]?Math.max(3,100*totals[i]/max):0)+'%';
   for(const s of c.series){const v=s.values[i]||0;if(!v)continue;const seg=k.el('span','crash-seg');seg.style.flexGrow=String(v);seg.style.background=colorOf(s.id);stack.append(seg);}
   col.append(stack);
   const parts=c.series.filter(s=>s.values[i]).map(s=>(s.label.length>40?s.label.slice(0,39)+'…':s.label)+' — '+fmt(s.values[i]));
   const text=day(d)+': '+fmt(totals[i])+' '+plural(totals[i],['событие','события','событий'])+(inside?'':' (вне периода)');
   col.setAttribute('aria-label',text+(parts.length?'. '+parts.join('; '):''));col.title=text+(parts.length?'\n'+parts.join('\n'):'');
   col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent='Наведите на день';};
   bars.append(col);
  });
  const axis=k.el('div','crash-axis');axis.append(k.el('span',null,day(c.days[0])),k.el('span',null,day(c.days.at(-1))));
  const legend=k.el('ul','crash-legend');
  for(const s of c.series){const li=k.el('li');const dot=k.el('i');dot.style.background=colorOf(s.id);li.append(dot,s.id==='rest'?k.el('span',null,'остальные'):raw(k.el('span',null,s.label)));li.title=s.label;legend.append(li);}
  box.append(head,bars,axis,tip,legend);return box;
 }

 function issueRow(k,r,color,ctx){
  const li=k.el('article','crash-row');li.dataset.issue=r.id;if(color)li.style.setProperty('--stripe',color);
  const main=k.el('div','crash-main');
  const top=k.el('div','crash-line');
  const level=LEVEL[r.level]||{label:r.level||'error',tone:'alert'};
  top.append(k.chip({label:level.label,tone:level.tone,title:'Уровень в Sentry'}));
  if(r.isNew){const fresh=k.chip({label:'новый',title:'Впервые '+date(r.firstSeen)+(ctx.release?' — после релиза '+ctx.release.name:' — в этом периоде')});fresh.classList.add('crash-new');top.append(fresh);}
  const title=raw(k.el(r.url?'a':'span','crash-title',r.title));if(r.url){title.href=k.safeUrl(r.url);title.target='_blank';title.rel='noopener';}title.title=r.title;top.append(title);
  const meta=k.el('div','crash-meta');
  if(r.culprit)meta.append(raw(k.el('code','crash-culprit',r.culprit)));
  const seen=k.el('span','crash-seen');
  const ids=[r.shortId,r.project!==ctx.single?r.project:''].filter(Boolean).join(' · ');
  if(ids)seen.append(raw(k.el('span',null,ids)),' · ');
  if(r.unhandled)seen.append(k.el('span',null,'необработан'),' · ');
  seen.append(date(r.firstSeen)+' — '+date(r.lastSeen));
  seen.title='Впервые '+date(r.firstSeen)+', последний раз '+date(r.lastSeen);meta.append(seen);
  main.append(meta);
  const numbers=k.el('div','crash-numbers');
  const ev=k.el('div','crash-count');ev.append(k.el('strong',null,short(r.events)),k.el('small',null,plural(r.events,['событие','события','событий'])));
  const us=k.el('div','crash-count users');us.append(k.el('strong',null,short(r.users)),k.el('small',null,plural(r.users,['польз.','польз.','польз.'])));
  const spark=k.el('div','crash-spark-box');spark.title='14 дней: '+r.spark.map(fmt).join(', ');spark.append(sparkline(r.spark),k.el('small',null,'14 дн.'));
  numbers.append(ev,us,spark);
  const actions=k.el('div','crash-actions');
  const button=(label,run,cls='')=>{const b=k.el('button',cls,label);b.type='button';b.onclick=async e=>{e.stopPropagation();if(b.disabled)return;b.disabled=true;try{await run(b);}catch(err){k.toast(err.message,{error:true});}finally{if(!b.dataset.keep)b.disabled=false;}};actions.append(b);return b;};
  if(r.url)button('Открыть в Sentry',()=>open(r.url));
  const facts=fmt(r.events)+' '+plural(r.events,['событие','события','событий'])+', '+fmt(r.users)+' '+plural(r.users,['пользователь','пользователя','пользователей'])+' '+ctx.period;
  button('В задачу Jira',()=>k.ask('Создай задачу в Jira: Крэш '+(r.shortId?r.shortId+' ':'')+'— '+r.title+(r.culprit?' в '+r.culprit:'')+'. Sentry: '+(r.url||'')+' ('+facts+').',{send:true}));
  button('Отдать Программисту',()=>k.ask('Исправь баг в коде — крэш из Sentry: '+r.title+(r.culprit?' в '+r.culprit:'')+'. Ссылка: '+(r.url||'')+'. Это '+facts+(r.platform?', платформа '+r.platform:'')+'.',{send:true}));
  // State lives in data-state, not in the button's text.
  const resolve=button('Решено',async b=>{
   await feature('resolve',r.id);
   li.classList.add('resolved');b.dataset.state='resolved';b.textContent='Решено ✓';b.dataset.keep='1';
   k.toast('Отмечено решённым в Sentry',{timeout:10000,undo:async()=>{await feature('reopen',r.id);li.classList.remove('resolved');resolve.dataset.state='open';resolve.textContent='Решено';delete resolve.dataset.keep;resolve.disabled=false;k.toast('Снова открыто в Sentry');}});
  },'resolve');
  resolve.dataset.state='open';
  resolve.title='Отметить решённым в Sentry (можно отменить)';
  li.append(top,main,numbers,actions);return li;
 }

 window.renderCrashCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.crash-card'))return;
  const ids=(c.chart?.series||[]).map(s=>s.id),colorOf=id=>id==='rest'?REST:COLORS[ids.indexOf(id)%COLORS.length]||REST;
  const body=k.el('div','crash-body');
  const t=c.totals||{issues:0,events:0,users:0};
  const tiles=k.el('div','crash-tiles');
  tiles.append(tile(k,fmt(t.issues)+(t.more?'+':''),plural(t.issues,c.onlyNew?['новый крэш','новых крэша','новых крэшей']:['крэш','крэша','крэшей']),{alert:!!t.fresh,note:t.fresh&&!c.onlyNew?'новых: '+t.fresh:''}),
   tile(k,short(t.events),plural(t.events,['событие','события','событий'])),
   tile(k,short(t.users),'затронуто пользователей',{title:'Сумма по крэшам: один человек может попасть в несколько'}));
  if(c.crashFree?.sessions!=null)tiles.append(tile(k,pct(c.crashFree.sessions),'crash-free сессий',{alert:c.crashFree.sessions<0.99,note:c.crashFree.users!=null?'пользователей: '+pct(c.crashFree.users):'',title:'Release health за период, сессий: '+fmt(c.crashFree.total)}));
  body.append(tiles);
  if(c.chart?.days?.length&&t.events)body.append(chart(k,c.chart,colorOf));
  if(c.common){const p=k.el('p','crash-common');p.append(k.el('span',null,'Общее: '),raw(k.el('span','crash-common-text',c.common)));p.title='Вывод локальной модели по названиям крэшей';body.append(p);}
  if(c.issues?.length){
   const ctx={release:c.release,single:c.projects?.length===1?c.projects[0]:'',period:c.period?.label||''};
   body.append(k.collapse(c.issues.map(r=>issueRow(k,r,ids.includes(r.id)?colorOf(r.id):'',ctx)),5,'Ещё крэши'));
  }else body.append(k.el('p','crash-empty',c.onlyNew?'Новых крэшей нет.':'Крэшей нет — Sentry ничего не прислал за этот период.'));
  const status=!t.issues?{label:'чисто',tone:'done'}:t.fresh?{label:t.fresh+' '+plural(t.fresh,['новый','новых','новых']),tone:'alert'}:{label:'без новых',tone:'done'};
  const subtitle=[c.period?.label,c.platform,c.environment,c.release&&c.period?.kind!=='release'?'релиз '+c.release.name:''].filter(Boolean).join(' · ');
  const actions=[];
  if(c.url)actions.push({label:'Открыть список в Sentry',run:()=>open(c.url)});
  if(!c.onlyNew&&t.fresh)actions.push({label:'Только новые',run:()=>k.ask('Новые крэши '+(c.release?'после релиза '+c.release.name:c.period?.label||'за неделю')+(c.platform?' на '+c.platform:''),{send:true})});
  if(c.period?.kind!=='yesterday')actions.push({label:'За вчера',run:()=>k.ask('Сколько крэшей вчера'+(c.platform?' на '+c.platform:''),{send:true})});
  const card=k.card({app:'Sentry',initial:'S',color:'#362d59',key:c.org+(c.projects?.length?' / '+c.projects.join(', '):''),href:c.url,status,subtitle,body,actions,className:'crash-card'});
  const key=card.querySelector('.kit-key');if(key)raw(key);
  parent.append(card);
 };
})();
