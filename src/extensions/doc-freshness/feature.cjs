// «Свежесть документации»: on request, finds documents — the project's Markdown, Confluence pages of the connected
// space, Google Docs of the «Google Диск» connection — that mention file paths, code symbols, settings or versions
// that no longer exist in the code or changed after the document's last edit (scan.cjs). Every finding pairs the
// document's line with the git change. The card lists documents by staleness; «Создать задачу» goes through the
// `task-tracker` link; «Предложить правку» either shows the exact line change of a project document and writes it
// only on «Применить правку» (IPC `applyEdit`, with «Отменить»), or hands the fix to «Программист» (`code-fix`,
// its own branch and diff). Nothing is changed silently.
// A weekly check (off by default, setting `docFreshnessWeekly`) reads only the projects' Markdown and reports to the
// notification center.
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const scan=require('./scan.cjs');
const sources=require('./sources.cjs');
const ID='doc-freshness',BY='Свежесть документации';
const DAY=86400000,WEEK=7*DAY;

// --- Routing --------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').replace(/ё/g,'е').trim();
const DOC='(?:документац\\p{L}*|доки|доков|докам|доку|документ\\p{L}*|readme|ридми|вики|wiki|confluence|конфлюенс\\p{L}*|гугл[\\s-]+док\\p{L}*|google\\s+docs?)';
const STALE='(?:устаревш\\p{L}*|устарел\\p{L}*|неактуальн\\p{L}*|протух\\p{L}*|свежест\\p{L}*|актуальност\\p{L}*|stale)';
const CHECK=[
 new RegExp('^(?:а\\s+)?(?:провер\\p{L}*|найди|покажи|поищи|какая|какие|что|есть\\s+ли|где)?\\s*(?:\\p{L}+\\s+){0,2}?'+STALE+'\\s+(?:\\p{L}+\\s+){0,2}?'+DOC+'(?:\\s+.{0,60})?$','iu'),
 new RegExp('^(?:а\\s+)?(?:какая|какие|что|где|не|есть\\s+ли)?\\s*(?:в\\s+)?(?:\\p{L}+\\s+){0,2}?'+DOC+'\\s+(?:\\p{L}+\\s+){0,2}?(?:устарел\\p{L}*|устарела|протухл\\p{L}*|неактуальн\\p{L}*|актуальн\\p{L}*)(?:\\s+.{0,40})?$','iu'),
 new RegExp('^провер\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}?'+DOC+'\\s+на\\s+(?:устаревани\\p{L}*|актуальност\\p{L}*|свежест\\p{L}*)(?:\\s+.{0,40})?$','iu')
];
const WEEKLY=new RegExp('(?:^|\\s)(?:включи|выключи|отключи|не\\s+проверяй|проверяй|запускай|не\\s+запускай)\\s+(?:\\p{L}+\\s+){0,3}?(?:еженедельн\\p{L}*|каждую\\s+неделю|раз\\s+в\\s+неделю)(?:\\s+\\p{L}+){0,4}\\s*$|^(?:проверяй|не\\s+проверяй)\\s+(?:\\p{L}+\\s+){0,2}?'+DOC+'\\s+(?:каждую\\s+неделю|раз\\s+в\\s+неделю|еженедельно)$','iu');
// Dependencies, packages and API deprecations in code are other apps' subjects.
const NOT=/пакет|зависимост|библиотек|npm|nuget|sdk|плагин|api\s+в\s+коде|устаревш\p{L}*\s+(?:api|метод|код|функци)|обнови\s+документ|напиши\s+документ/iu;
function kind(text){
 const t=clean(text);
 if(!t||/^\/|(?:^|\s)скилл/iu.test(t)||NOT.test(t))return null;
 if(/^(?:а\s+)?(?:что\s+такое|зачем)/iu.test(t))return null;
 if(WEEKLY.test(t)&&new RegExp(DOC,'iu').test(t))return /(?:выключи|отключи|не\s+проверяй|не\s+запускай)/iu.test(t)?'weekly-off':'weekly-on';
 return CHECK.some(r=>r.test(t))?'check':null;
}
// Which sources the request names (none → all available).
function named(text){
 const t=String(text||'').toLowerCase();
 const out=[];
 if(/confluence|конфлюенс|вики|wiki/.test(t))out.push('confluence');
 if(/гугл[\s-]*док|google\s*docs?|гугл[\s-]*диск/.test(t))out.push('google');
 if(/readme|ридми|в\s+репозитори|в\s+проекте|markdown|маркдаун|\.md/.test(t))out.push('project');
 return out;
}

// --- Project folder ------------------------------------------------------------------------------------------------
function repos(s,projectId){
 try{
  const state=s.dialogue.state||{},topic=s.dialogue.active();
  const project=(state.projects||[]).find(p=>p.id===(projectId||topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId)).filter(d=>fs.existsSync(path.join(d,'.git')));
 }catch{return [];}
}
function folder(s,resume){
 const list=repos(s);
 if(!list.length)return {question:'Привяжите к чату папку проекта с git-репозиторием — документацию сверяю с его историей.'};
 if(list.length===1)return list[0];
 const label=d=>path.basename(d)+' · '+d;
 return ask({text:'В проекте несколько репозиториев. Какой сверить с документацией?',label:'Репозиторий',options:list.slice(0,8).map(label),strictChoices:true},answer=>resume(list.find(d=>label(d)===String(answer).trim())));
}

