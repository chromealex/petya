const {ask}=require('../../input-required.cjs');
// Consent belongs to this saved request, project and connection only.
module.exports=function approve(s,command,resume){
 const dialogue=s.dialogue,topic=dialogue.active(),company=s.companyId,version=topic?.versionIndex;
 const project=dialogue.state.projects.find(p=>p.id===topic?.projectId),url=s.settings.unityUrl,token=s.settings.unityToken;
 let used=false;
 ask({text:'Разрешить Unity Editor исследовать запрос и предложить решение? Изменения проекта потребуют отдельного подтверждения.',label:'Доступ к Unity Editor',options:['Разрешить','Отмена'],strictChoices:true},answer=>{
  if(used)throw Error('На этот запрос разрешения уже ответили.');
  if(answer!=='Разрешить'){used=true;return {handled:true,cancelled:true,text:'Запрос к Unity Editor отменён.'};}
  if(s.companyId!==company||s.dialogue!==dialogue||dialogue.active()!==topic||topic?.archived||topic?.versionIndex!==version||!project||project.archived||!dialogue.state.projects.includes(project)||topic.projectId!==project.id||s.settings.unityUrl!==url||s.settings.unityToken!==token||s.settings.module_unity!=='true'||project.disabledServices?.includes('unity'))throw Error('Чат, проект или подключение Unity изменились. Разрешение устарело.');
  used=true;return resume();
 });
};
