// «Архитектурные решения»: ADRs in the project's `docs/adr/NNNN-slug.md`.
// - «запиши решение: …», «оформи ADR про переход на Addressables» draft an ADR (context, decision, alternatives,
//   consequences) from the user's words, this chat, meeting summaries and the semantic index (when it is on). The
//   card shows the exact file — path and full text — and writes it only on «Сохранить в проект» (IPC `save`, which
//   re-checks the path and never overwrites). The same text can go to Google Docs through `document-export` or to a
//   Confluence page (own button, only when Confluence and its space are connected), each after a press.
// - «какие решения принимали про сеть» searches the ADRs (stems over title / decision / the rest, plus the semantic
//   index when it is on).
// - «противоречит ли это решению про сеть» compares a statement with the related ADRs: the model's verdict counts only
//   with a verbatim quote of the ADR; without a model the related decisions are shown to compare by eye.
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const adr=require('./adr.cjs');
const ID='adr',BY='Архитектурные решения';
const DAY=86400000;
const clip=(t,n=300)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const cap=t=>{const v=String(t||'').trim();return v?v[0].toLocaleUpperCase('ru')+v.slice(1):v;};

// --- Routing --------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[?!]+$/u,'').replace(/\.$/u,'').trim();
const ADR_WORD='(?:ADR|адр|эй-?ди-?ар|архитектурн\\p{L}*\\s+решени\\p{L}*)';
const RECORD=[
 /^(?:запиши|зафиксируй|задокументируй|сохрани|оформи)\s+(?:наше\s+|это\s+|архитектурн\p{L}*\s+)?решени[ея]\s*[:—–-]\s*([\s\S]{3,2000})$/iu,
 new RegExp('^(?:оформи|напиши|составь|создай|заведи|подготовь|запиши)\\s+(?:нов\\p{L}*\\s+)?'+ADR_WORD+'\\s*(?:(?:про|о|об|по|на\\s+тему|насч[её]т)\\s+|[:—–-]\\s*)([\\s\\S]{3,2000})$','iu')
];
const SEARCH=[
 /^(?:а\s+)?(?:какие|какое|что\s+за)\s+(?:архитектурн\p{L}*\s+)?(?:решени[яе]|ADR|адр)\s+(?:мы\s+)?(?:принимали|приняли|принято|были|есть|у\s+нас(?:\s+(?:есть|были))?)\s+(?:про|по|о|об|насч[её]т|касательно|по\s+поводу)\s+(.{2,200})$/iu,
 new RegExp('^(?:найди|покажи|поищи|есть\\s+ли)\\s+(?:нам\\s+)?'+ADR_WORD+'\\s+(?:про|по|о|об|насч[её]т)\\s+(.{2,200})$','iu')
];
const LIST=new RegExp('^(?:покажи|список|перечисли|какие)\\s+(?:все\\s+|наши\\s+)?(?:ADR|адр|архитектурн\\p{L}*\\s+решени\\p{L}*)(?:\\s+(?:есть|у\\s+нас|в\\s+проекте|проекта)){0,2}$','iu');
const CHECK=/^(?:а\s+)?(?:не\s+)?противоречит\s+ли\s+(?:(.+?)\s+)?(?:(?:нашим|нашему|принятым|принятому|прошлым|прошлому|архитектурн\p{L}*|существующ\p{L}*)\s+)*(?:решени\p{L}*|ADR|адр)(?:\s+([^:]{1,200}?))?\s*(?::\s*([\s\S]{3,2000}))?$/iu;
// A meeting's own decisions are Petya's meeting summary, not ADRs.
const MEETING=/встреч|созвон|совещани|планерк|планёрк|митинг|синк|дейли|стендап/iu;
function kind(text){
 const t=clean(text);
 if(!t||/^\/|(?:^|\s)скилл/iu.test(t))return null;
 for(const r of RECORD){const m=r.exec(t);if(m)return {kind:'record',statement:m[1].trim(),form:r===RECORD[0]?'decision':'topic'};}
 for(const r of SEARCH){const m=r.exec(t);if(m&&!MEETING.test(m[1]))return {kind:'search',query:m[1].trim()};}
 if(LIST.test(t))return {kind:'list'};
 const c=CHECK.exec(t);
 if(c){
  const target=String(c[2]||'').replace(/^(?:про|о|об|по|насч[её]т)\s+/iu,'').trim();
  const before=String(c[1]||'').trim();
  const subject=(c[3]||'').trim()||(/^(?:это|этот\s+вариант|это\s+предложение|такое|)$/iu.test(before)?'':before);
  if(MEETING.test(target))return null;
  return {kind:'check',subject,target};
 }
 return null;
}

