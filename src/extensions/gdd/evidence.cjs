// «Геймдизайн-документ», what a section is drafted from (everything only read):
// - configs, through the reader of «Конфиги и баланс» (`config-balance/files.cjs`: Unity ScriptableObject `.asset`,
//   JSON, CSV — every value keeps its file and line): numeric fields of the configs about the topic become facts
//   cited as `file:line`;
// - this chat (the last 16 messages that share a concept with the topic), meeting summaries of the last 120 days
//   (decisions and discussed points) and Jira epics (`POST /rest/api/3/search/jql`, `issuetype = Epic`) — each a
//   source line cited by its label;
// - systems in code and configs, for «чего не хватает в GDD».
const path=require('node:path');
const diff=require('../doc-diff/diff.cjs');
const DAY=86400000;
const clip=(t,n=300)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const reader=()=>require('../config-balance/files.cjs');

// --- Configs --------------------------------------------------------------------------------------------------------
async function configs(roots,topic,{scan}={}){
 const r=scan||await reader().scan(roots);
 const sets=[];
 for(const set of r.sets){
  const label=set.label+' '+set.files.join(' ');
  const whole=diff.overlap(topic,label)>0;
  const facts=[];
  for(const o of set.objects.slice(0,40)){
   // A config about the topic gives every number; any other config only its fields named like the topic.
   const objHit=whole;
   for(const [field,value] of Object.entries(o.fields)){
    if(typeof value!=='number'||!Number.isFinite(value))continue;
    if(!objHit&&!diff.overlap(topic,field))continue;
    const line=o.lines?.[field];if(!line)continue;
    const names=[o.id,o.name,o.fields.displayName,o.fields.name,o.fields.title].filter(v=>typeof v==='string'&&v.trim()).map(String);
    facts.push({object:String(o.fields.displayName||o.name||o.id),id:String(o.id),names,field,value,file:o.file,line,cite:o.file+':'+line});
   }
  }
  if(facts.length)sets.push({id:set.id,label:set.label,kind:set.kind,files:set.files,facts:facts.slice(0,60),whole});
 }
 sets.sort((a,b)=>Number(b.whole)-Number(a.whole)||b.facts.length-a.facts.length);
 return sets.slice(0,3);
}

// --- Chat, meetings, Jira ------------------------------------------------------------------------------------------------
function chat(s,topic){
 const t=s.dialogue.active();
 const rows=(t?.messages||[]).filter(m=>(m.role==='user'||m.role==='assistant')&&String(m.text||'').trim()).slice(-16);
 return rows.filter(m=>diff.overlap(topic,m.text)>0).slice(-4).map(m=>({kind:'chat',label:'чат «'+clip(t.title||'Чат',40)+'»',text:clip(m.text,400)}));
}
function meetings(s,topic,now){
 let memory=[];try{memory=s.memory?.prune?.()||[];}catch{memory=[];}
 const out=[];
 for(const r of memory.filter(x=>x?.kind==='summary'&&x.summary&&+now-Number(x.at)<=120*DAY).sort((a,b)=>b.at-a.at)){
  for(const part of ['decisions','discussed'])for(const line of (r.summary[part]||[]).map(String))
   if(diff.overlap(topic,line)>0)out.push({kind:'meeting',label:'встреча «'+clip(String(r.title||'Встреча').replace(/^Сводка встречи\s*·\s*/,''),40)+'»',text:clip(line,400)});
  if(out.length>=5)break;
 }
 return out.slice(0,5);
}
const jiraReady=settings=>settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
async function epics(s,topic){
 if(!s.workspace?.api||!jiraReady(s.settings))return [];
 const adf=require('../jira/search-source.cjs').adfText;
 const terms=[...new Set([...diff.words(topic).map(w=>/^[а-я]+$/u.test(w)&&w.length>=4?diff.stem(w)+'*':w),...[...diff.concepts(topic)].filter(c=>/^[a-z]{4,}$/.test(c))])].filter(w=>/^[\p{L}\p{N}*]{3,30}$/u.test(w)).slice(0,6);
 if(!terms.length)return [];
 const keys=String(s.settings.jiraProjects||s.settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));
 const q=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
 const jql=(keys.length?'project IN ('+keys.map(q).join(',')+') AND ':'')+'issuetype = Epic AND ('+terms.map(t=>'text ~ '+q(t)).join(' OR ')+') ORDER BY updated DESC';
 const r=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:5,fields:['summary','description','status']})},{...s.settings});
 const site=String(s.settings.jiraUrl||'').replace(/\/+$/,'');
 return (r?.issues||[]).filter(i=>/^[A-Z][A-Z0-9_]*-\d+$/.test(i.key||'')).map(i=>({kind:'jira',label:i.key,url:site+'/browse/'+i.key,text:clip(String(i.fields?.summary||'')+'. '+adf(i.fields?.description),500)}));
}

// --- Systems in code and configs (for the gaps) --------------------------------------------------------------------------
// [{name, words, files:[...], kind:'config'|'code'}]
async function systems(roots,{scan}={}){
 const r=scan||await reader().scan(roots);
 const out=new Map();
 const add=(name,kind,file)=>{
  const clean=String(name).replace(/(?:Config|Configs|Settings|Data|Database|Table|Manager|Controller|System|Service|Definition|Def|SO)$/,'').replace(/[_-]+/g,' ').trim();
  if(clean.length<3)return;
  const k=diff.stem(diff.norm(clean).replace(/\s+/g,''));
  const e=out.get(k)||{name:clean[0].toUpperCase()+clean.slice(1),kind,files:[]};if(!e.files.includes(file))e.files.push(file);out.set(k,e);
 };
 for(const set of r.sets){
  if(set.kind==='asset')add(set.label.split(' · ')[0],'config',set.files[0]);
  else for(const f of set.files)add(path.posix.basename(f).replace(/\.[^.]+$/,''),'config',f);
 }
 // Code: folders of scripts (Assets/Scripts/Leagues, src/economy …) with at least two source files.
 const files=await reader().walk(roots,{depth:6,dirs:3000});
 const per=new Map();
 for(const f of files){if(!/\.(?:cs|ts|js|gd|lua|cpp|py|go|kt|swift)$/i.test(f.name))continue;const rel=path.relative(f.root,path.dirname(f.full)).split(path.sep).join('/');const m=/(?:^|\/)(?:Assets\/Scripts|Scripts|src|Source|scripts)\/([A-Za-z][\w-]{2,40})(?:\/|$)/.exec(rel);if(!m)continue;const k=m[1];const list=per.get(k)||[];list.push(path.relative(f.root,f.full).split(path.sep).join('/'));per.set(k,list);}
 for(const [dir,list] of per)if(list.length>=2&&!/^(?:core|common|utils?|helpers?|editor|tests?|ui|shared|base|infrastructure|generated|plugins?|thirdparty|vendor)$/i.test(dir))add(dir,'code',list[0]);
 return [...out.values()].slice(0,60);
}

module.exports={configs,chat,meetings,epics,systems,jiraReady};
