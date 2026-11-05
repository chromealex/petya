const {ask}=require('../../input-required.cjs');
// Enabling the extension is consent, not permission to execute editor writes.
module.exports=function requireUnity(s,resume){
 let topic=s.dialogue.active();
 if(!topic){topic={id:require('node:crypto').randomUUID(),projectId:s.dialogue.state.activeProjectId||'general',title:'Запрос к Unity',kind:'chat',messages:[],at:Date.now()};s.dialogue.state.topics.push(topic);s.dialogue.state.activeId=topic.id;delete s.dialogue.state.newChat;s.dialogue.persist();}
 const project=s.dialogue.state.projects.find(p=>p.id===(topic?.projectId||s.dialogue.state.activeProjectId));
 if(s.settings.module_unity==='true'&&!project?.disabledServices?.includes('unity'))return;
 const company=s.companyId,version=topic?.versionIndex,url=s.settings.unityUrl,token=s.settings.unityToken;
 const check=()=>{if(s.companyId!==company||s.dialogue.active()!==topic||topic?.versionIndex!==version||topic?.archived||!project||project.archived||!s.dialogue.state.projects.includes(project)||topic&&topic.projectId!==project.id||s.settings.unityUrl!==url||s.settings.unityToken!==token)throw Error('Чат, проект или подключение изменились. Включение отменено.');};
 ask({text:'Для этого запроса нужно расширение «Unity Editor». Включить его для Пети и текущего проекта? После включения продолжу запрос. Действия в редакторе потребуют отдельного подтверждения.',options:['Включить и продолжить','Отмена'],strictChoices:true},async answer=>{
  if(answer!=='Включить и продолжить')return {handled:true,text:'Запрос отменён.'};
  check();await s.saveSettings({module_unity:'true'});check();
  project.disabledServices=(project.disabledServices||[]).filter(id=>id!=='unity');s.dialogue.persist();
  return require('../../modules.cjs').withProject(project,resume);
 });
};
