// «Планирование спринта», Jira reads (all GET, through the shared Jira connection `s.workspace.api`): the project's
// scrum boards, the board's estimation field, closed / active / future sprints, the issues of a sprint and the
// ranked backlog. Jira Software Cloud REST API (Agile 1.0):
//   GET /rest/agile/1.0/board?projectKeyOrId=KEY&type=scrum
//   GET /rest/agile/1.0/board/{boardId}/configuration           → estimation.field.fieldId / displayName
//   GET /rest/agile/1.0/board/{boardId}/sprint?state=closed|active,future
//   GET /rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue
//   GET /rest/agile/1.0/board/{boardId}/backlog                  (rank order)
// Nothing here writes; moving issues into a sprint goes through the Jira history preview/confirm flow (feature.cjs).
const PAGE=100,MAX_ISSUES=500;

function connected(s){
 try{return require('../../workload.cjs').sources(s.settings,s.modules||require('../../modules.cjs')).jira;}catch{return false;}
}
// Settings for one Jira project of the shared connection.
function scoped(s,project){return {...s.workspace.settings(),jiraProject:project};}

async function boards(s,project){
 const rows=await s.workspace.pages('/rest/agile/1.0/board?'+new URLSearchParams({projectKeyOrId:project,type:'scrum'}),scoped(s,project));
 return rows.filter(b=>b&&b.id!=null).map(b=>({id:String(b.id),name:String(b.name||'Доска '+b.id).slice(0,120)}));
}

// The board's estimation: story points (or another number field) or, when the board estimates nothing, issue count.
// Time-tracking estimation (originalEstimate) is read as hours.
async function estimation(s,project,boardId){
 let c=null;try{c=await s.workspace.api('/rest/agile/1.0/board/'+encodeURIComponent(boardId)+'/configuration',{},scoped(s,project));}catch{c=null;}
 const field=c?.estimation?.field;
 if(c?.estimation?.type==='field'&&field?.fieldId){
  const time=/^(?:timeoriginalestimate|timeestimate|aggregatetimeoriginalestimate)$/i.test(field.fieldId);
  return {mode:time?'hours':'points',field:String(field.fieldId),label:String(field.displayName||(time?'Оценка времени':'Story Points')).slice(0,60)};
 }
 return {mode:'count',field:'',label:'Количество задач'};
}

async function sprints(s,project,boardId,state){
 const rows=await s.workspace.pages('/rest/agile/1.0/board/'+encodeURIComponent(boardId)+'/sprint?'+new URLSearchParams({state}),scoped(s,project));
 return rows.map(x=>({id:String(x.id),name:String(x.name||'Спринт '+x.id).slice(0,120),state:String(x.state||''),start:x.startDate||null,end:x.endDate||null,complete:x.completeDate||null,goal:String(x.goal||'').slice(0,300)}));
}

const FIELDS=['summary','status','assignee','priority','issuetype','resolutiondate'];
// One issue as the planner needs it. Estimate: number or null («без оценки»).
function issue(raw,est){
 const f=raw?.fields||{};
 let value=null;
 if(est.mode==='count')value=1;
 else{const v=f[est.field];const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;value=Number.isFinite(n)&&n>=0?est.mode==='hours'?Math.round(n/360)/10:n:null;}
 return {key:String(raw?.key||''),summary:String(f.summary||'').slice(0,300),estimate:value,
  status:String(f.status?.name||''),category:String(f.status?.statusCategory?.key||''),assigneeId:String(f.assignee?.accountId||''),assignee:String(f.assignee?.displayName||''),
  priority:String(f.priority?.name||''),type:String(f.issuetype?.name||''),subtask:!!f.issuetype?.subtask,resolved:f.resolutiondate||null};
}

async function issuePages(s,project,route,est,{limit=MAX_ISSUES,jql=''}={}){
 const fields=[...FIELDS,...est.field?[est.field]:[]].join(','),out=[];
 for(let startAt=0;startAt<limit;){
  const q=new URLSearchParams({startAt:String(startAt),maxResults:String(Math.min(PAGE,limit-startAt)),fields,...jql?{jql}:{}});
  const page=await s.workspace.api(route+'?'+q,{},scoped(s,project));
  const rows=page?.issues||[];
  out.push(...rows.map(r=>issue(r,est)).filter(r=>r.key));
  startAt+=rows.length;
  if(!rows.length||(Number.isFinite(page?.total)&&startAt>=page.total))break;
 }
 return out;
}
const sprintIssues=(s,project,boardId,sprintId,est)=>issuePages(s,project,'/rest/agile/1.0/board/'+encodeURIComponent(boardId)+'/sprint/'+encodeURIComponent(sprintId)+'/issue',est);
// The ranked backlog (issues in no active or future sprint), without finished ones.
const backlog=(s,project,boardId,est,limit=200)=>issuePages(s,project,'/rest/agile/1.0/board/'+encodeURIComponent(boardId)+'/backlog',est,{limit,jql:'statusCategory != Done'});

module.exports={connected,scoped,boards,estimation,sprints,sprintIssues,backlog,issue};
