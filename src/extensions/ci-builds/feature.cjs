// «Сборки»: CI runs in the chat — GitHub Actions workflow runs and Unity Build Automation builds, a history strip
// per workflow, and for a failed run the failing job/step with the first error lines of its log (found by code).
// Re-running is a card button with its own confirmation; a chat turn never re-runs anything.
//
// Boundary with the existing build flows (they run after extension turns in converse.cjs, so this turn must
// step aside for what they own):
//  - build-repair.cjs: «почини/исправь билд», «статус исправления», «отмени исправление» and build logs attached
//    to the chat or a repair source in the topic;
//  - build-question.cjs: «спроси/узнай, что с билдом», «что с этим билдом», and a bare «что с билдом / как там
//    сборка» that names no CI target (it asks the people of the Slack thread);
//  - slack-log.cjs / review-assistant.cjs: anything said in a Slack thread chat (topic.slackSource / slackLog),
//    a request that names Slack, «следи за билдом», «статус билдов», «сравни с прошлым падением».
// «что с билдом на андроид», «почему упала сборка», «последние сборки», «статус CI» are answered here.
const kit=require('../app-kit.cjs');
const github=require('../github/client.cjs');
const src=require('./sources.cjs');
const ID='ci-builds',BY='Сборки';

const SUBJECT=/(?:^|[^\p{L}])(?:сборк\p{L}*|билд\p{L}*|builds?|ci|ci\/cd|пайплайн\p{L}*|pipelines?|workflows?|воркфло\p{L}*|github actions|actions|экшен\p{L}*|джоб\p{L}*|прогон\p{L}*|cloud build|build automation)(?=$|[^\p{L}])/iu;
const INTENT=/(?:почему|из-за чего|что с |что там|статус|состояни|последн|покажи|показать|какие|как там|как дела|упал|упала|упало|упали|пада|сломал|красн|зел[её]н|прош[её]л|прошла|прошли|перезапуст|история|список|что по |провер)/iu;
const WHY=/(?:почему|из-за чего|причин|что сломал|какая ошибк|что за ошибк|в ч[её]м ошибк|что упало)/iu;
const RERUN=/(?:перезапуст\p{L}*|rerun|re-run)/iu;
// Explicit CI targets: with one of these, a «что с билдом …» is about CI, not a Slack thread.
const TARGET=/(?:^|[^\p{L}])(?:ci|github|actions|workflow\p{L}*|воркфло\p{L}*|пайплайн\p{L}*|pipeline|unity cloud|cloud build|build automation|ветк\p{L}*|branch|main|master|develop|android|андроид\p{L}*|ios|айос|iphone|webgl|windows|винд\p{L}*|mac|macos|linux)(?=$|[^\p{L}])/iu;
// What other flows and neighbour apps own.
const NOT_OURS=[
 /^(?:а\s+)?(?:что такое|зачем нуж|как (?:настроить|подключить|работает|устроен))/iu,
 /(?:slack|слак\p{L}*|тред\p{L}*|канал\p{L}*)/iu,
 /(?:^|[^\p{L}])(?:спроси|узнай|напиши|сообщи)(?=$|[^\p{L}])/iu,
 /(?:этим|этой|этот|эта|тем|той)\s+(?:билд|сборк)/iu,
 /^(?:следи|наблюдай)|сравни\s.*(?:падени|билд|лог)|^статус (?:билдов|исправления)|^что с исправлением|^отмени (?:исправление|ожидание)|за чем ты следишь|^запомни/iu,
 /(?:размер\p{L}*|(?:^|[^\p{L}])(?:вес(?:ит|а|е)?|мб|mb)(?=$|[^\p{L}])|мегабайт|похудел|растолст)/iu,
 /(?:зависимост|уязвим|npm audit|версии пакет)/iu,
 /(?:^|[^\p{L}])(?:собери|собрать|соберите|(?<!пере)запусти\p{L}*\s+(?:сборк|билд)|сделай билд|билдани)/iu,
 /^исправь код/iu
];
const BRANCH=/(?:ветк\p{L}*|branch)\s+[«"]?([A-Za-z0-9._\/-]{1,100})|(?:^|[\s«"])(main|master|develop|dev|release\/[A-Za-z0-9._-]+)(?=$|[\s»".,!?])/iu;

const isRepair=text=>{try{return require('../../build-repair.cjs').isRepair(text);}catch{return false;}};
const isBuildQuestion=text=>{try{return require('../../build-question.cjs').isBuildQuestion(text);}catch{return false;}};

// Whether a chat request is for «Сборки», and what it asks: {kind:'why'|'rerun'|'status', platform, branch}.
function route(text,topic){
 const t=String(text||'').trim().replace(/^петя[\s,!:—-]+/iu,'');
 if(!t||t.length>500||!SUBJECT.test(t)||!INTENT.test(t))return null;
 if(isRepair(t)||NOT_OURS.some(re=>re.test(t)))return null;
 if(isBuildQuestion(t)&&!TARGET.test(t))return null;
 if(topic?.slackSource||topic?.slackLog||topic?.repairSource||topic?.attachments?.length)return null;
 const platform=src.platformOf(t),branch=(t.match(BRANCH)||[]).slice(1).find(Boolean)||'';
 return {kind:RERUN.test(t)?'rerun':WHY.test(t)?'why':'status',platform,branch};
}

const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);if(!Number.isFinite(m))return '';if(m<1)return 'только что';if(m<60)return m+' мин назад';const h=Math.round(m/60);if(h<24)return h+' ч назад';const d=Math.round(h/24);return d+' '+kit.plural(d,['день','дня','дней'])+' назад';};
// Handoff text for «Программист»: it must read as coding work (coder/intent.cjs), so words that route to other
// flows (build/CI/commit/Jira) are left out of it.
const HANDOFF_WORDS=/(?:^|(?<=[^\p{L}]))(?:билд\p{L}*|сборк\p{L}*|ci|codex|кодекс\p{L}*|claude|клод\p{L}*|jira|джир\p{L}*|тикет\p{L}*|коммит\p{L}*|push|pull)(?=$|[^\p{L}])/giu;
function handoff(f){
 const where=[f.job&&'«'+f.job+'»',f.step&&'шаг «'+f.step+'»'].filter(Boolean).join(', ');
 const text='Исправь код проекта, чтобы проходила проверка'+(where?' '+where:'')+(f.repo?' в '+f.repo:'')+(f.branch?' (ветка '+f.branch+')':'')+'. Ошибка:\n'+(f.lines.length?f.lines.join('\n'):'см. лог по ссылке '+(f.url||''));
 return text.replace(HANDOFF_WORDS,'…').slice(0,1500);
}

