// Capability «task-tracker» of Jira: a card's problem becomes a chat request to Petya's Jira flow, which drafts
// the issue, lets the user pick the project and creates it only after confirmation. Nothing is written here.
const modules=require('../../modules.cjs');
const {taskBody}=require('../link-text.cjs');
module.exports={
 label:'В задачу Jira',
 ready:s=>modules.enabled(s,'jira')&&!!s.jiraUrl&&!!(s.atlassianCredential||s.jiraEmail&&s.jiraToken),
 async run(services,payload){
  return {ask:'Создай задачу в Jira: '+(payload.type==='bug'?'Баг. ':'')+taskBody(payload),send:true};
 }
};
