// «Discord», renderer. The digest card: channel chips with unread counts, messages per day with bug reports marked,
// the players' mood on a −1…1 scale, themes with verbatim quotes linking to the messages (a bug theme can go to the
// connected task tracker), frequent questions with answers drafted from the pinned messages. The compose card shows
// the exact text and the channel. Nothing is posted until the user presses «Отправить» in a card.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('discord-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('discordApp',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const fmt=n=>Number(n||0).toLocaleString(locale());
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 // Players' messages, channel names, themes and drafts are left alone by the UI translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const notify=(id,data)=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data}}));
 const KIND={bug:{label:'баг',tone:'alert'},question:{label:'вопрос',tone:'progress'},feedback:{label:'отзыв',tone:''},praise:{label:'похвала',tone:'done'},other:{label:'разное',tone:''}};
 function link(k,url,text,className='dc-link'){
  const safe=k.safeUrl(url);const a=k.el(safe?'a':'span',className,text);
  if(safe){a.href=safe;a.target='_blank';a.rel='noopener';a.title='Открыть в Discord';}
  return a;
 }
 const channelName=(d,id)=>(d.channels||[]).find(c=>c.id===id)?.name||'';

 function channels(k,d){
  const row=k.el('div','dc-channels');row.setAttribute('role','list');row.setAttribute('aria-label','Каналы');
  for(const c of d.channels){
   const chip=k.el('button','dc-channel'+(c.unread?' unread':''));chip.type='button';chip.setAttribute('role','listitem');
   chip.append(raw(k.el('span','dc-channel-name',(c.type===15?'▤ ':'#')+c.name)));
   if(c.unread)chip.append(k.el('span','dc-unread',fmt(c.unread)));
   else chip.append(k.el('span','dc-count',fmt(c.count)));
   chip.title=c.unread?'Новых с прошлого просмотра: '+fmt(c.unread)+' из '+fmt(c.count):'Сообщений игроков: '+fmt(c.count);
   chip.onclick=()=>k.ask('что нового в дискорде в #'+c.name,{send:true});
   row.append(chip);
  }
  return row;
 }
 function activity(k,d){
  const days=d.activity||[];if(!days.length)return null;
  const box=k.el('div','dc-activity');
  const head=k.el('div','dc-section-row');head.append(k.el('span','dc-section','Сообщения по дням'),k.el('span','dc-max','всего '+fmt(d.total)));
  const plot=k.el('div','dc-plot');plot.setAttribute('role','list');
  const max=Math.max(1,...days.map(x=>x.count));
  const tip=k.el('div','dc-tip','Наведите на день');
  for(const x of days){
   const col=k.el('button','dc-col');col.type='button';col.setAttribute('role','listitem');
   const text=day(x.date)+': '+(x.count?fmt(x.count)+' '+plural(x.count,['сообщение','сообщения','сообщений'])+(x.bugs?', о багах: '+fmt(x.bugs):''):'нет сообщений');
   col.setAttribute('aria-label',text);
   const stack=k.el('span','dc-stack');stack.style.height=(x.count?Math.max(4,100*x.count/max):0)+'%';
   if(x.bugs){const bug=k.el('span','dc-seg bug');bug.style.flexGrow=String(x.bugs);stack.append(bug);}
   if(x.count-x.bugs>0){const rest=k.el('span','dc-seg');rest.style.flexGrow=String(x.count-x.bugs);stack.append(rest);}
   col.append(stack);col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent='Наведите на день';};
   plot.append(col);
  }
  const axis=k.el('div','dc-axis');axis.append(k.el('span',null,day(days[0].date)),k.el('span',null,day(days.at(-1).date)));
  const legend=k.el('div','dc-legend');const a=k.el('span');a.append(k.el('i','dc-sw'),'сообщения');const b=k.el('span');b.append(k.el('i','dc-sw bug'),'о багах (по словам)');legend.append(a,b);
  box.append(head,plot,axis,legend,tip);return box;
 }
 function mood(k,d){
  if(!d.mood)return null;
  const v=Math.max(-1,Math.min(1,d.mood.score));
  const box=k.el('div','dc-mood');
  const label=v<=-0.3?'скорее недовольны':v>=0.3?'скорее довольны':'нейтрально';
  const head=k.el('div','dc-section-row');head.append(k.el('span','dc-section','Настроение игроков'),k.el('span','dc-mood-label '+(v<=-0.3?'bad':v>=0.3?'good':''),label));
  const track=k.el('div','dc-mood-track');track.setAttribute('role','meter');track.setAttribute('aria-valuemin','-1');track.setAttribute('aria-valuemax','1');track.setAttribute('aria-valuenow',String(v));track.setAttribute('aria-label','Настроение: '+label);
  const mark=k.el('span','dc-mood-mark');mark.style.left=(50+v*50)+'%';track.append(mark);
  const ends=k.el('div','dc-axis');ends.append(k.el('span',null,'недовольны'),k.el('span',null,'довольны'));
  box.append(head,track,ends);
  if(!d.mood.byModel)box.append(k.el('small','kit-meta','Оценка по словам в сообщениях — с локальной моделью точнее.'));
  return box;
 }
 function quote(k,q,d){
  const line=k.el('blockquote','dc-quote');
  line.append(raw(k.el('span',null,'«'+q.text+'»')));
  const meta=k.el('span','dc-quote-meta');meta.append(raw(k.el('span',null,' — '+q.author+(channelName(d,q.channel)?' · #'+channelName(d,q.channel):''))),' ',link(k,q.url,'↗'));
  line.append(meta);return line;
 }
 function clusters(k,d){
  const box=k.el('div','dc-clusters');
  box.append(k.el('div','dc-section',d.mode==='bugs'?'Баги, о которых пишут':'О чём говорят'));
  if(d.clusters===null){box.append(k.el('p','dc-note','Темы появятся, когда в настройках выбрана локальная модель. Ниже — сообщения о багах, найденные по словам.'));return box;}
  if(!d.clusters.length){box.append(k.el('p','dc-note',d.mode==='bugs'?'Сообщений о багах не нашлось.':'Повторяющихся тем не нашлось.'));return box;}
  const max=Math.max(...d.clusters.map(c=>c.count));
  for(const c of d.clusters){
   const item=k.el('div','dc-cluster');
   const head=k.el('div','dc-cluster-head');
   const bar=k.el('span','dc-bar');const fill=k.el('span','dc-bar-fill'+(c.sentiment<0?' bad':c.sentiment>0?' good':''));fill.style.width=(100*c.count/max)+'%';bar.append(fill);
   const kind=k.chip({label:(KIND[c.kind]||KIND.other).label,tone:(KIND[c.kind]||KIND.other).tone});
   head.append(raw(k.el('span','dc-cluster-title',c.title)),kind,bar,k.el('span','dc-cluster-count',fmt(c.count)+' '+plural(c.count,['сообщение','сообщения','сообщений'])));
   item.append(head);
   for(const q of c.quotes||[])item.append(quote(k,q,d));
   if(c.kind==='bug'){
    const quotes=(c.quotes||[]).map(q=>'«'+q.text+'» ('+q.url+')').join(' ');
    const row=k.el('div','kit-actions dc-row-actions');
    row.append(k.links('task-tracker',{title:'Discord: '+c.title,description:fmt(c.count)+' '+plural(c.count,['сообщение','сообщения','сообщений'])+' игроков'+(d.guildName?' на сервере '+d.guildName:'')+'. '+quotes,link:c.quotes?.[0]?.url,type:'bug'}));
    item.append(row);
   }
   box.append(item);
  }
  return box;
 }
 function bugs(k,d){
  if(!d.bugs?.length)return null;
  const box=k.el('div','dc-bugs');box.append(k.el('div','dc-section','Похоже на баги (по словам)'));
  for(const b of d.bugs){
   const row=k.el('div','dc-bug');
   const text=k.el('div','dc-bug-text');text.append(raw(k.el('span',null,b.text)));
   const meta=k.el('small','kit-meta');meta.append(raw(k.el('span',null,b.author+(channelName(d,b.channel)?' · #'+channelName(d,b.channel):'')+' · '+when(b.at)+' ')),link(k,b.url,'↗'));
   text.append(meta);
   const actions=k.el('div','kit-actions dc-row-actions');
   actions.append(k.links('task-tracker',{title:'Discord: '+b.text.slice(0,90),description:b.author+': «'+b.text+'»',link:b.url,type:'bug'}));
   row.append(text,actions);box.append(row);
  }
  return box;
 }

 // Reply editor: the channel is fixed (the question's own channel or thread), the text is exactly what is sent.
 function editor(k,{parent,label,text,limit=2000,send,onSent,cancellable=true}){
  parent.querySelector(':scope > .kit-draft')?.remove();
  const box=k.el('div','kit-draft dc-editor');
  const area=raw(k.el('textarea'));area.value=text||'';area.rows=4;area.setAttribute('aria-label','Текст сообщения');
  const counter=k.el('small','dc-counter');
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
  row.append(go);if(cancellable)row.append(cancel);row.append(counter);box.append(k.el('div','kit-draft-label',label),area,row);
  parent.append(box);area.focus();return box;
 }
 function sentLine(k,sent){const p=k.el('p','dc-sent');p.append(k.el('b',null,'Отправлено: '),raw(k.el('span',null,sent.text)),' ',link(k,sent.url,'↗'));return p;}

 function faq(k,d){
  if(!d.faq)return null;
  const box=k.el('div','dc-faq');
  box.append(k.el('div','dc-section','Частые вопросы'+(d.faq.length?' · '+d.faq.length:'')));
  if(!d.faq.length){box.append(k.el('p','dc-note','Повторяющихся вопросов нет.'));return box;}
  for(const q of d.faq){
   const item=k.el('article','dc-faq-item');
   const head=k.el('div','dc-faq-head');head.append(raw(k.el('span','dc-faq-q',q.question)),k.el('span','dc-faq-count','×'+fmt(q.count)));
   item.append(head);
   if(q.latest)item.append(quote(k,q.latest,d));
   if(q.answer){const ans=k.el('div','dc-answer');ans.append(k.el('b',null,'Черновик ответа: '),raw(k.el('span',null,q.answer)));if(q.pin)ans.append(' ',link(k,q.pin.url,'по закрепу ↗','dc-pin'));item.append(ans);}
   else if(d.faqByModel)item.append(k.el('small','kit-meta','В закреплённых сообщениях ответа нет — напишите его сами.'));
   if(q.sent)item.append(sentLine(k,q.sent));
   const where=(q.thread?'ветку в #':'#')+(channelName(d,q.channel)||'канал');
   const actions=k.el('div','kit-actions dc-row-actions');
   const reply=k.el('button',null,q.sent?'Отправлено':'Ответить в Discord');reply.type='button';reply.disabled=!!q.sent;
   reply.onclick=()=>editor(k,{parent:item,label:'Ответ в '+where+' на последний такой вопрос — отправится ровно этот текст',text:q.answer,
    send:text=>call('send',{card:d.id,replyTo:q.latest.id},text),
    onSent:(result,text)=>{q.sent={...result,text};reply.textContent='Отправлено';reply.disabled=true;item.querySelector('.dc-sent')?.remove();actions.before(sentLine(k,q.sent));k.toast(result.text);notify('discord-send:'+d.id+':'+q.latest.id,{title:'Discord',text:'Ответ отправлен в '+where+'.',kind:'success'});}});
   actions.append(reply);item.append(actions);box.append(item);
  }
  return box;
 }

 window.renderDiscordDigest=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.discord-card'))return;
  const body=k.el('div','dc-body');
  if(d.hidden){const warn=k.el('p','dc-warning','Бот не видит текст сообщений. Включите Message Content Intent: Developer Portal → ваше приложение → Bot → Privileged Gateway Intents.');body.append(warn);}
  body.append(channels(k,d));
  const top=k.el('div','dc-top');const a=activity(k,d),m=mood(k,d);if(a)top.append(a);if(m)top.append(m);if(top.children.length)body.append(top);
  if(d.mode!=='faq'&&d.total)body.append(clusters(k,d));
  const b=bugs(k,d);if(b)body.append(b);
  const f=d.mode!=='bugs'&&d.total?faq(k,d):null;if(f)body.append(f);
  if(d.pinned?.length&&d.mode==='faq'){const pins=d.pinned.map(p=>{const row=k.el('div','dc-pinned');row.append(raw(k.el('span',null,p.text)),' ',link(k,p.url,'↗'));return row;});const box=k.el('div','dc-pins');box.append(k.el('div','dc-section','Закреплено'),k.collapse(pins,2,'Ещё закреплённые'));body.append(box);}
  if(!d.total&&!d.hidden)body.append(k.el('p','dc-note','Новых сообщений игроков нет.'));
  for(const note of d.notes||[])body.append(raw(k.el('small','kit-meta dc-footnote',note)));
  const unread=d.channels.reduce((n,c)=>n+c.unread,0);
  const v=d.mood?.score??0;
  const status=d.hidden?{label:'нет доступа к тексту',tone:'alert'}:{label:unread?fmt(unread)+' '+plural(unread,['новое','новых','новых']):fmt(d.total)+' '+plural(d.total,['сообщение','сообщения','сообщений']),tone:v<=-0.3?'alert':unread?'progress':'done',title:'Сообщения игроков в выбранных каналах'};
  const subtitle=(d.mode==='bugs'?'баги · ':d.mode==='faq'?'частые вопросы · ':'')+(d.days?d.days+' '+plural(d.days,['день','дня','дней']):'с прошлого просмотра');
  const actions=[];
  if(d.mode!=='bugs')actions.push({label:'Только баги',run:()=>k.ask('баги из дискорда'+(d.days?' за '+d.days+' '+plural(d.days,['день','дня','дней']):' за неделю'),{send:true})});
  if(d.mode!=='faq')actions.push({label:'Частые вопросы',run:()=>k.ask('частые вопросы игроков в дискорде за неделю',{send:true})});
  if(d.mode!=='digest'||d.days!==7)actions.push({label:'Сводка за неделю',run:()=>k.ask('что писали в дискорде за неделю',{send:true})});
  const node=k.card({app:'Discord',initial:'#',color:'#5b62c9',key:d.guildName||'Discord',status,subtitle,body,actions,className:'discord-card'});
  const key=node.querySelector('.kit-key');if(key)raw(key);
  parent.append(node);
 };

 window.renderDiscordCompose=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.discord-compose'))return;
  const body=k.el('div','dc-body');
  const target=k.el('div','dc-target');target.append(k.el('span','dc-section','Канал'),raw(k.chip({label:'#'+d.channel.name,title:'Сообщение уйдёт только в этот канал'})));
  body.append(target);
  const status={label:d.sent?'отправлено':'не отправлено',tone:d.sent?'done':'progress'};
  if(d.sent){body.append(sentLine(k,d.sent));}
  else editor(k,{parent:body,label:'Сообщение в #'+d.channel.name+' — отправится ровно этот текст',text:d.text,limit:d.limit,cancellable:false,
   send:text=>call('send',{card:d.id,channel:d.channel.id},text),
   onSent:(result,text)=>{d.sent={...result,text};body.append(sentLine(k,d.sent));const chip=node.querySelector('.kit-card-head .kit-chip');if(chip){chip.textContent='отправлено';chip.className='kit-chip tone-done';}k.toast(result.text);notify('discord-send:'+d.id,{title:'Discord',text:'Сообщение отправлено в #'+d.channel.name+'.',kind:'success'});}});
  const node=k.card({app:'Discord',initial:'#',color:'#5b62c9',key:d.guildName||'Discord',status,subtitle:'новое сообщение',body,className:'discord-card discord-compose'});
  const key=node.querySelector('.kit-key');if(key)raw(key);
  parent.append(node);
 };
})();