function groups(runs){
 const map=new Map();
 for(const r of [...runs].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))){if(!map.has(r.group))map.set(r.group,{key:r.group,name:r.workflow,source:r.source,repo:r.repo,runs:[]});map.get(r.group).runs.push(r);}
 return [...map.values()].map(g=>({...g,last:g.runs.at(-1),runs:g.runs.slice(-10).map(r=>({status:r.status,number:r.number,branch:r.branch,at:r.at,url:r.url,title:r.title}))}))
  .sort((a,b)=>Date.parse(b.last.at)-Date.parse(a.last.at)).slice(0,6).map(({last,...g})=>g);
}
// The run to explain: the latest failure (asked «почему»), or a workflow whose latest finished run is red.
function pickFailure(runs,kind){
 const sorted=[...runs].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 if(kind!=='status')return sorted.find(r=>r.status==='failure')||null;
 const latest=new Map();for(const r of sorted)if(['success','failure'].includes(r.status)&&!latest.has(r.group))latest.set(r.group,r);
 return [...latest.values()].find(r=>r.status==='failure')||null;
}

function setup(s){
 // Runs shown in a card, so the card's «Перезапустить» can only act on what the user saw.
 const shown=new Map();
 const remember=run=>{shown.set(run.key,{...run,company:s.companyId,at:Date.now()});while(shown.size>60)shown.delete(shown.keys().next().value);};
 const publish=(text,busy,kind='info')=>{try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',{id:'ci-builds',title:BY,text,busy,kind});}catch{/* window closed */}};
 let busy=false;
 async function rerun(key){
  const run=shown.get(String(key||''));
  if(!run||run.company!==s.companyId||Date.now()-run.at>3600000)throw Error('Покажите сборку заново: эта карточка устарела.');
  if(busy)throw Error('Уже перезапускаю сборку.');
  busy=true;publish('Перезапускаю «'+run.workflow+'»…',true);
  try{const r=await (run.source==='github'?src.githubRerun(s,run):src.unityRerun(s,run));shown.delete(run.key);publish(r.text,false,'success');return r;}
  catch(e){publish('Не удалось перезапустить «'+run.workflow+'»: '+e.message,false,'error');throw e;}
  finally{busy=false;}
 }
 // Settings form: what is connected (secrets never reach the renderer).
 async function status(){return {github:github.connected(s.settings),unity:src.unityConfigured(s.settings),org:s.settings.ciUnityOrg||'',project:s.settings.ciUnityProject||'',keyId:String(s.settings.ciUnityKey||'').split(':')[0]||''};}
 return {ciBuilds:{remember},ipc:{rerun,status}};
}

async function collect(s,{repos,platform,branch}){
 const runs=[],errors=[];
 if(github.connected(s.settings))for(const repo of repos.slice(0,3)){
  try{s.requestProgress?.report('Читаю запуски GitHub Actions '+repo);runs.push(...await src.githubRuns(s,repo,{branch}));}
  catch(e){errors.push({source:'GitHub '+repo,text:e.message});}
 }
 if(src.unityConfigured(s.settings)){
  try{s.requestProgress?.report('Читаю сборки Unity Build Automation');runs.push(...(await src.unityRuns(s,{platform})).filter(r=>!branch||r.branch===branch));}
  catch(e){errors.push({source:'Unity Build Automation',text:e.message});}
 }
 return {runs,errors};
}

async function answer(s,command,want,repos){
 const {runs:all,errors}=await collect(s,{repos,platform:want.platform,branch:want.branch});
 if(!all.length&&errors.length)return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+errors.map(e=>e.source+': '+e.text).join(' ')});
 let runs=all,note='';
 if(want.platform){runs=all.filter(r=>r.source==='unity'||src.matchesPlatform(want.platform,r.workflow+' '+r.title));if(!runs.length&&all.length){runs=all;note='Сборок для '+src.PLATFORM_NAMES[want.platform]+' не нашёл — показываю все. ';}}
 if(!runs.length)return kit.reply(s,command,{by:BY,text:'Запусков CI не нашёл'+(want.branch?' на ветке '+want.branch:'')+(repos.length?' в '+repos.join(', '):'')+'.',data:{ciCard:{runs:[],history:[],failure:null,repos,errors,filter:want}}});
 const recent=[...runs].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8);
 const failed=pickFailure(runs,want.kind);
 let failure=null;
 if(failed){
  s.requestProgress?.report('Читаю лог упавшей сборки');
  try{failure=await (failed.source==='github'?src.githubFailure(s,failed):src.unityFailure(s,failed));}
  catch(e){failure={key:failed.key,source:failed.source,repo:failed.repo,workflow:failed.workflow,number:failed.number,branch:failed.branch,title:failed.title,url:failed.url,job:'',step:'',lines:[],error:e.message};}
  failure.handoff=handoff(failure);failure.at=failed.at;
  s.ciBuilds?.remember(failed);failure.rerun=failed.key;
 }
 const count=st=>recent.filter(r=>r.status===st).length;
 let text;
 if(failure){
  const where=[failure.job&&'job «'+failure.job+'»',failure.step&&'шаг «'+failure.step+'»'].filter(Boolean).join(', ');
  text=note+'Упал «'+failure.workflow+'» #'+failure.number+(failure.branch?' на '+failure.branch:'')+(failed.at?' ('+ago(failed.at)+')':'')+(where?': '+where:'')+'.'+(failure.lines[0]?' Первая ошибка: '+failure.lines[0]:failure.error?' '+failure.error:'');
  if(want.kind==='rerun')text+=' Перезапустить можно кнопкой в карточке.';
 }else if(want.kind!=='status')text=note+'Среди последних сборок упавших нет: '+count('success')+' успешно'+(count('running')+count('queued')?', '+(count('running')+count('queued'))+' в работе':'')+'.';
 else text=note+'Последние сборки: '+count('success')+' успешно, '+count('failure')+' '+kit.plural(count('failure'),['упала','упали','упало'])+(count('running')+count('queued')?', '+(count('running')+count('queued'))+' в работе':'')+'.';
 if(errors.length)text+=' Не удалось прочитать: '+errors.map(e=>e.source).join(', ')+'.';
 const sources=failure?.url?[{title:failure.workflow+' #'+failure.number,url:failure.url}]:[];
 return kit.reply(s,command,{by:BY,text,sources,data:{ciCard:{runs:recent,history:groups(runs),failure,repos,errors,filter:want,note:note.trim()}}});
}

