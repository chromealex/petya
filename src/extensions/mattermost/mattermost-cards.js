// «Mattermost», renderer. One card for three answers: a channel digest (channel chips, messages per day, who wrote
// with their status, themes with verbatim quotes linking to the posts, active threads), a thread summary (the root,
// points with quotes, the last replies, a reply editor) and search results. The compose card shows the exact text and
// the channel. Nothing is posted until the user presses «Отправить» in a card. The body below the APP line is the
// same in vk-teams-cards.js (the shared messenger card; keep them in step).
(()=>{
 const APP={name:'Mattermost',feature:'mattermostApp',service:'mattermost',color:'#4a6aa0',initial:'M',sigil:'~',at:n=>'~'+n,cls:'mattermost-card',
  digest:'mattermostCard',compose:'mattermostCompose',ask:{channel:c=>'что нового в Mattermost в ~'+c.name,thread:t=>t.url?'перескажи тред '+t.url+' в Mattermost':'перескажи тред «'+t.title.slice(0,60)+'» в Mattermost',week:'что обсуждали в Mattermost за неделю',search:'найди в Mattermost '},
  css:'mattermost-cards.css',renderCard:'renderMattermostCard',renderCompose:'renderMattermostCompose'};
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL(APP.css,document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature(APP.feature,method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[one,few,many])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?one:many;const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 // Messages, names, channel names and themes are left alone by the UI translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const notify=(id,data)=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data}}));
 const STATUS={online:'в сети',away:'отошёл',dnd:'не беспокоить',offline:'не в сети'};
 const KIND={decision:{label:'решение',tone:'done'},question:{label:'вопрос',tone:'progress'},task:{label:'задача',tone:'progress'},point:{label:'мысль',tone:''}};
 function link(k,url,text,className='ms-link'){
  const safe=k.safeUrl(url);const a=k.el(safe?'a':'span',className,text);
  if(safe){a.href=safe;a.target='_blank';a.rel='noopener';a.title='Открыть в '+APP.name;}
  return a;
 }
 function time(at){
  if(!at)return null;const d=new Date(at);if(Number.isNaN(d.getTime()))return null;
  if(typeof window.timeElement==='function')return window.timeElement(d);
  const t=document.createElement('time');t.dateTime=d.toISOString();t.textContent=d.toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});return t;
 }
 function quote(k,q){
  const line=k.el('blockquote','ms-quote');
  line.append(raw(k.el('span','ms-quote-text','«'+q.text+'»')));
  const meta=k.el('span','ms-quote-meta');meta.append(raw(k.el('span',null,' — '+q.author+(q.channel?' · '+APP.sigil+q.channel:''))));
  const t=time(q.at);if(t)meta.append(' · ',t);
  if(q.url)meta.append(' ',link(k,q.url,'↗'));
  line.append(meta);return line;
 }
 function section(k,title,extra){const head=k.el('div','ms-section-row');head.append(k.el('span','ms-section',title));if(extra)head.append(raw(k.el('span','ms-max',extra)));return head;}

 // --- Digest ---------------------------------------------------------------------------------------------------------
 function channels(k,d){
  const row=k.el('div','ms-channels');row.setAttribute('role','list');row.setAttribute('aria-label','Каналы');
  for(const c of d.channels){
   const chip=k.el('button','ms-channel'+(c.count?'':' quiet'));chip.type='button';chip.setAttribute('role','listitem');
   chip.append(raw(k.el('span','ms-channel-name',APP.sigil+c.name)),k.el('span','ms-count',fmt(c.count)));
   chip.title='Сообщений: '+fmt(c.count);
   chip.onclick=()=>k.ask(APP.ask.channel(c),{send:true});
   row.append(chip);
  }
  return row;
 }
 function activity(k,d){
  const days=d.activity||[];if(days.length<2)return null;
  const box=k.el('div','ms-activity');
  box.append(section(k,'Сообщения по дням','всего '+fmt(d.total)));
  const plot=k.el('div','ms-plot');plot.setAttribute('role','list');
  const max=Math.max(1,...days.map(x=>x.count));
  const tip=k.el('div','ms-tip','Наведите на день');
  for(const x of days){
   const col=k.el('button','ms-col');col.type='button';col.setAttribute('role','listitem');
   const text=day(x.date)+': '+(x.count?fmt(x.count)+' '+plural(x.count,['сообщение','сообщения','сообщений']):'нет сообщений');
   col.setAttribute('aria-label',text);
   const bar=k.el('span','ms-bar-col');bar.style.height=(x.count?Math.max(4,100*x.count/max):0)+'%';col.append(bar);
   col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent=(window.t||String)('Наведите на день');};
   plot.append(col);
  }
  const axis=k.el('div','ms-axis');axis.append(k.el('span',null,day(days[0].date)),k.el('span',null,day(days.at(-1).date)));
  box.append(plot,axis,tip);return box;
 }
 function authors(k,d){
  if(!d.authors?.length)return null;
  const box=k.el('div','ms-authors');box.append(section(k,'Кто писал'));
  const max=Math.max(1,...d.authors.map(a=>a.count));
  for(const a of d.authors.slice(0,6)){
   const row=k.el('div','ms-author');
   const name=k.el('span','ms-author-name');
   if(a.status){const dot=k.el('i','ms-dot '+a.status);dot.title=STATUS[a.status]||'';dot.setAttribute('aria-label',STATUS[a.status]||'');name.append(dot);}
   name.append(raw(k.el('span',null,a.name)));
   const track=k.el('span','ms-track'),fill=k.el('span','ms-fill');fill.style.width=(100*a.count/max)+'%';track.append(fill);
   row.append(name,track,k.el('span','ms-n',fmt(a.count)));box.append(row);
  }
  return box;
 }
 function themes(k,d){
  const box=k.el('div','ms-themes');
  if(d.themes===null){
   box.append(section(k,'Последние сообщения'),k.el('p','ms-note','Темы появятся, когда в настройках выбрана локальная модель.'));
   for(const m of d.latest||[])box.append(quote(k,m));
   return box;
  }
  if(!d.themes.length){box.append(section(k,'Последние сообщения'));for(const m of d.latest||[])box.append(quote(k,m));return box;}
  box.append(section(k,'О чём говорили'));
  const max=Math.max(...d.themes.map(t=>t.count));
  for(const t of d.themes){
   const item=k.el('div','ms-theme');
   const head=k.el('div','ms-theme-head');
   const bar=k.el('span','ms-track');const fill=k.el('span','ms-fill');fill.style.width=(100*t.count/max)+'%';bar.append(fill);
   head.append(raw(k.el('span','ms-theme-title',t.title)),bar,k.el('span','ms-n',fmt(t.count)+' '+plural(t.count,['сообщение','сообщения','сообщений'])));
   item.append(head);for(const q of t.quotes||[])item.append(quote(k,q));
   box.append(item);
  }
  return box;
 }
 function threads(k,d){
  if(!d.threads?.length)return null;
  const box=k.el('div','ms-threads');box.append(section(k,'Активные треды'));
  for(const t of d.threads){
   const row=k.el('div','ms-thread');
   const text=k.el('div','ms-thread-text');
   const title=link(k,t.url,t.title||'(без текста)','ms-thread-title');raw(title);text.append(title);
   const meta=k.el('small','kit-meta');meta.append(raw(k.el('span',null,APP.sigil+t.channel.name+' · ')),fmt(t.replies)+' '+plural(t.replies,['ответ','ответа','ответов']));
   if(t.people?.length)meta.append(raw(k.el('span',null,' · '+t.people.slice(0,3).join(', '))));
   const w=time(t.last);if(w)meta.append(' · ',w);
   text.append(meta);
   const b=k.el('button',null,'Пересказать');b.type='button';b.onclick=()=>k.ask(APP.ask.thread(t),{send:true});
   row.append(text,b);box.append(row);
  }
  return box;
 }

 // --- Thread --------------------------------------------------------------------------------------------------------
 // Reply editor: the target is fixed, the text is exactly what is sent; the draft passes the outgoing review.
 function editor(k,{parent,label,text='',limit,send,onSent,cancellable=true,target}){
  parent.querySelector(':scope > .kit-draft')?.remove();
  const box=k.el('div','kit-draft ms-editor');
  const area=raw(k.el('textarea'));area.value=text;area.rows=4;area.setAttribute('aria-label',(window.t||String)('Текст сообщения'));
  const counter=k.el('small','ms-counter');
  const row=k.el('div','kit-actions');
  const go=k.el('button','primary','Отправить');go.type='button';
  const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>box.remove();
  const sync=()=>{counter.textContent=fmt(area.value.length)+' / '+fmt(limit);counter.classList.toggle('over',area.value.length>limit);go.disabled=!area.value.trim()||area.value.length>limit;};
  go.onclick=async()=>{
   const value=area.value;go.disabled=true;area.readOnly=true;go.setAttribute('aria-busy','true');
   try{const result=await send(value);box.remove();onSent(result,value);}
   catch(e){area.readOnly=false;sync();k.toast(e.message,{error:true});}
   finally{go.removeAttribute('aria-busy');}
  };
  area.oninput=sync;sync();
  row.append(go);if(cancellable)row.append(cancel);row.append(counter);box.append(k.el('div','kit-draft-label',label),area);
  if(k.outgoingReview)box.append(k.outgoingReview(area,{channel:{service:APP.service,target,audience:'team'}}));
  box.append(row);parent.append(box);area.focus();return box;
 }
 function sentLine(k,sent){const p=k.el('p','ms-sent');p.append(k.el('b',null,'Отправлено: '),raw(k.el('span',null,sent.text)));if(sent.url)p.append(' ',link(k,sent.url,'↗'));return p;}
 function thread(k,d){
  const t=d.thread,box=k.el('div','ms-thread-card');
  const root=k.el('div','ms-root');root.append(quote(k,t.root));box.append(root);
  // Timeline of the thread: from the root to the last reply.
  const span=k.el('div','ms-span');
  const people=k.el('span','ms-people');people.append(fmt(t.replies)+' '+plural(t.replies,['ответ','ответа','ответов'])+' · ',raw(k.el('span',null,t.people.join(', '))));
  span.append(people);box.append(span);
  if(t.summary){const p=k.el('p','ms-summary');p.append(raw(k.el('span',null,t.summary)));box.append(p);}
  else if(!d.model)box.append(k.el('p','ms-note','Пересказ появится, когда в настройках выбрана локальная модель. Ниже — последние ответы.'));
  if(t.points?.length){
   const list=k.el('div','ms-points');
   for(const p of t.points){
    const item=k.el('div','ms-point');const kind=KIND[p.kind]||KIND.point;
    const head=k.el('div','ms-point-head');head.append(k.chip({label:kind.label,tone:kind.tone}),raw(k.el('span','ms-point-text',p.text)));
    item.append(head,quote(k,p.quote));list.append(item);
   }
   box.append(list);
  }
  if(t.messages?.length){const rows=t.messages.map(m=>quote(k,m));box.append(section(k,'Последние ответы'),k.collapse(rows,3,'Ещё ответы'));}
  if(t.sent)box.append(sentLine(k,t.sent));
  const actions=k.el('div','kit-actions ms-row-actions');
  const reply=k.el('button',null,t.sent?'Отправлено':'Ответить в тред');reply.type='button';reply.disabled=!!t.sent;
  reply.onclick=()=>editor(k,{parent:box,label:'Ответ в тред в '+APP.at(d.channel.name)+' — отправится ровно этот текст',limit:d.limit||16383,target:APP.sigil+d.channel.name,
   send:text=>call('send',{card:d.id,root:t.id},text),
   onSent:(result,text)=>{t.sent={...result,text};reply.textContent=(window.t||String)('Отправлено');reply.disabled=true;actions.before(sentLine(k,t.sent));k.toast(result.text);notify(APP.service+'-send:'+d.id,{title:APP.name,text:'Ответ отправлен в тред.',kind:'success'});}});
  actions.append(reply);
  const points=(t.points||[]).map(p=>'— '+p.text).join('\n');
  actions.append(k.links('task-tracker',{title:APP.name+': '+(t.summary||t.root.text).slice(0,120),description:(t.summary?t.summary+'\n':'')+points,link:t.root.url}));
  box.append(actions);
  return box;
 }

 // --- Search ----------------------------------------------------------------------------------------------------------
 function marked(k,text,query){
  const node=raw(k.el('span','ms-result-text'));
  const words=String(query||'').toLowerCase().split(/\s+/).filter(w=>w.length>=3).map(w=>w.slice(0,Math.max(3,w.length-2)));
  const lower=text.toLowerCase();let at=0;const marks=[];
  for(const w of words){let i=lower.indexOf(w);while(i>=0&&marks.length<30){marks.push([i,i+w.length]);i=lower.indexOf(w,i+w.length);}}
  for(const [a,b] of marks.sort((x,y)=>x[0]-y[0])){if(a<at)continue;if(a>at)node.append(document.createTextNode(text.slice(at,a)));node.append(k.el('mark',null,text.slice(a,b)));at=b;}
  if(at<text.length)node.append(document.createTextNode(text.slice(at)));
  return node;
 }
 function search(k,d){
  const box=k.el('div','ms-results');
  if(!d.results.length){box.append(k.el('p','ms-note','Ничего не нашлось.'));return box;}
  const rows=d.results.map(r=>{
   const row=k.el('div','ms-result');
   row.append(marked(k,r.text,d.query));
   const meta=k.el('small','kit-meta');meta.append(raw(k.el('span',null,r.author+(r.channel?' · '+APP.sigil+r.channel:''))));
   const w=time(r.at);if(w)meta.append(' · ',w);if(r.url)meta.append(' ',link(k,r.url,'↗'));
   row.append(meta);return row;
  });
  box.append(k.collapse(rows,6,'Ещё результаты'));
  return box;
 }

 window[APP.renderCard]=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.'+APP.cls))return;
  const body=k.el('div','ms-body');let status,subtitle,actions=[];
  if(d.mode==='thread'){
   body.append(thread(k,d));
   status={label:fmt(d.thread.replies)+' '+plural(d.thread.replies,['ответ','ответа','ответов']),tone:d.thread.sent?'done':'progress'};
   subtitle='тред · '+APP.sigil+d.channel.name;
  }else if(d.mode==='search'){
   const head=k.el('div','ms-query');head.append(k.el('span','ms-section','Запрос'),raw(k.chip({label:'«'+d.query+'»'})));if(d.scope)head.append(k.el('small','kit-meta',d.scope));
   body.append(head,search(k,d));
   status={label:d.total?fmt(d.total)+' '+plural(d.total,['результат','результата','результатов']):'ничего',tone:d.total?'done':'alert'};
   subtitle='поиск';
   actions=[{label:'Искать другое',run:()=>k.ask(APP.ask.search)}];
  }else{
   body.append(channels(k,d));
   const top=k.el('div','ms-top');const a=activity(k,d),p=authors(k,d);if(a)top.append(a);if(p)top.append(p);if(top.children.length)body.append(top);
   if(d.total)body.append(themes(k,d));
   const t=threads(k,d);if(t)body.append(t);
   if(!d.total)body.append(k.el('p','ms-note','Новых сообщений нет.'));
   status={label:fmt(d.total)+' '+plural(d.total,['сообщение','сообщения','сообщений']),tone:d.total?'done':'progress',title:'Сообщения в выбранных каналах'};
   subtitle=d.days===1?'за сутки':'за '+d.days+' '+plural(d.days,['день','дня','дней']);
   if(d.days!==7)actions.push({label:'Сводка за неделю',run:()=>k.ask(APP.ask.week,{send:true})});
   actions.push({label:'Найти…',run:()=>k.ask(APP.ask.search)});
  }
  for(const note of d.notes||[])body.append(raw(k.el('small','kit-meta ms-footnote',note)));
  const node=k.card({app:APP.name,initial:APP.initial,color:APP.color,key:d.server||APP.name,status,subtitle,body,actions,className:APP.cls});
  const key=node.querySelector('.kit-key');if(key)raw(key);
  parent.append(node);
 };

 window[APP.renderCompose]=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.'+APP.cls+'.ms-compose'))return;
  const body=k.el('div','ms-body');
  const target=k.el('div','ms-target');target.append(k.el('span','ms-section','Куда'),raw(k.chip({label:APP.sigil+d.channel.name,title:'Сообщение уйдёт только сюда'})));
  body.append(target);
  const status={label:d.sent?'отправлено':'не отправлено',tone:d.sent?'done':'progress'};
  if(d.sent)body.append(sentLine(k,d.sent));
  else editor(k,{parent:body,label:'Сообщение в '+APP.at(d.channel.name)+' — отправится ровно этот текст',text:d.text,limit:d.limit,cancellable:false,target:APP.sigil+d.channel.name,
   send:text=>call('send',{card:d.id,channel:d.channel.id},text),
   onSent:(result,text)=>{d.sent={...result,text};body.append(sentLine(k,d.sent));const chip=node.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent=(window.t||String)('отправлено');chip.className='kit-chip tone-done';}k.toast(result.text);notify(APP.service+'-send:'+d.id,{title:APP.name,text:'Сообщение отправлено.',kind:'success'});}});
  const node=k.card({app:APP.name,initial:APP.initial,color:APP.color,key:d.server||APP.name,status,subtitle:'новое сообщение',body,className:APP.cls+' ms-compose'});
  const key=node.querySelector('.kit-key');if(key)raw(key);
  parent.append(node);
 };
})();