// --- Project folder -----------------------------------------------------------------------------------------------
function folders(s){
 try{
  const state=s.dialogue.state||{},topic=s.dialogue.active();
  const project=(state.projects||[]).find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId)).filter(d=>{try{return fs.statSync(d).isDirectory();}catch{return false;}});
 }catch{return [];}
}
// The folder whose docs/adr exists, else a git repository, else the only folder; several → a question.
function folder(s,resume){
 const list=folders(s);
 if(!list.length)return {question:'Привяжите к чату папку проекта (в настройках проекта) — решения хранятся в её docs/adr.'};
 const withAdr=list.filter(d=>fs.existsSync(path.join(d,adr.DIR)));
 if(withAdr.length===1)return withAdr[0];
 const pool=withAdr.length?withAdr:list;
 const git=pool.filter(d=>fs.existsSync(path.join(d,'.git')));
 if(pool.length===1)return pool[0];
 if(git.length===1)return git[0];
 const label=d=>path.basename(d)+' · '+d;
 return ask({text:'В проекте несколько папок. В какой хранить решения (docs/adr)?',label:'Папка',options:pool.slice(0,8).map(label),strictChoices:true},answer=>resume(pool.find(d=>label(d)===String(answer).trim())));
}

// --- Evidence ------------------------------------------------------------------------------------------------------
function chatEvidence(s,query){
 const topic=s.dialogue.active();
 const stems=adr.words(query).map(adr.stem);
 const rows=(topic?.messages||[]).filter(m=>(m.role==='user'||m.role==='assistant')&&String(m.text||'').trim()).slice(-16);
 const fits=m=>stems.length&&adr.words(m.text).some(w=>stems.some(x=>w.startsWith(x)));
 return rows.filter(fits).slice(-4).map(m=>({kind:'chat',label:'Чат «'+clip(topic.title||'Чат',60)+'»'+(m.role==='user'?'':' · ответ Пети'),text:clip(m.text,400)}));
}
function meetingEvidence(s,query,now){
 let memory=[];try{memory=s.memory?.prune?.()||[];}catch{memory=[];}
 const stems=adr.words(query).map(adr.stem);if(!stems.length)return [];
 const out=[];
 for(const r of memory.filter(x=>x?.kind==='summary'&&x.summary&&+now-Number(x.at)<=120*DAY).sort((a,b)=>b.at-a.at)){
  for(const [part,label] of [['decisions','решение'],['discussed','обсуждали']])for(const line of (r.summary[part]||[]).map(String))
   if(adr.words(line).some(w=>stems.some(x=>w.startsWith(x))))out.push({kind:'meeting',label:clip(String(r.title||'Встреча').replace(/^Сводка встречи\s*·\s*/,'Встреча · '),60)+' · '+label,text:clip(line,400),decision:part==='decisions'});
  if(out.length>=5)break;
 }
 return out.slice(0,5);
}
async function indexEvidence(s,query){
 if(typeof s.semanticIndex?.search!=='function')return [];
 try{
  const r=await s.semanticIndex.search(['chats','meetings','files'],query,{k:6,perItem:1});
  return (r?.hits||[]).filter(h=>h.score>=0.35&&!String(h.meta?.path||'').replace(/\\/g,'/').includes('docs/adr/')).slice(0,4).map(h=>({kind:'index',
   label:h.collection==='files'?'Файл '+clip(h.meta?.path||h.meta?.title||h.id,80):h.collection==='chats'?'Чат «'+clip(h.meta?.title||'',60)+'»':'Запись встречи'+(h.meta?.title?' «'+clip(h.meta.title,60)+'»':''),text:clip(h.text,400)}));
 }catch{return [];}
}

