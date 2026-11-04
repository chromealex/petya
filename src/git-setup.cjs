// Git and local projects: workspace, discovery, status, commands and local project links.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const gitWorkspace=new (require('./git-workspace.cjs').GitWorkspace)({context:()=>{
    const p=ctx.dialogue.state.projects.find(p=>p.id===ctx.dialogue.state.activeProjectId);
    return p&&p.id!=='general'?{id:p.id,name:p.name,folders:require('./project-folders.cjs').projectFolders(p,ctx.projectMemory.get(p.memoryId))}:null;
  }});
  ctx.handle('gitDiscover',()=>gitWorkspace.discover());
  ctx.handle('gitSelect',(root,projectId)=>gitWorkspace.select(root,projectId));
  ctx.handle('gitInit',(folder,projectId)=>gitWorkspace.init(folder,projectId));
  ctx.handle('gitStatus',()=>gitWorkspace.status());
  ctx.handle('gitExecute',input=>gitWorkspace.execute(input));
  ctx.handle('localProjectStatus',()=>({projects:ctx.projectMemory.state.projects.map(p=>({id:p.id,name:p.name,folder:p.localFolder||''})),activeId:ctx.projectMemory.active()?.id||''}));
  ctx.handle('localProjectConnect',async id=>{
    const project=ctx.projectMemory.get(id);if(!project)throw Error('Сначала выберите рабочий проект.');
    const scope=ctx.companyId;
    const picked=await require('electron').dialog.showOpenDialog(ctx.win,{title:'Папка проекта «'+project.name+'»',properties:['openDirectory']});
    if(picked.canceled)return {canceled:true};
    const snapshot=await require('./local-project.cjs').readProject(picked.filePaths[0]);
    if(scope!==ctx.companyId||!ctx.projectMemory.get(id))throw Error('Проект изменился. Повторите подключение.');
    const next=structuredClone(ctx.projectMemory.state);next.projects.find(p=>p.id===id).localFolder=snapshot.root;ctx.projectMemory.commit(next);
    return snapshot;
  });
  ctx.handle('localProjectDisconnect',id=>{const next=structuredClone(ctx.projectMemory.state),project=next.projects.find(p=>p.id===id);if(!project)throw Error('Проект не найден.');delete project.localFolder;ctx.projectMemory.commit(next);return true;});
  ctx.handle('localProjectRefresh',async id=>{const project=ctx.projectMemory.get(id);if(!project?.localFolder)throw Error('Подключите папку проекта.');return require('./local-project.cjs').readProject(project.localFolder);});
  return {gitWorkspace};
};
