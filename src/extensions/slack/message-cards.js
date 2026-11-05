(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('message-cards.css',document.currentScript.src).href;document.head.append(style);
 window.renderSlackMessages=(parent,items)=>{
  if(!Array.isArray(items)||!items.length||parent.querySelector('.slack-message-list'))return;
  const list=document.createElement('div');list.className='slack-message-list';let more;
  items.forEach((item,index)=>{
   const card=document.createElement('section');card.className='slack-message-card';const header=document.createElement('header'),author=document.createElement('strong'),body=document.createElement('p');author.textContent=item.author;header.append(author);
   const date=new Date(item.at);if(item.at&&Number.isFinite(date.getTime())){const time=document.createElement('time');time.dateTime=date.toISOString();time.textContent=date.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});time.title=date.toLocaleString('ru-RU');header.append(time);}
   try{const url=new URL(item.url);if(url.protocol==='https:'&&(url.hostname==='slack.com'||url.hostname.endsWith('.slack.com'))){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener';link.textContent='В обсуждение ↗';header.append(link);}}catch{}
   body.textContent=item.text;card.append(header,body);
   if(index<3)list.append(card);else{if(!more){more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Ещё сообщения · '+(items.length-3);more.append(summary);list.append(more);}more.append(card);}
  });parent.append(list);
 };
})();