// --- Drafting ------------------------------------------------------------------------------------------------------
const ALT=/(?:вместо|альтернатив|рассматривали|рассмотрели|или\s+оставить|либо|vs\.?\s)/iu;
async function draft(s,{statement,form,now,rows}){
 const query=statement;
 const sources=[...chatEvidence(s,query),...meetingEvidence(s,query,now),...await indexEvidence(s,query)];
 // Similar decisions: by the user's words and what the chat and meetings said (not the index's code snippets).
 const related=adr.search(rows,[query,...sources.filter(x=>x.kind!=='index').map(x=>x.text)].join('\n'),{limit:3});
 let title=form==='topic'?cap(statement.replace(/[.\s]+$/,'')):cap(statement.split(/[.;,—–]\s|\s—\s|\n/)[0].replace(/[.\s]+$/,''));
 if(title.length>90)title=title.slice(0,89).replace(/\s+\S*$/,'')+'…';
 const meetingDecision=sources.find(x=>x.decision)?.text||'';
 let decision=form==='decision'?cap(statement):meetingDecision?cap(meetingDecision):cap(statement);
 if(!/[.!?…]$/.test(decision))decision+='.';
 let context=sources.filter(x=>!x.decision||form==='decision').slice(0,3).map(x=>x.label+': «'+clip(x.text,220)+'»').join('\n\n');
 let alternatives=sources.flatMap(x=>x.text.split(/(?<=[.!?])\s+/)).filter(t=>ALT.test(t)).slice(0,3).map(t=>clip(t,200));
 let consequences=[];
 let by='rules';
 if(s.settings.model){
  try{
   const r=await kit.modelJSON(s,{system:'Оформи архитектурное решение (ADR) по-русски из слов пользователя и источников. title — до 8 слов; context — 2–4 предложения: почему понадобилось решение; decision — что решили, 1–3 предложения; alternatives — рассмотренные варианты и почему не они, только если они есть в источниках; consequences — 2–5 коротких пунктов: что станет лучше и чем платим. Только из данных, ничего не выдумывай; чего нет в данных — оставь пустым.',
    user:{statement,sources:sources.map((x,i)=>({n:i+1,source:x.label,text:x.text})),existing:related.map(r=>adr.pad(r.number)+' '+r.title)},
    schema:{type:'object',properties:{title:{type:'string'},context:{type:'string'},decision:{type:'string'},alternatives:{type:'array',items:{type:'string'}},consequences:{type:'array',items:{type:'string'}}},required:['title','context','decision','alternatives','consequences']},predict:900,temperature:0.2});
   if(r&&String(r.decision||'').trim().length>=6){
    by='model';
    if(String(r.title||'').trim().length>=3)title=clip(cap(r.title.replace(/^(?:ADR[-\s]?)?\d+[.:]\s*/i,'')),90).replace(/[.\s]+$/,'');
    decision=clip(cap(r.decision),1200);
    if(String(r.context||'').trim())context=clip(r.context,1500);
    const items=v=>(Array.isArray(v)?v:[]).map(x=>clip(x,240)).filter(x=>x.length>=3).slice(0,6);
    if(items(r.alternatives).length)alternatives=items(r.alternatives);
    consequences=items(r.consequences);
   }
  }catch{by='rules';}
 }
 return {title,decision,context,alternatives,consequences,sources,related,by};
}

const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
const DRAFTS=50;
function remember(s,id,value){
 const st=store(s),all={...st.peek('drafts')||{}};
 all[id]={...all[id],...value,at:Date.now()};
 st.set('drafts',Object.fromEntries(Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,DRAFTS)));
 return all[id];
}
const recall=(s,id)=>(store(s).peek('drafts')||{})[id]||null;

function confluence(settings){
 let on=false;try{on=require('../../modules.cjs').enabled(settings,'confluence');}catch{on=settings.module_confluence!=='false';}
 return on&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken)&&!!String(settings.confluenceSpace||'').trim();
}

async function recordTurn(s,command,intent,{now=new Date()}={}){
 const run=async dir=>{
  if(!dir)return kit.reply(s,command,{by:BY,text:'Такой папки нет в проекте. Повторите запрос.',error:true});
  if(dir.question)return kit.reply(s,command,{by:BY,question:true,text:dir.question});
  s.requestProgress?.report?.('Собираю контекст решения');
  const rows=adr.list(dir);
  const d=await draft(s,{...intent,now,rows});
  const number=adr.nextNumber(rows);
  const rel=adr.DIR.split(path.sep).join('/')+'/'+adr.pad(number)+'-'+adr.slug(d.title)+'.md';
  const date=now.toISOString().slice(0,10);
  const text=adr.format({number:adr.pad(number),title:d.title,date,context:d.context,decision:d.decision,alternatives:d.alternatives,consequences:d.consequences,sources:d.sources.map(x=>x.label)});
  const draftId=randomUUID();
  remember(s,draftId,{folder:dir,path:rel,number,title:d.title,state:'draft'});
  const card={mode:'draft',draftId,folder:{name:path.basename(dir),path:dir},path:rel,number,title:d.title,text,date,by:d.by,
   sources:d.sources.map(x=>({kind:x.kind,label:x.label,text:x.text})),related:d.related.map(r=>({number:r.number,title:r.title,path:r.path,status:r.status,date:r.date})),
   existing:rows.length,confluence:confluence(s.settings)?String(s.settings.confluenceSpace).trim():''};
  const said='Черновик '+adr.pad(number)+' «'+d.title+'» — '+rel+(d.sources.length?' (по '+d.sources.length+' '+kit.plural(d.sources.length,['источнику','источникам','источникам'])+')':'')+'. Проверьте текст на карточке: файл появится только после «Сохранить в проект».'+(d.related.length?' Похожие решения: '+d.related.map(r=>adr.pad(r.number)+' «'+r.title+'»').join(', ')+'.':'');
  return kit.reply(s,command,{by:BY,text:said,data:{adrCard:card}});
 };
 return run(folder(s,run));
}

