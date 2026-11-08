// «Зависимости»: outdated packages and known vulnerabilities in the current project folder (npm, pip, Unity Package
// Manager; Gradle and CocoaPods are listed only). It never changes files: updates are handed to the coder extension
// from the card («Обновить безопасные (patch/minor) в ветке»), which works in its own branch.
const path=require('node:path');
const kit=require('../app-kit.cjs');
const M=require('./manifests.cjs');
const S=require('./sources.cjs');
const cancel=require('../../answer-cancel.cjs');
const ID='dependencies',BY='Зависимости',NOTICE='dependencies-check';

// «какие пакеты устарели», «есть ли уязвимости в зависимостях», «npm audit», «что обновить в проекте»,
// «проверь зависимости юнити».
const TOPIC=/зависимост\p{L}*|(?:пакет|библиотек|модул)\p{L}* устарел\p{L}*|устарел\p{L}* (?:ли )?(?:пакет|библиотек|зависимост)|устаревш\p{L}* (?:пакет|библиотек|зависимост)|какие пакеты|(?:^|[^\p{L}])(?:npm|yarn|pnpm) (?:audit|outdated)|pip[- ]audit|уязвимост\p{L}* (?:в |у )?(?:пакет|зависимост|библиотек|npm|pip|проект|модул)|(?:пакет|зависимост|библиотек)\p{L}* (?:с|на) уязвимост|что (?:нужно |надо |можно )?обновить в (?:проекте|пакетах|зависимостях|репозитории)|пакет\p{L}* (?:юнити|unity)|(?:юнити|unity) пакет\p{L}*|(?:^|[^\p{L}])upm(?=$|[^\p{L}])|package manager|outdated packages|dependabot/iu;
// Not package dependencies: tasks depending on each other, addiction, what a deadline depends on.
const AVOID=/между задач|задач\p{L}*[^.?!]{0,30}зависим|зависим\p{L}*[^.?!]{0,20}(?:задач|тикет|эпик|сторис|jira|джир|спринт|команд)|эмоциональн|психологич|алкогол|наркот|никотин|игров\p{L}* зависим|созависим|зависит от|от чего зависит|финансов\p{L}* зависим/iu;
// Commands to change things belong to the coder; this app only checks.
const CHANGE=/^(?:петя[,\s]+)?(?:пожалуйста[,\s]+)?(?:обнови|апдейтни|подними|установи|поставь|удали|добавь|замени|откати)|как программист/iu;
const wanted=text=>TOPIC.test(text)&&!AVOID.test(text)&&!CHANGE.test(text.trim());
function only(text){
 if(/юнити|unity|upm/iu.test(text))return 'unity';
 if(/(?:^|[^\p{L}])(?:npm|yarn|pnpm|node|js|javascript)(?=$|[^\p{L}])/iu.test(text))return 'npm';
 if(/(?:^|[^\p{L}])(?:pip|python|питон\p{L}*|pypi)(?=$|[^\p{L}])/iu.test(text))return 'pip';
 return null;
}

let operation=null,busy=false;
const deps={npm:()=>S.npmCommand({home:require('node:os').homedir()}),exec:S.exec};
function publish(s,item){
 operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',operation);}catch{/* window closing */}
}
const EMPTY=()=>({critical:0,high:0,moderate:0,low:0,unknown:0});
const RANK={critical:4,high:3,moderate:2,low:1,unknown:0};

