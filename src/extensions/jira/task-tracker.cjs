// Capability «task-tracker» of Jira: a card's problem becomes a chat request to Petya's Jira flow, which drafts
// the issue, lets the user pick the project and creates it only after confirmation. Nothing is written here.
// A list of tasks ({title, tasks:[…]}) goes to the same flow as one batch request.
const modules=require('../../modules.cjs');
const {taskBody,taskList}=require('../link-text.cjs');
module.exports={
 label:'В задачу Jira',order:10,
 ready:s=>modules.enabled(s,'jira')&&!!s.jiraUrl&&!!(s.atlassianCredential||s.jiraEmail&&s.jiraToken),
 async run(services,payload){
  if(Array.isArray(payload.tasks))return {ask:'Создай задачи в Jira'+taskList(payload),send:true};
  return {ask:'Создай задачу в Jira: '+(payload.type==='bug'?'Баг. ':'')+taskBody(payload),send:true};
 }
};