async function searchTurn(s,command,intent){
 const run=async dir=>{
  if(!dir)return kit.reply(s,command,{by:BY,text:'Такой папки нет в проекте. Повторите запрос.',error:true});
  if(dir.question)return kit.reply(s,command,{by:BY,question:true,text:dir.question});
  const rows=adr.list(dir);
  if(!rows.length)return kit.reply(s,command,{by:BY,text:'В '+path.basename(dir)+'/docs/adr ещё нет решений. Скажите «запиши решение: …» — оформлю первое.'});
  let found=intent.kind==='list'?[...rows].reverse().slice(0,12).map(r=>({...r,excerpt:adr.excerpt(r,[])})):adr.search(rows,intent.query);
  // The semantic index (when the user turned it on) adds ADR files found by meaning.
  if(intent.kind==='search'&&typeof s.semanticIndex?.search==='function'){
   try{
    const r=await s.semanticIndex.search('files',intent.query,{k:8,filter:{pathPrefix:path.join(dir,adr.DIR)}});
    for(const h of r?.hits||[]){
     const name=path.basename(String(h.meta?.path||h.id||''));
     const row=rows.find(x=>x.file===name);
     if(row&&!found.some(x=>x.file===name)&&h.score>=0.35)found.push({...row,score:0,excerpt:clip(h.text,300),byMeaning:true});
    }
   }catch{}
  }
  found=found.slice(0,10);
  const card={mode:intent.kind,query:intent.query||'',folder:{name:path.basename(dir),path:dir},
   all:rows.map(r=>({number:r.number,title:r.title,date:r.date,status:r.status})),
   found:found.map(r=>({number:r.number,title:r.title,path:r.path,status:r.status,statusText:r.statusText,date:r.date,excerpt:r.excerpt,decision:clip(r.sections.decision,400),byMeaning:!!r.byMeaning}))};
  const text=intent.kind==='list'?'Решений в docs/adr: '+rows.length+'. Последние: '+found.slice(0,5).map(r=>adr.pad(r.number)+' «'+r.title+'»').join(', ')+'.'
   :found.length?'Про «'+intent.query+'» — '+found.length+' '+kit.plural(found.length,['решение','решения','решений'])+': '+found.slice(0,5).map(r=>adr.pad(r.number)+' «'+r.title+'»'+(r.status==='superseded'?' (заменено)':'')).join(', ')+'.'
   :'Про «'+intent.query+'» решений в docs/adr не нашёл (всего их '+rows.length+').';
  return kit.reply(s,command,{by:BY,text,data:{adrCard:card}});
 };
 return run(folder(s,run));
}

