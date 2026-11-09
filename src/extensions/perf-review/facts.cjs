// «Перформанс-ревью», the facts of a period by code. Every fact has a date, a source label and, where the service has
// one, a link. Each source is read only, and one failing never hides the others; what could not be read becomes a
// coverage gap («нет данных о …») instead of a guess.
// - Jira (Petya's Jira connection, the projects chosen there): issues assigned to the person's Jira account and
//   resolved in the period (POST /rest/api/3/search/jql); incidents are those of an incident type or label;
// - GitHub (the shared GitHub token, the configured repositories): pull requests the person authored and pull
//   requests of others they reviewed (GET /search/issues, `author:` / `reviewed-by:`), by the login on their card;
// - meetings: Petya's meeting summaries of the period — tasks given to the person and decisions naming them;
// - 1:1: the notes and agreed follow-ups of «Встречи 1:1» (people records), read only because the user asked about
//   this person in this chat.
const match=require('../../team-match.cjs');
const DAY=86400000;
const clip=(t,n=200)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const ymd=ms=>new Date(ms).toISOString().slice(0,10);
const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
const jiraConnected=settings=>settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
const projects=settings=>String(settings.jiraProjects||settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));
const INCIDENT=/incident|инцидент|postmortem|post-mortem|постмортем|outage|авари/iu;

async function jira(s,member,{from}){
 if(!s.workspace?.api||!jiraConnected(s.settings))return {facts:[],gaps:['нет данных о задачах Jira: Jira не подключена']};
 if(!member.jiraId)return {facts:[],gaps:['нет данных о задачах Jira: в карточке «Команды» нет аккаунта Jira']};
 const keys=projects(s.settings);
 const jql=(keys.length?'project IN ('+keys.map(quote).join(',')+') AND ':'')+'assignee = '+quote(member.jiraId)+' AND statusCategory = Done AND resolved >= '+quote(from)+' ORDER BY resolved DESC';
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 const issues=[];let token='';
 for(let page=0;page<3;page++){
  const data=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['summary','issuetype','labels','resolutiondate','priority'],...token?{nextPageToken:token}:{}})});
  if(!Array.isArray(data?.issues))throw Error('Jira вернула неизвестный ответ на поиск задач.');
  issues.push(...data.issues);
  if(data.isLast!==false||!data.nextPageToken)break;token=data.nextPageToken;
 }
 const facts=issues.filter(i=>/^[A-Z][A-Z0-9_]*-\d+$/.test(String(i.key||''))).map(i=>{
  const f=i.fields||{},incident=INCIDENT.test(String(f.issuetype?.name||''))||(f.labels||[]).some(l=>INCIDENT.test(l));
  return {kind:incident?'incident':'task',date:String(f.resolutiondate||'').slice(0,10),key:i.key,
   text:(incident?'Разобран инцидент ':'Закрыта задача ')+i.key+' «'+clip(f.summary,140)+'»'+(f.issuetype?.name&&!incident?' ('+clip(f.issuetype.name,30)+')':''),
   source:{label:'Jira · '+i.key,url:site?site+'/browse/'+i.key:''}};
 });
 const gaps=[];
 if(!facts.length)gaps.push('нет данных о задачах Jira: за период нет закрытых задач на этом аккаунте');
 if(!facts.some(f=>f.kind==='incident'))gaps.push('нет данных об инцидентах: в Jira за период нет задач-инцидентов этого человека, а мониторинг не хранит, кто их разбирал');
 return {facts,gaps,link:site?site+'/issues/?jql='+encodeURIComponent(jql):''};
}

