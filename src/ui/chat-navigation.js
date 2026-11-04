(()=>{
 const bar=document.createElement('form'),query=document.createElement('input'),count=document.createElement('span');
 bar.className='chat-find';bar.hidden=true;bar.setAttribute('role','search');
 query.type='search';query.placeholder='Найти в этом чате';query.setAttribute('aria-label',query.placeholder);
 query.maxLength=300;count.setAttribute('aria-live','polite');bar.append(query,count);
 function button(text,title,fn){
   const b=document.createElement('button');b.type='button';b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;
 }
 bar.append(button('↑','Предыдущее совпадение',()=>move(-1)),button('↓','Следующее совпадение',()=>move(1)),button('×','Закрыть поиск',close));
 const heading=document.querySelector('.chat-heading');heading.after(bar);
 let matches=[],selected=-1,revision=0,returnFocus;
 function close(){revision++;bar.hidden=true;CSS.highlights.delete('petya-find');CSS.highlights.delete('petya-find-current');returnFocus?.focus({preventScroll:true});}
 function open(){
   if(bar.hidden)returnFocus=document.activeElement;
   bar.hidden=false;query.focus();query.select();find();
 }
 const searchButton=button('','Найти в чате (Ctrl/⌘+F)',open);
 searchButton.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
 heading.append(searchButton);
 document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.code==='KeyF'&&!$('home').hidden&&!document.querySelector('dialog[open]')){e.preventDefault();open();}
   if(!bar.hidden && e.key==='Escape'){e.preventDefault();close();}
 });
 function collect(text,term){
   const rows=[];let at=0;
   while(term && (at=text.indexOf(term,at))!==-1){rows.push(at);at+=term.length;}
   return rows;
 }
 function paint(){
   const ranges=[],term=query.value.trim().toLowerCase(),hit=matches[selected];
   let current;
   for(const el of dialogueMessages.querySelectorAll('[data-message-index]')){
     const body=el.querySelector('.message-content:not([hidden])');if(!body)continue;
     const nodes=[],walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);let node,str='';
     while(node=walker.nextNode()){nodes.push({node,start:str.length,end:str.length+node.length});str+=node.data;}
     const locations=collect(str.toLowerCase(),term);
     locations.forEach((at,ordinal)=>{
       const start=nodes.find(n=>n.end>at),end=nodes.find(n=>n.end>=at+term.length);
       if(!start||!end)return;
       const r=new Range();r.setStart(start.node,at-start.start);r.setEnd(end.node,at+term.length-end.start);ranges.push(r);
       if(Number(el.dataset.messageIndex)===hit?.index && ordinal===hit.ordinal)current=r;
     });
   }
   CSS.highlights.set('petya-find',new Highlight());
   for(const range of ranges)CSS.highlights.get('petya-find').add(range);
   CSS.highlights.set('petya-find-current',new Highlight(...current?[current]:[]));
   return current;
 }
 async function reveal(){
   const ticket=++revision,hit=matches[selected];
   count.textContent=query.value.trim()?(hit?(selected+1)+' из '+matches.length:'Совпадений нет'):'';
   if(hit)await window.jumpToChatMessage(hit.index);
   if(ticket!==revision || bar.hidden)return;
   const current=paint();
   if(current){const feed=document.querySelector('.chat-feed');feed.scrollTop+=current.getBoundingClientRect().top-feed.getBoundingClientRect().top-feed.clientHeight*.35;}
 }
 function find(){
   const term=query.value.trim().toLowerCase();
   matches=chatHistory.flatMap((m,index)=>collect(String(m.text||'').toLowerCase(),term).map((_,ordinal)=>({index,ordinal})));
   selected=matches.length?0:-1;reveal();
 }
 function move(delta){if(!matches.length)return;selected=(selected+delta+matches.length)%matches.length;reveal();}
 query.oninput=find;bar.onsubmit=e=>{e.preventDefault();move(1);};
 query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();move(e.shiftKey?-1:1);}};
 document.addEventListener('petya-topic-changed',e=>{if(!bar.hidden&&!e.detail?.preserveScroll)close();});
 const enhance=window.enhanceChatMessage;
 window.enhanceChatMessage=(node,message)=>{
   enhance?.(node,message);
   if(message.role!=='assistant'||!message.at)return;
   const menu=document.createElement('details'),trigger=document.createElement('summary');
   menu.className='message-actions-menu';trigger.textContent='•••';trigger.setAttribute('aria-label','Действия с ответом');
   menu.append(trigger,button('Скопировать ссылку','Скопировать ссылку на ответ',async()=>{
     try{const raw=await window.petya.messageLink(topicSelect.value,Number(node.dataset.messageIndex),message.text,message.at);
       await navigator.clipboard.writeText(raw);menu.open=false;notice('Ссылка на ответ скопирована.');
     }catch(e){notice(e.message,true);}
   }));node.querySelector('.message-meta')?.append(menu);
 };
 async function receive(){
   try{
     await window.chatNavigationReady;
     const url=await window.petya.takeMessageLink();if(!url)return;
     const target=await window.petya.resolveMessageLink(url);
     if(target.company){await window.petya.companySwitch(target.company,url);return;}
     if(commandProgress.busy||planning||workspaceBusy||window.chatQueue?.active)throw Error('Завершите текущее действие и откройте ссылку ещё раз.');
     const info=await window.petya.chatWorkspaceInfo(target.chat);
     if(info.index!==target.version)await window.petya.chatVersionSelect(target.chat,target.version);
     if(topicSelect.dataset.projectId!==target.project)await window.petya.chatProjectSelect(target.project);
     view('home');await selectDialogueTopic(target.chat);
     await window.jumpToChatMessage(target.index);
   }catch(e){notice(e.message,true);}
 }
 window.petyaEvents.onMessageLink(receive);
 window.chatNavigationReady.then(receive).catch(e=>notice(e.message,true));
 showDialogueMessages(chatHistory);
})();