// «это» is the previous message of the user in this chat.
function previousStatement(s){
 const topic=s.dialogue.active();
 const m=[...(topic?.messages||[])].reverse().find(x=>x.role==='user'&&String(x.text||'').trim());
 return m?clip(m.text,1000):'';
}
async function checkTurn(s,command,intent){
 let subject=intent.subject||previousStatement(s);
 if(!subject)return ask({text:'С чем сравнить решения? Напишите утверждение или план.',label:'Что проверить',placeholder:'например: перейдём на UDP для синхронизации'},answer=>checkTurn(s,command,{...intent,subject:String(answer||'').trim()}));
 const run=async dir=>{
  if(!dir)return kit.reply(s,command,{by:BY,text:'Такой папки нет в проекте. Повторите запрос.',error:true});
  if(dir.question)return kit.reply(s,command,{by:BY,question:true,text:dir.question});
  const rows=adr.list(dir);
  if(!rows.length)return kit.reply(s,command,{by:BY,text:'В '+path.basename(dir)+'/docs/adr ещё нет решений — сравнивать не с чем.'});
  const num=/(?:^|\D)(\d{1,4})(?:\D|$)/.exec(intent.target||'')?.[1];
  let related=num?rows.filter(r=>r.number===Number(num)):[];
  if(!related.length)related=adr.search(rows,(intent.target||'')+' '+subject,{limit:3});
  if(!related.length&&intent.target)related=adr.search(rows,intent.target,{limit:3});
  if(!related.length)return kit.reply(s,command,{by:BY,text:'Не нашёл решений, связанных с «'+clip(subject,80)+'»'+(intent.target?' и «'+intent.target+'»':'')+'. Всего решений: '+rows.length+'.',data:{adrCard:{mode:'check',subject,verdict:'none',items:[],folder:{name:path.basename(dir),path:dir}}}});
  let verdict='unclear',items=related.slice(0,3).map(r=>({number:r.number,title:r.title,path:r.path,status:r.status,quote:clip(r.sections.decision||r.excerpt,400),verified:false,verdict:'unclear',explanation:''}));
  let by='rules';
  if(s.settings.model){
   try{
    const out=await kit.modelJSON(s,{system:'Сравни утверждение с архитектурными решениями проекта. Для каждого решения: verdict — contradicts (противоречит), consistent (согласуется) или unrelated (не связано); quote — дословная цитата из текста решения, на которой основан вывод; explanation — одно короткое предложение по-русски. Только по этим текстам.',
     user:{statement:subject,decisions:related.slice(0,3).map(r=>({number:r.number,title:r.title,status:r.statusText||r.status,text:clip([r.sections.decision,r.sections.consequences,r.sections.context].filter(Boolean).join('\n'),2500)}))},
     schema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{number:{type:'integer'},verdict:{type:'string',enum:['contradicts','consistent','unrelated']},quote:{type:'string'},explanation:{type:'string'}},required:['number','verdict','quote','explanation']}}},required:['items']},predict:700,temperature:0.1});
    for(const x of out?.items||[]){
     const item=items.find(i=>i.number===Number(x.number));if(!item)continue;
     const row=related.find(r=>r.number===item.number);
     const quote=adr.verbatim(x.quote,row.text);
     // A verdict without a verbatim quote of the ADR is not shown as a verdict.
     if(quote){item.quote=quote;item.verified=true;item.verdict=x.verdict;item.explanation=clip(x.explanation,240);by='model';}
    }
   }catch{by='rules';}
  }
  const live=items.filter(i=>i.status!=='superseded'&&i.status!=='rejected');
  verdict=live.some(i=>i.verdict==='contradicts')?'contradicts':live.some(i=>i.verdict==='consistent')?'consistent':items.every(i=>i.verdict==='unrelated')?'unrelated':'unclear';
  const head=verdict==='contradicts'?'Похоже, противоречит '+live.filter(i=>i.verdict==='contradicts').map(i=>adr.pad(i.number)+' «'+i.title+'»').join(', ')
   :verdict==='consistent'?'Не противоречит: согласуется с '+live.filter(i=>i.verdict==='consistent').map(i=>adr.pad(i.number)+' «'+i.title+'»').join(', ')
   :verdict==='unrelated'?'Связанных решений не нашёл: найденные — о другом'
   :'Сравните сами: '+(s.settings.model?'модель не нашла дословного основания в тексте решений':'без локальной модели не берусь судить')+'. Связанные решения: '+items.map(i=>adr.pad(i.number)+' «'+i.title+'»').join(', ');
  const card={mode:'check',subject,verdict,by,items,folder:{name:path.basename(dir),path:dir}};
  return kit.reply(s,command,{by:BY,text:head+'.',data:{adrCard:card}});
 };
 return run(folder(s,run));
}