const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
// The edits a card may apply: kept per check (the 30 latest), never taken from the renderer.
function remember(s,checkId,value){
 const st=store(s),all={...st.peek('checks')||{}};
 all[checkId]={...value,at:Date.now()};
 st.set('checks',Object.fromEntries(Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,30)));
}
const recall=(s,id)=>(store(s).peek('checks')||{})[id]||null;

// --- The check -----------------------------------------------------------------------------------------------------
async function build(s,dir,{want=[],git=scan.runGit,now=new Date(),remote=true}={}){
 s.requestProgress?.report?.('Читаю репозиторий '+path.basename(dir));
 const r=await scan.repo(dir,{git});
 const docs=[],notes=[],used={project:0,confluence:null,google:null};
 const wants=k=>!want.length||want.includes(k);
 if(wants('project')){const d=await sources.project(r,{git});docs.push(...d);used.project=d.length;}
 if(remote&&wants('confluence')){
  try{s.requestProgress?.report?.('Читаю страницы Confluence');const c=await sources.confluence(s);if(c.used){docs.push(...c.docs);used.confluence=c.docs.length;}if(c.note)notes.push(c.note);}
  catch(e){notes.push('Confluence: '+e.message);used.confluence=0;}
 }
 if(remote&&wants('google')){
  try{s.requestProgress?.report?.('Читаю Google Документы');const g=await sources.google(s);if(g.used){docs.push(...g.docs);used.google=g.docs.length;}}
  catch(e){notes.push('Google Диск: '+e.message);used.google=0;}
 }
 if(want.length&&!docs.length&&!notes.length)notes.push('Этот источник не подключён.');
 s.requestProgress?.report?.('Сверяю '+docs.length+' '+kit.plural(docs.length,['документ','документа','документов'])+' с историей git');
 const found=await scan.check(r,docs,{git,now});
 const checkId=randomUUID();
 const totals={docs:found.length,scanned:docs.length,findings:found.reduce((n,d)=>n+d.findings.length,0),byProblem:{}};
 for(const d of found)for(const f of d.findings)totals.byProblem[f.problem]=(totals.byProblem[f.problem]||0)+1;
 return {checkId,repo:{name:path.basename(dir),path:dir,web:r.web},docs:found,totals,used,notes,weekly:s.settings.docFreshnessWeekly==='true',at:now.toISOString()};
}

const PROBLEM={missing:'файл удалён',renamed:'переименовано',removed:'удалено из кода',value:'значение изменилось',version:'версия изменилась',changed:'код изменился после правки'};
function summary(card){
 if(!card.totals.scanned)return 'Документов для проверки не нашёл: в репозитории '+card.repo.name+' нет Markdown'+(card.notes.length?'; '+card.notes.join(' '):'.');
 if(!card.docs.length)return 'Проверил '+card.totals.scanned+' '+kit.plural(card.totals.scanned,['документ','документа','документов'])+' — расхождений с кодом не нашёл.'+(card.notes.length?' '+card.notes.join(' '):'');
 const kinds=Object.entries(card.totals.byProblem).sort((a,b)=>b[1]-a[1]).map(([k,n])=>PROBLEM[k]+' — '+n).join(', ');
 return 'Устарело '+card.totals.docs+' из '+card.totals.scanned+' '+kit.plural(card.totals.scanned,['документа','документов','документов'])+' ('+card.totals.findings+' '+kit.plural(card.totals.findings,['место','места','мест'])+': '+kinds+'). Сильнее всего — '+card.docs.slice(0,3).map(d=>d.title).join(', ')+'. Правки — только по вашей кнопке.';
}

async function checkTurn(s,command,deps={}){
 const run=async dir=>{
  if(!dir)return kit.reply(s,command,{by:BY,text:'Такого репозитория нет в проекте. Повторите запрос.',error:true});
  if(dir.question)return kit.reply(s,command,{by:BY,question:true,text:dir.question});
  let card;
  // Also reached from a clarification's answer, outside turn(): failures are reported the same way.
  try{card=await build(s,dir,{want:named(command),git:deps.git||scan.runGit,now:deps.now||new Date()});}
  catch(e){return kit.failure(s,command,BY,/not a git repository/i.test(String(e.message))?Error('Папка '+path.basename(dir)+' не похожа на рабочий git-репозиторий.'):e);}
  remember(s,card.checkId,{dir,edits:Object.fromEntries(card.docs.filter(d=>d.source==='project').flatMap(d=>d.findings.filter(f=>f.suggestion?.line).map(f=>[f.id,{path:d.path,n:f.line.n,old:f.line.text,next:f.suggestion.line}])))});
  return kit.reply(s,command,{by:BY,text:summary(card),data:{freshnessCard:card}});
 };
 return run(folder(s,run));
}

