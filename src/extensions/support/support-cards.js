// «Поддержка игроков», renderer. Overview: tiles (open, overdue against the SLA, new today, urgent), tickets per day
// stacked by status, problems with counts and verbatim quotes («Создать баг» through the connected task tracker), and
// open tickets with priority chips and the wait against the SLA. Reply: the ticket with its thread, knowledge base
// articles and an editor with exactly the text that is sent; nothing is sent until the user presses «Отправить».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('support-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('supportDesk',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 const hours=h=>{const v=Math.abs(h);if(v<1)return 'меньше часа';if(v<48){const n=Math.round(v);return n+' '+plural(n,['час','часа','часов']);}const n=Math.round(v/24);return n+' '+plural(n,['день','дня','дней']);};
 // Players' texts, subjects, problem titles and drafts are left alone by the UI translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const notify=(id,data)=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data}}));
 const STATUS={new:{label:'новый',color:'#e5ce8c'},open:{label:'открыт',color:'#f0b4a8'},pending:{label:'ждёт игрока',color:'#86c2ff'},hold:{label:'на паузе',color:'#c9a8f0'},solved:{label:'решён',color:'#c9ed9d'},closed:{label:'закрыт',color:'#c9ed9d'}};
 const PRIORITY={urgent:{label:'срочный',tone:'alert'},high:{label:'высокий',tone:'progress'},normal:{label:'обычный',tone:''},low:{label:'низкий',tone:''}};
 function link(k,url,text,className='sp-link'){const safe=k.safeUrl(url);const a=k.el(safe?'a':'span',className,text);if(safe){a.href=safe;a.target='_blank';a.rel='noopener';}return a;}
 const bugLabel=p=>'Создать баг'+(p?.name?' · '+p.name:'');

 function tiles(k,d){
  const row=k.el('div','sp-tiles');
  const tile=(value,label,tone,title)=>{const t=k.el('div','sp-tile'+(tone?' '+tone:''));t.append(k.el('span','sp-value',fmt(value)),k.el('span','sp-label',label));if(title)t.title=title;return t;};
  row.append(tile(d.tiles.open,'открыто','',''),tile(d.tiles.overdue,'просрочено SLA',d.tiles.overdue?'alert':'','Новые и открытые тикеты дольше цели SLA'+(d.slaHours?' (по умолчанию '+d.slaHours+' ч)':'')),
   tile(d.tiles.today,'новых сегодня','',''),tile(d.tiles.urgent,'срочных и высоких',d.tiles.urgent?'progress':'',''));
  return row;
 }
 function chart(k,d){
  const days=d.daily||[];if(!days.length)return null;
  const keys=['new','open','pending','hold','solved'];
  const box=k.el('div','sp-chart');
  const totals=days.map(x=>keys.reduce((n,s)=>n+x[s],0)),max=Math.max(1,...totals);
  const head=k.el('div','sp-row-between');head.append(k.el('span','sp-section','Новые тикеты по дням · по статусу сейчас'),k.el('span','sp-max','макс. '+fmt(Math.max(...totals))+' в день'));
  const plot=k.el('div','sp-plot');plot.setAttribute('role','list');
  const tip=k.el('div','sp-tip','Наведите на день');
  days.forEach((x,i)=>{
   const col=k.el('button','sp-col');col.type='button';col.setAttribute('role','listitem');
   const text=day(x.date)+': '+(totals[i]?fmt(totals[i])+' · '+keys.filter(s=>x[s]).map(s=>STATUS[s].label+' '+x[s]).join(', '):'нет тикетов');
   col.setAttribute('aria-label',text);
   const stack=k.el('span','sp-stack');stack.style.height=(totals[i]?Math.max(4,100*totals[i]/max):0)+'%';
   for(const s of keys)if(x[s]){const seg=k.el('span','sp-seg');seg.style.flexGrow=String(x[s]);seg.style.background=STATUS[s].color;stack.append(seg);}
   col.append(stack);col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent='Наведите на день';};
   plot.append(col);
  });
  const axis=k.el('div','sp-axis');axis.append(k.el('span',null,day(days[0].date)));if(days.length>2)axis.append(k.el('span',null,day(days[Math.floor(days.length/2)].date)));axis.append(k.el('span',null,day(days.at(-1).date)));
  const legend=k.el('div','sp-legend');for(const s of keys){const item=k.el('span');const sw=k.el('i');sw.style.background=STATUS[s].color;item.append(sw,STATUS[s].label);legend.append(item);}
  box.append(head,plot,axis,legend,tip);return box;
 }
 function clusters(k,d){
  const box=k.el('div','sp-clusters');
  box.append(k.el('div','sp-section','На что жалуются'+(d.clustersByModel?'':' · по словам в тикетах')));
  if(!d.clusters.length){box.append(k.el('p','sp-note','Повторяющихся проблем не нашлось.'));return box;}
  const max=Math.max(...d.clusters.map(c=>c.count));
  for(const c of d.clusters){
   const item=k.el('div','sp-cluster');
   const head=k.el('div','sp-cluster-head');const bar=k.el('span','sp-bar');const fill=k.el('span');fill.style.width=(100*c.count/max)+'%';bar.append(fill);
   head.append(raw(k.el('span','sp-cluster-title',c.title)),bar,k.el('span','sp-count',fmt(c.count)+' '+plural(c.count,['тикет','тикета','тикетов'])));
   item.append(head);
   for(const q of c.quotes||[]){const line=k.el('blockquote','sp-quote');line.append(raw(k.el('span',null,'«'+q.text+'»')));const t=(d.tickets||[]).find(x=>x.id===q.ticket);line.append(' ',t?link(k,t.url,'#'+q.ticket):k.el('span','sp-muted','#'+q.ticket));item.append(line);}
   const row=k.el('div','kit-actions sp-row-actions');
   const quotes=(c.quotes||[]).map(q=>'«'+q.text+'» (#'+q.ticket+')').join(' ');
   row.append(k.links('task-tracker',{title:'Поддержка: '+c.title,description:fmt(c.count)+' '+plural(c.count,['тикет','тикета','тикетов'])+' игроков за '+d.days+' '+plural(d.days,['день','дня','дней'])+'. Тикеты: '+(c.tickets||[]).slice(0,10).map(id=>'#'+id).join(', ')+(quotes?'. '+quotes:''),type:'bug'},{label:bugLabel}));
   item.append(row);box.append(item);
  }
  return box;
 }
 function waitBar(k,t){
  const box=k.el('div','sp-wait');
  if(t.slaLeft===null||t.slaLeft===undefined){box.append(k.el('span','sp-wait-text','ждёт '+hours(t.wait)));return box;}
  const total=Math.max(0.1,t.wait+Math.max(0,t.slaLeft));
  const track=k.el('span','sp-wait-track');const fill=k.el('span','sp-wait-fill'+(t.overdue?' over':t.slaLeft<4?' soon':''));fill.style.width=Math.min(100,100*t.wait/total)+'%';track.append(fill);
  track.setAttribute('role','meter');track.setAttribute('aria-label','Ожидание относительно SLA');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(Math.round(total*10)/10));track.setAttribute('aria-valuenow',String(t.wait));
  box.append(track,k.el('span','sp-wait-text'+(t.overdue?' over':''),t.overdue?'просрочен на '+hours(-t.slaLeft):'ждёт '+hours(t.wait)+' · SLA через '+hours(t.slaLeft)));
  return box;
 }
 function ticketRow(k,d,t){
  const row=k.el('article','sp-ticket'+(t.overdue?' overdue':''));row.dataset.ticket=t.id;
  const head=k.el('div','sp-ticket-head');
  head.append(link(k,t.url,'#'+t.id,'sp-id'),raw(k.el('span','sp-subject',t.subject||'(без темы)')));
  const chips=k.el('span','sp-chips');
  if(t.priority&&PRIORITY[t.priority])chips.append(k.chip({label:PRIORITY[t.priority].label,tone:PRIORITY[t.priority].tone,title:'Приоритет'}));
  const st=STATUS[t.status]||STATUS.open;const sc=k.chip({label:st.label,title:'Статус'});sc.style.setProperty('--sp-status',st.color);sc.classList.add('sp-status');chips.append(sc);
  head.append(chips);row.append(head);
  const meta=k.el('div','sp-ticket-meta');
  const reply=k.el('button','sp-reply','Ответить');reply.type='button';reply.title='Черновик ответа по тикету и базе знаний';reply.onclick=()=>k.ask('ответь на тикет '+t.id,{send:true});
  const right=k.el('span','sp-meta-right');right.append(waitBar(k,t),reply);
  meta.append(raw(k.el('span','sp-requester',[t.requester,when(t.created)].filter(Boolean).join(' · '))),right);
  row.append(meta);
  return row;
 }

 function overview(k,d){
  const body=k.el('div','sp-body');
  body.append(tiles(k,d));
  const c=chart(k,d);if(c)body.append(c);
  if(d.clusters)body.append(clusters(k,d));
  const list=k.el('div','sp-list');
  list.append(k.el('div','sp-section',(d.topic?'Тикеты · '+d.topic.label.toLowerCase():'Открытые тикеты')+(d.tickets.length?' · '+fmt(d.tickets.length+d.more):'')));
  if(d.tickets.length)list.append(k.collapse(d.tickets.map(t=>ticketRow(k,d,t)),5,'Показать ещё тикеты'));
  else list.append(k.el('p','sp-note','Открытых тикетов нет.'));
  if(d.more)list.append(k.el('small','kit-meta','Ещё '+fmt(d.more)+' — в службе поддержки.'));
  body.append(list);
  for(const note of d.notes||[])body.append(raw(k.el('small','kit-meta sp-footnote',note)));
  const status=d.tiles.overdue?{label:fmt(d.tiles.overdue)+' просрочено',tone:'alert',title:'Просрочено по SLA'}:{label:fmt(d.tiles.open)+' открыто',tone:d.tiles.open?'progress':'done'};
  const actions=[];
  if(!d.topic)actions.push({label:'Про оплату',run:()=>k.ask('тикеты про оплату за неделю',{send:true})});
  else actions.push({label:'Все тикеты',run:()=>k.ask('что в поддержке за неделю',{send:true})});
  if(d.days<30)actions.push({label:'За месяц',run:()=>k.ask((d.topic?'тикеты '+d.topic.label.toLowerCase():'что жалуются в поддержку')+' за месяц',{send:true})});
  return {body,status,actions,subtitle:d.sources.map(x=>x.name).join(' · ')+' · '+d.days+' '+plural(d.days,['день','дня','дней'])};
 }

 function replyView(k,d){
  const t=d.ticket,body=k.el('div','sp-body');
  const head=k.el('div','sp-reply-head');
  const title=k.el('div','sp-reply-title');title.append(link(k,t.url,'#'+t.id,'sp-id'),raw(k.el('span','sp-subject',t.subject||'(без темы)')));
  const chips=k.el('div','sp-chips');
  if(t.priority&&PRIORITY[t.priority])chips.append(k.chip({label:PRIORITY[t.priority].label,tone:PRIORITY[t.priority].tone}));
  const st=STATUS[t.status]||STATUS.open;const sc=k.chip({label:st.label});sc.style.setProperty('--sp-status',st.color);sc.classList.add('sp-status');chips.append(sc);
  if(t.requester)chips.append(raw(k.chip({label:t.requester,title:'Игрок'})));
  head.append(title,chips,waitBar(k,t));body.append(head);
  const thread=k.el('div','sp-thread');
  for(const c of d.thread||[]){
   const m=k.el('div','sp-msg '+(c.agent?'agent':'player')+(c.public?'':' internal'));
   const who=k.el('div','sp-msg-who');who.append(raw(k.el('span',null,c.author||(c.agent?'агент':'игрок'))),k.el('span','sp-muted',' · '+(c.agent?(c.public?'агент':'внутренняя заметка'):'игрок')+' · '+when(c.created)));
   m.append(who,raw(k.el('p','sp-msg-text',c.text)));thread.append(m);
  }
  if(thread.children.length){const box=k.el('div');box.append(k.el('div','sp-section','Переписка'),k.collapse([...thread.children],3,'Раньше в переписке'));body.append(box);}
  if(d.articles?.length){
   const box=k.el('div','sp-articles');box.append(k.el('div','sp-section','База знаний'));
   for(const x of d.articles){const row=k.el('div','sp-article');row.append(raw(link(k,x.url,x.title||x.url)));if(x.snippet)row.append(raw(k.el('small','sp-muted',x.snippet)));box.append(row);}
   body.append(box);
  }
  if(d.removed?.length){const warn=k.el('div','sp-warning');warn.append(k.el('b',null,'Убрано из черновика: '),'обещание возврата или компенсации — в макросах службы поддержки его нет.');warn.append(...d.removed.map(r=>raw(k.el('div','sp-removed','«'+r+'»'))));body.append(warn);}
  const editorBox=k.el('div','kit-draft sp-editor');
  const sentLine=sent=>{const p=k.el('p','sp-sent');p.append(k.el('b',null,'Отправлено игроку: '),raw(k.el('span',null,sent.text)));return p;};
  if(d.sent)body.append(sentLine(d.sent));
  else{
   const area=raw(k.el('textarea'));area.value=d.draft||'';area.rows=7;area.setAttribute('aria-label','Текст ответа');
   const counter=k.el('small','sp-counter');
   const go=k.el('button','primary','Отправить');go.type='button';
   const sync=()=>{counter.textContent=fmt(area.value.length)+' '+plural(area.value.length,['символ','символа','символов']);go.disabled=!area.value.trim();};
   go.onclick=async()=>{
    const text=area.value;go.disabled=true;area.readOnly=true;go.setAttribute('aria-busy','true');
    try{
     const result=await call('send',{card:d.id,source:d.source,id:t.id},text);
     d.sent={text,url:result.url};editorBox.replaceWith(sentLine(d.sent));
     const chip=node?.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent='ответ отправлен';chip.className='kit-chip tone-done';}
     k.toast(result.text);notify('support-reply:'+d.source+':'+t.id,{title:'Поддержка · тикет #'+t.id,text:result.text,kind:'success'});
    }catch(e){area.readOnly=false;sync();k.toast(e.message,{error:true});notify('support-reply:'+d.source+':'+t.id,{title:'Поддержка · тикет #'+t.id,text:e.message,kind:'error'});}
    finally{go.removeAttribute('aria-busy');}
   };
   area.oninput=sync;sync();
   const row=k.el('div','kit-actions');row.append(go,counter);
   editorBox.append(k.el('div','kit-draft-label',(d.draft?'Черновик ответа':'Ответ')+' — уйдёт игроку публичным комментарием ровно этот текст'),area,row);
   if(!d.draft)editorBox.append(k.el('small','kit-meta',d.model?'Черновик не получился — напишите ответ сами.':'Черновик появится, когда в настройках выбрана локальная модель.'));
   body.append(editorBox);
  }
  for(const note of d.notes||[])body.append(raw(k.el('small','kit-meta sp-footnote',note)));
  let node=null;
  const actions=[k.links('task-tracker',{title:'Поддержка #'+t.id+': '+(t.subject||'обращение игрока'),description:(t.text||'').slice(0,800),link:t.url,type:'bug'},{label:bugLabel})];
  const status=d.sent?{label:'ответ отправлен',tone:'done'}:t.overdue?{label:'просрочен SLA',tone:'alert'}:{label:'ждёт ответа',tone:'progress'};
  return {body,status,actions,subtitle:d.sources.map(x=>x.name).join(' · ')+' · тикет #'+t.id,bind:n=>{node=n;}};
 }

 window.renderSupportCard=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.support-card'))return;
  const view=d.mode==='reply'?replyView(k,d):overview(k,d);
  const node=k.card({app:'Поддержка игроков',initial:'П',color:'#8a5a9e',key:d.mode==='reply'?'Тикет #'+d.ticket.id:'Поддержка',status:view.status,subtitle:view.subtitle,body:view.body,actions:view.actions,className:'support-card'});
  view.bind?.(node);
  parent.append(node);
 };
})();