// --- Confluence (only from the card's button) ---------------------------------------------------------------------
function storage(markdown){
 const md=require('../google-drive/markdown.cjs');
 const out=[];let open=null;
 const close=()=>{if(open){out.push('</'+open+'>');open=null;}};
 for(const b of md.blocks(markdown)){
  if(b.type==='heading'&&b.level===1)continue;
  if(b.type==='li'){const tag=b.ordered?'ol':'ul';if(open!==tag){close();out.push('<'+tag+'>');open=tag;}out.push('<li>'+md.inline(b.text)+'</li>');continue;}
  close();
  if(b.type==='heading')out.push('<h'+b.level+'>'+md.inline(b.text)+'</h'+b.level+'>');
  else if(b.type==='code')out.push('<pre>'+md.esc(b.text)+'</pre>');
  else if(b.type==='quote')out.push('<blockquote><p>'+md.inline(b.text)+'</p></blockquote>');
  else if(b.type!=='table')out.push('<p>'+md.inline(b.text)+'</p>');
 }
 close();
 return out.join('');
}

function setup(s){
 const guard=draftId=>{
  if(!kit.installed(s,ID))throw Error('Приложение «Архитектурные решения» не добавлено.');
  if(typeof draftId!=='string'||!/^[0-9a-f-]{36}$/.test(draftId))throw Error('Некорректный черновик.');
  const d=recall(s,draftId);if(!d)throw Error('Черновик устарел. Попросите оформить решение заново.');
  return d;
 };
 const body=text=>{if(typeof text!=='string'||!text.trim()||text.length>200000)throw Error('Пустой или слишком длинный текст решения.');return text.replace(/\r\n?/g,'\n').replace(/\s*$/,'\n');};
 return {ipc:{
  state(draftId){const d=guard(draftId);return {state:d.state,confluenceUrl:d.confluenceUrl||''};},
  // Writes exactly the text shown on the card to the path fixed when the draft was made; never overwrites.
  save(draftId,text){
   const d=guard(draftId),content=body(text);
   if(d.state==='saved')return {ok:true,path:d.path,text:'Уже сохранено: '+d.path};
   const root=path.resolve(d.folder),target=path.resolve(root,d.path);
   if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw Error('Папки проекта больше нет: '+d.folder);
   if(path.dirname(target)!==path.join(root,adr.DIR)||!adr.FILE.test(path.basename(target)))throw Error('Некорректный путь решения.');
   const dir=path.dirname(target);
   if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('docs/adr — ссылка, а не папка: не пишу туда.');
   const taken=adr.list(root).find(r=>r.number===d.number);
   if(taken)throw Error('Номер '+adr.pad(d.number)+' уже занят: '+taken.path+'. Попросите оформить решение заново — возьму следующий номер.');
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(target,content,{flag:'wx'});
   remember(s,draftId,{state:'saved',savedAt:new Date().toISOString()});
   return {ok:true,path:d.path,text:'Сохранено: '+d.path};
  },
  // A Confluence page in the connected space (Confluence Cloud REST v2), from the card's button only.
  async confluence(draftId,text){
   const d=guard(draftId),content=body(text);
   if(d.confluenceUrl)return {ok:true,url:d.confluenceUrl,text:'Страница уже создана'};
   if(!confluence(s.settings))throw Error('Confluence не подключён или не выбрано пространство в подключении.');
   const settings=s.settings,key=String(settings.confluenceSpace).trim();
   const spaces=await s.workspace.api('/wiki/api/v2/spaces?'+new URLSearchParams({keys:key,limit:'1'}),{},settings);
   const space=(spaces?.results||[])[0];if(!space?.id)throw Error('Пространство Confluence «'+key+'» не найдено.');
   const title=adr.pad(d.number)+'. '+String(d.title||'Решение').slice(0,200);
   let page;
   try{page=await s.workspace.api('/wiki/api/v2/pages',{method:'POST',body:JSON.stringify({spaceId:String(space.id),status:'current',title,body:{representation:'storage',value:storage(content)}})},settings);}
   catch(e){if(!e?.status)e.message='Результат неизвестен — проверьте пространство «'+key+'» в Confluence, прежде чем повторять. '+e.message;throw e;}
   const webui=String(page?._links?.webui||'');
   const url=webui.startsWith('/')?String(settings.jiraUrl).replace(/\/+$/,'')+'/wiki'+webui:'';
   remember(s,draftId,{confluenceUrl:url});
   return {ok:true,url,text:'Страница создана в Confluence: '+title};
  }
 }};
}

async function turn(s,command,deps={}){
 if(!kit.installed(s,ID))return null;
 const intent=kind(command);if(!intent)return null;
 try{
  if(intent.kind==='record')return await recordTurn(s,String(command),intent,deps);
  if(intent.kind==='check')return await checkTurn(s,String(command),intent);
  return await searchTurn(s,String(command),intent);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'adr',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,draft,storage,teardown(){}};