async function npmPart(s,dir,signal,notes){
 const project=M.npmProject(dir),rel=label=>label+(project.name?' · '+project.name:'');
 const eco={id:'npm',label:rel('npm'),dir,status:'ok',note:''};
 if(project.error){eco.status='error';eco.note=project.error;return {eco,packages:[]};}
 const byName=new Map(project.deps.map(d=>[d.name,{name:d.name,ecosystem:'npm',project:project.name,current:d.installed,spec:d.spec,wanted:null,latest:null,kind:null,dev:d.dev,direct:true,flags:[],vulns:[]}]));
 const cmd=deps.npm();
 let outdatedOk=false,auditOk=false;
 if(!cmd){eco.status='error';eco.note='npm не найден: установите Node.js или откройте Петю из терминала. Список пакетов показан без свежих версий.';}
 else{
  s.requestProgress?.report?.('npm outdated: '+project.name);
  try{
   const data=await S.npmOutdated(deps.exec,cmd,dir,{signal});outdatedOk=true;
   for(const [name,v] of Object.entries(data||{})){
    const row=byName.get(name)||{name,ecosystem:'npm',project:project.name,spec:'',dev:false,direct:false,flags:[],vulns:[]};
    Object.assign(row,{current:v.current||row.current||null,wanted:v.wanted||null,latest:v.latest||null});
    byName.set(name,row);
   }
  }catch(e){
   if(e.name==='AbortError')throw e;
   eco.status=S.offline(e)?'offline':'error';
   eco.note=S.offline(e)?'Нет сети: свежие версии npm не получены.':'npm outdated: '+(e.stderr||e.message).trim().split('\n')[0].slice(0,160);
  }
  if(project.hasLock&&eco.status!=='offline'){
   s.requestProgress?.report?.('npm audit: '+project.name);
   try{
    const vulns=S.auditVulns(await S.npmAudit(deps.exec,cmd,dir,{signal}));auditOk=true;
    for(const [name,v] of vulns){
     const row=byName.get(name)||{name,ecosystem:'npm',project:project.name,current:null,spec:'',dev:false,direct:v.direct,flags:[],vulns:[]};
     row.vulns=v.advisories.length?v.advisories:[{id:name,severity:v.severity,summary:'Уязвима через '+v.via.join(', '),url:'',fixed:''}];
     if(v.fix)row.fix=v.fix;
     if(!row.current)row.current=null;
     byName.set(name,row);
    }
   }catch(e){if(e.name==='AbortError')throw e;notes.push('npm audit недоступен ('+(S.offline(e)?'нет сети':e.message.slice(0,80))+') — проверяю по OSV.');}
  }
 }
 // OSV for npm when audit could not run: exact installed versions only.
 if(!auditOk&&eco.status!=='offline'){
  const queries=[...byName.values()].filter(r=>r.current).map(r=>({name:r.name,ecosystem:'npm',version:r.current}));
  try{const found=await S.osv(s.request,queries,{signal});queries.forEach((q,i)=>{if(found[i]?.length)byName.get(q.name).vulns=found[i];});eco.vulnSource='OSV';}
  catch(e){if(e.name==='AbortError')throw e;if(S.offline(e)){eco.status='offline';eco.note='Нет сети: версии и уязвимости npm не проверены.';}else notes.push('OSV: '+e.message.slice(0,120));}
 }else if(auditOk)eco.vulnSource='npm audit';
 if(!project.hasLock)notes.push((project.name||'npm')+': нет package-lock.json'+(project.lockfile?' ('+project.lockfile+')':'')+' — уязвимости проверены по OSV для установленных версий.');
 for(const r of byName.values())r.kind=r.current&&r.latest?M.kind(r.current,r.latest):null;
 eco.checked=outdatedOk;
 return {eco,packages:[...byName.values()]};
}

async function pipPart(s,entry,signal,notes){
 const project=M.pipProject(entry);
 const eco={id:'pip',label:'pip · '+entry.files.join(', '),dir:entry.dir,status:'ok',note:''};
 const rows=project.deps.map(d=>({name:d.name,ecosystem:'pip',current:d.pinned,spec:d.spec,wanted:null,latest:null,kind:null,dev:false,direct:true,flags:[],vulns:[],file:d.file}));
 let failures=0,network=false;
 for(let i=0;i<rows.length;i+=6){
  s.requestProgress?.report?.('PyPI: '+Math.min(i+6,rows.length)+' из '+rows.length);
  await Promise.all(rows.slice(i,i+6).map(async r=>{
   try{const v=await S.pypi(s.request,r.name,r.spec,{signal});r.latest=v.latest;r.wanted=v.wanted;}
   catch(e){if(e.name==='AbortError')throw e;failures++;if(S.offline(e))network=true;else r.error='не найден на PyPI';}
  }));
  if(network)break;
 }
 if(network){eco.status='offline';eco.note='Нет сети: последние версии с PyPI не получены.';}
 else if(failures)eco.note='Не найдено на PyPI: '+failures+'.';
 const pinned=rows.filter(r=>r.current);
 if(pinned.length<rows.length)notes.push('pip: '+(rows.length-pinned.length)+' '+kit.plural(rows.length-pinned.length,['пакет','пакета','пакетов'])+' без точной версии (==) — уязвимости для них не проверить.');
 if(!network&&pinned.length){
  try{const found=await S.osv(s.request,pinned.map(r=>({name:r.name,ecosystem:'PyPI',version:r.current})),{signal});pinned.forEach((r,i)=>{r.vulns=found[i]||[];});eco.vulnSource='OSV';}
  catch(e){if(e.name==='AbortError')throw e;if(S.offline(e)){eco.status='offline';eco.note='Нет сети: уязвимости не проверены.';}else notes.push('OSV: '+e.message.slice(0,120));}
 }
 for(const r of rows)r.kind=r.current&&r.latest?M.kind(r.current,r.latest):null;
 return {eco,packages:rows};
}

