// «Сборки» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// the latest run of every workflow / Unity build target on the release branch must be green. Read-only.
const github=require('../github/client.cjs');
const src=require('./sources.cjs');
const LABEL={success:'успешно',failure:'упал',cancelled:'отменён',running:'идёт',queued:'в очереди',skipped:'пропущен',unknown:'неизвестно'};

module.exports={
 checks:[{id:'ci.green',title:'CI зелёный на релизной ветке',group:'Сборка'}],
 ready:settings=>github.connected(settings)||src.unityConfigured(settings),
 hint:()=>'Подключите GitHub или Unity Build Automation в настройках «Сборки».',
 async run(s,release){
  const branch=release.branch,runs=[],errors=[];
  if(github.connected(s.settings)){
   let repos=[];try{repos=await github.repos(s);}catch(e){errors.push('GitHub: '+e.message);}
   for(const repo of repos.slice(0,3)){try{runs.push(...await src.githubRuns(s,repo,{branch}));}catch(e){errors.push('GitHub '+repo+': '+e.message);}}
  }
  if(src.unityConfigured(s.settings)){try{runs.push(...(await src.unityRuns(s,{})).filter(r=>r.branch===branch));}catch(e){errors.push('Unity Build Automation: '+e.message);}}
  if(!runs.length)return [{id:'ci.green',status:'unknown',summary:errors.length?'Не удалось прочитать CI: '+errors.join('; '):'На ветке '+branch+' запусков CI нет.',action:{label:'Сборки',ask:'последние сборки'}}];
  // The latest run per workflow (GitHub) or build target (Unity) decides.
  const latest=new Map();
  for(const r of [...runs].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)))if(!latest.has(r.group)&&r.status!=='skipped')latest.set(r.group,r);
  const list=[...latest.values()];
  const failed=list.filter(r=>r.status==='failure'),pending=list.filter(r=>['running','queued'].includes(r.status)),odd=list.filter(r=>['cancelled','unknown'].includes(r.status));
  const evidence=list.slice(0,6).map(r=>({text:r.workflow+' #'+r.number+' — '+LABEL[r.status],url:r.url}));
  if(failed.length)return [{id:'ci.green',status:'problem',summary:'На '+branch+' '+(failed.length===1?'упал «'+failed[0].workflow+'» #'+failed[0].number:'упали '+failed.map(r=>'«'+r.workflow+'»').join(', '))+'.',evidence,action:{label:'Почему упала',ask:'почему упала сборка на ветке '+branch}}];
  if(pending.length)return [{id:'ci.green',status:'unknown',summary:'На '+branch+' ещё идут сборки: '+pending.map(r=>'«'+r.workflow+'»').join(', ')+'.',evidence}];
  if(odd.length)return [{id:'ci.green',status:'problem',summary:'Последний запуск '+odd.map(r=>'«'+r.workflow+'»').join(', ')+' не завершился успешно ('+odd.map(r=>LABEL[r.status]).join(', ')+').',evidence}];
  return [{id:'ci.green',status:'ok',summary:'Последние запуски на '+branch+' успешны: '+list.length+'.',evidence}];
 }
};
