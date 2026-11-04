(()=>{
 const active=()=>topicSelect.value||'draft:'+(topicSelect.dataset.projectId||'general');
 let lastUndo;
 window.offerInlineUndo=(anchor,label,restore)=>{
   lastUndo?.remove();
   const owner=active(),bar=document.createElement('div'),undo=document.createElement('button');
   bar.className='inline-chat-undo';bar.setAttribute('role','status');bar.append(label+' ',undo);
   undo.type='button';undo.textContent='Вернуть';
   if(anchor.closest('dialog'))anchor.after(bar);
   else if(anchor.closest('.chat-feed'))anchor.parentElement.after(bar);
   else document.querySelector('.chat-composer').prepend(bar);
   lastUndo=bar;setTimeout(()=>bar.remove(),10000);
   undo.onclick=async()=>{undo.disabled=true;try{if(active()!==owner)throw Error('Вернитесь в исходный чат.');await restore();bar.remove();}catch(e){notice(e.message,true);undo.disabled=false;}};
 };
 window.removeComposerFile=async id=>{
   const token=await window.petya.discardComposerFile(id);
   await refreshAttachments();
   window.offerInlineUndo(document.querySelector('.chat-composer'),'Вложение удалено',async()=>{await window.petya.restoreComposerFile(token);await refreshAttachments();});
 };
 window.toggleChatMaterial=async(owner,type,id,enabled,anchor,onRestore)=>{
   const {index}=await window.petya.chatWorkspaceInfo(owner);
   await window.petya.chatContextToggle(owner,type,id,enabled);
   if(!enabled)window.offerInlineUndo(anchor,'Материал исключён',async()=>{
     const state=await window.petya.chatWorkspaceInfo(owner);
     if(state.index!==index)throw Error('Версия чата изменилась.');
     const excluded=type==='file'?state.files.some(f=>f.id===id&&!f.enabled):state.excluded.includes(id);
     if(excluded)await window.petya.chatContextToggle(owner,type,id,true);
     onRestore();
   });
 };
 const recent=[];let cycle=null,pending=Promise.resolve();
 function remember(id){
   if(!id)return;
   const index=recent.indexOf(id);if(index>=0)recent.splice(index,1);
   recent.unshift(id);if(recent.length>50)recent.pop();
 }
 document.addEventListener('petya-dialogue-state',e=>remember(e.detail?.activeId));
 remember(topicSelect.value);
 document.addEventListener('keydown',e=>{
   if(!e.ctrlKey||e.altKey||e.metaKey||e.key!=='Tab'||$('home').hidden||document.querySelector('dialog[open]'))return;
   if(recent.length<2)return;e.preventDefault();
   cycle ||= {ids:[...recent],index:Math.max(0,recent.indexOf(topicSelect.value))};
   const step=e.shiftKey?-1:1;
   cycle.index=(cycle.index+step+cycle.ids.length)%cycle.ids.length;
   const id=cycle.ids[cycle.index];
   pending=pending.then(async()=>{
     if(window.chatNavigationPending||window.chatSwitchPending||commandProgress.busy||window.chatQueue?.active)throw Error('Дождитесь завершения текущего действия.');
     window.guardChatNavigation?.();
     const state=await window.petya.chatNavigation('');
     const chat=state.topics.find(t=>t.id===id&&!t.archived&&state.projects.some(p=>p.id===t.projectId&&!p.archived));
     if(!chat){const at=recent.indexOf(id);if(at>=0)recent.splice(at,1);cycle=null;return;}
     if(chat.projectId!==state.activeProjectId)await window.petya.chatProjectSelect(chat.projectId);
     await selectDialogueTopic(id);
   }).catch(e=>notice(e.message,true));
 });
 window.addEventListener('keyup',e=>{if(e.key==='Control')cycle=null;});window.addEventListener('blur',()=>cycle=null);
 window.showProjectAnswers=async project=>{
   try{
     const d=document.createElement('dialog');d.className='chat-utility-dialog saved-answers';
     const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button'),list=document.createElement('div');
     title.textContent='Сохранённые ответы';close.textContent='×';close.setAttribute('aria-label','Закрыть');close.onclick=()=>d.close();
     head.append(title,close);d.append(head,list);
     const draw=async()=>{
       const rows=await window.petya.projectAnswers(project);
       list.replaceChildren();
       if(!rows.length)list.textContent='Сохранённых ответов пока нет.';
       for(const item of rows){
         const row=document.createElement('div'),open=document.createElement('button'),chat=document.createElement('small'),remove=document.createElement('button');
         open.textContent=item.title;chat.textContent=item.chat;open.append(chat);open.onclick=()=>{d.close();window.openPetyaAnswer(item.url);};
         remove.textContent='×';remove.setAttribute('aria-label','Удалить из сохранённых');remove.onclick=async()=>{try{await window.petya.bookmarkAnswer(item.url,false);document.dispatchEvent(new Event('petya-bookmarks-updated'));await draw();}catch(e){notice(e.message,true);}};
         row.append(open,remove);list.append(row);
       }
     };
     await draw();document.body.append(d);d.onclose=()=>d.remove();d.showModal();
   }catch(e){notice(e.message,true);}
 };
})();
