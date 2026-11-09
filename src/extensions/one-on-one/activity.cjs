// «Встречи 1:1», the colleague's recent work for the prep card, read only and only from what is connected:
// - Jira (Petya's Jira connection, the projects chosen there): issues assigned to the person's Jira account and
//   updated in the last 14 days — POST /rest/api/3/search/jql.
// - GitHub (the «Pull requests» app added and a token in «GitHub»): pull requests of the configured repositories
//   (or the project's own remote) updated in the last 14 days whose author is the person — GET /repos/{repo}/pulls.
//   The author is the person when the login is on their «Команда» card (accounts.github) or the login reads as their
//   name («oleg-smirnov», «osmirnov»).
const match=require('../../team-match.cjs');
const DAYS=14,DAY=86400000;
const CATEGORY={new:'new',indeterminate:'progress',done:'done'};

function jiraConnected(settings={}){return settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);}
function prsConnected(settings={}){return settings['extension_pull-requests']==='true'&&!!String(settings.githubToken||'').trim();}
const projects=settings=>String(settings.jiraProjects||settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));
const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';

async function jira(s,member){
 if(!jiraConnected(s.settings))return {connected:false,items:[]};
 if(!member.jiraId)return {connected:true,items:[],hint:'В карточке «Команды» нет аккаунта Jira — задачи не показаны.'};
 const keys=projects(s.settings);
 const jql=(keys.length?'project IN ('+keys.map(quote).join(',')+') AND ':'')+'assignee = '+quote(member.jiraId)+' AND updated >= -'+DAYS+'d ORDER BY updated DESC';
 const data=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:8,fields:['summary','status','updated','priority']})});
 if(!Array.isArray(data?.issues))throw Error('Jira вернула неизвестный ответ на поиск задач.');
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 return {connected:true,items:data.issues.map(i=>({key:String(i.key||''),title:String(i.fields?.summary||'').slice(0,200),status:String(i.fields?.status?.name||''),
  category:CATEGORY[i.fields?.status?.statusCategory?.key]||'new',updated:Date.parse(i.fields?.updated)||0,url:/^https:\/\//.test(site)&&/^[A-Z][A-Z0-9_]*-\d+$/.test(i.key)?site+'/browse/'+i.key:''}))};
}

// Whether a GitHub login is this person.
function isAuthor(login,member,members){
 const own=[member.accounts?.github?.handle,member.accounts?.github?.name,member.accounts?.github?.id].filter(Boolean).map(v=>String(v).toLowerCase());
 if(own.length)return own.includes(String(login).toLowerCase());
 const shown=String(login).replace(/[-_.]+/g,' ').replace(/\d+/g,' ').trim();
 return !!shown&&match.match(shown,members)?.name===member.name;
}
async function prs(s,member,members,{now=Date.now()}={}){
 if(!prsConnected(s.settings))return {connected:false,items:[]};
 const github=require('../github/client.cjs');
 const repos=(await github.repos(s)).slice(0,3);
 if(!repos.length)return {connected:true,items:[],hint:'Не выбраны репозитории GitHub — PR не показаны.'};
 const api=github.create(s),since=now-DAYS*DAY,items=[];
 for(const repo of repos){
  const list=await api.get('/repos/'+github.validRepo(repo)+'/pulls',{state:'all',sort:'updated',direction:'desc',per_page:50});
  for(const pr of Array.isArray(list)?list:[]){
   if((Date.parse(pr.updated_at)||0)<since)continue;
   if(!isAuthor(pr.user?.login||'',member,members))continue;
   items.push({repo,number:Number(pr.number)||0,title:String(pr.title||'').slice(0,200),state:pr.merged_at?'merged':pr.state==='closed'?'closed':pr.draft?'draft':'open',
    updated:Date.parse(pr.updated_at)||0,created:Date.parse(pr.created_at)||0,url:/^https:\/\/github\.com\//.test(pr.html_url||'')?pr.html_url:''});
  }
 }
 return {connected:true,items:items.sort((a,b)=>b.updated-a.updated).slice(0,8)};
}
// Both, each failure kept apart (a broken token does not hide the other source).
async function collect(s,member,members,options={}){
 const one=async(name,fn)=>{try{return await fn();}catch(e){if(e?.name==='AbortError')throw e;return {connected:true,items:[],error:name+': '+String(e?.message||e).slice(0,200)};}};
 const [j,p]=await Promise.all([one('Jira',()=>jira(s,member)),one('GitHub',()=>prs(s,member,members,options))]);
 return {jira:j,prs:p};
}
module.exports={collect,jira,prs,isAuthor,jiraConnected,prsConnected,DAYS};
