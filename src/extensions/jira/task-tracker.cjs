// Capability «task-tracker» of Jira: a card's problem becomes a chat request to Petya's Jira flow, which drafts
// the issue, lets the user pick the project and creates it only after confirmation. Nothing is written here.
// A list of tasks ({title, tasks:[…]}) goes to the same flow as one batch request.
// A comment on an existing issue ({issue:'BW-12', comment}) comes from a card that already showed the exact text and
// issue as its confirmation (e.g. «История буфера»: a copied link into BW-12): it is written on that press only
// (POST /rest/api/3/issue/{key}/comment), after the connection is checked again.
const modules=require('../../modules.cjs');
const {taskBody,taskList}=require('../link-text.cjs');
const KEY=/^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
async function comment(services,{issue,comment:text},check){
 const key=String(issue||'').trim().toUpperCase();
 if(!KEY.test(key))throw Error('Укажите ключ задачи Jira, например PROJ-123.');
 const body=String(text||'').trim();if(!body||body.length>5000)throw Error('Комментарий пустой или слишком длинный.');
 const s=services.settings,site=String(s.jiraUrl||'').replace(/\/+$/,'');
 const basic=!s.atlassianCredential&&s.jiraEmail&&s.jiraToken?{Authorization:'Basic '+Buffer.from(s.jiraEmail+':'+s.jiraToken).toString('base64')}:{};
 check();
 const made=await services.request(site+'/rest/api/3/issue/'+encodeURIComponent(key)+'/comment',{method:'POST',headers:{...basic,'Content-Type':'application/json'},body:JSON.stringify({body:require('../../core.cjs').adf(body)})});
 if(!made?.id)throw Error('Jira не подтвердила комментарий.');
 return {done:true,key,url:site+'/browse/'+key,text:'Комментарий добавлен в '+key+'.'};
}
module.exports={
 label:'В задачу Jira',order:10,
 ready:s=>modules.enabled(s,'jira')&&!!s.jiraUrl&&!!(s.atlassianCredential||s.jiraEmail&&s.jiraToken),
 async run(services,payload,check){
  if(payload.issue!==undefined)return comment(services,payload,check);
  if(Array.isArray(payload.tasks))return {ask:'Создай задачи в Jira'+taskList(payload),send:true};
  return {ask:'Создай задачу в Jira: '+(payload.type==='bug'?'Баг. ':'')+taskBody(payload),send:true};
 },
 comment
};
