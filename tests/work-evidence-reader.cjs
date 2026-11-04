const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.PETYA_ROOT||path.resolve(__dirname,'..');
const {JiraInsights}=require(process.env.PETYA_READER||path.join(root,'src/jira-insights.cjs'));
(async()=>{
 for(const kind of ['tasks','bugs']){
  const queries=[];
  const insight=new JiraInsights({settings:()=>({jiraProjects:'AL',jiraUrl:'https://fixture.invalid'}),pages:async()=>[{key:'AL',name:'Альфа'}],api:async(route,options)=>{
   if(route.endsWith('/versions'))return [{id:'v1',name:'1.0',released:true,releaseDate:'2026-01-01'}];
   if(route.includes('/project/'))return {issueTypes:[{id:'bug',name:'Bug'}]};
   const q=JSON.parse(options.body);queries.push(q);
   const all={summary:'Работа',status:{name:'Blocked',statusCategory:{key:'indeterminate'}},priority:{name:'High'},assignee:{accountId:'u1',displayName:'Анна',emailAddress:'unneeded@example.invalid',avatarUrls:{large:'https://fixture.invalid/avatar'}},duedate:'2026-11-06',updated:'2026-11-01T12:00:00Z',issuelinks:[{type:{inward:'is blocked by',outward:'blocks'},inwardIssue:{key:'AL-2'}}]};
   return {isLast:true,issues:[{id:'1',key:'AL-1',fields:Object.fromEntries(q.fields.filter(f=>Object.hasOwn(all,f)).map(f=>[f,all[f]]))}]};
  }});
  const result=await insight.read(kind==='tasks'?'Покажи задачи Альфа':'Проверь баги Альфа',{},'',kind);
  for(const field of ['assignee','duedate','updated','issuelinks'])assert(queries[0].fields.includes(field),kind+' must request '+field);
  const issue=result.data.issues[0],fields=issue.fields||issue;
  assert.equal(fields.assignee.displayName,'Анна',kind+' must preserve assignee');
  assert.equal(fields.duedate,'2026-11-06');
  assert.equal(fields.issuelinks[0].inwardIssue.key,'AL-2');
  assert.equal(fields.status.statusCategory.key,'indeterminate');
  assert(!JSON.stringify(result.data).includes('unneeded@example.invalid'));
  assert(!JSON.stringify(result.data).includes('avatar'));
  const {Dialogue}=require(path.join(root,'src/dialogue.cjs'));
  const {dialogueRequest}=require(path.join(root,'src/dialogue-request.cjs'));
  let sawEvidence=false;
  const d=new Dialogue({readers:{[kind]:(command,topic)=>insight.read(command,topic,'',kind)},answer:async(command,topic)=>{
   const body=dialogueRequest({model:'test',command,topic});
   const data=JSON.parse(body.messages[1].content.slice(body.messages[1].content.indexOf('{'))).lastVerifiedData;
   assert.equal(data.issues[0].fields.assignee.displayName,'Анна');sawEvidence=true;
   const {localAnswer}=require(process.env.PETYA_ANSWER_MODULE||path.join(root,'src/dialogue-answer.cjs'));
   const answer=await localAnswer({model:'test',command,topic,request:()=>assert.fail('A clear field question must use the stored card')});
   assert.match(answer,/Анна/);return answer;
  }});
  await d.turn(kind==='tasks'?'Покажи задачи в Альфа':'Проверь баги Альфа');
  await d.turn('Кто назначен на AL-1?');assert(sawEvidence,'Follow-up answer must see reader evidence');
 }
 console.log('Jira work evidence: requested fields, assignee, deadline, update, dependency and status category retained for tasks and bugs');
})().catch(e=>{console.error(e);process.exitCode=1;});
