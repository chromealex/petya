// «Кто знает»: who in the team knows a subject («кто разбирается в сетевом коде», «к кому идти по магазину»), who
// wrote or last touched a piece of code. People are ranked by a transparent score from evidence only: git history of
// the project (recency-weighted lines in the subject's files), Jira issues that mention it (assignee, reporter,
// commenters), Slack messages and meeting speech Petya already keeps. Every point has a source the card links to.
// The local model only turns the subject into search words (English names as in code); it never names people.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const terms=require('./terms.cjs');
const git=require('./git.cjs');
const jira=require('./jira.cjs');
const talk=require('./talk.cjs');
const {People}=require('./people.cjs');
const ID='who-knows',BY='Кто знает';
const TOP=8;
const SOURCES={code:'код',jira:'Jira',slack:'Slack',meetings:'встречи'};
const round=n=>Math.round(n*10)/10;

async function modelTerms(s,topic){
 if(!s.settings.model)return {};
 try{
  const r=await kit.modelJSON(s,{system:'Тема вопроса о проекте игры. Верни слова для поиска в коде, истории git, задачах и переписке: английские названия, как их пишут в коде и путях файлов (например network, Shop, Inventory), и русские синонимы. Не называй людей. До 10 слов.',
   user:{topic},schema:{type:'object',properties:{terms:{type:'array',items:{type:'string'},maxItems:10}},required:['terms']},predict:200,temperature:0.1});
  return {terms:(r?.terms||[]).filter(t=>typeof t==='string'&&t.length<=40&&!/\s{2,}/.test(t)).slice(0,10)};
 }catch{return {};}
}

function team(s){try{return require('../../team.cjs').members(s.settings);}catch{return [];}}
function memoryItems(s){try{return s.memory?.prune?.()||[];}catch{return [];}}

async function repositories(s){
 if(!s.gitWorkspace)return {roots:[],note:'Git недоступен.'};
 try{const found=await s.gitWorkspace.discover();return {roots:found.repositories.slice(0,3),note:found.repositories.length?'':'В папках проекта нет Git-репозитория.'};}
 catch(e){return {roots:[],note:/локальных папок/iu.test(e.message)?'В контексте чата нет папки проекта с Git.':e.message};}
}

