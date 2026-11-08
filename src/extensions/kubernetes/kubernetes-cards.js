// «Kubernetes», renderer: the namespace at a glance (ready pods, problems, restarts, warning events), the pods
// table (status dots, CrashLoopBackOff/OOMKilled chips, restarts), deployments with rollout bars, warning events;
// one pod in detail (facts, the grounded cause, containers, events, the previous container's last lines, describe);
// a rollout; and the confirmation of a restart or scale with the exact kubectl command — the only button that acts.
(()=>{
 if(window.renderKubernetesCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('kubernetes-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('kubernetesApp',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 const moment=iso=>{if(!iso)return document.createTextNode('—');if(window.timeElement)return window.timeElement(iso);const t=document.createElement('time');t.dateTime=iso;t.textContent=new Date(iso).toLocaleString(locale());return t;};
 const clock=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'});};
 const BAD=new Set(['CrashLoopBackOff','ImagePullBackOff','ErrImagePull','CreateContainerConfigError','CreateContainerError','OOMKilled','Error','Evicted','Failed','Unknown']);
 const ROLL={complete:{label:'выкачено',tone:'done'},progressing:{label:'выкатывается',tone:'progress'},failed:{label:'выкатка не удалась',tone:'alert'},'scaled-down':{label:'0 реплик',tone:''}};

 function tiles(k,list){const box=k.el('div','k8-tiles');for(const [v,label,tone] of list){const t=k.el('div','k8-tile'+(tone?' '+tone:''));t.append(k.el('strong',null,v),k.el('span',null,label));box.append(t);}return box;}
 function reasonChip(k,p){
  const r=p.reason;const chip=raw(k,'span','k8-reason '+(BAD.has(r)?'alert':p.problem==='warn'?'warn':'ok'),r==='Running'&&p.readyCount===p.total?'Running':r);
  return chip;
 }
 function podRow(k,p){
  const row=k.el('div','k8-row k8-pod '+p.problem);row.setAttribute('role','listitem');row.dataset.pod=p.name;
  const dot=k.el('span','k8-dot '+p.problem);dot.setAttribute('aria-hidden','true');
  const who=k.el('div','k8-who');who.append(raw(k,'span','k8-name',p.name));
  const sub=k.el('span','k8-sub');if(p.owner?.name)sub.append(raw(k,'span',null,(p.owner.kind==='Deployment'?'deploy/':p.owner.kind.toLowerCase()+'/')+p.owner.name));if(p.node)sub.append(raw(k,'span','k8-node',p.node));who.append(sub);
  const st=k.el('div','k8-state');st.append(reasonChip(k,p));if(p.oomKilled&&p.reason!=='OOMKilled')st.append(k.el('span','k8-reason alert','OOMKilled'));
  const ready=raw(k,'span','k8-ready'+(p.readyCount<p.total?' warn':''),p.ready);ready.title='Готовых контейнеров';
  const rs=k.el('span','k8-restarts'+(p.restarts>=5?' alert':p.restarts?' warn':''),fmt(p.restarts));rs.title='Перезапусков';
  const actions=k.el('div','k8-row-actions');
  const items=[...(p.problem!=='ok'?[{id:'why',label:'Почему?'}]:[{id:'why',label:'Подробнее'}]),{id:'logs',label:'Логи'},...(p.owner?.kind==='Deployment'?[{id:'restart',label:'Перезапустить деплоймент…'}]:[])];
  const menu=k.el('button','k8-mini'+(p.problem==='bad'?' k8-why':''),'Действия ▾');menu.type='button';menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-label','Действия с подом '+p.name);
  menu.onclick=e=>{e.stopPropagation();k.menu(menu,async()=>items,async item=>{
   if(item.id==='why')return k.ask('почему падает под '+p.name,{send:true});
   if(item.id==='logs')return k.ask('логи сервиса '+(p.app||p.owner?.name||p.name)+' за последний час',{send:true});
   if(item.id==='restart')return k.ask('перезапусти деплоймент '+p.owner.name,{send:true});
  });};
  actions.append(menu);
  row.append(dot,who,st,ready,rs,actions);
  return row;
 }
 function podTable(k,pods){
  const box=k.el('div','k8-table');box.setAttribute('role','list');box.setAttribute('aria-label','Поды');
  const head=k.el('div','k8-row k8-head');head.setAttribute('aria-hidden','true');
  head.append(k.el('span'),k.el('span',null,'Под'),k.el('span',null,'Состояние'),k.el('span',null,'Готово'),k.el('span',null,'Рестарты'),k.el('span'));
  box.append(head);
  const order={bad:0,warn:1,ok:2};
  const rows=[...pods].sort((a,b)=>order[a.problem]-order[b.problem]||b.restarts-a.restarts||a.name.localeCompare(b.name)).map(p=>podRow(k,p));
  box.append(...rows.slice(0,10));
  if(rows.length>10){const more=k.el('details','k8-more');more.append(k.el('summary',null,'Ещё подов: '+(rows.length-10)),...rows.slice(10));box.append(more);}
  return box;
 }
 // ready / updated / desired as one bar: green ready, yellow updated-not-ready, grey the rest.
 function rolloutBar(k,d){
  const box=k.el('div','k8-roll');box.setAttribute('role','img');
  const total=Math.max(1,d.replicas,d.updated);
  const seg=(n,cls)=>{const s=k.el('span','k8-roll-seg '+cls);s.style.width=(100*n/total)+'%';return s;};
  const track=k.el('span','k8-roll-track');track.append(seg(Math.min(d.ready,d.updated),'ready'),seg(Math.max(0,d.updated-d.ready),'updating'));
  box.setAttribute('aria-label','Готово '+d.ready+' из '+d.replicas+', обновлено '+d.updated);
  box.append(track,raw(k,'span','k8-roll-label',d.ready+' / '+d.replicas));
  return box;
 }
 function deploymentRow(k,d){
  const row=k.el('div','k8-row k8-deploy');row.dataset.deployment=d.name;
  const who=k.el('div','k8-who');who.append(raw(k,'span','k8-name',d.name),raw(k,'span','k8-sub',(d.images||[])[0]||''));
  const st=ROLL[d.status]||ROLL.complete;const chip=k.chip({label:st.label,tone:st.tone,title:d.note||d.message||''});
  const b=k.el('button','k8-mini','Выкатка');b.type='button';b.onclick=()=>k.ask('статус выкатки '+d.name,{send:true});
  row.append(who,rolloutBar(k,d),chip,b);
  return row;
 }
 function eventsList(k,events,limit=6){
  const ul=k.el('ul','k8-events');
  for(const e of events.slice(0,limit)){
   const li=k.el('li','k8-event '+(e.type==='Warning'?'warn':'normal'));
   const head=k.el('div','k8-event-head');head.append(raw(k,'strong',null,e.reason),raw(k,'span','k8-event-obj',e.object));
   if(e.count>1)head.append(k.el('span','k8-event-count','×'+fmt(e.count)));
   const when=k.el('span','k8-event-when');when.append(moment(e.last));head.append(when);
   li.append(head,raw(k,'p','k8-event-msg selectable',e.message));ul.append(li);
  }
  if(events.length>limit)ul.append(k.el('li','k8-muted','Ещё событий: '+(events.length-limit)));
  return ul;
 }

 function overview(k,c,body){
  const ready=c.pods.filter(p=>p.phase==='Running'&&p.readyCount===p.total).length,bad=c.pods.filter(p=>p.problem==='bad').length,restarts=c.pods.reduce((a,p)=>a+p.restarts,0);
  body.append(tiles(k,[[fmt(ready)+' / '+fmt(c.pods.length),'подов готовы',ready===c.pods.length?'done':''],[fmt(bad),plural(bad,['с проблемой','с проблемами','с проблемами']),bad?'alert':''],[fmt(restarts),plural(restarts,['перезапуск','перезапуска','перезапусков']),restarts?'warn':''],[fmt(c.events.length),plural(c.events.length,['предупреждение','предупреждения','предупреждений']),c.events.length?'warn':'']]));
  if(c.focus==='events'&&c.events.length){body.append(k.el('div','k8-section','Предупреждения'),eventsList(k,c.events,10));}
  if(c.pods.length)body.append(k.el('div','k8-section','Поды'),podTable(k,c.pods));else body.append(k.el('p','k8-muted','В этом пространстве имён подов нет.'));
  if(c.deployments?.length){const box=k.el('div','k8-deploys');box.append(...c.deployments.slice(0,8).map(d=>deploymentRow(k,d)));body.append(k.el('div','k8-section','Деплойменты'),box);}
  if(c.focus!=='events'&&c.events.length)body.append(k.el('div','k8-section','Предупреждения'),eventsList(k,c.events,4));
  const status=bad?{label:'проблем: '+bad,tone:'alert'}:ready<c.pods.length?{label:'не все готовы',tone:'progress'}:{label:'всё работает',tone:'done'};
  return {status,key:'Поды',actions:[{label:'Обновить',run:async()=>{const fresh=await call('overview');const host=body.closest('.k8-card');const parent=host.parentElement;host.remove();window.renderKubernetesCard(parent,fresh);}}]};
 }
 function pod(k,c,body){
  const p=c.pod;
  const cause=k.el('div','k8-cause '+p.problem);
  cause.append(raw(k,'p','k8-cause-text',c.cause));
  if(c.explanation)cause.append(raw(k,'p','k8-explain',c.explanation));
  if(c.evidence?.length){const ul=k.el('ul','k8-evidence');for(const q of c.evidence)ul.append(raw(k,'li','selectable',q));cause.append(k.el('small','k8-muted','Опирается на:'),ul);}
  if(c.steps?.length){const ol=k.el('ol','k8-steps');for(const s of c.steps)ol.append(raw(k,'li',null,s));cause.append(ol);}
  if(c.explainedBy==='model')cause.title='Вывод локальной модели по фактам кластера';
  body.append(cause);
  const facts=k.el('ul','k8-facts');for(const f of c.facts||[])facts.append(raw(k,'li',null,f));body.append(facts);
  const box=k.el('div','k8-containers');
  for(const x of p.containers){
   const row=k.el('div','k8-row k8-container');
   const who=k.el('div','k8-who');who.append(raw(k,'span','k8-name',x.name),raw(k,'span','k8-sub',x.image));
   const st=k.el('div','k8-state');st.append(raw(k,'span','k8-reason '+(BAD.has(x.reason)?'alert':x.ready?'ok':'warn'),x.reason||x.state));
   if(x.lastReason)st.append(raw(k,'span','k8-reason '+(x.lastReason==='OOMKilled'?'alert':'warn'),'был '+x.lastReason+(x.lastExit!=null?' ('+x.lastExit+')':'')));
   const lim=raw(k,'span','k8-sub',x.limits?.memory?'память ≤ '+x.limits.memory:'без лимита памяти');
   const rs=k.el('span','k8-restarts'+(x.restarts?' warn':''),fmt(x.restarts));rs.title='Перезапусков';
   row.append(who,st,lim,rs);box.append(row);
  }
  body.append(k.el('div','k8-section','Контейнеры'),box);
  if(c.events?.length)body.append(k.el('div','k8-section','События пода'),eventsList(k,c.events,6));
  if(c.logs?.length){
   const pre=k.el('div','k8-logs selectable');pre.dataset.noI18n='';
   for(const l of c.logs.slice(-25)){const line=k.el('div','k8-log');if(l.ts)line.append(k.el('span','k8-log-time',clock(l.ts)));line.append(k.el('span',null,l.text));pre.append(line);}
   body.append(k.el('div','k8-section',c.previous?'Последние строки прошлого запуска':'Последние строки'),pre);
  }
  if(c.describe){const d=k.el('details','k8-describe');d.append(k.el('summary',null,'kubectl describe'),raw(k,'pre','selectable',c.describe));body.append(d);}
  const actions=[{label:'Логи за час',run:()=>k.ask('логи сервиса '+(p.app||p.owner?.name||p.name)+' за последний час',{send:true})}];
  if(p.owner?.kind==='Deployment')actions.push({label:'Перезапустить деплоймент…',run:()=>k.ask('перезапусти деплоймент '+p.owner.name,{send:true})});
  return {status:p.problem==='bad'?{label:p.reason,tone:'alert'}:p.problem==='warn'?{label:'требует внимания',tone:'progress'}:{label:'работает',tone:'done'},key:p.name,actions};
 }
 function rollout(k,c,body){
  const d=c.deployment;const st=ROLL[d.status]||ROLL.complete;
  body.append(deploymentRow(k,d));
  body.append(tiles(k,[[fmt(d.replicas),'нужно'],[fmt(d.updated),'обновлено'],[fmt(d.ready),'готово',d.ready===d.replicas?'done':'warn'],[fmt(d.available),'доступно']]));
  if(c.statusText)body.append(raw(k,'p','k8-status-text selectable',c.statusText));
  if(d.revision)body.append(k.el('p','k8-muted','Ревизия '+d.revision));
  if(c.pods?.length)body.append(k.el('div','k8-section','Поды'),podTable(k,c.pods));
  if(c.events?.length)body.append(k.el('div','k8-section','События'),eventsList(k,c.events,5));
  return {status:st,key:d.name,actions:[{label:'Перезапустить…',run:()=>k.ask('перезапусти деплоймент '+d.name,{send:true})}]};
 }
 function confirm(k,c,body){
  const p=c.pending,d=c.deployment;
  body.append(deploymentRow(k,d));
  const box=k.el('div','k8-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение');
  box.append(k.el('p','k8-confirm-title',p.verb==='restart'?'Перезапустить деплоймент '+p.name+'?':'Поставить '+p.name+' '+p.replicas+' '+plural(p.replicas,['реплику','реплики','реплик'])+' (сейчас '+p.current+')?'));
  box.append(k.el('p','k8-muted',p.verb==='restart'?'Поды пересоздаются по очереди по стратегии деплоймента; во время выкатки старые поды работают, пока новые не готовы.':p.replicas===0?'Ноль реплик останавливает сервис полностью.':'Kubernetes добавит или удалит поды до нужного числа.'));
  box.append(k.el('small','k8-muted','Выполнится команда:'),raw(k,'code','k8-command selectable',p.command));
  const go=k.el('button','primary'+(p.verb==='scale'&&p.replicas===0||p.verb==='restart'?' k8-danger':''),p.verb==='restart'?'Перезапустить':'Масштабировать');go.type='button';
  const cancel=k.el('button',null,'Отмена');cancel.type='button';
  const result=k.el('p','k8-result');result.hidden=true;result.setAttribute('role','status');
  cancel.onclick=()=>{box.dataset.state='cancelled';go.disabled=cancel.disabled=true;result.hidden=false;result.textContent='Отменено — ничего не выполнялось.';};
  go.onclick=async()=>{
   if(go.disabled)return;go.disabled=cancel.disabled=true;go.setAttribute('aria-busy','true');
   try{const r=await call('apply',p);box.dataset.state='done';result.hidden=false;result.textContent='Выполнено: '+r.text;result.dataset.noI18n='';k.toast(r.text);}
   catch(e){k.toast(e.message,{error:true});go.disabled=cancel.disabled=false;}
   finally{go.removeAttribute('aria-busy');}
  };
  const bar=k.el('div','k8-confirm-actions');bar.append(go,cancel);box.append(bar,result);
  body.append(box);
  return {status:{label:'нужно подтверждение',tone:'progress'},key:'Подтверждение',actions:[]};
 }

 window.renderKubernetesCard=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.k8-card'))return;
  const body=k.el('div','k8-body');
  const view={overview,pod,rollout,confirm}[c.mode];if(!view)return;
  const r=view(k,c,body);
  parent.append(k.card({app:'Kubernetes',initial:'⎈',color:'#3a5a8c',key:r.key,status:r.status,subtitle:c.context?c.context+' · '+c.namespace:'',body,actions:r.actions,className:'k8-card'}));
  const sub=parent.querySelector('.k8-card .kit-subtitle');if(sub)sub.dataset.noI18n='';
 };
})();
