// Small, text-only Markdown renderer: model output never becomes executable HTML.
// «Ход работы»: an expandable list of what Petya did (done) and is doing now (current).
// Durations as people read them: «45 с», «4 мин 5 с», «1 ч 12 мин».
window.formatDuration=function(ms){const t=Math.max(0,Math.round((Number(ms)||0)/1000));if(t<60)return t+' с';if(t<3600){const m=Math.floor(t/60),r=t%60;return m+' мин'+(r?' '+r+' с':'');}const h=Math.floor(t/3600),m=Math.floor(t%3600/60);return h+' ч'+(m?' '+m+' мин':'');};
window.renderSteps = function(steps,{live=false,open=false}={}){
 const rows=(Array.isArray(steps)?steps:[]).filter(s=>s&&typeof s.label==='string'&&s.label).slice(0,40);
 const box=document.createElement('details');box.className='message-steps'+(live?' live':'');box.open=open;
 const summary=document.createElement('summary'),label=document.createElement('span'),time=document.createElement('span');
 const seconds=ms=>window.formatDuration(ms);
 const total=rows.reduce((sum,s)=>sum+(Number(s.ms)||0),0);
 label.className='steps-label';label.textContent=live?(rows.at(-1)?.label||'Думаю…'):'Ход работы · '+rows.length+' '+(rows.length%10===1&&rows.length%100!==11?'шаг':rows.length%10>=2&&rows.length%10<=4&&(rows.length%100<10||rows.length%100>=20)?'шага':'шагов');
 time.className='steps-duration';time.textContent=seconds(total);if(live)time.dataset.started=String(Date.now()-total);summary.append(label);if(live||total>=1000)summary.append(time);
 const list=document.createElement('ol');
 rows.forEach((s,i)=>{
  const li=document.createElement('li'),current=live&&i===rows.length-1;
  li.className=current?'current':'done';li.setAttribute('aria-label',(current?'Выполняется: ':'Выполнено: ')+s.label);
  if(typeof s.detail==='string'&&s.detail.trim()){
   const details=document.createElement('details'),heading=document.createElement('summary'),body=document.createElement('pre');heading.textContent=s.label;body.textContent=s.detail;details.append(heading,body);li.append(details);
  }else{const text=document.createElement('span');text.textContent=s.label;li.append(text);}
  list.append(li);
 });
 box.append(summary,list);return box;
};
window.setInterval?.(()=>{for(const node of document.querySelectorAll('.message-steps.live .steps-duration[data-started]'))node.textContent=window.formatDuration(Date.now()-Number(node.dataset.started));},1000);
window.renderMessage = function(message){
 const node=document.createElement('article');node.className=message.role==='user'?'message-user':'message-assistant';node.dataset.messageText=message.text||'';
 const role=document.createElement('span');role.className='sr-only';role.textContent=message.role==='user'?'Вы: ':'Петя: ';node.append(role);
 function inline(parent,text){const pattern=/(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;let at=0,m;while((m=pattern.exec(text))){parent.append(document.createTextNode(text.slice(at,m.index)));let item;if(m[2]){item=document.createElement('strong');item.textContent=m[2];}else if(m[3]){item=document.createElement('code');item.textContent=m[3];}else{item=document.createElement('a');item.textContent=m[4];item.href=m[5];item.target='_blank';item.rel='noopener';}parent.append(item);at=pattern.lastIndex;}parent.append(document.createTextNode(text.slice(at)));}
 const lines=String(message.text||'').split('\n');let list=null;
 for(let i=0;i<lines.length;i++){const line=lines[i];if(line.startsWith('```')){list=null;const lang=line.slice(3).trim().toLowerCase(),body=[];while(++i<lines.length&&!lines[i].startsWith('```'))body.push(lines[i]);const kind=({json:'JSON',bash:'Вывод команды',sh:'Вывод команды',console:'Вывод команды',log:'Лог',text:'Текст'})[lang]||'Код';
 node.append(renderTechnicalBlock(body,kind,message.role==='assistant'));continue;}
 if(message.role==='assistant'){const block=technicalExcerpt(lines,i);if(block){list=null;node.append(renderTechnicalBlock(lines.slice(i,block.end),block.kind,true));i=block.end-1;continue;}}
 if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1])){list=null;const wrap=document.createElement('div');wrap.className='message-table';const table=document.createElement('table');const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|');let row=document.createElement('tr');for(const cell of cells(line)){const th=document.createElement('th');inline(th,cell.trim());row.append(th);}table.append(row);i++;while(i+1<lines.length&&lines[i+1].includes('|')){row=document.createElement('tr');for(const cell of cells(lines[++i])){const td=document.createElement('td');inline(td,cell.trim());row.append(td);}table.append(row);}wrap.append(table);node.append(wrap);continue;}
 const bullet=line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);if(bullet){if(!list){list=document.createElement(/^\s*\d/.test(line)?'ol':'ul');node.append(list);}const li=document.createElement('li');inline(li,bullet[1]);list.append(li);continue;}list=null;if(!line.trim())continue;
 const heading=line.match(/^(#{1,4})\s+(.+)/),p=document.createElement(heading?'h'+Math.min(4,heading[1].length+1):'p');inline(p,heading?heading[2]:line);node.append(p);
 }
 const content=document.createElement('div');content.className='message-content';content.append(...node.childNodes);node.append(content);
 const files=document.createElement('div');files.className='message-attachments';for(const file of (message.attachments||[]).slice(0,5)){const item=document.createElement('div');item.className='message-attachment';const name=document.createElement('span');name.textContent=file.name||'Файл';item.append(name);if(typeof file.thumbnail==='string'&&file.thumbnail.length<2*1024*1024&&/^[A-Za-z0-9+/=]+$/.test(file.thumbnail)){const image=document.createElement('img');image.src='data:image/png;base64,'+file.thumbnail;image.alt=file.name||'Изображение';image.loading='lazy';const open=document.createElement('button');open.type='button';open.setAttribute('aria-label','Открыть изображение '+(file.name||''));open.append(image);open.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='chat-image-preview';const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>dialog.close();const full=image.cloneNode();dialog.append(close,full);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();};item.prepend(open);}else{item.classList.add('document');item.title=file.note||file.name||'';}files.append(item);}if(files.childElementCount)content.append(files);
 if(message.role==='assistant' && message.extensionResult){
   const source=document.createElement('small');source.className='small';source.textContent='Источник: '+message.extensionResult.source;content.append(source);
   const choices=message.extensionResult.choices;
   if(choices?.length>1 && chatHistory.at(-1)===message){
     const select=document.createElement('select');select.setAttribute('aria-label','Уточнить источник отчёта');
     select.add(new Option('Выбрать источник…',''));
     for(const key of choices)select.add(new Option(key,key));
     select.value=message.extensionResult.selected||'';
     select.onchange=run(async()=>{if(select.value)await processCommand('Только '+select.value);});
     content.append(select);
   }
 }
 if(message.role==='assistant' && message.serviceProblem && moduleChecks.has(message.serviceProblem.id)){
     const actions=document.createElement('div');actions.className='actions';
     const settings=document.createElement('button'),retry=document.createElement('button');
     settings.type=retry.type='button';settings.textContent='Настройки '+message.by;retry.textContent='Повторить запрос';
     settings.onclick=run(()=>window.openChatServiceSettings(message.serviceProblem.id));
     retry.onclick=run(async()=>{retry.disabled=true;try{await processCommand(message.serviceProblem.query);}finally{retry.disabled=false;}});
     actions.append(settings);if(message.serviceProblem.query && chatHistory.at(-1)===message)actions.append(retry);content.append(actions);
 }
 if (message.role === 'assistant' && Array.isArray(message.extensionImages)) {
   for (const block of message.extensionImages) {
     if (!['image/svg+xml','image/png','image/jpeg','image/webp'].includes(block?.mimeType) || typeof block.data !== 'string' || block.data.length > 8*1024*1024) continue;
     const img = document.createElement('img');
     img.className = 'extension-reply-image'; img.alt = '';
     img.src = 'data:' + block.mimeType + ';base64,' + block.data;
     content.append(img);
   }
 }
 window.extensionHost?.render(content,message);
 if (message.role === 'assistant' && ['clean','repair'].includes(message.motionMode)) window.renderMotionCard(content,message);
 const meta=document.createElement('div');meta.className='message-meta';
 const at=message.at?new Date(message.at):null;
 if(at&&!Number.isNaN(at.getTime())){const time=document.createElement('time');time.dateTime=at.toISOString();const today=at.toDateString()===new Date().toDateString();time.textContent=at.toLocaleString('ru-RU',today?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});time.title=at.toLocaleString('ru-RU');meta.append(time);}
 const copy=document.createElement('button');copy.className='message-copy';copy.type='button';
 const paint=copied=>{copy.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(copied?'<path d="m5 12 4 4L19 6"/>':'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>')+'</svg>';copy.title=copied?'Скопировано':'Копировать сообщение';copy.setAttribute('aria-label',copy.title);};paint(false);
 if(message.role!=='user'&&typeof message.by==='string'&&message.by){const source=document.createElement('span');source.className='message-source';source.textContent=message.by;source.title='Кто подготовил ответ';meta.append(source);}
 // Keep completed work above the answer, where its live progress appeared.
 if(message.role!=='user'&&Array.isArray(message.steps)&&message.steps.length>0)node.insertBefore(window.renderSteps(message.steps),content);
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(message.text||'');paint(true);setTimeout(()=>paint(false),1800);}catch{notice('Не удалось скопировать сообщение. Выделите текст и нажмите ⌘C / Ctrl+C.',true);}};meta.append(copy);node.append(meta);
 window.enhanceChatMessage?.(node,message);
 // Icon-only actions get a visible tooltip from their accessible name.
 for(const control of meta.querySelectorAll('button,summary'))if(!control.title&&control.getAttribute('aria-label'))control.title=control.getAttribute('aria-label');
 const menu=node.querySelector('.message-actions-menu');
 if(menu){
  const close=()=>{menu.open=false;};
  node.addEventListener('pointerleave',event=>{if(!event.relatedTarget||!node.contains(event.relatedTarget))close();});
  node.addEventListener('focusout',event=>{if(!node.contains(event.relatedTarget))close();});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();menu.querySelector('summary').focus();}});
  const paths={
   'Скопировать ссылку':'<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
   'Сохранить в проект':'<path d="M6 3h12v18l-6-4-6 4z"/>',
   'Продолжить в новом чате':'<path d="M7 4v10a4 4 0 0 0 4 4h6M13 14l4 4-4 4M3 8l4-4 4 4"/>'
  };
  for(const button of menu.querySelectorAll('.answer-menu-items>button')){
   const path=paths[button.textContent];if(!path)continue;
   const icon=document.createElement('span');icon.className='message-menu-icon';icon.setAttribute('aria-hidden','true');
   icon.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';button.prepend(icon);
  }
 }
 return node;
};
