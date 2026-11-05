// Chats and projects: navigation, folders, archive, move, pin, reorder IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  require('./chat-workspace.cjs').register(ctx);
  ctx.handle('dialogueTopics',()=>ctx.dialogue.list());
  ctx.handle('chatNavigation',async query=>{const state=ctx.dialogue.list(),q=String(query||'').trim().toLocaleLowerCase().slice(0,200);const projects=await Promise.all(state.projects.map(async p=>({...p,icon:await require('./project-icon.cjs').projectIcon(p.id==='general'?null:(Object.hasOwn(p,'folder')?p.folder:ctx.projectMemory.get(p.memoryId)?.localFolder),require('electron').nativeImage)})));const drafts={};
    for(const [owner,text] of Object.entries(ctx.dialogue.state.composerDrafts||{}))if(text.trim())drafts[owner]={line:text.trim().split(/\r?\n/)[0].slice(0,120),files:0};
    for(const file of ctx.attachments.pending.values())(drafts[file.owner] ||= {line:'',files:0}).files++;
    for(const project of projects)project.savedCount=ctx.dialogue.state.topics.reduce((n,t)=>n+(!t.archived&&t.projectId===project.id?(t.savedAnswers?.length||0):0),0);
    return {...state,projects,drafts,topics:ctx.dialogue.state.topics.flatMap(t=>{const index=q?t.messages.findIndex(m=>String(m.text).toLocaleLowerCase().includes(q)):-1;if(q&&!t.title.toLocaleLowerCase().includes(q)&&index<0)return [];const match=index>=0?String(t.messages[index].text):'';const pos=match.toLocaleLowerCase().indexOf(q);return [{id:t.id,title:t.title,projectId:t.projectId,at:t.at,archived:!!t.archived,pinned:!!t.pinned,order:t.order,agentOf:t.agentOf||'',job:t.chatJob||null,needsReply:!!t.lastChatResult?.question&&!t.lastChatResult?.error,attention:require('./chat-location.cjs').attention(t),index,snippet:match?match.slice(Math.max(0,pos-35),Math.max(0,pos-35)+140):''}];}).sort((a,b)=>b.at-a.at)};});
  // Requests are scoped to their own chat, so navigating and organising chats never waits for them.
  const projectMutation=fn=>fn;const projectBusy=id=>ctx.dialogue.state.topics.some(t=>t.projectId===id&&(ctx.chatJobs.busy(t.id)||ctx.dialogue.running.has(t.id)));
  ctx.handle('chatProjectCreate',projectMutation(name=>ctx.dialogue.projectCreate(name)));
  const pickedProjectFolders=new Set();
  ctx.handle('chatProjectSettings',id=>{const p=id?ctx.dialogue.state.projects.find(p=>p.id===id):null;if(id&&!p)throw Error('Проект не найден.');return {project:p?{...p,folders:require('./project-folders.cjs').projectFolders(p,ctx.projectMemory.get(p.memoryId)),folder:p.id==='general'?'':p.folder||ctx.projectMemory.get(p.memoryId)?.localFolder||''}:null,services:require('./project-settings.cjs').services(ctx.settings)};});
  ctx.handle('chatProjectPickFolder',async id=>{if(id==='general')throw Error('Общему проекту нельзя назначить папку.');const picked=await require('electron').dialog.showOpenDialog(ctx.win,{title:'Контекст проекта',properties:['openDirectory']});if(picked.canceled)return null;const folder=await require('./local-project.cjs').rootFolder(picked.filePaths[0]);pickedProjectFolders.add(folder);return folder;});
  ctx.handle('chatProjectSave',projectMutation(async input=>{if(input?.id&&projectBusy(input.id))throw Error('Дождитесь ответов в чатах этого проекта, затем измените его настройки.');
    const data=require('./project-settings.cjs').validate(input);let p=input.id?ctx.dialogue.state.projects.find(p=>p.id===input.id):null;if(input.id&&!p)throw Error('Проект не найден.');if(p?.id==='general'&&data.folder)throw Error('Общему проекту нельзя назначить папку.');if(p&&ctx.dialogue.state.topics.some(t=>t.projectId===p.id&&ctx.chatJobs.busy(t.id)))throw Error('Дождитесь ответов в проекте перед изменением контекста и сервисов.');
    const name=p?.id==='general'?'Общее':ctx.dialogue.projectName(input.name);if(ctx.dialogue.state.projects.some(row=>row.id!==p?.id&&row.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Проект с таким названием уже есть.');
    const existing=require('./project-folders.cjs').projectFolders(p,ctx.projectMemory.get(p?.memoryId));const folders=data.folders|| (data.folder?[data.folder]:[]);for(const folder of folders)if(!existing.includes(folder)&&!pickedProjectFolders.has(folder))throw Error('Выберите папку кнопкой в контексте проекта.');data.folders=await Promise.all(folders.map(folder=>require('./local-project.cjs').rootFolder(folder)));data.folder=data.folders[0]||'';
    if(!p){ctx.dialogue.projectCreate(name);p=ctx.dialogue.state.projects.find(p=>p.id===ctx.dialogue.state.activeProjectId);}p.name=name;Object.assign(p,data);ctx.dialogue.persist();return ctx.dialogue.list();
  }));
  ctx.handle('chatArchive',projectMutation((kind,id,archived)=>{if(!['project','chat'].includes(kind))throw Error('Неизвестный тип записи.');if(kind==='chat'&&ctx.chatJobs.busy(id)||kind==='project'&&ctx.dialogue.state.topics.some(t=>t.projectId===id&&ctx.chatJobs.busy(t.id)))throw Error('Дождитесь ответа перед архивированием.');return ctx.chatUndo.mutate(()=>ctx.dialogue.archive(kind,id,archived));}));

  ctx.handle('chatProjectSelect',projectMutation(id=>ctx.dialogue.projectSelect(id)));
  ctx.handle('chatProjectRename',projectMutation((id,name)=>ctx.dialogue.projectRename(id,name)));
  ctx.handle('chatProjectMove',projectMutation((id,projectId)=>{if(ctx.chatJobs.busy(id))throw Error('Дождитесь ответа перед переносом чата.');return ctx.chatUndo.mutate(()=>ctx.dialogue.move(id,projectId));}));
  ctx.handle('chatProjectContext',()=>require('./chat-project-context.cjs').snapshot({dialogue:ctx.dialogue,projectMemory:ctx.projectMemory,settings:ctx.settings,slackAccount:ctx.slackAccount(),attachments:ctx.attachments.list()}));
  ctx.handle('chatProjectPin',(id,pinned)=>{const p=ctx.dialogue.state.projects.find(p=>p.id===id);if(!p)throw Error('Проект не найден.');if(id!=='general')p.pinned=!!pinned;ctx.dialogue.persist();return ctx.dialogue.list();});
  ctx.handle('chatPin',(id,pinned)=>ctx.dialogue.pin(id,pinned));
  ctx.handle('chatReorder',projectMutation((id,projectId,beforeId)=>{if(ctx.chatJobs.busy(id))throw Error('Дождитесь ответа перед переносом чата.');return ctx.chatUndo.mutate(()=>ctx.dialogue.reorder(id,projectId,beforeId));}));
  ctx.handle('chatProjectBind',projectMutation((id,memoryId)=>{const group=ctx.dialogue.state.projects.find(p=>p.id===id);if(id==='general')throw Error('Для общего проекта нельзя подключить папку или рабочий проект.');if(!group||id!==ctx.dialogue.state.activeProjectId)throw Error('Проект изменился. Откройте контекст заново.');if(memoryId&&!ctx.projectMemory.get(memoryId))throw Error('Рабочий проект не найден.');group.memoryId=memoryId||'';ctx.dialogue.select('');return ctx.dialogue.list();}));


  ctx.handle('dialogueRename',(id,title)=>ctx.dialogue.rename(id,title));
  ctx.handle('dialogueSelect',id=>ctx.dialogue.select(typeof id==='string'?id:''));
};
