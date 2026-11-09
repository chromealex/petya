// Git: the project's repositories (discovery by the project's folders, status, diff, history, stage, commit,
// branches, fetch/pull/push) as a bounded set of operations, never a shell command (workspace.cjs). Chat requests
// reach it through its chat route (chat-route.cjs); the Git panel and the chat cards call the IPC below.
// `services.gitWorkspace` is what other apps read (journal, code review, who-knows, patch notes, coder, …).
const {GitWorkspace}=require('./workspace.cjs');
module.exports={
 name:'gitWorkspace',defaults:{},validate(){},
 setup(s){
  const gitWorkspace=new GitWorkspace({context:()=>{
   const p=s.dialogue.state.projects.find(p=>p.id===s.dialogue.state.activeProjectId);
   return p&&p.id!=='general'?{id:p.id,name:p.name,folders:require('../../project-folders.cjs').projectFolders(p,s.projectMemory.get(p.memoryId))}:null;
  }});
  return {gitWorkspace,ipc:{
   discover:()=>gitWorkspace.discover(),
   select:(root,projectId)=>gitWorkspace.select(root,projectId),
   init:(folder,projectId)=>gitWorkspace.init(folder,projectId),
   status:()=>gitWorkspace.status(),
   execute:input=>gitWorkspace.execute(input)
  }};
 },
 teardown(){}
};
