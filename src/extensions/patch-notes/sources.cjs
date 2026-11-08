// «Патчноуты», the changes of a release by code: Jira issues of a version or sprint, commits between two tags of
// the project's git repository (local, or through GitHub's compare API) and merged pull requests of that period.
// Each change keeps its source reference (PET-12, a1b2c3d, #123); internal ones are marked by labels, components
// and conventional commit types from the settings, never dropped silently. Nothing here writes anywhere.
const github=require('../github/client.cjs');
const KEY=/(?:^|[^A-Z0-9])([A-Z][A-Z0-9_]{1,9}-\d{1,7})(?!\d)/g;
const GROUPS=['feature','improvement','fix'];
const DEFAULT_LABELS='internal, tech-debt, techdebt, refactoring, no-release-notes, ci, qa-only';
const INTERNAL_TYPES=/^(?:chore|ci|build|test|tests|refactor|docs|style|wip)(?:\([^)]*\))?!?:/i;

// --- Request -------------------------------------------------------------------------------------------------
// «к версии 1.5», «между v1.4 и v1.5», «спринт 12», «текущий спринт».
function refs(text){
 const t=String(text||'');
 const versions=[...new Set([...t.matchAll(/(?:^|[\s«"(])(v?\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.]+)?)(?=$|[\s»"),;:!?]|\.(?:\s|$))/giu)].map(m=>m[1]))];
 const n=/(?:спринт\p{L}*|sprint)\s*(?:№\s*)?(\d{1,4})(?!\d)/iu.exec(t)?.[1];
 const sprint=n?{number:Number(n)}:/(?:текущ|эт)\p{L}*\s+спринт/iu.test(t)?{state:'active'}:/(?:прошл|последн|предыдущ)\p{L}*\s+спринт/iu.test(t)?{state:'last'}:null;
 return {versions,sprint};
}
// «v1.5.0», «release-1.5», «1.5» are the same version.
const plainVersion=v=>String(v||'').toLowerCase().replace(/^(?:release|version|ver|rel|v)[-_/ ]?/,'').replace(/^v/,'').replace(/(?:\.0)+$/,'');
function compareVersions(a,b){const x=plainVersion(a).split(/[.-]/).map(Number),y=plainVersion(b).split(/[.-]/).map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d||Number.isNaN(d))return Number.isNaN(d)?0:d;}return 0;}
const versionLike=tag=>/^(?:release|version|ver|rel|v)?[-_/]?\d+(?:\.\d+)+/i.test(tag);
// The tag of a version and the previous version tag (by version order) when the start is not named.
function tagRange(tags,versions){
 const list=tags.filter(versionLike);
 const find=v=>list.find(t=>t===v)||list.find(t=>plainVersion(t)===plainVersion(v))||null;
 if(versions.length>=2){const [a,b]=versions.slice(0,2).sort(compareVersions);return {from:find(a),to:find(b),fromName:a,toName:b};}
 if(!versions.length)return null;
 const to=find(versions[0]);if(!to)return {from:null,to:null,toName:versions[0]};
 const older=list.filter(t=>compareVersions(t,to)<0).sort(compareVersions);
 return {from:older.at(-1)||null,to,toName:versions[0]};
}

