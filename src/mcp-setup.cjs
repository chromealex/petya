module.exports = function setup(ctx) {
  let endpoint, access, changing = false;
  const edits=new Map();
  ctx.handle('mcpUndoDraft',(owner,token)=>{
    const edit=edits.get(owner);
    if(!edit || token!==edit.token || require('./chat-revision.cjs').revision(ctx,owner)!==edit.revision)throw Error('Черновик уже изменился.');
    const drafts=ctx.dialogue.state.composerDrafts ||= {};
    if(edit.added)ctx.attachments.remove(edit.added);
    else if(edit.removed)ctx.attachments.store(edit.removed);
    else{
      if(edit.previous)drafts[owner]=edit.previous;else delete drafts[owner];
      ctx.dialogue.persist();
    }
    edits.delete(owner);
    return drafts[owner]||'';
  });
  const status = () => ({enabled:!!endpoint,access,url:endpoint?.url || ''});
  const stop = async () => {
    const current = endpoint;
    endpoint = undefined;
    await current?.close();
  };
  ctx.handle('mcpStatus', status);
  ctx.handle('mcpStart', async (options={}) => {
    if (changing) throw Error('Подключение MCP уже изменяется.');
    changing = true;
    try {
      if(endpoint)return status();
      const projectId=options.projectId ?? ctx.dialogue.state.activeProjectId;
      const mode=options.mode ?? 'read';
      if(!['read','drafts','edit'].includes(mode) || (projectId!=='' && !ctx.dialogue.state.projects.some(p=>p.id===projectId&&!p.archived)))throw Error('Проверьте проект и права.');
      access={projectId,mode};
      let valid=true;
      const current=await require('./mcp.cjs').startMcp({...ctx,access,
        check(){ctx.check();if(!valid)throw Error('Доступ отключён.');},
        changed({removed,added,previous,...event}){
          if(removed || added || previous!==undefined){
            event.token=require('node:crypto').randomUUID();
            edits.delete(event.owner);edits.set(event.owner,{...event,removed,added,previous});
            if(edits.size>10)edits.delete(edits.keys().next().value);
          }
          ctx.changed(event);
        }
      }, {port:0});
      endpoint={...current,close:()=>{valid=false;return current.close();}};
      return status();
    } finally { changing = false; }
  });
  ctx.handle('mcpCopy', () => {
    if (!endpoint) throw Error('Сначала включите доступ через MCP.');
    require('electron').clipboard.writeText(JSON.stringify({mcpServers:{petya:{url:endpoint.url,headers:{Authorization:'Bearer '+endpoint.token}}}},null,2));
  });
  ctx.handle('mcpStop', async () => {
    if (changing) throw Error('Подключение MCP уже изменяется.');
    changing = true;
    try { await stop(); return status(); } finally { changing = false; }
  });
  return stop;
};
