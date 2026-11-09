// Materials page: grouped by the app they came from (meetings, Slack, Telegram, mail, notes…), with sizes,
// meeting recording and transcription progress, a warning on transcripts Whisper probably made up, and deletion.
// The list redraws only when something changed, and opened records stay open.
(() => {
 const GROUPS=[['meetings','Встречи'],['slack','Slack'],['telegram','Telegram'],['mail','Почта'],['jira','Jira'],['confluence','Confluence'],['notion','Notion'],['notes','Заметки']];
 const open=new Set(),chosen=new Map();let signature='',data=null;
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const size=n=>n<1024?n+' Б':n<1048576?(n/1024).toFixed(n<10240?1:0).replace('.',',')+' КБ':(n/1048576).toFixed(1).replace('.',',')+' МБ';
 const when=t=>t?window.relativeTime(t):'';
 const minutes=ms=>{const m=Math.round(ms/60000);return m<1?'меньше минуты':m<60?m+' мин':Math.floor(m/60)+' ч '+(m%60?m%60+' мин':'');};
 const words=(n,[one,few,many])=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
 function remove(button,request,label){
  button.onclick=run(async()=>{
   if(button.dataset.confirm!=='1'){button.dataset.confirm='1';button.classList.add('confirm');button.textContent='Удалить?';setTimeout(()=>{if(button.isConnected){button.dataset.confirm='';button.classList.remove('confirm');button.innerHTML=window.petyaIcons?.trash||'×';}},4000);return;}
   button.disabled=true;await window.petya.feature('materials','remove',request);notice(label+' удалено.');await refreshContexts();
  });
 }
 function deleteButton(request,label){const b=node('button','material-delete delete-button');b.type='button';b.title='Удалить';b.setAttribute('aria-label','Удалить');b.innerHTML=window.petyaIcons?.trash||'×';remove(b,request,label);return b;}
 // A record: heading, details, actions; the text is put in only when it is opened.
 function record({key,title,meta,status,percent,warning,text,ask,url,request,label}){
  const card=node('article','material-item');card.dataset.key=key;
  const head=node('div','material-head'),info=node('div','material-info');info.append(node('strong',null,title),node('p','material-meta',meta.filter(Boolean).join(' · ')));
  if(status){const s=node('p','material-status',status);if(Number.isFinite(percent)){const bar=node('span','material-progress');const fill=node('span');fill.style.width=Math.max(2,Math.min(100,percent))+'%';bar.append(fill);s.append(bar);}info.append(s);}
  if(warning)info.append(node('p','material-warning',warning));
  const actions=node('div','material-actions');
  if(ask){const b=node('button',null,'Спросить Петю');b.type='button';b.onclick=()=>{view('home');$('command').value='По материалу «'+title+'»: ';$('command').focus();};actions.append(b);}
  if(url&&/^https:\/\//.test(url)){const b=node('button',null,'Открыть');b.type='button';b.onclick=()=>window.open(url,'_blank');actions.append(b);}
  actions.append(deleteButton(request,label));head.append(info,actions);card.append(head);
  if(text){const details=node('details','material-text'),summary=node('summary',null,warning?'Показать текст':'Прочитать запись'),body=node('div','material-body');details.append(summary,body);
   // The body is looked up at toggle time: a redraw keeps the card already on screen (morph below), not this one.
   const fill=body=>{if(!body.childElementCount&&!body.textContent)for(const part of [].concat(text())){if(part.at){const line=node('p');line.append(node('span','material-time',new Date(part.at).toLocaleTimeString(window.petyaLocale||'ru-RU',{hour:'2-digit',minute:'2-digit'})+' '),...part.who?[node('strong','material-who'+(part.who==='Вы'?' me':''),part.who+': ')]:[],document.createTextNode(part.text));body.append(line);}else body.append(node('p',null,part.text||part));}};
   if(open.has(key)){details.open=true;fill(body);}
   details.ontoggle=event=>{const d=event.currentTarget;if(d.open){open.add(key);fill(d.querySelector('.material-body'));}else open.delete(key);};card.append(details);}
  return card;
 }
 function meetings(items,sessions){
  const by=new Map();for(const item of items){const id=item.sessionId||item.id;if(!by.has(id))by.set(id,{id,parts:[],extra:[],session:null});(item.kind?by.get(id).extra:by.get(id).parts).push(item);}
  for(const s of sessions){if(!by.has(s.id))by.set(s.id,{id:s.id,parts:[],extra:[],session:s});else by.get(s.id).session=s;}
  // One meeting is one record: recordings that follow each other within 15 minutes (the meeting app
  // lost the meeting for a moment, the recording restarted) are joined.
  const sorted=[...by.values()].map(m=>{m.parts.sort((a,b)=>a.at-b.at);m.at=m.session?.startedAt||m.parts[0]?.at||m.extra[0]?.at||0;m.end=Math.max(m.at+(m.session?.duration||0),m.parts.at(-1)?.at||0);m.ids=[m.id];return m;}).sort((a,b)=>a.at-b.at);
  const joined=[];for(const m of sorted){const last=joined.at(-1);if(last&&m.at-last.end<=15*60000){last.parts.push(...m.parts);last.extra.push(...m.extra);last.ids.push(m.id);last.end=Math.max(last.end,m.end);if(m.session&&(!last.session||['recording','processing','error'].includes(m.session.phase)))last.session={...m.session,startedAt:last.at,duration:Math.max(0,last.end-last.at)};else if(last.session)last.session={...last.session,duration:Math.max(0,last.end-last.at)};}else joined.push(m);}
  return joined.sort((a,b)=>b.at-a.at).map(m=>{
   const s=m.session,bytes=m.parts.reduce((n,p)=>n+p.bytes,0),suspect=m.parts.filter(p=>p.suspect);
   const live=s&&['recording','processing'].includes(s.phase),start=m.at,end=m.parts.at(-1)?.at;
   const duration=m.ids.length>1?Math.max(0,m.end-m.at):s?.duration||(start&&end?end-start:0);
   const status=s?.phase==='recording'?'● Идёт запись'+(s.completed?' · расшифровано '+s.completed+' из '+s.segments:''):s?.phase==='processing'?'Расшифровываю · '+(s.percent||0)+'%':s?.phase==='error'?s.message:'';
   // Fragments Whisper made up are simply left out of the text; only a record made up entirely is flagged.
   const warning=suspect.length&&suspect.length===m.parts.length?'Похоже, распознавание ошиблось ('+suspect[0].suspect+'). Такую запись лучше удалить.':'';
   const card=record({key:'meeting:'+m.ids[0],title:'Встреча · '+when(start),meta:[duration?minutes(duration):'',s?.bytes&&live?size(s.bytes)+' аудио':'',bytes?size(bytes)+' текста':''],
    status,percent:s?.phase==='processing'?s.percent:s?.phase==='recording'&&s.segments?s.completed/s.segments*100:undefined,warning,
    text:m.parts.length?()=>{const good=m.parts.filter(p=>!p.suspect);return (good.length?good:m.parts).map(p=>({at:p.at,text:p.text,who:p.source==='Микрофон'?'Вы':p.speaker||'Собеседники'}));}:null,ask:m.parts.length>0,request:{sessionIds:m.ids,ids:m.parts.map(p=>p.id)},label:'Встреча'});
   // The summary of the meeting (what was discussed, decided, who does what, what was not discussed) and
   // the meeting service's own letter, when one came.
   const summary=m.extra.filter(x=>x.kind==='summary').sort((a,b)=>b.at-a.at)[0],letter=m.extra.find(x=>x.kind==='meeting-mail');
   if(summary){const box=node('div','material-summary');for(const block of summary.text.split(/\n\n+/)){const [head,...rows]=block.split('\n');const h=node('p','material-summary-head',head.replace(/\*\*/g,''));box.append(h);const ul=node('ul');for(const r of rows)ul.append(node('li',null,r.replace(/^-\s*/,'')));if(rows.length)box.append(ul);}card.querySelector('.material-head').after(box);}
   else if(m.parts.length&&!['recording','processing'].includes(s?.phase)){const b=node('button',null,'Сделать сводку');b.type='button';b.onclick=run(async()=>{b.disabled=true;b.textContent='Собираю сводку…';try{await window.petya.feature('meetingSummary','summarize',m.ids[0]);await refreshContexts();}finally{b.disabled=false;}});card.querySelector('.material-actions').prepend(b);}
   if(letter){const d=node('details','material-text');d.append(node('summary',null,letter.title));const body=node('div','material-body');d.ontoggle=event=>{const box=event.currentTarget.querySelector('.material-body');if(event.currentTarget.open&&!box.textContent)box.append(node('p',null,letter.text));};d.append(body);card.append(d);}
   if(s?.phase==='error'){const retry=node('button',null,'Обработать снова');retry.type='button';retry.onclick=run(async()=>{await window.petya.feature('meetingMemory','retry',m.id);await refreshContexts();});card.querySelector('.material-actions').prepend(retry);}
   return card;});
 }
 function plain(items){return [...items].sort((a,b)=>b.at-a.at).map(item=>record({key:item.id,title:item.title||item.source,meta:[item.source,when(item.at),item.messages!==undefined?words(item.messages,['сообщение','сообщения','сообщений']):'',size(item.bytes)],
  text:()=>item.text,ask:true,url:item.url,request:{ids:[item.id]},label:'Материал'}));}
 function recordingLine(settings){if(!settings)return null;const line=node('p','material-recording');
  line.textContent=!settings.sources?.length||settings.mode==='off'?'Встречи записываются по кнопке «Слушать встречу».':settings.mode==='ask'?'Перед записью встречи Петя спросит.':'Встречи в '+settings.sources.join(', ')+' записываются автоматически и расшифровываются по ходу.';
  const b=node('button',null,'Настроить');b.type='button';b.onclick=()=>{view('settings');setTimeout(()=>document.querySelector('[data-service="meetings"]')?.scrollIntoView({block:'center'}),100);};line.append(' ',b);return line;}
 function render(value){
  data=value;const sig=JSON.stringify([value.items.map(i=>[i.id,i.bytes,i.suspect]),value.meetings.map(m=>[m.id,m.phase,m.completed,m.segments,m.percent]),value.recording]);if(sig===signature)return;signature=sig;
  let list=$('context-list');if(!list)return;
  // Built aside and merged into what is on screen: a recording meeting updates every few seconds, and redrawing
  // the page each time made it blink and reset the scrolled transcript.
  const target=list,scroll=window.scrollY;list=document.createElement('div');
  const stats=$('source-stats');if(stats)stats.replaceChildren(Object.assign(document.createElement('span'),{textContent:'Всего записей:'}),document.createTextNode(' '+value.items.length));
  if(!value.items.length&&!value.meetings.length){list.append(node('p','material-empty','Пока нет сохранённых материалов. Здесь появятся встречи, сообщения Slack и Telegram и ваши заметки.'));const line=recordingLine(value.recording);if(line)list.append(line);children(target,list);return;}
  for(const [id,label] of GROUPS){
   const items=value.items.filter(i=>i.app===id),sessions=id==='meetings'?value.meetings:[];if(!items.length&&!sessions.length)continue;
   const group=node('details','material-group');group.dataset.source=label;// Groups start folded so every app is visible at once; only the first is open. The user's choice sticks.
   group.open=chosen.has(id)?chosen.get(id):!list.childElementCount;group.ontoggle=()=>chosen.set(id,group.open);
   const cards=id==='meetings'?meetings(items,sessions):plain(items);
   const summary=node('summary');summary.append(node('span','material-group-title',label),node('span','material-group-meta',words(cards.length,['запись','записи','записей'])+' · '+size(items.reduce((n,i)=>n+i.bytes,0))));
   group.append(summary);if(id==='meetings'){const line=recordingLine(value.recording);if(line)group.append(line);
    // One click removes every meeting whose whole transcript was made up by Whisper.
    const bad=[...new Set(items.filter(i=>i.suspect).map(i=>i.sessionId||i.id))].filter(sid=>items.filter(i=>(i.sessionId||i.id)===sid).every(i=>i.suspect));
    if(bad.length&&line){const b=node('button',null,'Удалить ошибочные записи · '+bad.length);b.type='button';b.onclick=run(async()=>{for(const sid of bad)await window.petya.feature('materials','remove',{sessionIds:[sid],ids:items.filter(i=>(i.sessionId||i.id)===sid).map(i=>i.id)});notice('Удалено ошибочных записей: '+bad.length+'.');await refreshContexts();});line.append(' ',b);}}group.append(...cards);list.append(group);
  }
  children(target,list);window.scrollTo(0,scroll);
 }
 // Brings `a` (on screen) to match `b` (fresh), keeping nodes that did not change: open details, scroll positions.
 const HANDLERS=['onclick','ontoggle','oninput','onchange','onkeydown'];
 function morph(a,b){
  if(a.nodeType!==b.nodeType||a.nodeName!==b.nodeName||a.nodeType===1&&a.dataset.key!==b.dataset.key){a.replaceWith(b);return;}
  if(a.nodeType!==1){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;return;}
  for(const {name,value} of [...b.attributes])if(a.getAttribute(name)!==value)a.setAttribute(name,value);
  for(const {name} of [...a.attributes])if(!b.hasAttribute(name))a.removeAttribute(name);
  for(const h of HANDLERS)if(a[h]!==b[h])a[h]=b[h];if('disabled' in b&&a.disabled!==b.disabled)a.disabled=b.disabled;
  children(a,b);
 }
 function children(a,b){
  const old=[...a.childNodes],fresh=[...b.childNodes];
  fresh.forEach((child,i)=>{if(i<old.length)morph(old[i],child);else a.append(child);});
  for(const extra of old.slice(fresh.length))extra.remove();
 }
 window.renderMaterials=render;
 if(window.materialsData)render(window.materialsData);
 // Meeting progress redraws the page while it is open; Slack and other updates come through refreshContexts().
 let timer;window.petyaEvents.onMeetingMemory?.(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!$('sources')?.hidden)refreshContexts().catch(()=>{});},500);});
})();
