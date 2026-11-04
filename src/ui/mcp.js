(() => {
  const toggle=$('mcp-toggle'),copy=$('mcp-copy'),status=$('mcp-status');
  let enabled=false;
  function show(state) {
    enabled=state.enabled;
    toggle.textContent=enabled?'Выключить доступ':'Включить доступ';
    copy.hidden=!enabled;
    $('mcp-mode').disabled=$('mcp-project').disabled=enabled;
    if(enabled && state.access){$('mcp-mode').value=state.access.mode;$('mcp-project').value=state.access.projectId;}
    status.textContent=enabled?'Доступ включён для этой компании.':'Доступ выключен.';
  }
  toggle.onclick=async()=>{
    toggle.disabled=true;
    try {show(enabled?await window.petya.mcpStop():await window.petya.mcpStart({projectId:$('mcp-project').value,mode:$('mcp-mode').value}));}
    catch(error){status.textContent=error.message;}
    finally{toggle.disabled=false;}
  };
  copy.onclick=async()=>{
    try {await window.petya.mcpCopy(); status.textContent='Подключение скопировано для MCP-клиента.';}
    catch(error){status.textContent=error.message;}
  };
  toggle.disabled=true;
  async function load(){
    const state=await window.petya.dialogueTopics();
    const select=$('mcp-project');select.replaceChildren();
    for(const p of state.projects.filter(p=>!p.archived))select.add(new Option(p.name,p.id));
    select.add(new Option('Все проекты компании',''));
    select.value=state.activeProjectId;
    show(await window.petya.mcpStatus());toggle.disabled=false;
  }
  $('mcp-project').onfocus=async()=>{
    if(enabled)return;
    const selected=$('mcp-project').value;await load();
    if([...$('mcp-project').options].some(o=>o.value===selected))$('mcp-project').value=selected;
  };
  load().catch(e=>status.textContent=e.message);
  const activeOwner=()=>topicSelect.value || 'draft:'+(topicSelect.dataset.projectId || 'general');
  const bar=document.createElement('div');
  bar.className='mcp-edit-feedback';bar.hidden=true;bar.setAttribute('role','status');
  document.querySelector('.chat-composer').append(bar);
  let timeout,barOwner;
  document.addEventListener('petya-dialogue-state',()=>{if(activeOwner()!==barOwner)bar.hidden=true;});
  function feedback(owner,revision,value){
    clearTimeout(timeout);barOwner=owner;bar.hidden=false;bar.replaceChildren('Черновик обновлён через MCP ');
    const undo=document.createElement('button');undo.textContent='Отменить';
    undo.onclick=async()=>{try{
      if(activeOwner()!==owner || $('command').value!==value)throw Error('Черновик уже изменился.');
      const previous=await window.petya.mcpUndoDraft(owner,revision);
      window.applyExternalChatDraft(owner,previous);await refreshAttachments();bar.hidden=true;
    }catch(error){notice(error.message,true);}};
    bar.append(undo);timeout=setTimeout(()=>bar.hidden=true,10000);
  }
  window.petyaEvents.onMcpChatChanged(async ({owner,name,revision,token})=>{
    try{
      if(name==='bookmark_chat_answer')document.dispatchEvent(new Event('petya-bookmarks-updated'));
      if(token || name==='prepare_chat_version'){
        const drafts=await window.petya.chatDrafts();
        const value=drafts[owner]||'';
        window.applyExternalChatDraft(owner,value);document.dispatchEvent(new Event('petya-drafts-updated'));
        if(activeOwner()===owner && !$('home').hidden){
          if(token)feedback(owner,token,value);
        }else{
          const nav=await window.petya.dialogueTopics();
          const title=owner.startsWith('draft:')?nav.projects.find(p=>p.id===owner.slice(6))?.name:(await window.petya.chatNavigation('')).topics.find(t=>t.id===owner)?.title;
          document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'mcp-draft:'+owner,title:title||'Черновик чата',text:'Черновик обновлён через MCP',version:revision,actions:[['Открыть',async()=>{
            if(owner.startsWith('draft:'))await window.petya.chatProjectSelect(owner.slice(6));
            await selectDialogueTopic(owner.startsWith('draft:')?'':owner);view('home');
          }]]}}));
        }
      }
      if(owner===topicSelect.value && ['prepare_chat_version','select_chat_version'].includes(name)) await selectDialogueTopic(owner);
      if(name.endsWith('_draft_attachment')) await refreshAttachments();
    } catch(error){notice(error.message,true);}
  });
})();