async function collect(s,topic,{now=Date.now()}={}){
 const people=new People(team(s));
 const search=terms.build(topic,await modelTerms(s,topic));
 const re=terms.textPattern(search.text);
 const sources=[];
 // Code: commits in the subject's files, by author, with recency.
 s.requestProgress?.report('Смотрю историю Git по теме');
 const repos=await repositories(s);
 if(!repos.roots.length)sources.push({kind:'code',state:'off',note:repos.note});
 for(const root of repos.roots){
  try{
   const r=await git.scan((...a)=>s.gitWorkspace.git(...a),root,search,{now});
   sources.push({kind:'code',state:r.commits.length?'ok':'empty',label:r.name,count:r.commits.length,files:r.matchedFiles,url:r.links?.base||''});
   for(const c of r.commits){
    const p=people.get({name:c.name,email:c.email});
    p.points.code+=c.weight;
    if(c.at>p.lastAt){p.lastAt=c.at;p.lastCommit={short:c.short,subject:c.subject,at:c.at,url:c.url,repo:r.name};}
    if(p.commits.length<40)p.commits.push({short:c.short,subject:c.subject,at:c.at,url:c.url,lines:c.lines,repo:r.name,byMessage:c.byMessage});
    for(const f of c.fileLines){const key=r.name+':'+f.file,old=p.files.get(key)||{path:f.file,repo:r.name,root,lines:0,commits:0,at:0,weight:0,url:r.fileUrl(f.file)};
     old.lines+=f.lines;old.commits++;old.at=Math.max(old.at,c.at);old.weight+=git.recency(c.at,now)*(1+Math.log10(1+f.lines));p.files.set(key,old);}
   }
  }catch(e){sources.push({kind:'code',state:'error',label:require('node:path').basename(root),note:e.message});}
 }
 // Jira: assignee 3, reporter 1, each comment 1 (up to 3 per issue), with recency.
 if(!s.workspace||!jira.connected(s.settings))sources.push({kind:'jira',state:'off',note:'Jira не подключена.'});
 else{
  s.requestProgress?.report('Ищу задачи Jira по теме');
  try{
   const r=await jira.issues(s,search.text);
   sources.push({kind:'jira',state:r.issues.length?'ok':'empty',count:r.issues.length,label:jira.projects(s.settings).join(', '),url:r.site&&r.jql?r.site+'/issues/?jql='+encodeURIComponent(r.jql):''});
   for(const i of r.issues){
    const roles=new Map();
    const add=(u,role,points,at)=>{if(!u)return;const p=people.get(u);const x=roles.get(p)||{roles:[],points:0,comments:0};
     if(role==='comment'){if(x.comments>=3)return;x.comments++;}else x.roles.push(role);
     x.points+=points*git.recency(at||i.updated,now);roles.set(p,x);};
    add(i.assignee,'исполнитель',3,i.updated);add(i.reporter,'автор',1,i.updated);
    for(const c of i.comments)add(c.author,'comment',1,c.at);
    for(const [p,x] of roles){p.points.jira+=x.points;const labels=[...x.roles,...x.comments?['комментарии: '+x.comments]:[]];
     p.issues.set(i.key,{key:i.key,summary:i.summary,status:i.status,url:i.url,at:i.updated,roles:labels,points:x.points});}
   }
  }catch(e){sources.push({kind:'jira',state:'error',note:e.message});}
 }
 // Slack and meetings: what Petya already keeps; 1 point per message (up to 3 per thread or meeting).
 const items=memoryItems(s);
 const slackItems=items.filter(i=>i.source==='Slack'&&i.messages?.length);
 if(!slackItems.length)sources.push({kind:'slack',state:'off',note:'В памяти Пети нет переписки Slack.'});
 else{
  const found=re?talk.slack(slackItems,re):[];
  sources.push({kind:'slack',state:found.length?'ok':'empty',count:found.length,threads:slackItems.length});
  const per=new Map();
  for(const m of found){const p=people.get({slack:m.user,name:m.user});const k=m.thread+'|'+m.user,n=per.get(k)||0;if(n>=3)continue;per.set(k,n+1);
   p.points.slack+=git.recency(m.at,now);if(!p.threads.has(m.thread)||p.threads.get(m.thread).at<m.at)p.threads.set(m.thread,{title:m.title,text:m.text,at:m.at,url:m.url});}
 }
 const talkItems=items.filter(i=>i.source==='Встреча'&&i.speaker&&i.sessionId);
 if(!talkItems.length)sources.push({kind:'meetings',state:'off',note:'Нет записанных встреч с именами говорящих.'});
 else{
  const found=re?talk.meetings(talkItems,re):[];
  sources.push({kind:'meetings',state:found.length?'ok':'empty',count:found.length,sessions:new Set(talkItems.map(i=>i.sessionId)).size});
  const per=new Map();
  for(const m of found){const p=people.get({name:m.speaker});const k=m.session+'|'+p.name,n=per.get(k)||0;if(n>=3)continue;per.set(k,n+1);
   p.points.meetings+=git.recency(m.at,now);const old=p.meetings.get(m.session);if(!old)p.meetings.set(m.session,{session:m.session,title:m.title,text:m.text,at:m.at,count:1});else old.count++;}
 }
 return {people:people.list(),sources,search};
}