function unityPart(dir){
 const project=M.unityProject(dir);
 const eco={id:'unity',label:'Unity · '+project.name+(project.editor?' ('+project.editor+')':''),dir,status:project.error?'error':'listed',
  note:project.error||'Последние версии пакетов Unity без редактора не узнать — показаны текущие версии, git/file-пакеты и preview.'};
 const packages=project.deps.filter(d=>!d.builtin).map(d=>({name:d.name,ecosystem:'unity',current:d.version,spec:d.spec,wanted:null,latest:null,kind:null,dev:false,direct:true,flags:d.flags,vulns:[],source:d.source}));
 eco.builtin=project.deps.filter(d=>d.builtin).length;
 return {eco,packages};
}
function listPart(kind,dir){
 const project=kind==='gradle'?M.gradleProject(dir):M.podsProject(dir);
 return {eco:{id:kind,label:(kind==='gradle'?'Gradle':'CocoaPods')+' · '+path.basename(dir),dir,status:'listed',note:'Только список: версии не сверяются.'},
  packages:project.deps.map(d=>({name:d.name,ecosystem:kind,current:d.version,wanted:null,latest:null,kind:null,dev:false,direct:true,flags:[],vulns:[]}))};
}

function summarize(packages){
 const sum={outdated:0,patch:0,minor:0,major:0,vulns:EMPTY(),vulnerable:0,flagged:0,total:packages.length};
 for(const p of packages){
  if(p.kind){sum.outdated++;sum[p.kind]++;}
  if(p.vulns.length){sum.vulnerable++;for(const v of p.vulns)sum.vulns[v.severity]++;}
  if(p.flags.length)sum.flagged++;
 }
 return sum;
}
function text(name,sum,ecos,notes){
 const parts=[];
 const nv=Object.values(sum.vulns).reduce((a,b)=>a+b,0);
 const checked=ecos.some(e=>e.id==='npm'||e.id==='pip');
 if(checked)parts.push(name+': устарело '+sum.outdated+' '+kit.plural(sum.outdated,['пакет','пакета','пакетов'])+(sum.major?' (крупных обновлений — '+sum.major+')':'')+'.');
 if(nv)parts.push('Уязвимостей: '+nv+(sum.vulns.critical?', критических — '+sum.vulns.critical:'')+(sum.vulns.high?', высоких — '+sum.vulns.high:'')+'.');
 else if(checked&&!ecos.some(e=>e.status==='offline'))parts.push('Известных уязвимостей не нашёл.');
 const unity=ecos.filter(e=>e.id==='unity');
 if(unity.length)parts.push('Unity: '+sum.unity+' '+kit.plural(sum.unity,['пакет','пакета','пакетов'])+(sum.flagged?', с пометками (git/file/preview) — '+sum.flagged:'')+'; последние версии без редактора не узнать.');
 const offline=ecos.filter(e=>e.status==='offline');
 if(offline.length)parts.push('Нет сети — '+offline.map(e=>e.id).join(', ')+' проверены не полностью.');
 return parts.join(' ')||name+': пакеты прочитаны.';
}

