// Reminder trigger «сборка завершилась»: «напомни, когда соберётся билд», «когда закончится сборка на андроид».
// Reads runs through «Сборки» (GitHub Actions REST `GET /repos/{owner}/{repo}/actions/runs` and Unity Build
// Automation v2, src/extensions/ci-builds/sources.cjs): the newest running or queued run is watched until it
// finishes; when nothing runs, the next run that finishes. Polls every minute, then less often (up to 5 minutes).
// Lives here until «Сборки» declares its own `reminder-trigger` (move the file, the contract is the same).
const {TriggerError}=require('./triggers.cjs');
const SUBJECT='(?:билд\\p{L}*|сборк\\p{L}*|ci|пайплайн\\p{L}*|workflow|воркфло\\p{L}*)';
const VERB='(?:соберётся|соберется|собер[её]тся|закончится|заверш\\p{L}*|пройд[её]т|доедет|будет готов\\p{L}*|упад[её]т|доберётся|отработает)';
const FINISH=new RegExp('когда\\s+(?:'+VERB+'\\s+(?:\\p{L}+\\s+)?'+SUBJECT+'|'+SUBJECT+'(?:\\s+\\p{L}+){0,3}?\\s+'+VERB+')','iu');
const BRANCH=/(?:ветк\p{L}*|branch)\s+[«"]?([A-Za-z0-9._\/-]{1,100})/iu;
const DONE=['success','failure','cancelled','skipped'];
const RESULT={success:'успешно завершилась',failure:'упала',cancelled:'отменена',skipped:'пропущена'};
async function runs(s,params){
 const src=require('../ci-builds/sources.cjs'),github=require('../github/client.cjs');
 const out=[];
 if(github.connected(s.settings))for(const repo of (await github.repos(s)).slice(0,3))out.push(...await src.githubRuns(s,repo,{branch:params.branch||undefined}));
 if(src.unityConfigured(s.settings))out.push(...await src.unityRuns(s,{platform:params.platform||undefined}));
 return out.filter(r=>!params.platform||r.source==='unity'||src.matchesPlatform(params.platform,r.workflow+' '+r.title));
}
const name=r=>'«'+r.workflow+'» #'+r.number+(r.branch?' ('+r.branch+')':'');
module.exports={
 id:'ci-build',name:'Сборка CI',icon:'build',
 connect:'Добавьте «Сборки» и подключите GitHub или Unity Build Automation в настройках.',
 match(text){
  const t=String(text);if(!FINISH.test(t))return null;
  let platform='';try{platform=require('../ci-builds/sources.cjs').platformOf(t);}catch{platform='';}
  return {platform,branch:BRANCH.exec(t)?.[1]||''};
 },
 ready(settings){
  if(settings['extension_ci-builds']!=='true')return false;
  try{return require('../github/client.cjs').connected(settings)||require('../ci-builds/sources.cjs').unityConfigured(settings);}catch{return false;}
 },
 async prepare(s,params,{now=Date.now()}={}){
  const list=(await runs(s,params)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const run=list.find(r=>r.status==='running'||r.status==='queued');
  if(run)return {params:{...params,key:run.key,workflow:run.workflow,number:run.number},label:'сборка '+name(run)+' завершится',url:run.url||''};
  return {params:{...params,key:'',after:now,seen:list.filter(r=>DONE.includes(r.status)).map(r=>r.key).slice(0,80)},label:'завершится следующая сборка',note:'Сейчас ни одна сборка не идёт — напомню, когда завершится следующая.'};
 },
 async check(s,params){
  const list=await runs(s,params);
  const run=params.key?list.find(r=>r.key===params.key):list.filter(r=>DONE.includes(r.status)&&!params.seen.includes(r.key)&&Date.parse(r.at)>=params.after-10*60000).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
  if(params.key&&!run)throw new TriggerError('not-found','Сборка '+params.workflow+' #'+params.number+' больше не видна в списке запусков.');
  if(!run||!DONE.includes(run.status))return {fired:false};
  return {fired:true,text:'Сборка '+name(run)+' '+RESULT[run.status]+'.',url:run.url||''};
 },
 every(checks){return Math.min(5*60000,Math.round(60000*Math.pow(1.3,checks)));}
};
