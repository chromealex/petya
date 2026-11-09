// Read-only status of the meeting's tasks in the connected tracker. Summaries hold tasks as free text («Олег —
// обновить SDK»), so a task is looked up by an explicit key (PET-12) or by its words, and a found issue counts
// only when most of the task's words are in its title. Nothing is created or changed here.
const {words,close}=require('./collect.cjs');
const KEY=/(?:^|[^A-Z0-9])([A-Z][A-Z0-9_]{1,9}-\d{1,7})(?![\d])/;
// Connected trackers, the same check the team workload uses.
function connected(s){
 try{return require('../../workload.cjs').sources(s.settings,s.modules||require('../../modules.cjs'));}catch{return {jira:false,asana:false};}
}
// Most of the task's words are in the issue title.
function fits(task,title){
 const q=[...new Set(words(task))].filter(w=>w.length>=4),t=words(title);
 if(!q.length)return false;
 return q.filter(w=>t.some(x=>close(w,x))).length/q.length>=0.6;
}
// JQL text search needs plain words: quotes, operators and wildcards are dropped.
const jqlWords=text=>[...new Set(words(text).filter(w=>w.length>=4))].slice(0,4).map(w=>w.replace(/[^\p{L}\p{N}]/gu,'')).filter(Boolean);
const CATEGORY={new:'new',indeterminate:'progress',done:'done'};
const jiraRow=(s,issue)=>({system:'jira',key:String(issue.key||''),title:String(issue.fields?.summary||'').slice(0,200),status:String(issue.fields?.status?.name||''),
 category:CATEGORY[issue.fields?.status?.statusCategory?.key]||'new',url:/^https:\/\//.test(s.settings.jiraUrl||'')?String(s.settings.jiraUrl).replace(/\/+$/,'')+'/browse/'+encodeURIComponent(issue.key):''});

async function jira(s,task){
 const api=(route,options)=>s.workspace.api(route,options);
 const key=KEY.exec(task.what)?.[1];
 if(key){const issue=await api('/rest/api/3/issue/'+encodeURIComponent(key)+'?fields=summary,status');return issue?.key?jiraRow(s,issue):null;}
 const terms=jqlWords(task.what);if(!terms.length)return null;
 const projects=require('../jira/selection.cjs').keys(s.settings.jiraProjects||s.settings.jiraProject).filter(k=>/^[A-Z][A-Z0-9_]{1,9}$/.test(k));
 const jql=(projects.length?'project in ('+projects.join(',')+') AND ':'')+'text ~ "'+terms.join(' ')+'" AND updated >= -45d ORDER BY updated DESC';
 const found=await api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:5,fields:['summary','status']})});
 const hit=(found?.issues||[]).find(i=>fits(task.what,i.fields?.summary));
 return hit?jiraRow(s,hit):null;
}
async function asana(s,task){
 const {Asana}=require('../asana/asana.cjs');
 const client=new Asana({settings:()=>s.settings,request:s.request});
 const session=client.session();
 const q=new URLSearchParams({resource_type:'task',query:jqlWords(task.what).join(' ')||task.what.slice(0,60),count:'5',opt_fields:'name,completed,permalink_url'});
 const r=await client.api('/workspaces/'+session.workspace+'/typeahead?'+q);
 const hit=(r?.data||[]).find(t=>fits(task.what,t.name));
 return hit?{system:'asana',key:'',title:String(hit.name||'').slice(0,200),status:hit.completed?'Выполнена':'Открыта',category:hit.completed?'done':'new',url:/^https:\/\/app\.asana\.com\//.test(hit.permalink_url||'')?hit.permalink_url:''}:null;
}
// Fills task.tracker for each task; returns which trackers were asked and the first failure, if any.
async function status(s,tasks){
 const on=connected(s);
 const systems=[on.jira&&'jira',on.asana&&'asana'].filter(Boolean);
 if(!systems.length||!tasks.length)return {systems,error:''};
 let error='';
 for(const task of tasks){
  for(const system of systems){
   try{task.tracker=system==='jira'?await jira(s,task):await asana(s,task);}
   catch(e){if(e.name==='AbortError')throw e;error=error||(system==='jira'?'Jira':'Asana')+': '+e.message;if(e.status===401||e.status===403)return {systems,error};}
   if(task.tracker)break;
  }
 }
 return {systems,error};
}
module.exports={status,connected,fits,jqlWords,KEY};
