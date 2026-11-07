(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 function modal(title,cls){const previous=document.activeElement,d=el('dialog',null,'chat-utility-dialog '+(cls||'')),head=el('div',null,'chat-utility-head'),name=el('h2',title),close=button('×',()=>d.close());close.setAttribute('aria-label','Закрыть');head.append(name,close);d.append(head);document.body.append(d);d.addEventListener('close',()=>{d.remove();previous?.focus();});return d;}
 function safeRun(fn){return async()=>{try{await fn();}catch(e){notice(e.message,true);}};}
 // A single keyboard destination searches projects, chats and every stored message.
 window.openChatSearch=()=>{
  const d=modal('Поиск','chat-search-dialog'),input=el('input'),list=el('div',null,'chat-search-results'),status=el('p',null,'small');input.type='search';input.placeholder='Проект, чат или текст сообщения';input.setAttribute('aria-label',input.placeholder);status.setAttribute('role','status');d.append(input,status,list);let revision=0,timer,index=0;
  async function find(){const rev=++revision;status.textContent='Ищу…';try{const rows=await window.petya.chatQuickSearch(input.value);if(rev!==revision||!d.isConnected)return;list.replaceChildren();index=0;status.textContent=rows.length?rows.length===100?'Первые 100 результатов. Уточните запрос.':'Найдено: '+rows.length:'Ничего не найдено';for(const row of rows){const b=button('',safeRun(async()=>{if(window.chatStartPending||commandProgress.busy||planning||workspaceBusy||window.chatQueue?.active||(voiceReply&&!window.backgroundClarification))throw Error('Завершите текущее действие перед переключением чата.');await window.rememberChatOrigin?.();if(row.kind==='project'){await window.petya.chatProjectSelect(row.projectId);await selectDialogueTopic('');}else{if(row.projectId!==topicSelect.dataset.projectId)await window.petya.chatProjectSelect(row.projectId);await selectDialogueTopic(row.topicId);if(row.index>=0)await window.jumpToChatMessage(row.index);}view('home');d.close();}),'chat-search-result');b.append(el('strong',row.title),el('small',row.kind==='project'?'Проект':row.project+' · '+(row.kind==='message'?(row.role==='user'?'Вы':'Петя'):'Чат')));if(row.snippet){
    const excerpt=el('p'),query=input.value.trim().toLocaleLowerCase().slice(0,200),lower=row.snippet.toLocaleLowerCase();
    let start=0,match;
    while(query && (match=lower.indexOf(query,start))>=0){
      excerpt.append(row.snippet.slice(start,match),el('mark',row.snippet.slice(match,match+query.length)));
      start=match+query.length;
    }
    excerpt.append(row.snippet.slice(start));b.append(excerpt);
   }list.append(b);}mark();}catch(e){if(rev===revision)status.textContent=e.message;}}
  function mark(){[...list.children].forEach((b,i)=>b.classList.toggle('selected',i===index));}
  input.oninput=()=>{++revision;clearTimeout(timer);timer=setTimeout(find,120);};input.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)&&list.children.length){e.preventDefault();index=(index+(e.key==='ArrowDown'?1:-1)+list.children.length)%list.children.length;mark();list.children[index].scrollIntoView({block:'nearest'});}if(e.key==='Enter'){e.preventDefault();list.children[index]?.click();}};d.addEventListener('close',()=>{++revision;clearTimeout(timer);});d.showModal();input.focus();find();
 };
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!document.querySelector('dialog[open]'))window.openChatSearch();}});
 const search=button('Поиск  '+(/Mac/.test(navigator.platform)?'⌘K':'Ctrl+K'),window.openChatSearch,'chat-search-open');document.querySelector('.project-sidebar>input[type=search]')?.replaceWith(search);
 // Keep width stable between sessions; the separator is also keyboard-operable.
 const home=$('home'),sidebar=document.querySelector('.project-sidebar'),grip=el('div',null,'project-resizer');grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-label','Ширина списка проектов');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-valuemin','180');grip.setAttribute('aria-valuemax','420');home.append(grip);let width=238;try{width=Number(localStorage.getItem('petya-project-width'))||238;}catch{}
 function setWidth(value){width=Math.max(180,Math.min(420,value));home.style.setProperty('--project-sidebar-width',width+'px');grip.setAttribute('aria-valuenow',String(Math.round(width)));try{localStorage.setItem('petya-project-width',String(width));}catch{}}
 setWidth(width);new ResizeObserver(()=>grip.style.left=sidebar.offsetWidth-3+'px').observe(sidebar);
 grip.onpointerdown=e=>{grip.setPointerCapture(e.pointerId);home.classList.add('resizing-projects');};grip.onpointermove=e=>{if(grip.hasPointerCapture(e.pointerId))setWidth(e.clientX-home.getBoundingClientRect().left);};const finish=()=>home.classList.remove('resizing-projects');grip.onpointerup=e=>{grip.releasePointerCapture(e.pointerId);finish();};grip.onlostpointercapture=finish;grip.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setWidth(e.key==='Home'?180:e.key==='End'?420:width+(e.key==='ArrowRight'?10:-10));}};
 window.offerChatUndo=(token,text)=>{if(!token)return;const toast=el('div',null,'chat-undo-toast');toast.setAttribute('role','status');let used=false;const undo=async()=>{if(used)return;await window.petya.chatUndo(token);used=true;toast.remove();await refreshTopics();document.dispatchEvent(new Event('petya-dialogue-state'));};toast.append(el('span',text),button('Отменить',safeRun(undo)),button('×',()=>toast.remove()));toast.lastChild.setAttribute('aria-label','Скрыть уведомление');document.querySelector('.chat-undo-toast')?.remove();document.body.append(toast);setTimeout(()=>toast.remove(),10000);document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'chat-undo:'+token,title:text,text:'Можно отменить в течение 5 минут.',version:token,actions:[['Отменить',undo]]}}));};
 window.openChatAttachment=async(file,topicId=topicSelect.value,match=null)=>{
  const d=modal(file.name||'Вложение','chat-file-dialog'),status=el('p','Открываю файл…','small');d.append(status);d.showModal();try{let data;try{data=await window.petya.chatAttachmentPreview(topicId,file.id);}catch(e){if(file.thumbnail)data={name:file.name,image:file.thumbnail,note:'Сохранённое превью изображения.'};else throw e;}if(!d.isConnected)return;status.textContent=data.note;
   if(data.modelFormat){d.append(window.chatModelFrame(data));return;}
   if(data.image&&/^[A-Za-z0-9+/=]+$/.test(data.image)){const img=el('img');img.src='data:image/png;base64,'+data.image;img.alt=data.name;d.append(img);}
   if(data.text){const tools=el('div',null,'chat-file-tools'),input=el('input'),result=el('span',null,'small'),pre=el('pre'),body=el('div',null,'chat-file-body');input.type='search';input.placeholder='Найти в тексте';input.setAttribute('aria-label',input.placeholder);let hits=[],current=-1;const render=()=>{pre.replaceChildren();hits=[];current=-1;const q=input.value;if(!q){pre.textContent=data.text;result.textContent='';return;}const lower=data.text.toLocaleLowerCase(),needle=q.toLocaleLowerCase();let at=0,pos;while((pos=lower.indexOf(needle,at))>=0){pre.append(document.createTextNode(data.text.slice(at,pos)));const mark=el('mark',data.text.slice(pos,pos+q.length));pre.append(mark);hits.push(mark);at=pos+q.length;}pre.append(document.createTextNode(data.text.slice(at)));result.textContent='Совпадений: '+hits.length;if(match && q===match.query){current=match.ordinal-1;match=null;}next();};const next=()=>{if(!hits.length)return;current=(current+1)%hits.length;hits[current].scrollIntoView({block:'center'});result.textContent=(current+1)+' / '+hits.length;};input.oninput=render;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();next();}};tools.append(input,button('Далее',next),button('Копировать',async e=>{const target=e.currentTarget;try{await navigator.clipboard.writeText(data.text);target.textContent='Скопировано';}catch{status.textContent='Не удалось скопировать текст.';}}),result);body.append(pre);d.append(tools,body);if(match?.query)input.value=match.query;render();
   if(Number.isInteger(match?.line)){
     const lines=data.text.split('\n'),start=match.line-1,end=Math.min(lines.length,match.end||match.line);
     if(start>=0 && start<end){
       const mark=el('mark',lines.slice(start,end).join('\n'));
       pre.replaceChildren(lines.slice(0,start).join('\n')+(start?'\n':''),mark,(end<lines.length?'\n':'')+lines.slice(end).join('\n'));
       result.textContent=end===match.line?'Строка '+match.line:'Строки '+match.line+'–'+end;mark.scrollIntoView({block:'center'});
     }
   }}else if(!data.image)status.textContent='Нет сохранённого текста для просмотра.';
  }catch(e){status.textContent=e.message;}
 };
 function editMessage(node,message){const index=Number(node.dataset.messageIndex),id=topicSelect.value;if(!Number.isInteger(index)||index<0)return;const d=modal('Изменить сообщение'),input=el('textarea'),note=el('p','Предыдущий ответ останется в истории версий.','small'),error=el('p',null,'small');input.value=message.text;input.rows=5;input.maxLength=4000;input.setAttribute('aria-label','Текст сообщения');const save=button('Получить новый ответ',async()=>{save.disabled=true;try{const result=await window.petya.chatVersionEdit(id,index,input.value);window.takeChatQuote?.();await selectDialogueTopic(result.topicId);d.close();$('command').value=result.command;$('command').dispatchEvent(new Event('input'));await window.sendChatNow();}catch(e){error.textContent=e.message;save.disabled=false;}});d.append(input,note,error,save);d.showModal();input.focus();}
 function errorText(raw){const text=String(raw||'');const service=/jira/i.test(text)?'Jira':/slack/i.test(text)?'Slack':/ollama|модел|runner/i.test(text)?'Модель':null;if(/429|слишком много|ограничил запрос/i.test(text))return (service||'Сервис')+' временно ограничил запросы. Попробуйте позже.';if(/401|403|missing_scope|доступ|прав|авторизац/i.test(text))return 'Не удалось получить доступ'+(service?' к '+service:'')+'. Проверьте подключение.';if(/timeout|timed out|тайм.?аут/i.test(text))return 'Ответ не получен вовремя. Можно повторить запрос.';if(/fetch failed|ECONN|ENOTFOUND|недоступ/i.test(text))return (service||'Сервис')+' сейчас недоступен. Проверьте подключение.';return text.split('\n')[0].slice(0,220)||'Не удалось получить ответ.';}
 // ↑ in an empty composer edits the last own message, as in other messengers.
 $('command').addEventListener('keydown',event=>{if(event.key!=='ArrowUp'||event.defaultPrevented||event.shiftKey||event.altKey||event.metaKey||event.ctrlKey||event.isComposing||$('command').value)return;const edit=[...dialogueMessages.querySelectorAll(':scope>article.message-user .message-edit')].at(-1);if(!edit)return;event.preventDefault();edit.click();});
 window.enhanceChatMessage=(node,message)=>{
  const meta=node.querySelector('.message-meta');if(message.role==='user'){const edit=button('',()=>editMessage(node,message),'message-copy message-edit');edit.title='Изменить сообщение';edit.setAttribute('aria-label',edit.title);edit.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 20 4-1L20 7l-3-3L5 16l-1 4m10-13 3 3"/></svg>';meta.append(edit);}
  const files=node.querySelectorAll('.message-attachment');[...(message.attachments||[])].slice(0,5).forEach((file,i)=>{const item=files[i];if(!item)return;
    if(file.modelFormat){
      const toggle=button('Показать 3D',safeRun(async()=>{
        const frame=item.querySelector('iframe');
        if(frame){frame.remove();toggle.textContent='Показать 3D';return;}
        toggle.disabled=true;
        try{const data=await window.petya.chatAttachmentPreview(topicSelect.value,file.id);
          if(item.isConnected){item.append(window.chatModelFrame(data));toggle.textContent='Свернуть';}
        }finally{toggle.disabled=false;}
      }));item.classList.add('model-attachment');item.append(toggle);return;
    }
    const img=item.querySelector('button');if(img)img.onclick=safeRun(()=>window.openChatAttachment(file));else item.append(button('Открыть',safeRun(()=>window.openChatAttachment(file))));});
  const sources=(message.sources||[]).filter(s=>{try{return ['https:','http:'].includes(new URL(s.url).protocol);}catch{return false;}});const refs=message.usedMaterials||[];if(sources.length||message.evidence?.length||refs.length){const details=el('details',null,'message-sources');details.append(el('summary','Источники · '+(sources.length+refs.length+(message.evidence?.length||0))));for(const s of sources){const a=el('a',s.title||new URL(s.url).hostname);a.href=s.url;a.target='_blank';a.rel='noopener';details.append(a);}const owner=topicSelect.value;
    for(const ref of refs){
      const ranges=[];
      for(const line of [...new Set(ref.lines||[])].sort((a,b)=>a-b)){
        const previous=ranges.at(-1);
        if(previous && previous.end+1===line)previous.end=line;
        else ranges.push({line,end:line});
      }
      for(const {line,end} of ranges){
        const link=button(ref.name+(line===end?' · строка '+line:' · строки '+line+'–'+end),safeRun(()=>window.openChatAttachment(ref,topicSelect.value,{line,end})),'source-line-link');
        meta.before(link);
      }
      const row=el('div',null,'answer-source-row');
      row.append(button(ref.name||'Материал',safeRun(async()=>{
        if(ref.type==='file'){await window.openChatAttachment({id:ref.id,name:ref.name});return;}
        const item=(await window.petya.contexts()).find(m=>m.id===ref.id);
        if(!item)throw Error('Материал больше не хранится в памяти.');
        const d=modal(ref.name||'Материал','');d.append(el('p',item.text));d.showModal();
      })));
      const switcher=button('Исключить из следующих ответов',safeRun(async()=>{
        const active=topicSelect.value||owner;if(!active)return;
        const info=await window.petya.chatWorkspaceInfo(active);
        const enabled=ref.type==='file'?info.files.find(f=>f.id===ref.id)?.enabled:!info.excluded.includes(ref.id);
        await window.toggleChatMaterial(active,ref.type,ref.id,!enabled,switcher,()=>switcher.textContent='Исключить из следующих ответов');
        switcher.textContent=enabled?'Вернуть в контекст':'Исключить из следующих ответов';
      }));
      details.addEventListener('toggle',async()=>{if(details.open){try{const info=await window.petya.chatWorkspaceInfo(topicSelect.value||owner);switcher.textContent=(ref.type==='file'?info.files.find(f=>f.id===ref.id)?.enabled:!info.excluded.includes(ref.id))?'Исключить из следующих ответов':'Вернуть в контекст';}catch{switcher.disabled=true;}}});
      row.append(switcher);details.append(row);
    }
    for(const e of message.evidence||[]){const b=el('blockquote');b.append(el('strong',e.name+' · строка '+e.line),el('mark',e.text));const files=chatHistory.flatMap(m=>m.attachments||[]).filter(f=>f.name===e.name);const file=files[0];if(file&&files.every(f=>f.id===file.id))b.append(button('Открыть файл',safeRun(()=>window.openChatAttachment(file,topicSelect.value,{line:e.line}))));details.append(b);}meta.before(details);}
  if(message.error){node.dataset.error='true';const content=node.querySelector('.message-content'),raw=message.text||'';content.replaceChildren(el('p',errorText(raw)));const details=el('details');details.append(el('summary','Подробности'),el('pre',raw));content.append(details);const restore=button('Вернуть запрос',()=>{const index=Number(node.dataset.messageIndex);const user=chatHistory.slice(0,index).filter(m=>m.role==='user').at(-1);if(user){$('command').value=user.text;$('command').dispatchEvent(new Event('input'));$('command').focus();}});content.append(restore);if(commandProgress.failed)content.append(button('Повторить',safeRun(()=>repeatCommand(false))));}
 };
 // Inform about actual delays; never invent a percentage for model generation.
 const jobs=new Map();document.addEventListener('petya-chat-job',e=>jobs.set(e.detail.topicId,e.detail.job));
 setInterval(()=>{const job=window.chatJobInfo?.(topicSelect.value)||jobs.get(topicSelect.value),started=window.chatJobBusy?.(topicSelect.value)?job?.startedAt:commandProgress.busy?commandProgress.startedAt:0;for(const panel of document.querySelectorAll('.chat-running-reply')){let hint=panel.querySelector('.chat-wait-hint');if(!hint){hint=el('small',null,'chat-wait-hint');panel.append(hint);}hint.hidden=!started||Date.now()-started<30000;hint.textContent=hint.hidden?'':'Ожидание дольше обычного. Текущий этап показан выше; ответ можно остановить кнопкой ■.';}
  const error=dialogueMessages.querySelector('.message-assistant[data-error=true]:last-child');if(error){if(commandProgress.state==='error')progressPanel.hidden=true;const jobPanel=document.querySelector('.chat-job-status[data-state=attention]');if(jobPanel)jobPanel.hidden=true;if($('notice').textContent===error.dataset.messageText||commandProgress.state==='error'&&$('notice').textContent===commandProgress.label)$('notice').hidden=true;}
 },1000);
 window.showChatRequestError=(command,text)=>{const message={role:'assistant',text,error:true,at:Date.now()};chatHistory.push(message);showDialogueMessages(chatHistory);progressPanel.hidden=true;$('notice').hidden=true;};
 showDialogueMessages(chatHistory);
})();
