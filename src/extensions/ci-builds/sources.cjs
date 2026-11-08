// CI sources of «Сборки»: GitHub Actions workflow runs (shared GitHub adapter) and Unity Build Automation
// builds (REST API v2, service account key). Both are normalized to one run shape:
// {key, source, repo, group, workflow, number, title, branch, sha, status, duration, at, url, event, target, platform}.
const github=require('../github/client.cjs');
const {errorLines}=require('./log.cjs');
const UNITY='https://build-automation.services.api.unity.com/v2';

// --- GitHub Actions -------------------------------------------------------------------------------
const GH_DONE={success:'success',neutral:'success',failure:'failure',timed_out:'failure',startup_failure:'failure',cancelled:'cancelled',stale:'cancelled',skipped:'skipped',action_required:'queued'};
function ghStatus(run){if(run.status!=='completed')return run.status==='in_progress'?'running':'queued';return GH_DONE[run.conclusion]||'unknown';}
const seconds=(from,to)=>{const a=Date.parse(from),b=Date.parse(to);return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.round((b-a)/1000):null;};
function ghRun(repo,r,now=Date.now()){
 const status=ghStatus(r),started=r.run_started_at||r.created_at;
 return {key:'gh:'+repo+':'+r.id,source:'github',repo,id:r.id,group:'gh:'+repo+':'+(r.workflow_id||r.name),workflow:String(r.name||r.path||'workflow').slice(0,120),number:r.run_number,attempt:r.run_attempt||1,
  title:String(r.display_title||r.head_commit?.message||'').split('\n')[0].slice(0,200),branch:String(r.head_branch||'').slice(0,120),sha:String(r.head_sha||'').slice(0,40),
  status,duration:status==='running'||status==='queued'?seconds(started,new Date(now).toISOString()):seconds(started,r.updated_at),at:r.created_at,
  url:/^https:\/\/github\.com\//.test(r.html_url||'')?r.html_url:'',event:String(r.event||''),actor:String(r.actor?.login||r.triggering_actor?.login||'')};
}
async function githubRuns(s,repo,{branch}={}){
 const api=github.create(s);
 const r=await api.get('/repos/'+github.validRepo(repo)+'/actions/runs',{per_page:40,branch});
 if(!Array.isArray(r?.workflow_runs))throw Error('GitHub вернул некорректный список запусков.');
 return r.workflow_runs.map(x=>ghRun(repo,x));
}
// The failing job and step of a run and the first error lines of that job's log.
async function githubFailure(s,run){
 const api=github.create(s);
 const jobs=(await api.get('/repos/'+run.repo+'/actions/runs/'+run.id+'/jobs',{filter:'latest',per_page:50}))?.jobs||[];
 const job=jobs.find(j=>['failure','timed_out'].includes(j.conclusion))||jobs.find(j=>j.conclusion&&!['success','skipped','neutral'].includes(j.conclusion));
 const failure={key:run.key,source:'github',repo:run.repo,workflow:run.workflow,number:run.number,branch:run.branch,title:run.title,url:run.url,job:'',step:'',lines:[],error:''};
 if(!job){failure.error='GitHub не показал упавший job (возможно, запуск не стартовал).';return failure;}
 failure.job=String(job.name||'').slice(0,160);
 if(/^https:\/\/github\.com\//.test(job.html_url||''))failure.url=job.html_url;
 const step=(job.steps||[]).find(x=>['failure','timed_out'].includes(x.conclusion));
 failure.step=String(step?.name||'').slice(0,160);
 try{failure.lines=errorLines(await api.log('/repos/'+run.repo+'/actions/jobs/'+job.id+'/logs'));}
 catch(e){failure.error='Лог недоступен: '+e.message;}
 return failure;
}
async function githubRerun(s,run){
 const api=github.create(s);
 // Only the failed jobs of a failed run; a cancelled run is rerun as a whole.
 await api.send('POST','/repos/'+run.repo+'/actions/runs/'+run.id+(run.status==='failure'?'/rerun-failed-jobs':'/rerun'));
 return {text:'Перезапуск «'+run.workflow+'» #'+run.number+' принят GitHub.',url:run.url};
}

// --- Unity Build Automation ----------------------------------------------------------------------
const unityConfigured=settings=>!!(String(settings?.ciUnityOrg||'').trim()&&String(settings?.ciUnityProject||'').trim()&&String(settings?.ciUnityKey||'').includes(':'));
const UNITY_STATUS={success:'success',failure:'failure',canceled:'cancelled',cancelled:'cancelled',queued:'queued',sentToBuilder:'queued',started:'running',restarted:'running',unknown:'unknown'};
function unityProblem(error){
 const status=error?.status;let text;
 if(status===401)text='Unity Build Automation не принял ключ сервисного аккаунта. Проверьте Key ID и Secret в настройках «Сборки».';
 else if(status===403)text='У сервисного аккаунта Unity нет доступа: нужна роль Automation User в проекте.';
 else if(status===404)text='Unity Build Automation: не найдено. Проверьте ID организации и проекта.';
 else if(status===410)text='Unity Build Automation отключил эту версию API.';
 else if(status===429)text='Unity Build Automation временно ограничил запросы. Повторите позже.';
 else return error instanceof Error?error:Error(String(error));
 const e=Error(text);e.status=status;return e;
}
function unityClient(s){
 if(!unityConfigured(s.settings))throw Error('Подключите Unity Build Automation в настройках «Сборки».');
 const org=encodeURIComponent(s.settings.ciUnityOrg.trim()),project=encodeURIComponent(s.settings.ciUnityProject.trim());
 const base=UNITY+'/orgs/'+org+'/projects/'+project;
 const headers={Authorization:'Basic '+Buffer.from(s.settings.ciUnityKey.trim()).toString('base64'),Accept:'application/json'};
 const doFetch=s.fetch||globalThis.fetch;
 const target=id=>{if(typeof id!=='string'||!/^[A-Za-z0-9._-]{1,120}$/.test(id))throw Error('Некорректная цель сборки Unity.');return encodeURIComponent(id);};
 return {
  base,org:s.settings.ciUnityOrg.trim(),project:s.settings.ciUnityProject.trim(),
  async get(path){try{return await s.request(base+path,{headers});}catch(e){throw unityProblem(e);}},
  async text(path){const r=await doFetch(base+path,{headers:{...headers,Accept:'text/plain'},signal:AbortSignal.timeout(60000)});if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;throw unityProblem(e);}return github.readText(r);},
  async post(path,body){const r=await doFetch(base+path,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});const t=await r.text().catch(()=>'');if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;throw unityProblem(e);}try{return t?JSON.parse(t):{};}catch{return {};}},
  target
 };
}
function unityRun(u,b){
 const status=UNITY_STATUS[b.buildStatus]||'unknown',targetId=String(b.buildtargetid||'');
 const change=Array.isArray(b.changeset)?b.changeset[0]:null;
 const dashboard=b.links?.dashboard_url?.href||b.links?.dashboard?.href||'';
 return {key:'unity:'+targetId+':'+b.build,source:'unity',repo:'',target:targetId,platform:String(b.platform||''),group:'unity:'+targetId,workflow:String(b.buildTargetName||targetId).slice(0,120),number:b.build,
  title:String(change?.message||'').split('\n')[0].slice(0,200),branch:String(b.scmBranch||'').slice(0,120),sha:String(b.lastBuiltRevision||change?.commitId||'').slice(0,40),
  status,duration:Number.isFinite(b.totalTimeInSeconds)?Math.round(b.totalTimeInSeconds):seconds(b.buildStartTime||b.created,b.finished),at:b.created||b.buildStartTime||'',
  url:/^https:\/\//.test(dashboard)?dashboard:'',event:'',actor:''};
}
async function unityRuns(s,{platform}={}){
 const u=unityClient(s);
 const targets=await u.get('/buildtargets');
 if(!Array.isArray(targets))throw Error('Unity Build Automation вернул некорректный список целей сборки.');
 const chosen=targets.filter(t=>t.enabled!==false&&(!platform||matchesPlatform(platform,(t.platform||'')+' '+(t.name||'')+' '+(t.buildtargetid||'')))).slice(0,6);
 const runs=[];
 for(const t of chosen){const builds=await u.get('/buildtargets/'+u.target(String(t.buildtargetid))+'/builds?per_page=10');if(Array.isArray(builds))runs.push(...builds.map(b=>unityRun(u,{buildTargetName:t.name,platform:t.platform,...b,buildtargetid:b.buildtargetid||t.buildtargetid})));}
 return runs;
}
async function unityFailure(s,run){
 const u=unityClient(s);
 const failure={key:run.key,source:'unity',repo:'',target:run.target,workflow:run.workflow,number:run.number,branch:run.branch,title:run.title,url:run.url,job:run.workflow,step:'',lines:[],error:''};
 try{failure.lines=errorLines(await u.text('/buildtargets/'+u.target(run.target)+'/builds/'+Number(run.number)+'/log?offsetlines=1&linenumbers=false'));}
 catch(e){failure.error='Лог недоступен: '+e.message;}
 return failure;
}
async function unityRerun(s,run){
 const u=unityClient(s);
 const r=await u.post('/buildtargets/'+u.target(run.target)+'/builds',{clean:false});
 const started=Array.isArray(r)?r[0]:r;
 if(started?.error)throw Error('Unity Build Automation: '+String(started.error).slice(0,200));
 return {text:'Сборка «'+run.workflow+'» поставлена в очередь Unity Build Automation'+(started?.build?' (#'+started.build+')':'')+'.',url:run.url};
}

// --- Platforms --------------------------------------------------------------------------------------
const PLATFORMS={android:/android|андроид|apk|aab|gradle/iu,ios:/(?:^|[^\p{L}])(?:ios|iphone|ipad|xcode|айос|айфон)(?=$|[^\p{L}])/iu,webgl:/webgl|веб-?gl/iu,windows:/windows|win64|win32|винд/iu,mac:/(?:^|[^\p{L}])(?:mac|macos|osx|мак)(?=$|[^\p{L}])/iu,linux:/linux|линукс/iu};
const PLATFORM_NAMES={android:'Android',ios:'iOS',webgl:'WebGL',windows:'Windows',mac:'macOS',linux:'Linux'};
function platformOf(text){for(const [id,re] of Object.entries(PLATFORMS))if(re.test(text))return id;return '';}
const matchesPlatform=(platform,text)=>!!PLATFORMS[platform]?.test(text);

module.exports={ghRun,ghStatus,githubRuns,githubFailure,githubRerun,unityConfigured,unityClient,unityRun,unityRuns,unityFailure,unityRerun,platformOf,matchesPlatform,PLATFORM_NAMES,UNITY};