async function check(s,command){
 const found=await s.gitWorkspace?.discover?.().catch(()=>null);
 const folders=[...new Set([...(found?.selected?[found.selected]:[]),...(found?.folders||[]),...(found?.repositories||[])])];
 if(!folders.length)return kit.reply(s,command,{by:BY,question:true,text:'У проекта нет папки на компьютере. Подключите папку проекта в настройках проекта — тогда проверю его зависимости.'});
 const filter=only(command);
 const manifests=M.discover(folders);
 const has=k=>!filter||filter===k||(filter==='npm'&&k==='npm');
 const total=(has('npm')?manifests.npm.length:0)+(has('pip')?manifests.pip.length:0)+(has('unity')?manifests.unity.length:0)+(filter?0:manifests.gradle.length+manifests.pods.length);
 if(!total)return kit.reply(s,command,{by:BY,question:true,text:filter==='unity'?'В папке проекта не нашёл Unity-проект (Packages/manifest.json). Откройте чат проекта Unity или подключите его папку.':'В папке проекта не нашёл package.json, requirements.txt, pyproject.toml, Packages/manifest.json, build.gradle или Podfile.lock. Какую папку проверить? Подключите её в настройках проекта.'});
 if(busy)return kit.reply(s,command,{by:BY,text:'Уже проверяю зависимости — дождитесь результата.'});
 busy=true;
 const signal=cancel.signal(),notes=[],ecos=[],packages=[];let step=0;
 const stage=label=>{step++;s.requestProgress?.report?.(label);publish(s,{text:label,busy:true,percent:Math.round((step-1)*100/total),kind:'info',version:'running:'+label});};
 try{
  if(has('npm'))for(const dir of manifests.npm.slice(0,6)){stage('npm: '+path.basename(dir));const r=await npmPart(s,dir,signal,notes);ecos.push(r.eco);packages.push(...r.packages);}
  if(has('pip'))for(const entry of manifests.pip.slice(0,4)){stage('pip: '+path.basename(entry.dir));const r=await pipPart(s,entry,signal,notes);ecos.push(r.eco);packages.push(...r.packages);}
  if(has('unity'))for(const dir of manifests.unity.slice(0,4)){stage('Unity: '+path.basename(dir));const r=unityPart(dir);ecos.push(r.eco);packages.push(...r.packages);}
  if(!filter)for(const [kind,list] of [['gradle',manifests.gradle],['pods',manifests.pods]])for(const dir of list.slice(0,3)){const r=listPart(kind,dir);ecos.push(r.eco);packages.push(...r.packages);}
  const sum=summarize(packages);sum.unity=packages.filter(p=>p.ecosystem==='unity').length;
  const name=found?.name||path.basename(folders[0]);
  const order=p=>-(Math.max(0,...p.vulns.map(v=>RANK[v.severity]))*10+({major:3,minor:2,patch:1}[p.kind]||0)+(p.flags.length?0.5:0));
  packages.sort((a,b)=>order(a)-order(b)||a.ecosystem.localeCompare(b.ecosystem)||a.name.localeCompare(b.name));
  const nv=Object.values(sum.vulns).reduce((a,b)=>a+b,0);
  publish(s,{text:'Готово: устарело '+sum.outdated+', уязвимостей '+nv,busy:false,kind:nv?'attention':'success',version:'done:'+Date.now()});
  const card={project:name,at:Date.now(),filter,showVulns:/уязвим|audit|cve|безопасн/iu.test(command),ecosystems:ecos,packages:packages.slice(0,300),summary:sum,notes};
  return kit.reply(s,command,{by:BY,text:text(name,sum,ecos,notes),data:{dependencies:card}});
 }catch(e){
  publish(s,{text:e.name==='AbortError'?'Остановлено':'Ошибка: '+e.message,busy:false,kind:e.name==='AbortError'?'info':'error',version:'error:'+Date.now()});
  if(e.name==='AbortError')throw e;
  return kit.failure(s,command,BY,e);
 }finally{busy=false;}
}

async function turn(s,command){
 const t=String(command||'');
 if(!wanted(t)||!kit.installed(s,ID))return null;
 return check(s,t);
}
function setup(){return {ipc:{progress:()=>operation}};}
module.exports={name:'dependencies',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,wanted,only,deps,summarize};