async function turn(s,command){
 const text=String(command||'');
 const want=route(text,s.dialogue?.active?.());
 if(!want||!kit.installed(s,ID))return null;
 if(s.attachments?.list?.().length)return null;
 const hasGithub=github.connected(s.settings),hasUnity=src.unityConfigured(s.settings);
 if(!hasGithub&&!hasUnity)return kit.reply(s,command,{by:BY,question:true,text:'Чтобы смотреть сборки, подключите GitHub (настройки → «GitHub», токен) или Unity Build Automation (настройки → «Сборки»). Потом повторите вопрос.'});
 const repos=hasGithub?await github.repos(s):[];
 if(hasGithub&&!repos.length&&!hasUnity){
  // No default repository and no GitHub remote in the project: ask which one, then continue this request.
  return require('../../input-required.cjs').ask({text:'В каком репозитории GitHub смотреть сборки? Укажите owner/repo (список по умолчанию задаётся в настройках «GitHub»).',label:'Репозиторий',placeholder:'owner/repo'},
   value=>{const list=github.parseRepos(value);if(!list.length)throw Error('Нужен репозиторий в виде owner/repo.');return answer(s,command,want,list.slice(0,3));});
 }
 try{return await answer(s,command,want,repos);}
 catch(e){if(e instanceof require('../../input-required.cjs').InputRequired)throw e;return kit.failure(s,command,BY,e);}
}
// Dashboards (src/features/dashboards.cjs): read-only requests refresh there by themselves.
const dashboard={accepts:text=>{const r=route(String(text||''),null);return !!r&&r.kind!=='rerun';},widgets:[{title:'Последние сборки',command:'как там сборки'}]};
module.exports={name:'ciBuilds',dashboard,defaults:{['extension_'+ID]:'false',ciUnityOrg:'',ciUnityProject:'',ciUnityKey:''},secrets:['ciUnityKey'],
 validate(next){
  for(const key of ['ciUnityOrg','ciUnityProject'])if(next[key]&&!/^[A-Za-z0-9._-]{1,100}$/.test(String(next[key]).trim()))throw Error('ID организации и проекта Unity — латиница, цифры, точка, дефис или подчёркивание.');
  if(next.ciUnityKey&&!/^[^:\s]{1,200}:[^\s]{1,400}$/.test(next.ciUnityKey))throw Error('Ключ Unity Build Automation: Key ID и Secret сервисного аккаунта.');
 },
 setup,turn,route,handoff,pickFailure,groups};
