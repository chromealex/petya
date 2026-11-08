// «Релизный чек-лист»: is release X ready? A per-project checklist (template editable in settings) whose automatic
// items are answered by other apps through the `release-check` registry (checks.cjs) — CI, crashes, store reviews,
// patch notes, localization, build size, dependencies, Jira blockers, version numbers — and whose manual items the
// user ticks per release. Nothing is written to any service: statuses come from the apps' reads, the Slack status
// and tasks for problems go through cross-app links only when the user presses those buttons.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const checks=require('./checks.cjs');
const template=require('./template.cjs');
const {Store,versionKey}=require('./store.cjs');
const ID='release-checklist',BY='Релизный чек-лист';

// --- Routing ------------------------------------------------------------------------------------------------------
const LIST=/чек[- ]?лист\p{L}*|checklist/iu;
const RELEASE=/релиз\p{L}*|выпуск\p{L}*|(?:^|[^\p{L}])release(?=$|[^\p{L}])/iu;
const ASKS=[
 /готов\p{L}*\s+(?:ли\s+)?(?:\p{L}+\s+){0,2}(?:к\s+)?(?:релиз|выпуск)\p{L}*/iu,
 /(?:релиз|верси|выпуск)\p{L}*\s+v?\d+(?:\.\d+)+\s+(?:уже\s+)?готов/iu,
 /что\s+(?:ещё\s+|еще\s+)?(?:мешает|блокирует|держит|не\s+даёт|не\s+дает)\s+(?:нам\s+)?(?:выпуск|выпустить|релиз|зарелизить|выкат|выкатить|релизнуть|выложить)\p{L}*/iu,
 /можно\s+ли\s+(?:уже\s+)?(?:выпускать|выпустить|релизить|зарелизить|релизиться|выкатывать|выкатить)/iu,
 /(?:статус|готовность)\s+(?:релиза|версии)\s+v?\d+(?:\.\d+)+/iu
];
// Release notes, crashes or reviews after a release, «when is the release» and other checklists belong elsewhere.
const NEAR=/патч[- ]?ноу?т\p{L}*|patch[- ]?notes?|ч[еэ]й?нджлог\p{L}*|changelog|release[- ]?notes?|релиз[- ]?ноу?т\p{L}*|крэш\p{L}*|краш\p{L}*|отзыв\p{L}*|когда\s+(?:будет\s+)?релиз/iu;
function intent(text){
 const t=String(text||'').trim();
 if(!t||NEAR.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить))/iu.test(t))return false;
 if(LIST.test(t)&&RELEASE.test(t))return true;
 return ASKS.some(r=>r.test(t));
}
const VERSION=/(?:^|[\s(«"v])(\d+(?:\.\d+){1,3})(?=$|[\s,.!?)»"])/iu;
const versionOf=text=>VERSION.exec(String(text||''))?.[1]||'';
const cmp=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d;}return 0;};
// The release before: the newest checked version below it, else the number before it («1.5» → «1.4», «2.0» → «1.9» is
// not guessed). Apps that know releases use it only when they find it.
function previousOf(version,known=[]){
 const lower=known.filter(v=>/^\d+(?:\.\d+)*$/.test(v)&&cmp(v,version)<0).sort(cmp);
 if(lower.length)return lower.at(-1);
 const parts=String(version).split('.').map(Number);
 for(let i=parts.length-1;i>=0;i--)if(parts[i]>0){parts[i]--;return parts.slice(0,i+1).join('.');}
 return null;
}

// --- Project ------------------------------------------------------------------------------------------------------
function project(s){
 const state=s.dialogue?.state||{},topic=s.dialogue?.active?.();
 const p=(state.projects||[]).find(x=>x.id===(topic?.projectId||state.activeProjectId))||(state.projects||[]).find(x=>x.id==='general')||{id:'general',name:'Общее'};
 let roots=[];try{roots=require('../../project-folders.cjs').projectFolders(p,s.projectMemory?.get?.(p.memoryId||topic?.projectMemoryId));}catch{roots=[];}
 return {id:p.id,name:p.name||'Общее',roots};
}
const stores=new Map();
const store=s=>{const key=s.dataRoot||'';if(!stores.has(key))stores.set(key,new Store(s.dataRoot));return stores.get(key);};

