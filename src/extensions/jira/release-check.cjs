// Jira as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs): open
// blocking bugs in the Jira version of the release. Read-only: GET project versions and POST search/jql (a search).
// Priority names differ per site, so blockers are picked by code from the open issues of the version: a bug whose
// priority is Blocker / Highest / Critical (or Russian names) or that carries a «blocker» label.
const modules=require('../../modules.cjs');
const keysOf=settings=>require('../../jira-selection.cjs').keys(settings.jiraProjects||settings.jiraProject).filter(k=>/^[A-Z][A-Z0-9_]{1,9}$/.test(k));
const plain=v=>String(v||'').toLowerCase().replace(/^(?:release|version|ver|rel|v)[-_/ ]?/,'').replace(/^v/,'').replace(/(?:\.0)+$/,'');
const BUG=/bug|баг|ошибк|дефект|defect/i;
const BLOCKER_PRIORITY=/blocker|highest|critical|блок|крит|наивысш|высочайш/i;
const BLOCKER_LABEL=/^(?:release[-_]?)?block(?:er|ing)$/i;
const quote=v=>'"'+String(v).replace(/["\\]/g,'')+'"';

module.exports={
 checks:[{id:'jira.blockers',title:'Нет открытых блокирующих багов в версии',group:'Качество'}],
 ready:settings=>modules.enabled(settings,'jira')&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken),
 hint:()=>'Подключите Jira в «Подключения → Jira» и выберите проект.',
 async run(s,release){
  const keys=keysOf(s.settings);
  if(!keys.length)return [{id:'jira.blockers',status:'unknown',summary:'В настройках Jira не выбран проект.'}];
  const versions=[];
  for(const key of keys.slice(0,5)){const list=await s.workspace.api('/rest/api/3/project/'+encodeURIComponent(key)+'/versions');for(const v of Array.isArray(list)?list:[])if(!v.archived)versions.push(String(v.name||''));}
  const want=plain(release.version);
  const names=[...new Set(versions.filter(n=>plain(n)===want||plain(n).endsWith(' '+want)))];
  if(!names.length)return [{id:'jira.blockers',status:'unknown',summary:'Версии '+release.version+' нет в Jira ('+keys.join(', ')+').'}];
  const jql='project in ('+keys.join(',')+') AND fixVersion in ('+names.map(quote).join(',')+') AND statusCategory != Done ORDER BY priority DESC, key ASC';
  const issues=[];let token='';
  for(let page=0;page<3;page++){
   const r=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['summary','issuetype','priority','status','labels'],...token?{nextPageToken:token}:{}})});
   issues.push(...(r?.issues||[]));token=r?.nextPageToken||'';if(!token||r?.isLast)break;
  }
  const base=/^https:\/\//.test(s.settings.jiraUrl||'')?String(s.settings.jiraUrl).replace(/\/+$/,''):'';
  const blockers=issues.filter(i=>BUG.test(i.fields?.issuetype?.name||'')&&(BLOCKER_PRIORITY.test(i.fields?.priority?.name||'')||(i.fields?.labels||[]).some(l=>BLOCKER_LABEL.test(l))));
  const evidence=blockers.slice(0,6).map(i=>({text:i.key+' · '+String(i.fields?.summary||'').slice(0,140)+' ('+(i.fields?.priority?.name||'')+', '+(i.fields?.status?.name||'')+')',url:base?base+'/browse/'+encodeURIComponent(i.key):''}));
  evidence.push({text:'Открытых задач в версии '+names.join(', ')+': '+issues.length+(token?'+':'')+'.',url:base?base+'/issues/?jql='+encodeURIComponent(jql):''});
  const action={label:'Задачи версии',ask:'какие задачи в версии '+release.version+' в Jira'};
  if(blockers.length)return [{id:'jira.blockers',status:'problem',summary:'Открытых блокирующих багов: '+blockers.length+'.',evidence,action}];
  return [{id:'jira.blockers',status:'ok',summary:'Блокирующих багов нет'+(issues.length?'; открытых задач в версии — '+issues.length:'')+'.',evidence,action}];
 }
};
