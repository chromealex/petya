// Feature: the «Агенты» screen shows which tasks Petya, the Programmer, Claude and Codex are working on
// and in what status (src/agent-board.cjs collects them). The renderer is src/ui/agent-board.js.
const {board}=require('../agent-board.cjs');
module.exports={
 name:'agent-board',
 setup(s){
  const list=()=>board({records:s.agents?.records||[],topics:s.dialogue?.state?.topics||[],projects:s.dialogue?.state?.projects||[]});
  return {agentBoard:{list},ipc:{list}};
 }
};
