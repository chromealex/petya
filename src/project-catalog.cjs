const {keys}=require('./extensions/jira/selection.cjs');
const {ConversationInput}=require('./ui/conversation-input.js');
const isProjectCatalogQuestion=raw=>ConversationInput.isProjectCatalogQuestion(raw);
function projectCatalogReply(command,{projects=[],activeId='',settings={}}={}){
 if(!isProjectCatalogQuestion(command))return null;
 const saved=projects.map(p=>({id:p.id,name:String(p.name),active:p.id===activeId}));
 const jira=keys(settings.jiraProjects||settings.jiraProject);
 const lines=[];
 if(saved.length)lines.push('В памяти этой компании есть проекты:\n'+saved.map(p=>'• '+p.name+(p.active?' — текущий':'')).join('\n'));
 if(jira.length)lines.push('В настройках Jira выбраны: '+jira.join(', ')+'. Это сохранённые настройки, доступ сейчас не проверял.');
 if(!lines.length)lines.push('В этой компании пока нет сохранённых проектов и выбранных проектов Jira. Можешь назвать проект: «Работаем над проектом …», или выбрать проекты в подключении Jira.');
 return {handled:true,projectCatalog:true,text:lines.join('\n\n'),projects:saved,jiraProjects:jira};
}
module.exports={isProjectCatalogQuestion,projectCatalogReply};
