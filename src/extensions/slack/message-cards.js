(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('message-cards.css',document.currentScript.src).href;document.head.append(style);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined&&text!==null)n.textContent=text;return n;};
 const icon=d=>'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
 // Messages that mention the user come first and are marked, so «what needs me» is visible at a glance.
 let me=null;window.petya?.settings?.().then(v=>{me=[v.userName,...String(v.userNameVariants||'').split(',')].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);}).catch(()=>{});
 const mentions=item=>!!me?.length&&(item.parts||[{text:item.text}]).some(p=>/^@/.test(String(p.text||'').trim())&&me.some(n=>String(p.text).toLowerCase().includes(n)));
 // People by name: the team knows Slack IDs (src/ui/result-kit.js → loadTeam); unknown IDs stay as they are.
 const kit=()=>window.resultKit;
 const asked=new Map();// Slack ID → name from Slack itself (src/features/slack-open.cjs → names)
 const who=id=>kit()?.person?.(id)?.name||asked.get(id)||'';
 const isId=v=>/^[UWB][A-Z0-9]{6,}$/.test(String(v||''));
 const authorName=item=>isId(item.author)?who(item.author)||'Участник Slack':String(item.author||'Автор не указан');
 // Old cards and other sources keep Slack markup in the text: «<@U1>», «<#C1|general>», «<https://x|label>».
 function parse(text){
  const out=[];let last=0;const source=String(text||'');
  for(const m of source.matchAll(/<([^<>\s][^<>]*)>/g)){
   if(m.index>last)out.push({text:source.slice(last,m.index)});last=m.index+m[0].length;
   const [target,label]=m[1].split('|');
   if(/^@[UWB][A-Z0-9]+$/.test(target))out.push({text:'@'+(who(target.slice(1))||label||target.slice(1)),person:true});
   else if(/^#C[A-Z0-9]+$/.test(target))out.push({text:'#'+(label||'канал')});
   else if(/^!(?:here|channel|everyone)$/.test(target))out.push({text:'@'+target.slice(1)});
   else if(/^!subteam\^/.test(target))out.push({text:label||'@группа'});
   else if(/^https?:\/\//.test(target))out.push({link:target,text:label&&label!==target?label:''});
   else if(/^mailto:/.test(target))out.push({text:label||target.slice(7)});
   else out.push({text:m[0]});
  }
  if(last<source.length)out.push({text:source.slice(last)});
  return out.map(p=>({...p,text:String(p.text||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}));
 }
 // A link reads as what it is: «Google Таблица», «Сообщение в Slack», «BW-123», «PR #42», or the site and a short path.
 const urlish=v=>/^https?:\/\//.test(v)||/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v);
 function linkLabel(href,label){
  if(label&&!urlish(label)&&label.length<=80)return label;
  let u;try{u=new URL(href);}catch{return href;}
  const host=u.hostname.replace(/^www\./,''),p=u.pathname;
  if(host==='docs.google.com'){if(p.startsWith('/spreadsheets'))return 'Google Таблица';if(p.startsWith('/document'))return 'Google Документ';if(p.startsWith('/presentation'))return 'Google Презентация';if(p.startsWith('/forms'))return 'Google Форма';}
  if(host==='drive.google.com')return 'Google Диск';
  if(host==='slack.com'||host.endsWith('.slack.com'))return p.startsWith('/archives/')?'Сообщение в Slack':'Slack';
  const issue=p.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);if(issue)return issue[1];
  const gh=host==='github.com'&&p.match(/^\/[^/]+\/([^/]+)\/(pull|issues)\/(\d+)/);if(gh)return (gh[2]==='pull'?'PR #':'Задача #')+gh[3]+' · '+gh[1];
  if(host.endsWith('figma.com'))return 'Figma';
  const rest=p.replace(/\/$/,'');return host+(rest&&rest!=='/'?(rest.length>24?'/…'+rest.slice(-16):rest):'');
 }
 const isSlackMessage=href=>{try{const u=new URL(href);return (u.hostname==='slack.com'||u.hostname.endsWith('.slack.com'))&&u.pathname.startsWith('/archives/');}catch{return false;}};
 const openInSlack=href=>window.petya.feature('slackOpen','open',href).catch(e=>window.resultKit?.toast?.(e.message,{error:true}));
 function body(item){
  const box=el('div','slack-text');
  const parts=Array.isArray(item.parts)&&item.parts.length?item.parts.map(p=>p.link?{...p,text:p.text&&!/^https?:\/\//.test(p.text)&&!/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(p.text)?p.text:''}:p):parse(item.text);
  for(const part of parts){
   let href='';try{const u=new URL(part.link||'');if(['https:','http:'].includes(u.protocol))href=u.href;}catch{}
   if(href){const a=el('a','slack-link',linkLabel(href,part.text));a.href=href;a.target='_blank';a.rel='noopener';a.title=href;
    if(isSlackMessage(href))a.onclick=e=>{e.preventDefault();e.stopPropagation();openInSlack(href);};box.append(a);}
   else if(part.person||/^@\S/.test(part.text||'')&&String(part.text).length<60&&!/\s\S/.test(String(part.text).trim().slice(1))){
    // «@U043B3BETHQ» from a card made before the name was known: the team's name, or «участник».
    const raw=String(part.text).trim(),id=raw.slice(1);box.append(el('span','slack-mention',isId(id)?'@'+(who(id)||'участник Slack'):part.text));}
   else box.append(document.createTextNode(String(part.text||'')));
  }
  return box;
 }
 function reply(card,item,key,open){
  open.hidden=true;const draft=el('div','kit-draft'),label=el('div','kit-draft-label','Ответ в тред · от вашего имени');
  const text=el('textarea');text.setAttribute('aria-label','Текст ответа');text.maxLength=4000;
  const row=el('div','kit-actions'),send=el('button','primary','Отправить'),cancel=el('button',null,'Отмена'),ask=el('button',null,'Предложи ответ');
  for(const b of [send,cancel,ask])b.type='button';ask.title='Петя подготовит текст в поле ввода';
  ask.onclick=()=>{const c=document.getElementById('command');c.value='Предложи короткий ответ '+(item.author?authorName(item)+' ':'')+'на сообщение: «'+String(item.text||'').slice(0,300)+'»';c.focus();};
  cancel.onclick=()=>{draft.remove();open.hidden=false;};
  send.onclick=async()=>{send.disabled=true;try{await window.resultKit.quick(key,'reply',{text:text.value});draft.replaceChildren(el('div','kit-draft-label','Отправлено: '+text.value.slice(0,120)));}catch{send.disabled=false;}};
  row.append(send,cancel,ask);draft.append(label,text);
  // The reply passes the outgoing review (findings and suggestions under the text; sending stays as it is).
  if(window.resultKit?.outgoingReview)draft.append(window.resultKit.outgoingReview(text,{channel:{service:'slack',target:item.channel?'#'+item.channel:'',audience:'team'},context:{thread:true}}));
  draft.append(row);card.querySelector('.slack-main').append(draft);text.focus();
 }
 function message(item){
  const card=el('article','slack-msg'),name=authorName(item);
  if(mentions(item))card.classList.add('mentioned');
  const face=window.resultKit?.avatar?window.resultKit.avatar(isId(item.author)&&kit()?.person?.(item.author)?item.author:name,{size:30}):el('span','slack-face',name.slice(0,1));
  const main=el('div','slack-main'),head=el('div','slack-head');
  const author=el('strong','slack-author',name);if(isId(item.author))author.title='Slack ID: '+item.author;head.append(author);
  if(item.channel)head.append(el('span','slack-channel','#'+item.channel));
  const date=new Date(item.at);if(item.at&&Number.isFinite(date.getTime()))head.append(window.timeElement?window.timeElement(date):el('time',null,date.toLocaleString(window.petyaLocale)));
  if(mentions(item))head.append(el('span','kit-chip tone-alert','Вас упомянули'));
  main.append(head,body(item));
  // Attached files: «Посмотреть» downloads the file into the chat attachments and tells what is in it.
  const files=(item.files||[]).filter(f=>f&&f.name);
  if(files.length){const box=el('div','slack-files');
   for(const f of files){const chip=el('span','slack-file');chip.append(el('span',null,'📎 '+f.name+(f.size?' · '+(f.size<1048576?Math.max(1,Math.round(f.size/1024))+' КБ':(f.size/1048576).toFixed(1).replace('.',',')+' МБ'):'')));
    if(!f.external&&typeof inspectSourceMedia==='function'){const look=el('button',null,'Посмотреть');look.type='button';look.onclick=async()=>{look.disabled=true;try{await inspectSourceMedia(f.id,'Покажи, что в файле «'+f.name+'»: кратко перескажи содержимое, ошибки и важные детали.');}catch(e){notice?.(e.message,true);}finally{look.disabled=false;}};chip.append(look);}
    box.append(chip);}
   main.append(box);}
  // Actions show on hover: open the message in the Slack app, reply in its thread.
  const tools=el('div','slack-tools');
  const target=/^slack:\/\/channel\?/.test(item.appUrl||'')?item.appUrl:isSlackMessage(item.url)?item.url:'';
  if(target){const go=el('button','slack-tool');go.type='button';go.innerHTML=icon('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5');go.title='Открыть в Slack';go.setAttribute('aria-label','Открыть в Slack');go.onclick=()=>openInSlack(target);tools.append(go);}
  if(item.url&&window.chatResultsApi){
   const key=JSON.stringify(['slack',item.url]);card.dataset.resultPresentation=key;
   const open=el('button','slack-tool slack-reply-open');open.type='button';open.innerHTML=icon('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v5');open.append(' Ответить');open.title='Ответить в тред';
   open.onclick=()=>reply(card,item,key,open);tools.append(open);
  }
  card.append(face,main,tools);
  return card;
 }
 window.renderSlackMessages=(parent,items)=>{
  if(!Array.isArray(items)||!items.length||parent.querySelector('.slack-feed'))return;
  const list=el('div','slack-feed');
  const draw=()=>{list.replaceChildren();
   const sorted=[...items].sort((a,b)=>Number(mentions(b))-Number(mentions(a)));
   sorted.slice(0,3).forEach(item=>list.append(message(item)));
   if(sorted.length>3){const more=el('details','slack-more'),summary=el('summary',null,'Ещё '+(sorted.length-3)+' '+((n=>n%10===1&&n%100!==11?'сообщение':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'сообщения':'сообщений')(sorted.length-3)));more.append(summary);sorted.slice(3).forEach(item=>more.append(message(item)));list.append(more);}
  };
  draw();parent.append(list);
  // Names from the team arrive a moment later: redraw once they are known.
  // Names from the team arrive a moment later; IDs the team does not know are asked from Slack. Redraw once known.
  const ids=()=>[...new Set(items.flatMap(i=>[i.author,...String(i.text||'').match(/[UWB][A-Z0-9]{8,}/g)||[]]).filter(v=>isId(v)&&!who(v)))];
  Promise.resolve(kit()?.loadTeam?.()).then(async()=>{
   if(ids().length){try{const found=await window.petya.feature('slackOpen','names',ids());for(const [id,p] of Object.entries(found||{}))if(p?.name)asked.set(id,p.name);}catch{}}
   if(list.isConnected&&items.some(i=>isId(i.author)||/[UWB][A-Z0-9]{8,}/.test(i.text||'')))draw();}).catch(()=>{});
 };
})();