async function weeklyTurn(s,command,on){
 await s.saveSettings?.({docFreshnessWeekly:String(on)},true);
 if(s.settings&&!s.saveSettings)s.settings.docFreshnessWeekly=String(on);
 return kit.reply(s,command,{by:BY,text:on?'Раз в неделю проверю Markdown проектов и сообщу в уведомлениях, что устарело. Правок сам не вношу.':'Еженедельная проверка документации выключена. Проверю по запросу: «проверь свежесть документации».'});
}

// --- Weekly (off by default): local Markdown only, a notification, nothing changed -----------------------------------
async function weekly(s,{now=new Date(),git=scan.runGit}={}){
 if(s.settings.docFreshnessWeekly!=='true'||!kit.installed(s,ID))return null;
 const st=store(s),last=Number(st.peek('weekly:last')||0);
 if(+now-last<WEEK)return null;
 st.set('weekly:last',+now);
 const projects=(s.dialogue?.state?.projects||[]).filter(p=>p.id!=='general');
 const rows=[];
 for(const p of projects.slice(0,6)){
  for(const dir of repos(s,p.id).slice(0,1)){
   try{const card=await build(s,dir,{want:['project'],git,now,remote:false});rows.push({project:p.name||path.basename(dir),docs:card.totals.docs,findings:card.totals.findings,top:card.docs[0]?.title||''});}
   catch{}
  }
  if(rows.length>=3)break;
 }
 const stale=rows.filter(r=>r.findings);
 const text=!rows.length?'Нет проектов с git-репозиторием для проверки.':stale.length?stale.map(r=>r.project+': устарело документов — '+r.docs+(r.top?' (сильнее всего '+r.top+')':'')).join('; ')+'. Откройте чат проекта и скажите «проверь свежесть документации».':'Документация проектов не расходится с кодом.';
 const item={id:'doc-freshness:weekly',title:'Свежесть документации',text,kind:stale.length?'attention':'done',version:String(+now)};
 try{if(!s.win?.isDestroyed?.())s.win?.webContents?.send('extension-install-progress',item);}catch{}
 return {item,rows};
}

let timer=null;
function setup(s){
 if(timer){clearInterval(timer);timer=null;}
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){timer=setInterval(()=>{weekly(s).catch(()=>{});},3600000);timer.unref?.();}
 return {ipc:{
  status(){const last=Number(store(s).peek('weekly:last')||0);return {weekly:s.settings.docFreshnessWeekly==='true',last:last?new Date(last).toISOString():''};},
  // Writes the one line change shown on the card, only when the line is still what the check saw.
  applyEdit(checkId,findingId,undo){
   if(!kit.installed(s,ID))throw Error('Приложение «Свежесть документации» не добавлено.');
   if(typeof checkId!=='string'||!/^[0-9a-f-]{36}$/.test(checkId)||typeof findingId!=='string'||findingId.length>600)throw Error('Некорректная правка.');
   const c=recall(s,checkId);const e=c?.edits?.[findingId];
   if(!e)throw Error('Эта проверка устарела — проверьте документацию заново.');
   const root=path.resolve(c.dir),file=path.resolve(root,e.path);
   if(!file.startsWith(root+path.sep)||!/\.(?:md|markdown)$/i.test(file))throw Error('Некорректный путь документа.');
   if(fs.lstatSync(file).isSymbolicLink())throw Error('Документ — ссылка: не правлю.');
   const [from,to]=undo?[e.next,e.old]:[e.old,e.next];
   const text=fs.readFileSync(file,'utf8'),eol=text.includes('\r\n')?'\r\n':'\n',lines=text.split(eol);
   let i=lines[e.n-1]===from?e.n-1:-1;
   if(i<0){const all=lines.map((l,k)=>l===from?k:-1).filter(k=>k>=0);if(all.length===1)i=all[0];}
   if(i<0)throw Error('Строка '+e.n+' в '+e.path+' уже изменилась — проверьте документацию заново.');
   lines[i]=to;fs.writeFileSync(file,lines.join(eol));
   return {ok:true,path:e.path,line:i+1,text:(undo?'Вернул строку ':'Исправлено: ')+e.path+':'+(i+1)};
  }
 }};
}

async function turn(s,command,deps={}){
 if(!kit.installed(s,ID))return null;
 const k=kind(command);if(!k)return null;
 try{
  if(k==='weekly-on'||k==='weekly-off')return await weeklyTurn(s,String(command),k==='weekly-on');
  return await checkTurn(s,String(command),deps);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
function validate(next){
 if(next.docFreshnessWeekly!==undefined&&!['true','false'].includes(String(next.docFreshnessWeekly)))throw Error('Проверьте настройку еженедельной проверки документации.');
}
function teardown(){if(timer){clearInterval(timer);timer=null;}}
module.exports={name:'docFreshness',defaults:{['extension_'+ID]:'false',docFreshnessWeekly:'false'},validate,setup,turn,kind,named,build,summary,weekly,teardown};