// --- The card -----------------------------------------------------------------------------------------------------
function counts(items){
 const c={total:items.length,ok:0,problem:0,unknown:0,missing:0,todo:0};
 for(const i of items)c[i.status]=(c[i.status]||0)+1;
 return c;
}
function statusText(card){
 const c=card.counts,lines=['Релиз '+card.version+(card.project?.name&&card.project.id!=='general'?' ('+card.project.name+')':'')+': готово '+c.ok+' из '+c.total+'.'];
 const problems=card.items.filter(i=>i.status==='problem');
 if(problems.length)lines.push('Проблемы: '+problems.map(i=>i.title+(i.summary?' — '+i.summary:'')).join('; ')+'.');
 const open=card.items.filter(i=>i.status==='todo').map(i=>i.title);
 if(open.length)lines.push('Не отмечено: '+open.join('; ')+'.');
 const unknown=card.items.filter(i=>i.status==='unknown'||i.status==='missing').map(i=>i.title);
 if(unknown.length)lines.push('Не проверено: '+unknown.join('; ')+'.');
 if(!problems.length&&!open.length&&!unknown.length)lines.push('Все пункты в порядке.');
 return lines.join(' ');
}
const tasksOf=card=>card.items.filter(i=>i.status==='problem').map(i=>'Релиз '+card.version+': '+i.title+(i.summary?' — '+i.summary:''));
function finish(card){card.counts=counts(card.items);card.share=statusText(card);card.tasks=tasksOf(card);return card;}

async function build(s,command,version,{now=new Date(),providers,timeout}={}){
 const p=project(s),st=store(s),items=st.template(p.id);
 const release={version,previous:previousOf(version,st.releases(p.id)),branch:String(s.settings.releaseChecklistBranch||'release/{version}').replace(/\{version\}/g,version),roots:p.roots,now,project:{id:p.id,name:p.name}};
 const auto=items.filter(i=>i.check).map(i=>i.check);
 s.requestProgress?.report?.('Проверяю релиз '+version);
 const registry=checks.create(s,providers?{providers}:{});
 const results=await registry.evaluate(auto,release,{progress:text=>s.requestProgress?.report?.(text),...timeout?{timeout}:{}});
 const saved=st.release(p.id,version);
 const rows=items.map(i=>{
  const base={id:i.id,title:i.title,group:i.group,custom:template.custom(i),customGroup:template.customGroup(i.group)};
  if(!i.check)return {...base,kind:'manual',status:saved.manual?.[i.id]?.done?'ok':'todo',done:!!saved.manual?.[i.id]?.done,summary:'',evidence:[]};
  const r=results[i.check]||{status:'unknown',summary:'',evidence:[]};
  return {...base,kind:'auto',check:i.check,status:r.status,summary:r.summary||'',evidence:r.evidence||[],...r.action?{action:r.action}:{},extension:r.extension||'',app:r.name||'',...r.connect?{connect:true}:{}};
 });
 const card=finish({id:randomUUID(),project:{id:p.id,name:p.name},version,previous:release.previous,branch:release.branch,checkedAt:now.toISOString(),items:rows});
 try{st.checked(p.id,version,Object.fromEntries(rows.map(r=>[r.id,r.status])));}catch(e){console.error('Release checklist state:',e.message);}
 // Apps that are not added (or not connected) are offered through the shared offer card; accepting re-runs the check.
 const offers=[];
 for(const ext of [...new Set(rows.filter(r=>(r.status==='missing'||r.connect)&&r.extension).map(r=>r.extension))]){
  const o=s.extensionOffers?.prerequisite?.(ext,command);if(o?.items?.length)offers.push(...o.items);
 }
 const c=card.counts,problems=rows.filter(r=>r.status==='problem');
 let text='Релиз '+version+': готово '+c.ok+' из '+c.total+'.';
 if(problems.length)text+=' Проблемы: '+problems.slice(0,4).map(r=>r.title+(r.summary?' ('+r.summary.replace(/\.$/,'')+')':'')).join('; ')+(problems.length>4?' и ещё '+(problems.length-4):'')+'.';
 if(c.todo)text+=' Отметить вручную: '+c.todo+'.';
 if(c.unknown+c.missing)text+=' Не проверено: '+(c.unknown+c.missing)+(c.missing?', из них без приложения — '+c.missing:'')+'.';
 if(!problems.length&&!c.todo&&!c.unknown&&!c.missing)text+=' Можно выпускать.';
 return kit.reply(s,command,{by:BY,text,data:{releaseChecklist:card,...offers.length?{extensionOffer:{items:offers,direct:true}}:{}}});
}

