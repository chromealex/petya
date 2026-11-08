(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('message-cards.css',document.currentScript.src).href;document.head.append(style);
 window.renderSlackMessages=(parent,items)=>{
  if(!Array.isArray(items)||!items.length||parent.querySelector('.slack-message-list'))return;
  const list=document.createElement('div');list.className='slack-message-list';let more;
  items.forEach((item,index)=>{
   const card=document.createElement('section');card.className='slack-message-card';const header=document.createElement('header'),author=document.createElement('strong'),body=document.createElement('p');author.textContent=item.author;header.append(author);
   const date=new Date(item.at);if(item.at&&Number.isFinite(date.getTime())){const time=document.createElement('time');time.dateTime=date.toISOString();time.textContent=date.toLocaleString(window.petyaLocale||'ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});time.title=date.toLocaleString(window.petyaLocale||'ru-RU');header.append(time);}
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
