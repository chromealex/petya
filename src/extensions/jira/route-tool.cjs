// The «bugs» tool of the semantic tool router (route-tool, src/features/route-tools.cjs): the model picks it for a
// request to read a project's bugs in other words; the request then runs as the «bugs» chat subject (dialogue-kind.cjs)
// after the access check for Jira.
module.exports={
 id:'bugs',order:10,says:'прочитать дефекты проекта в Jira',
 async run(s,{command}){
  const offer=await s.serviceAccess.offer('Проверь Jira: '+command,s.dialogue.active());
  return offer||s.dialogue.turn(command,undefined,'bugs');
 }
};
