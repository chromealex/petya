// «Зависимости» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// known vulnerabilities in the project's packages. Critical or high ones are a problem, moderate and low are listed.
// A dependencies card from the last 24 hours is reused; otherwise `npm audit` (with a lockfile) and OSV for pinned
// npm/pip versions are asked, as the app's card does. Read-only: nothing is installed or changed.
const M=require('./manifests.cjs');
const S=require('./sources.cjs');
const feature=require('./feature.cjs');
const FRESH=24*3600000;
const EMPTY=()=>({critical:0,high:0,moderate:0,low:0,unknown:0});

function recent(s,now){
 let best=null;
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){const c=m.extensionData?.dependencies;if(c&&now-c.at<FRESH&&!c.filter&&(!best||c.at>best.at))best=c;}
 return best;
}
async function audit(s,folders){
 const manifests=M.discover(folders),vulns=EMPTY(),rows=[],notes=[];let checked=0;
 const add=(name,list)=>{if(!list.length)return;for(const v of list)vulns[v.severity]++;rows.push({name,vulns:list});};
 const cmd=feature.deps.npm();
 for(const dir of manifests.npm.slice(0,6)){
  const project=M.npmProject(dir);if(project.error)continue;
  if(project.hasLock&&cmd){
   try{for(const [name,v] of S.auditVulns(await S.npmAudit(feature.deps.exec,cmd,dir,{})))add(name,v.advisories.length?v.advisories:[{id:name,severity:v.severity,summary:'',url:''}]);checked++;continue;}
   catch(e){if(S.offline(e)){notes.push('нет сети для npm audit');continue;}}
  }
  const queries=project.deps.filter(d=>d.installed).map(d=>({name:d.name,ecosystem:'npm',version:d.installed}));
  try{const found=await S.osv(s.request,queries);queries.forEach((q,i)=>add(q.name,found[i]||[]));checked++;}catch(e){notes.push('OSV: '+e.message.slice(0,80));}
 }
 for(const entry of manifests.pip.slice(0,4)){
  const pinned=M.pipProject(entry).deps.filter(d=>d.pinned).map(d=>({name:d.name,ecosystem:'PyPI',version:d.pinned}));if(!pinned.length)continue;
  try{const found=await S.osv(s.request,pinned);pinned.forEach((q,i)=>add(q.name,found[i]||[]));checked++;}catch(e){notes.push('OSV: '+e.message.slice(0,80));}
 }
 return {checked,vulns,rows,notes,manifests:manifests.npm.length+manifests.pip.length+manifests.unity.length};
}

module.exports={
 checks:[{id:'deps.vulnerable',title:'Нет уязвимых зависимостей',group:'Код'}],
 ready:()=>true,
 async run(s,release){
  const now=(release.now||new Date()).getTime(),action={label:'Зависимости',ask:'есть ли уязвимости в зависимостях'};
  let vulns,rows,from='';
  const card=recent(s,now);
  if(card){
   vulns=card.summary.vulns;rows=card.packages.filter(p=>p.vulns?.length).map(p=>({name:p.name,vulns:p.vulns}));from='проверка '+new Date(card.at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }else{
   const found=await s.gitWorkspace?.discover?.().catch(()=>null);
   const folders=[...new Set([...(release.roots||[]),...(found?.selected?[found.selected]:[]),...(found?.folders||[])])];
   if(!folders.length)return [{id:'deps.vulnerable',status:'unknown',summary:'У проекта нет папки на компьютере — подключите её в настройках проекта.'}];
   const r=await audit(s,folders);
   if(!r.checked)return [{id:'deps.vulnerable',status:'unknown',summary:r.manifests?'Уязвимости не проверены'+(r.notes.length?': '+r.notes.join('; '):' (Unity, Gradle и CocoaPods сверяются только списком)')+'.':'В папке проекта нет package.json, requirements.txt или pyproject.toml.',action}];
   vulns=r.vulns;rows=r.rows;
  }
  const rank={critical:4,high:3,moderate:2,low:1,unknown:0};
  const evidence=rows.sort((a,b)=>Math.max(...b.vulns.map(v=>rank[v.severity]))-Math.max(...a.vulns.map(v=>rank[v.severity]))).slice(0,5)
   .map(r=>({text:r.name+': '+r.vulns.map(v=>v.severity).filter((v,i,l)=>l.indexOf(v)===i).join(', ')+(r.vulns[0].summary?' — '+r.vulns[0].summary:''),url:r.vulns[0].url}));
  if(from)evidence.push({text:'По последней '+from+'.'});
  const serious=vulns.critical+vulns.high,minor=vulns.moderate+vulns.low+vulns.unknown;
  if(serious)return [{id:'deps.vulnerable',status:'problem',summary:'Серьёзных уязвимостей: '+serious+(vulns.critical?' (критических — '+vulns.critical+')':'')+'.',evidence,action}];
  return [{id:'deps.vulnerable',status:'ok',summary:minor?'Критических и высоких нет; средних и низких — '+minor+'.':'Известных уязвимостей нет.',evidence,action}];
 }
};