// --- Classification ------------------------------------------------------------------------------------------------
function settingsList(value,fallback=''){return String(value??fallback).split(/[,;\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean);}
function kind({type='',title='',labels=[]}){
 const l=labels.map(x=>x.toLowerCase());
 if(l.some(x=>/^(?:bug|fix|bugfix|баг)$/.test(x))||/bug|баг|ошибк|дефект/i.test(type))return 'fix';
 if(l.some(x=>/^(?:feature|enhancement|фича|new)$/.test(x))||/story|feature|epic|истори|фича|new/i.test(type))return 'feature';
 if(/improvement|улучш/i.test(type))return 'improvement';
 const m=/^(feat|fix|perf)(?:\([^)]*\))?!?:/i.exec(title);
 if(m)return {feat:'feature',fix:'fix',perf:'improvement'}[m[1].toLowerCase()];
 if(/^(?:fix|fixed|исправ|почин|hotfix)|(?:^|\s)(?:fix(?:es|ed)?|исправлен\p{L}*|crash|вылет\p{L}*|краш\p{L}*)(?=$|[^\p{L}])/iu.test(title))return 'fix';
 if(/^(?:add|added|new|добав|нов|introduc|implement|реализ)/iu.test(title))return 'feature';
 return 'improvement';
}
// Why a change is internal ('' when it is for players).
function internal({labels=[],components=[],title='',subtask=false},settings){
 const L=settingsList(settings.patchNotesInternalLabels,DEFAULT_LABELS),C=settingsList(settings.patchNotesInternalComponents);
 const label=labels.find(x=>L.includes(String(x).toLowerCase()));if(label)return 'метка '+label;
 const component=components.find(x=>C.includes(String(x).toLowerCase()));if(component)return 'компонент '+component;
 if(INTERNAL_TYPES.test(title))return 'тип '+title.split(/[(:!]/)[0].toLowerCase();
 if(/^(?:merge (?:branch|remote)|bump (?:version|build)|version bump|wip\b)/i.test(title))return 'служебный коммит';
 if(subtask)return 'подзадача';
 return '';
}
// Conventional prefixes and keys are noise for players: «feat(shop): PET-12 add bundles» → «add bundles».
const cleanTitle=t=>String(t||'').replace(/^(?:feat|fix|perf|chore|ci|build|test|refactor|docs|style)(?:\([^)]*\))?!?:\s*/i,'').replace(/\s*\(#\d+\)\s*$/,'').replace(/^\s*\[?[A-Z][A-Z0-9_]{1,9}-\d+\]?[:\s-]*/,'').trim().slice(0,300);
function item(settings,{source,ref,title,type='',labels=[],components=[],url='',done=true,subtask=false,at=''}){
 const why=internal({labels,components,title,subtask},settings);
 return {id:source+':'+ref,source,ref,title:cleanTitle(title)||String(title).slice(0,300),raw:String(title).slice(0,300),group:kind({type,title,labels}),labels:labels.slice(0,10),components:components.slice(0,10),url,done,internal:why,
  include:!why&&done,at,also:[]};
}
// A commit or PR naming a Jira issue of the list (or a commit naming a PR) joins it as an extra reference instead of
// repeating the same change. Order: Jira issues, pull requests, commits.
function merge(items){
 const jira=new Map(items.filter(i=>i.source==='jira').map(x=>[x.ref,x]));
 const out=[...jira.values()],owners=new Map();
 const keyOwner=x=>[...x.raw.matchAll(KEY)].map(m=>jira.get(m[1])).find(Boolean)||null;
 for(const x of items.filter(i=>i.source==='pr')){
  const owner=keyOwner(x);
  if(owner){owner.also.push({source:x.source,ref:x.ref,url:x.url});owners.set(x.ref,owner);}else{out.push(x);owners.set(x.ref,x);}
 }
 for(const x of items.filter(i=>i.source==='commit')){
  const pr=/\(#(\d+)\)\s*$|Merge pull request #(\d+)/.exec(x.raw);
  const owner=keyOwner(x)||(pr?owners.get('#'+(pr[1]||pr[2])):null);
  if(owner)owner.also.push({source:x.source,ref:x.ref,url:x.url});else out.push(x);
 }
 return out;
}

// --- Jira --------------------------------------------------------------------------------------------------------
const projectKeys=settings=>require('../../jira-selection.cjs').keys(settings.jiraProjects||settings.jiraProject).filter(k=>/^[A-Z][A-Z0-9_]{1,9}$/.test(k));
const quote=v=>'"'+String(v).replace(/["\\]/g,'')+'"';
async function jiraSearch(s,jql){
 const out=[];let token='';
 for(let page=0;page<3;page++){
  const r=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['summary','issuetype','labels','components','status'],...token?{nextPageToken:token}:{}})});
  out.push(...(r?.issues||[]));token=r?.nextPageToken||'';if(!token||r?.isLast)break;
 }
 return out;
}
const jiraItem=(s,i)=>item(s.settings,{source:'jira',ref:String(i.key),title:String(i.fields?.summary||''),type:String(i.fields?.issuetype?.name||''),subtask:!!i.fields?.issuetype?.subtask,
 labels:(i.fields?.labels||[]).map(String),components:(i.fields?.components||[]).map(c=>String(c.name||'')),done:i.fields?.status?.statusCategory?.key==='done',
 url:/^https:\/\//.test(s.settings.jiraUrl||'')?String(s.settings.jiraUrl).replace(/\/+$/,'')+'/browse/'+encodeURIComponent(i.key):''});
// Versions of the chosen projects, newest first: [{name, released, project}].
async function jiraVersions(s){
 const out=[];
 for(const key of projectKeys(s.settings).slice(0,5)){const list=await s.workspace.api('/rest/api/3/project/'+encodeURIComponent(key)+'/versions');for(const v of Array.isArray(list)?list:[])if(!v.archived)out.push({name:String(v.name||''),released:!!v.released,project:key,date:v.releaseDate||''});}
 return out.sort((a,b)=>compareVersions(b.name,a.name));
}
async function fromJira(s,{versions,sprint},notes){
 const keys=projectKeys(s.settings);if(!keys.length){notes.push('Jira: не выбран проект — версии не искал.');return {items:[],label:''};}
 const scope='project in ('+keys.join(',')+')';
 if(versions.length===1||versions.length&&!sprint){
  const want=[...versions].sort(compareVersions).at(-1);const all=await jiraVersions(s);
  const v=all.find(x=>x.name===want)||all.find(x=>plainVersion(x.name)===plainVersion(want))||all.find(x=>plainVersion(x.name).endsWith(' '+plainVersion(want)));
  if(!v){notes.push('Jira: версии «'+want+'» нет в '+keys.join(', ')+'.');return {items:[],label:''};}
  return {items:(await jiraSearch(s,scope+' AND fixVersion = '+quote(v.name)+' ORDER BY key ASC')).map(i=>jiraItem(s,i)),label:'Jira · версия '+v.name};
 }
 if(sprint){
  let jql,label;
  if(sprint.state==='active'){jql=scope+' AND sprint in openSprints()';label='Jira · текущий спринт';}
  else{
   const boards=await s.workspace.api('/rest/agile/1.0/board?'+new URLSearchParams({projectKeyOrId:keys[0],maxResults:'5'}));
   const board=(boards?.values||[]).find(b=>b.type==='scrum')||boards?.values?.[0];
   if(!board){notes.push('Jira: у проекта '+keys[0]+' нет доски со спринтами.');return {items:[],label:''};}
   const list=(await s.workspace.api('/rest/agile/1.0/board/'+encodeURIComponent(board.id)+'/sprint?'+new URLSearchParams({state:'active,closed',maxResults:'50'})))?.values||[];
   const found=sprint.number?list.find(x=>new RegExp('(?:^|\\D)'+sprint.number+'(?:\\D|$)').test(x.name)):list.filter(x=>x.state==='closed').sort((a,b)=>String(b.endDate||'').localeCompare(String(a.endDate||'')))[0];
   if(!found){notes.push('Jira: спринт '+(sprint.number||'')+' не найден на доске «'+board.name+'».');return {items:[],label:''};}
   jql=scope+' AND sprint = '+Number(found.id);label='Jira · '+found.name;
  }
  return {items:(await jiraSearch(s,jql+' ORDER BY key ASC')).map(i=>jiraItem(s,i)),label};
 }
 return {items:[],label:''};
}

// --- Git (the project's repository on this computer) ------------------------------------------------------------------
async function localRepo(s){try{const found=await s.gitWorkspace?.discover?.();return found?.selected||'';}catch{return '';}}
async function localTags(s,root){return String(await s.gitWorkspace.git(root,['tag','--list','--sort=-creatordate'])).split('\n').map(x=>x.trim()).filter(t=>t&&!t.startsWith('-')).slice(0,300);}
async function fromGit(s,root,range){
 const out=String(await s.gitWorkspace.git(root,['log','--no-merges','-n','400','--format=%H%x1f%s%x1f%aI%x1e',range.from+'..'+range.to]));
 return out.split('\x1e').map(r=>r.trim()).filter(Boolean).map(r=>{const [sha,subject,at]=r.split('\x1f');return item(s.settings,{source:'commit',ref:sha.slice(0,7),title:subject,at});});
}

// --- GitHub: compare between tags and merged PRs of that period -----------------------------------------------------------
async function fromGithub(s,repo,range,{commits=true}={}){
 const api=github.create(s);
 const enc=v=>encodeURIComponent(v);
 const cmp=await api.get('/repos/'+github.validRepo(repo)+'/compare/'+enc(range.from)+'...'+enc(range.to));
 const list=(cmp?.commits||[]).filter(c=>(c.parents||[]).length<2);
 const items=commits?list.map(c=>item(s.settings,{source:'commit',ref:String(c.sha).slice(0,7),title:String(c.commit?.message||'').split('\n')[0],url:/^https:\/\/github\.com\//.test(c.html_url||'')?c.html_url:'',at:c.commit?.committer?.date||''})):[];
 const since=cmp?.merge_base_commit?.commit?.committer?.date,until=list.at(-1)?.commit?.committer?.date;
 if(since&&until){
  const q='repo:'+repo+' is:pr is:merged merged:'+new Date(since).toISOString().slice(0,19)+'+00:00..'+new Date(until).toISOString().slice(0,19)+'+00:00';
  const found=await api.get('/search/issues',{q,per_page:100,sort:'created',order:'asc'});
  for(const pr of found?.items||[])items.push(item(s.settings,{source:'pr',ref:'#'+pr.number,title:String(pr.title||''),labels:(pr.labels||[]).map(l=>String(l.name||'')),url:/^https:\/\/github\.com\//.test(pr.html_url||'')?pr.html_url:''}));
 }
 return items;
}
async function githubTags(s,repo){const r=await github.create(s).get('/repos/'+github.validRepo(repo)+'/tags',{per_page:100});return (Array.isArray(r)?r:[]).map(t=>String(t.name||'')).filter(Boolean);}

// What can be read: {jira, git: local root, github: repo}.
async function available(s){
 const jira=require('../../workload.cjs').sources(s.settings,s.modules||require('../../modules.cjs')).jira;
 const git=await localRepo(s);
 let repo='';if(github.connected(s.settings)){try{repo=(await github.repos(s))[0]||'';}catch{repo='';}}
 return {jira,git,github:repo};
}
// Everything of one release. Returns {items, sources:[labels], range, notes}.
async function collect(s,request,have){
 const notes=[],labels=[],all=[];
 const r=refs(request);
 let range=null;
 const fail=(where,e)=>{if(e.name==='AbortError')throw e;notes.push(where+': '+e.message);};
 if(have.jira&&(r.versions.length||r.sprint)){
  try{const j=await fromJira(s,r,notes);all.push(...j.items);if(j.label)labels.push(j.label);}catch(e){fail('Jira',e);}
 }
 if(r.versions.length&&(have.git||have.github)){
  try{
   const tags=have.git?await localTags(s,have.git):await githubTags(s,have.github);
   range=tagRange(tags,r.versions);
   if(range?.from&&range.to){
    if(have.git){all.push(...await fromGit(s,have.git,range));labels.push('git · '+range.from+'..'+range.to);}
    if(have.github){try{all.push(...await fromGithub(s,have.github,range,{commits:!have.git}));labels.push('GitHub · '+have.github);}catch(e){fail('GitHub',e);}}
   }else if(range?.to&&!range.from)notes.push('Git: нет тега версии раньше '+range.to+' — коммиты не собраны.');
   else notes.push('Git: тега версии '+(r.versions.at(-1))+' нет.');
  }catch(e){fail('Git',e);}
 }
 return {items:merge(all),sources:labels,range,notes};
}
module.exports={refs,tagRange,plainVersion,compareVersions,kind,internal,cleanTitle,item,merge,available,collect,jiraVersions,localTags,githubTags,GROUPS,DEFAULT_LABELS};
