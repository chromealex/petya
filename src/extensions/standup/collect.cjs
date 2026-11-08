// «Стендап», sources (read-only): Jira activity since the last standup (status transitions from the changelog,
// comments and worklogs of the people of «Команда»), their open issues (in progress = «сегодня», flagged / blocked
// = «блокеры»), git commits of the project's folders, and answers posted in a chosen Slack thread.
// Jira: POST /rest/api/3/search/jql (expand=changelog, fields comment/worklog), GET /rest/api/3/field (the «Flagged»
// field). Slack: GET conversations.replies. Git: `git log` in the project's local folders.
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const {adfText}=require('../../history.cjs');
const MAX_ISSUES=60;

const clip=(t,n=200)=>{t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t;};
const keyRe=/\b([A-Z][A-Z0-9_]{1,30}-\d{1,7})\b/;

// --- Jira -------------------------------------------------------------------------------------------------------------
function jiraReady(s){try{return require('../../workload.cjs').sources(s.settings,s.modules||require('../../modules.cjs')).jira;}catch{return false;}}
async function search(s,settings,body,pages=2){
 const out=[];let token='';
 for(let i=0;i<pages;i++){
  const r=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({...body,...token?{nextPageToken:token}:{}})},settings);
  out.push(...(r?.issues||[]));
  if(r?.isLast!==false||!r?.nextPageToken)break;token=r.nextPageToken;
 }
 return out;
}
async function flaggedField(s,settings){
 const cache=require('../../extension-cache.cjs').store(s.dataRoot,'standup');
 return cache.get('flagged:'+settings.jiraUrl,async()=>{
  const fields=await s.workspace.api('/rest/api/3/field',{},settings);
  return (Array.isArray(fields)?fields:[]).find(f=>f.custom&&/^(?:flagged|помечено|флаг)$/i.test(String(f.name||'')))?.id||'';
 },{ttl:7*86400000}).catch(()=>'');
}
const BLOCKED_STATUS=/block|блок|impediment|on hold|hold|ожида/i;
// Why an open issue is a blocker, or ''.
function blockedBy(f,flag){
 if(flag&&f[flag]&&(!Array.isArray(f[flag])||f[flag].length))return 'флаг';
 if(BLOCKED_STATUS.test(f.status?.name||''))return 'статус '+clip(f.status.name,40);
 if(/blocker|блокер/i.test(f.priority?.name||''))return 'приоритет '+clip(f.priority.name,40);
 const link=(f.issuelinks||[]).find(l=>/blocked by|заблокирован/i.test(l.type?.inward||'')&&l.inwardIssue&&l.inwardIssue.fields?.status?.statusCategory?.key!=='done');
 if(link)return 'ждёт '+link.inwardIssue.key;
 if((f.labels||[]).some(l=>/^block/i.test(l)))return 'метка '+(f.labels||[]).find(l=>/^block/i.test(l));
 return '';
}

// Activity per Jira account since `since`: {accountId:{issues:{KEY:{summary,url,transitions:[],comments,seconds}}}}
// and open issues per account: {accountId:{today:[],blockers:[]}}.
async function jira(s,{project,ids,since,now=new Date()}){
 const settings={...s.workspace.settings(),jiraProject:project};
 const site=String(settings.jiraUrl||'').replace(/\/+$/,''),url=k=>site+'/browse/'+encodeURIComponent(k);
 const minutes=Math.max(60,Math.ceil((now-since)/60000)+30);
 const at=v=>Date.parse(v||'');
 const fresh=v=>{const t=at(v);return Number.isFinite(t)&&t>=+since&&t<=+now;};
 const activity={},open={};
 const touch=(id,issue)=>{const a=activity[id]||(activity[id]={issues:{}});return a.issues[issue.key]||(a.issues[issue.key]={key:issue.key,summary:clip(issue.fields?.summary,160),url:url(issue.key),transitions:[],comments:0,seconds:0});};
 const updated=await search(s,settings,{jql:'project = "'+project+'" AND updated >= -'+minutes+'m ORDER BY updated DESC',maxResults:Math.min(MAX_ISSUES,100),fields:['summary','status','comment','worklog'],expand:'changelog'});
 for(const issue of updated.slice(0,MAX_ISSUES)){
  for(const h of issue.changelog?.histories||[]){
   const id=h.author?.accountId;if(!id||!fresh(h.created))continue;
   for(const item of h.items||[])if(item.field==='status')touch(id,issue).transitions.push(clip(item.fromString,40)+' → '+clip(item.toString,40));
  }
  for(const c of issue.fields?.comment?.comments||[]){const id=c.author?.accountId;if(id&&fresh(c.created))touch(id,issue).comments++;}
  for(const w of issue.fields?.worklog?.worklogs||[]){const id=w.author?.accountId;if(id&&fresh(w.started||w.created))touch(id,issue).seconds+=Number(w.timeSpentSeconds)||0;}
 }
 if(ids.length){
  const flag=await flaggedField(s,settings);
  const rows=await search(s,settings,{jql:'project = "'+project+'" AND assignee in ('+ids.map(id=>JSON.stringify(id)).join(',')+') AND statusCategory != Done ORDER BY updated DESC',maxResults:100,
   fields:['summary','status','priority','issuelinks','labels','assignee','updated',...flag?[flag]:[]]},2);
  for(const issue of rows){
   const f=issue.fields||{},id=f.assignee?.accountId;if(!id)continue;
   const o=open[id]||(open[id]={today:[],blockers:[]});
   const why=blockedBy(f,flag);
   if(why)o.blockers.push({key:issue.key,url:url(issue.key),text:clip(f.summary,140)+' — '+why});
   else if(f.status?.statusCategory?.key==='indeterminate'&&o.today.length<4)o.today.push({key:issue.key,url:url(issue.key),text:clip(f.summary,140)+' ('+clip(f.status.name,30)+')'});
  }
 }
 return {activity,open,site};
}