function githubReady(settings){
 try{return require('../github/client.cjs').connected(settings)&&(settings.extension_github==='true'||settings['extension_pull-requests']==='true');}catch{return false;}
}
async function github(s,member,{from}){
 if(!githubReady(s.settings))return {facts:[],gaps:['нет данных о PR и код-ревью: GitHub не подключён']};
 const login=String(member.accounts?.github?.handle||member.accounts?.github?.name||'').replace(/^@/,'');
 if(!/^[A-Za-z0-9-]{1,39}$/.test(login))return {facts:[],gaps:['нет данных о PR и код-ревью: в карточке «Команды» нет логина GitHub']};
 const gh=require('../github/client.cjs');
 const repos=(await gh.repos(s)).slice(0,3);
 if(!repos.length)return {facts:[],gaps:['нет данных о PR и код-ревью: не выбраны репозитории GitHub']};
 const api=gh.create(s),facts=[];
 for(const repo of repos){
  gh.validRepo(repo);
  const authored=await api.get('/search/issues',{q:'repo:'+repo+' type:pr author:'+login+' created:>='+from,per_page:100,sort:'created',order:'desc'});
  for(const pr of authored?.items||[]){
   const merged=!!pr.pull_request?.merged_at;
   facts.push({kind:'pr',date:String(pr.pull_request?.merged_at||pr.closed_at||pr.created_at||'').slice(0,10),merged,
    text:'PR #'+pr.number+' «'+clip(pr.title,140)+'» — '+(merged?'влит':pr.state==='open'?'открыт':'закрыт без слияния'),
    source:{label:repo+' #'+pr.number,url:/^https:\/\/github\.com\//.test(pr.html_url||'')?pr.html_url:''}});
  }
  const reviewed=await api.get('/search/issues',{q:'repo:'+repo+' type:pr reviewed-by:'+login+' -author:'+login+' updated:>='+from,per_page:100,sort:'updated',order:'desc'});
  for(const pr of reviewed?.items||[]){
   facts.push({kind:'review',date:String(pr.updated_at||pr.created_at||'').slice(0,10),
    text:'Ревью PR #'+pr.number+' «'+clip(pr.title,140)+'»'+(pr.user?.login?' (автор '+clip(pr.user.login,40)+')':''),
    source:{label:repo+' #'+pr.number,url:/^https:\/\/github\.com\//.test(pr.html_url||'')?pr.html_url:''}});
  }
 }
 const gaps=[];
 if(!facts.some(f=>f.kind==='pr'))gaps.push('нет данных о PR: за период нет PR с автором '+login);
 if(!facts.some(f=>f.kind==='review'))gaps.push('нет данных о код-ревью: за период нет ревью чужих PR от '+login);
 return {facts,gaps};
}

// Meeting summaries in the period: tasks given to the person («who» is their name), decisions that name them.
function meetings(memory,member,{from,to}){
 const rows=(memory||[]).filter(r=>r?.kind==='summary'&&r.summary&&typeof r.summary==='object'&&ymd(Number(r.at)||0)>=from&&ymd(Number(r.at)||0)<=to);
 const facts=[];
 const named=t=>{const words=String(t||'').split(/[^\p{L}-]+/u).filter(w=>w.length>=3);for(let i=0;i<words.length;i++){const one=match.match(words[i],[member])||match.match(words.slice(i,i+2).join(' '),[member]);if(one)return true;}return false;};
 for(const r of rows){
  const title=clip(String(r.title||'Сводка встречи').replace(/^Сводка встречи\s*·\s*/,''),80),date=ymd(Number(r.at));
  const source={label:'Встреча · '+title,url:''};
  for(const t of (r.summary.tasks||[]).slice(0,20))if(t&&named(t.who))facts.push({kind:'meeting',date,text:'Взял(а) на встрече: '+clip(t.what,160)+(t.due?' (срок: '+clip(t.due,30)+')':''),source});
  for(const d of (r.summary.decisions||[]).map(String).slice(0,10))if(named(d))facts.push({kind:'meeting',date,text:'Решение встречи: '+clip(d,180),source});
 }
 return {facts:facts.slice(0,30),gaps:rows.length?facts.length?[]:['нет данных о встречах: в сводках встреч за период его задач и решений нет']:['нет данных о встречах: сводок встреч за период нет']};
}

// «Встречи 1:1»: agreed follow-ups of the person (theirs) and the dates of the notes, from the people records.
function oneOnOne(s,member,{from,to}){
 if(!s.people?.followups)return {facts:[],gaps:['нет данных о встречах 1:1: записи о коллегах не загружены']};
 const facts=[];
 let follow=[],notes=[];
 try{follow=s.people.followups({member:member.key||member.name,open:false});notes=s.people.notes(member.key||member.name,{limit:50});}catch{return {facts:[],gaps:['нет данных о встречах 1:1: человека нет в записях']};}
 for(const f of follow){
  const date=ymd(f.at||0);if(date<from||date>to||f.owner!=='them')continue;
  facts.push({kind:'followup',date,text:'Договорённость с 1:1: '+clip(f.text,160)+' — '+(f.done?'выполнено':f.due&&f.due<to?'просрочено':'открыто'),done:!!f.done,source:{label:'Встречи 1:1 · '+date,url:''}});
 }
 for(const n of notes){if(n.date<from||n.date>to)continue;facts.push({kind:'note',date:n.date,text:'Заметка 1:1: '+clip(n.text,220),source:{label:'Встречи 1:1 · '+n.date,url:''}});}
 return {facts,gaps:facts.length?[]:['нет данных о встречах 1:1: за период нет сохранённых итогов 1:1']};
}

// Everything, each source apart; facts get ids F1… in date order.
async function collect(s,member,{from,to,memory=[]}){
 const one=async(name,fn)=>{try{return await fn();}catch(e){if(e?.name==='AbortError')throw e;return {facts:[],gaps:['нет данных из '+name+': '+clip(e?.message||e,160)]};}};
 const [j,g]=await Promise.all([one('Jira',()=>jira(s,member,{from})),one('GitHub',()=>github(s,member,{from}))]);
 const m=meetings(memory,member,{from,to}),o=oneOnOne(s,member,{from,to});
 const facts=[...j.facts,...g.facts,...m.facts,...o.facts].filter(f=>f.date&&f.date>=from&&f.date<=to).sort((a,b)=>a.date.localeCompare(b.date)).map((f,i)=>({id:'F'+(i+1),...f}));
 return {facts,gaps:[...j.gaps,...g.gaps,...m.gaps,...o.gaps],links:{jira:j.link||''}};
}
module.exports={collect,jira,github,meetings,oneOnOne,githubReady,jiraConnected,INCIDENT,DAY,ymd};
