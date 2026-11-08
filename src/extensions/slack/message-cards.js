(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('message-cards.css',document.currentScript.src).href;document.head.append(style);
 // Messages that mention the user come first and are marked, so «what needs me» is visible at a glance.
 let me=null;window.petya?.settings?.().then(v=>{me=[v.userName,...String(v.userNameVariants||'').split(',')].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);}).catch(()=>{});
 const mentions=item=>!!me?.length&&(item.parts||[{text:item.text}]).some(p=>/^@/.test(String(p.text||'').trim())&&me.some(n=>String(p.text).toLowerCase().includes(n)));
 window.renderSlackMessages=(parent,items)=>{
  if(!Array.isArray(items)||!items.length||parent.querySelector('.slack-message-list'))return;
  const list=document.createElement('div');list.className='slack-message-list';let more;
  items=[...items].sort((a,b)=>Number(mentions(b))-Number(mentions(a)));
  items.forEach((item,index)=>{
   const card=document.createElement('section');card.className='slack-message-card';const header=document.createElement('header'),author=document.createElement('strong'),body=document.createElement('p');author.textContent=item.author;header.append(author);if(mentions(item)){const tag=document.createElement('span');tag.className='kit-chip tone-alert';tag.textContent='Вас упомянули';header.append(tag);}
   const date=new Date(item.at);if(item.at&&Number.isFinite(date.getTime())){const time=document.createElement('time');time.dateTime=date.toISOString();time.textContent=date.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});time.title=date.toLocaleString('ru-RU');header.append(time);}
   // «В обсуждение» opens the Slack app on the message; the web link is the fallback.
   const web=(()=>{try{const url=new URL(item.url);return url.protocol==='https:'&&(url.hostname==='slack.com'||url.hostname.endsWith('.slack.com'))?url.href:'';}catch{return '';}})();
   const app=/^slack:\/\/channel\?/.test(item.appUrl||'')?item.appUrl:'';
   if(web||app){const link=document.createElement('a');link.href=app||web;link.target='_blank';link.rel='noopener';link.textContent='В обсуждение ↗';link.title=app?'Открыть в приложении Slack':'Открыть в Slack';header.append(link);}
   // Text with links shown by their labels, people and channels by name.
   for(const part of Array.isArray(item.parts)&&item.parts.length?item.parts:[{text:item.text}]){
    let href='';try{const u=new URL(part.link||'');if(['https:','http:'].includes(u.protocol))href=u.href;}catch{}
    if(href){const a=document.createElement('a');a.className='slack-inline-link';a.href=href;a.target='_blank';a.rel='noopener';a.textContent=part.text||href;a.title=href;body.append(a);}else body.append(document.createTextNode(String(part.text||'')));
   }
   card.append(header,body);
   // Reply in the thread: the draft in the card is the preview; only «Отправить» posts it.
   if(item.url&&window.chatResultsApi){
    const key=JSON.stringify(['slack',item.url]);card.dataset.resultPresentation=key;
    const open=document.createElement('button');open.type='button';open.className='slack-reply-open';open.textContent='Ответить';
    open.onclick=()=>{open.hidden=true;const draft=document.createElement('div');draft.className='kit-draft';const label=document.createElement('div');label.className='kit-draft-label';label.textContent='Ответ в тред · от вашего имени';
     const text=document.createElement('textarea');text.setAttribute('aria-label','Текст ответа');text.maxLength=4000;
     const row=document.createElement('div');row.className='kit-actions';const send=document.createElement('button');send.type='button';send.className='primary';send.textContent='Отправить';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';
     const ask=document.createElement('button');ask.type='button';ask.textContent='Предложи ответ';ask.title='Петя подготовит текст в поле ввода';
     ask.onclick=()=>{const c=document.getElementById('command');c.value='Предложи короткий ответ '+(item.author?item.author+' ':'')+'на сообщение: «'+String(item.text||'').slice(0,300)+'»';c.focus();};
     cancel.onclick=()=>{draft.remove();open.hidden=false;};
     send.onclick=async()=>{send.disabled=true;try{await window.resultKit.quick(key,'reply',{text:text.value});draft.replaceChildren(Object.assign(document.createElement('div'),{className:'kit-draft-label',textContent:'Отправлено: '+text.value.slice(0,120)}));}catch{send.disabled=false;}};
     row.append(send,cancel,ask);draft.append(label,text,row);card.append(draft);text.focus();};
    header.append(open);
   }
   // Attached files: «Посмотреть» downloads the file into the chat attachments and tells what is in it.
   const files=(item.files||[]).filter(f=>f&&f.name);
   if(files.length){const box=document.createElement('div');box.className='slack-files';
    for(const f of files){const chip=document.createElement('span');chip.className='slack-file';const label=document.createElement('span');label.textContent='📎 '+f.name+(f.size?' · '+(f.size<1048576?Math.max(1,Math.round(f.size/1024))+' КБ':(f.size/1048576).toFixed(1).replace('.',',')+' МБ'):'');chip.append(label);
     if(!f.external&&typeof inspectSourceMedia==='function'){const open=document.createElement('button');open.type='button';open.textContent='Посмотреть';open.onclick=run(async()=>{open.disabled=true;try{await inspectSourceMedia(f.id,'Покажи, что в файле «'+f.name+'»: кратко перескажи содержимое, ошибки и важные детали.');}finally{open.disabled=false;}});chip.append(open);}
     box.append(chip);}
    card.append(box);}
   if(index<3)list.append(card);else{if(!more){more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ещё сообщения · '+(items.length-3);more.append(summary);list.append(more);}more.append(card);}
  });parent.append(list);
 };
})();
