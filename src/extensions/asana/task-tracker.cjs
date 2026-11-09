// Capability «task-tracker» of Asana: a chat request to Petya's Asana flow (project choice, preview, «Создать»).
// Nothing is written here.
const modules=require('../../modules.cjs');
const {taskBody,taskList}=require('../link-text.cjs');
module.exports={
 label:'В задачу Asana',order:20,
 // Comments on an existing issue by its key (`{comment:true}` context) are Jira's; Asana creates tasks only.
 fits:context=>!context?.comment,
 ready:s=>modules.enabled(s,'asana')&&!!s.asanaCredential&&/^\d+$/.test(String(s.asanaWorkspace||'')),
 async run(services,payload){
  if(Array.isArray(payload.tasks))return {ask:'Создай задачи в Asana'+taskList(payload),send:true};
  return {ask:'Создай задачу в Asana: '+(payload.type==='bug'?'Баг. ':'')+taskBody(payload),send:true};
 }
};