// --- Git --------------------------------------------------------------------------------------------------------------
function runGit(dir,args){
 return new Promise((resolve,reject)=>execFile('git',['-C',dir,...args],{timeout:15000,maxBuffer:4e6,windowsHide:true},(e,out)=>e?reject(e):resolve(String(out))));
}
async function commits(folders,{since,git=runGit}){
 const out=[],warnings=[];
 for(const dir of folders.slice(0,4)){
  if(!fs.existsSync(path.join(dir,'.git')))continue;
  try{
   const text=await git(dir,['log','--all','--no-merges','--since='+since.toISOString(),'-n','300','--format=%an%x1f%ae%x1f%s%x1f%cI']);
   for(const line of text.split('\n').filter(Boolean)){const [name,email,subject,date]=line.split('\x1f');out.push({name,email:String(email||'').toLowerCase(),subject:clip(subject,160),date,repo:path.basename(dir)});}
  }catch(e){warnings.push('git '+path.basename(dir)+': '+clip(e.message,80));}
 }
 return {commits:out,warnings};
}

// --- Slack ------------------------------------------------------------------------------------------------------------
// https://team.slack.com/archives/C0123/p1731398400123456 (optionally ?thread_ts=…) → {channel, ts, url}.
function thread(link){
 try{
  const u=new URL(String(link||'').trim());
  if(u.protocol!=='https:'||!/(^|\.)slack\.com$/.test(u.hostname))return null;
  const m=/^\/archives\/([CGD][A-Z0-9]{5,})\/p(\d{10})(\d{6})$/.exec(u.pathname);if(!m)return null;
  const ts=u.searchParams.get('thread_ts');
  return {channel:m[1],ts:ts&&/^\d{10}\.\d{6}$/.test(ts)?ts:m[2]+'.'+m[3],url:u.origin+u.pathname+(ts?'?thread_ts='+ts:'')};
 }catch{return null;}
}
function slackReady(s){try{return (s.modules||require('../../modules.cjs')).enabled(s.settings,'slack')&&!!(s.settings.slackToken||s.settings.slackCredential);}catch{return false;}}
// Slack mrkdwn → plain text: <@U1|name> → @name, <url|text> → text, &amp; → &.
const plain=t=>String(t||'').replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g,(_,id,n)=>'@'+(n||id)).replace(/<(?:https?:\/\/|mailto:)[^|>]+\|([^>]+)>/g,'$1').replace(/<((?:https?:\/\/)[^>]+)>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
async function replies(s,t,{since}){
 const out=[];let cursor='';
 for(let page=0;page<3;page++){
  const q=new URLSearchParams({channel:t.channel,ts:t.ts,limit:'200',...cursor?{cursor}:{}});
  const r=await s.request('https://slack.com/api/conversations.replies?'+q,{headers:{Authorization:'Bearer '+(s.settings.slackToken||'')}});
  if(!r?.ok)throw Error('Slack: '+(r?.error==='thread_not_found'||r?.error==='channel_not_found'?'тред не найден или нет доступа к каналу':r?.error==='missing_scope'?'нет прав на чтение истории канала (channels:history / groups:history)':String(r?.error||'нет ответа')));
  out.push(...(r.messages||[]));
  cursor=String(r.response_metadata?.next_cursor||'').trim();if(!r.has_more||!cursor)break;
 }
 const rootAt=Number(t.ts)*1000,from=rootAt>=+since?rootAt:+since;
 return out.filter(m=>m.ts!==t.ts&&!m.bot_id&&m.subtype!=='bot_message'&&m.user&&Number(m.ts)*1000>=from).map(m=>({user:m.user,name:clip(m.user_profile?.real_name||m.user_profile?.display_name||'',80),text:plain(m.text).slice(0,3000),at:Number(m.ts)*1000}));
}

// «Вчера: …  Сегодня: …  Блокеры: нет» → three lists; null when the answer has no such markers.
const MARK=/(^|[\n;.]\s*|\s)(вчера|сделал[аи]?|yesterday|done|сегодня|today|план(?:ы)?(?:\s+на\s+сегодня)?|буду|блокер\p{L}*|блокир\p{L}*|проблем\p{L}*|blockers?|мешает)\s*[:—–-]\s*/giu;
const NONE=/^(?:нет|ничего|не\s+было|отсутствуют|no|none|nope|n\/a|-|—)\.?$/iu;
function split(text){
 const marks=[...String(text).matchAll(MARK)];if(!marks.length)return null;
 const part=w=>/^(?:вчера|сделал|yesterday|done)/iu.test(w)?'yesterday':/^(?:сегодня|today|план|буду)/iu.test(w)?'today':'blockers';
 const out={yesterday:[],today:[],blockers:[]};
 marks.forEach((m,i)=>{
  const start=m.index+m[0].length,end=i+1<marks.length?marks[i+1].index+marks[i+1][1].length:text.length;
  const items=text.slice(start,end).split(/\n+|;\s*|\s+[•·]\s+|^\s*[-*•]\s+/mu).map(x=>x.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean).filter(x=>!NONE.test(x));
  out[part(m[2])].push(...items.map(x=>clip(x,200)));
 });
 return out;
}

module.exports={jiraReady,jira,blockedBy,commits,thread,slackReady,replies,split,plain,clip,keyRe};