async function turn(s,command,deps={}){
 const text=String(command||'');
 if(!intent(text)||!kit.installed(s,ID))return null;
 const version=versionOf(text);
 if(!version){
  const p=project(s),known=store(s).releases(p.id).slice(0,4);
  return require('../../input-required.cjs').ask({text:'Какую версию проверить? Назовите номер, например 1.5.',label:'Версия',placeholder:'1.5',options:known},answer=>{
   const v=versionOf(' '+String(answer||'')+' ');
   if(!v)return kit.reply(s,command,{by:BY,question:true,text:'Не понял версию: нужен номер вроде 1.5 или 2.3.1. Повторите запрос с ним.'});
   return build(s,command,v,deps).catch(e=>kit.failure(s,command,BY,e));
  });
 }
 try{return await build(s,text,version,deps);}
 catch(e){if(e?.name==='InputRequired'||e?.name==='AbortError')throw e;return kit.failure(s,text,BY,e);}
}

// --- Card calls and the settings editor ---------------------------------------------------------------------------------
function setup(s){
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Релизный чек-лист» не добавлено.');};
 const projects=()=>(s.dialogue?.state?.projects||[]).filter(p=>!p.archived).map(p=>({id:p.id,name:p.name||p.id}));
 const known=id=>{if(typeof id!=='string'||!projects().some(p=>p.id===id))throw Error('Проект не найден.');return id;};
 // A manual tick, kept per project and release; every card of that release in the chats shows it.
 function tick(projectId,version,itemId,done){
  ready();known(projectId);
  if(typeof itemId!=='string'||!store(s).template(projectId).some(i=>i.id===itemId&&!i.check))throw Error('Такого пункта нет в чек-листе.');
  store(s).tick(projectId,versionKey(version),itemId,!!done);
  let card=null;
  for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){
   const c=m.extensionData?.releaseChecklist;if(!c||c.project?.id!==projectId||versionKey(c.version)!==versionKey(version))continue;
   const item=c.items.find(i=>i.id===itemId);if(item){item.done=!!done;item.status=done?'ok':'todo';finish(c);card=c;}
  }
  s.dialogue?.persist?.();
  return card?{counts:card.counts,share:card.share,tasks:card.tasks}:{done:!!done};
 }
 return {ipc:{
  tick,
  // The settings editor: projects, the chosen project's template and every check an app can provide.
  template:projectId=>{const list=projects(),id=list.some(p=>p.id===projectId)?projectId:(list.find(p=>p.id!=='general')||list[0])?.id||'general';
   return {projects:list,project:id,items:store(s).template(id),checks:checks.create(s).catalog(),defaults:template.defaults(),branch:s.settings.releaseChecklistBranch||'release/{version}'};},
  saveTemplate:(projectId,items)=>({items:store(s).saveTemplate(known(projectId),items)}),
  resetTemplate:projectId=>({items:store(s).resetTemplate(known(projectId))})
 }};
}
function validate(next){
 if(next.releaseChecklistBranch!==undefined){const b=String(next.releaseChecklistBranch).trim();if(!b||b.length>120||!/^[A-Za-z0-9._\/{}-]+$/.test(b))throw Error('Ветка релиза — имя ветки, например release/{version}.');next.releaseChecklistBranch=b;}
}
module.exports={name:'releaseChecklist',defaults:{['extension_'+ID]:'false',releaseChecklistBranch:'release/{version}'},validate,setup,turn,intent,versionOf,previousOf,statusText,build};