// The card row of one person: points by source, total, evidence lists (most relevant first).
function row(p){
 const points=Object.fromEntries(Object.entries(p.points).map(([k,v])=>[k,round(v)]));
 // The total is the sum of the parts as shown, so the card always adds up.
 const score=round(Object.values(points).reduce((a,b)=>a+b,0));
 return {name:p.name,member:p.member,role:p.role,slackId:p.slackId||'',score,points,last:p.lastCommit,
  files:[...p.files.values()].sort((a,b)=>b.weight-a.weight).slice(0,6).map(({weight,root,...f})=>f),
  commits:p.commits.sort((a,b)=>b.at-a.at).slice(0,6),
  issues:[...p.issues.values()].sort((a,b)=>b.points-a.points||b.at-a.at).slice(0,6).map(({points,...i})=>i),
  threads:[...p.threads.values()].sort((a,b)=>b.at-a.at).slice(0,5),
  meetings:[...p.meetings.values()].sort((a,b)=>b.at-a.at).slice(0,4)};
}
const dateText=ms=>new Date(ms).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:new Date(ms).getFullYear()===new Date().getFullYear()?undefined:'numeric'});
function summary(rows,{topic,mode}){
 if(!rows.length)return 'По теме «'+topic+'» не нашёл следов ни в коде, ни в задачах, ни в переписке. Попробуйте назвать тему иначе — например, как класс или папку в коде.';
 if(mode==='last'){
  const last=rows.find(r=>r.last);
  if(last)return 'Последним «'+topic+'» трогал(а) '+last.name+' — '+dateText(last.last.at)+', «'+last.last.subject+'» ('+last.last.short+').'+(rows.length>1?' Всего причастных: '+rows.length+'.':'');
 }
 const parts=r=>Object.entries(r.points).filter(([,v])=>v>0).map(([k,v])=>SOURCES[k]+' '+v).join(', ');
 const head=mode==='author'?'Над «'+topic+'» больше всех работали':'По теме «'+topic+'» больше всех знают';
 return head+': '+rows.slice(0,3).map(r=>r.name+' ('+parts(r)+')').join('; ')+'. Основания — в карточке.';
}

async function whoTurn(s,command,ask,{now=Date.now()}={}){
 const {people,sources,search}=await collect(s,ask.topic,{now});
 const available=sources.filter(x=>x.state!=='off');
 if(!available.length)return kit.reply(s,command,{by:BY,question:true,text:'Мне не на что опереться: нет ни Git проекта, ни Jira, ни сохранённой переписки Slack, ни записанных встреч. Подключите папку проекта с Git в контексте чата или Jira в «Подключениях», обновите Slack — и спросите снова.'});
 let rows=people.map(row).filter(r=>r.score>0||r.last);
 rows.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
 if(ask.mode==='last')rows.sort((a,b)=>(b.last?.at||0)-(a.last?.at||0)||b.score-a.score);
 rows=rows.slice(0,TOP);
 const text=summary(rows,ask);
 const card={topic:ask.topic,mode:ask.mode,search:{paths:search.paths,identifiers:search.identifiers,text:search.text},people:rows,sources,
  calendar:s.settings.extension_calendar==='true',at:now};
 const links=[...rows.flatMap(r=>[...r.commits.slice(0,1).map(c=>c.url),...r.issues.slice(0,1).map(i=>i.url)])].filter(Boolean).slice(0,4);
 return kit.reply(s,command,{by:BY,text,data:{whoKnows:card},sources:links.map(url=>({title:/\/browse\//.test(url)?'Jira · '+url.split('/').pop():'Git · '+url.split('/').pop().slice(0,8),url}))});
}

// The card's «Показать в папке» for a file without a web link: only a file inside a repository of the current project.
function setup(s){
 return {ipc:{
  reveal:async(root,file)=>{
   const path=require('node:path'),fs=require('node:fs');
   const found=await s.gitWorkspace.discover();
   const repo=found.repositories.find(r=>path.basename(r)===String(root));
   if(!repo)throw Error('Этот репозиторий больше не подключён к проекту.');
   const full=path.resolve(repo,String(file||''));
   if(!full.startsWith(repo+path.sep)||!fs.existsSync(full))throw Error('Файла больше нет в репозитории.');
   require('electron').shell.showItemInFolder(full);return true;
  }
 }};
}

async function turn(s,command){
 const text=String(command||'');
 const ask=query.parse(text);
 if(!ask||!kit.installed(s,ID))return null;
 try{return await whoTurn(s,text,ask);}
 catch(e){return kit.failure(s,text,BY,e);}
}
module.exports={name:'whoKnows',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,whoTurn,collect,summary};
