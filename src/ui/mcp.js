(() => {
  const toggle=$('mcp-toggle'),copy=$('mcp-copy'),status=$('mcp-status');
  let enabled=false;
  function show(state) {
    enabled=state.enabled;
    toggle.textContent=enabled?'Выключить доступ':'Включить доступ';
    copy.hidden=!enabled;
    status.textContent=enabled?'Доступ включён для этой компании.':'Доступ выключен.';
  }
  toggle.onclick=async()=>{
    toggle.disabled=true;
    try {show(await window.petya[enabled?'mcpStop':'mcpStart']());}
    catch(error){status.textContent=error.message;}
    finally{toggle.disabled=false;}
  };
  copy.onclick=async()=>{
    try {await window.petya.mcpCopy(); status.textContent='Подключение скопировано для MCP-клиента.';}
    catch(error){status.textContent=error.message;}
  };
  window.petya.mcpStatus().then(show).catch(e=>status.textContent=e.message);
  window.petyaEvents.onMcpChatChanged(async ({owner,name})=>{
    try{
      if(['set_chat_draft','prepare_chat_version'].includes(name)){
        const drafts=await window.petya.chatDrafts();
        window.applyExternalChatDraft(owner,drafts[owner]||'');
      }
      if(owner===topicSelect.value && ['prepare_chat_version','select_chat_version'].includes(name)) await selectDialogueTopic(owner);
      if(name.endsWith('_draft_attachment')) await refreshAttachments();
    } catch(error){notice(error.message,true);}
  });
})();
