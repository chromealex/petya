// One Jira issue named in a request («https://site.atlassian.net/browse/BW-4569 посмотри эту таску», «что в BW-12?»):
// Petya reads that issue — summary, status, people, description, latest comments, links — instead of listing the
// whole project. Only the connected site and the projects allowed in the connection are read.
const {allowed}=require('./routing.cjs');
const KEY=/^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
// The issue a request names: {key, host} for a browse link, {key} for a bare key; null for none or several.
function named(command){
 const text=String(command||'');
 const links=[...text.matchAll(/https?:\/\/([\w.-]+)\/browse\/([A-Z][A-Z0-9_]{0,19}-\d{1,9})(?![\w-])/g)].map(m=>({key:m[2],host:m[1].toLowerCase()}));
 const bare=[...text.replace(/https?:\/\/\S+/g,' ').matchAll(/(?:^|[^\p{L}\p{N}_-])([A-Z][A-Z0-9_]{0,19}-\d{1,9})(?![\p{L}\p{N}_-])/gu)].map(m=>({key:m[1]}));
 const keys=new Set([...links,...bare].map(x=>x.key));
 if(keys.size!==1)return null;
 return links[0]||bare[0];
}
// Plain text of an Atlassian Document Format value (descriptions, comments).
function plain(adf){
 if(typeof adf==='string')return adf;
 const out=[];const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='text'&&typeof n.text==='string')out.push(n.text);if(n.type==='hardBreak')out.push('\n');if(n.type==='mention'&&n.attrs?.text)out.push(n.attrs.text);
  for(const c of Array.isArray(n.content)?n.content:[])walk(c);if(['paragraph','heading','listItem','codeBlock','blockquote'].includes(n.type))out.push('\n');};
 walk(adf);return out.join('').replace(/\n{3,}/g,'\n\n').trim();
}
const cut=(s,n)=>{s=String(s||'').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
async function read(workspace,target){
 const s={...workspace.settings()};
 if(!s.jiraUrl)throw Error('Подключите Jira, чтобы я мог открыть задачу '+target.key+'.');
 const site=new URL(s.jiraUrl);
 if(target.host&&target.host!==site.hostname.toLowerCase())throw Error('Ссылка ведёт на другой сайт Jira ('+target.host+'), а подключён '+site.hostname+'.');
 const project=target.key.split('-')[0];
 if(!allowed(s).includes(project))throw Error('Проект '+project+' не отмечен в подключении Jira. Добавьте его в «Подключения → Jira», и я открою '+target.key+'.');
 const fields='summary,status,priority,assignee,reporter,issuetype,duedate,updated,created,description,comment,issuelinks,fixVersions,labels,parent';
 const issue=await workspace.api('/rest/api/3/issue/'+encodeURIComponent(target.key)+'?fields='+fields,{},s);
 if(!issue||issue.key!==target.key||!KEY.test(issue.key)||!issue.fields)throw Error('Jira не вернула задачу '+target.key+'.');
 const f=issue.fields,url=site.origin+'/browse/'+issue.key;
 const facts=[f.issuetype?.name,f.status?.name,f.priority?.name&&'приоритет '+f.priority.name,'исполнитель: '+(f.assignee?.displayName||'не назначен'),f.duedate&&'срок '+f.duedate,(f.fixVersions||[]).length&&'версия '+f.fixVersions.map(v=>v.name).join(', ')].filter(Boolean);
 const description=cut(plain(f.description),900);
 const comments=(f.comment?.comments||[]).slice(-2).map(c=>(c.author?.displayName||'Кто-то')+': '+cut(plain(c.body).replace(/\s+/g,' '),240));
 const links=(f.issuelinks||[]).slice(0,8).map(l=>l.outwardIssue?(l.type?.outward||'связана с')+' '+l.outwardIssue.key:l.inwardIssue?(l.type?.inward||'связана с')+' '+l.inwardIssue.key:'').filter(Boolean);
 const text=[issue.key+' — '+f.summary,facts.join(' · '),f.parent?.key&&'Родитель: '+f.parent.key+(f.parent.fields?.summary?' — '+f.parent.fields.summary:''),
  description?'Описание: '+description:'Описания нет.',
  comments.length?'Последние комментарии ('+(f.comment?.total??comments.length)+' всего):\n'+comments.join('\n'):'',
  links.length?'Связи: '+links.join(', ')+'.':''].filter(Boolean).join('\n');
 return {text,sources:[{title:'Jira · '+issue.key,url}],data:{project,total:1,open:['new','indeterminate'].includes(f.status?.statusCategory?.key)?1:0,at:Date.now(),issue:issue.key,
  issues:[{id:issue.id,key:issue.key,fields:{summary:f.summary,status:f.status?{name:f.status.name,statusCategory:{key:f.status.statusCategory?.key}}:null,priority:f.priority?{name:f.priority.name}:null,assignee:f.assignee?{accountId:f.assignee.accountId,displayName:f.assignee.displayName}:null,issuetype:f.issuetype?{name:f.issuetype.name}:null,duedate:f.duedate||null,updated:f.updated}}]}};
}
module.exports={named,plain,read};
