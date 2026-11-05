// Feature: the live self-check removes what it created — its «Автотест Пети …» projects and the chats it
// opened in the user's project — instead of leaving archived leftovers. User chats are never touched:
// only chats whose every message is from the run (or old archived self-check chats) are removed.
const TEST_PROJECT=/^Автотест Пети /u;
module.exports={
 name:'selftest',
 setup(s){
  const cleanup=({since=0,turns=[],legacy=false}={})=>{
   const state=s.dialogue.state,asked=new Set(turns.map(t=>String(t).trim()));
   const busy=id=>s.chatJobs?.busy?.(id)||s.dialogue.running?.has?.(id);
   const testProjects=new Set(state.projects.filter(p=>TEST_PROJECT.test(p.name||'')).map(p=>p.id));
   const firstAsk=t=>t.messages?.find(m=>m.role==='user')?.text?.trim()||'';
   const fromRun=t=>since&&t.messages?.length&&t.messages.every(m=>Number(m.at)>=since);
   const ours=t=>(/^Агент · /u.test(t.title||'')||asked.has(firstAsk(t)));
   // Old runs: only archived chats made of self-check questions alone (a user's own chat has other messages).
   const asks=t=>(t.messages||[]).filter(m=>m.role==='user').map(m=>String(m.text||'').trim());
   const oldRun=t=>{const a=asks(t);return t.archived&&a.length>0&&a.every(v=>asked.has(v))&&(/^Агент · /u.test(t.title||'')||a.length>=2);};
   const remove=t=>testProjects.has(t.projectId)||(fromRun(t)&&ours(t))||(legacy&&oldRun(t));
   const before=state.topics.length;
   state.topics=state.topics.filter(t=>busy(t.id)||!remove(t));
   const removedProjects=state.projects.filter(p=>testProjects.has(p.id)&&!state.topics.some(t=>t.projectId===p.id)).length;
   state.projects=state.projects.filter(p=>!testProjects.has(p.id)||state.topics.some(t=>t.projectId===p.id));
   if(!state.topics.some(t=>t.id===state.activeId))state.activeId='';
   if(!state.projects.some(p=>p.id===state.activeProjectId))state.activeProjectId=state.projects.find(p=>p.id==='general')?.id||state.projects[0]?.id||'';
   s.dialogue.persist();
   return {chats:before-state.topics.length,projects:removedProjects};
  };
  return {ipc:{cleanup}};
 }
};
