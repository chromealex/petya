// «Код-ревью»: reviews local changes before a PR (the working tree against the base branch) or a GitHub PR when
// «Pull requests» is connected. Code skips lock / vendor / generated / binary files, caps the size, runs its own
// checks (secrets, debug leftovers, TODO without an issue, large files, missing tests) and asks the local model
// per file with a strict schema; a model comment is kept only when it points to a changed line with the quoted code.
// Comments go to a PR only from the card, after the user confirms, as one review.
const kit=require('../app-kit.cjs');
const diff=require('./diff.cjs');
const checks=require('./checks.cjs');
const review=require('./review.cjs');
const {ask,InputRequired}=require('../../input-required.cjs');
const ID='code-review',BY='Код-ревью';

const REVIEW=/(?:код[- ]?ревью\p{L}*|code[- ]?review|(?:^|[^\p{L}])ревью(?=$|[^\p{L}])|ревьюн\p{L}*|отревью\p{L}*|поревью\p{L}*|проревью\p{L}*|(?:^|[^\p{L}])review(?=$|[^\p{L}]))/iu;
const CHECK=/(?:^|[^\p{L}])(?:проверь|проверить|посмотри|посмотреть|глянь|глянуть|оцени|покритикуй|найди\s+(?:баги|ошибки|проблемы))(?=$|[^\p{L}])/iu;
// What is reviewed locally: my changes, a diff, the branch before a PR / merge / push.
const MINE=/(?:мо(?:и|ё|е|й|его|их|ю)|наш\p{L}*)\s+(?:изменени\p{L}*|правк\p{L}*|код\p{L}*|дифф?\p{L}*|diff|коммит\p{L}*|ветк\p{L}*)/iu;
const DIFF=/(?:^|[^\p{L}])(?:дифф?\p{L}*|diff)(?=$|[^\p{L}])/iu;
const BEFORE=/перед\s+(?:pr|пр|пулл?[- ]?ре[кc]?вест\p{L}*|пул[- ]?риквест\p{L}*|мерж\p{L}*|мёрж\p{L}*|слияни\p{L}*|пуш\p{L}*|push|коммит\p{L}*|merge)(?=$|[^\p{L}])/iu;
const BRANCH=/(?:^|[^\p{L}])(?:ветк\p{L}*|бранч\p{L}*|branch)(?=$|[^\p{L}])/iu;
const UNCOMMITTED=/незакоммич\p{L}*|изменени\p{L}*\s+в\s+рабочей\s+папке/iu;
// Not ours: what code review is, store reviews, performance reviews of people, Jira tasks «на ревью», PR lists.
const CONCEPT=/^(?:а\s+)?(?:что\s+такое|что\s+значит|зачем|почему|как\s+(?:правильно\s+)?(?:провод|делать|сделать|научит|устроен|принят|пройти|давать|писать|оставлять)|расскажи\s+(?:про|о)|объясни,?\s+(?:что|как|зачем)|какие\s+(?:бывают|есть)\s+(?:правила|практики|виды)|чем\s+полезн|сколько\s+(?:длится|времени))/iu;
const NOT_OURS=/(?:отзыв\p{L}*|app\s*store|google\s*play|сторе|стор(?:а|ов|ы)?(?=$|[^\p{L}])|перфоманс\p{L}*|перформанс\p{L}*|performance|ревью\s+(?:сотрудник|кандидат|резюме|задач|дизайн|макет|текст|стать|документ|книг|фильм|игр|ресторан|отпуск)|(?:годов|полугодов|квартальн|360)\p{L}*\s+ревью|jira|джир\p{L}*|тикет\p{L}*|задач\p{L}*\s+на\s+ревью)/iu;
// A PR list or «waiting for my review» belongs to «Pull requests».
const REVIEW_ME=/(?:жд\p{L}*\s+(?:моего\s+|моих\s+|от меня\s+)?(?:ревью|review)|(?:на|для)\s+мо[её]м\s+ревью|ревью\s+(?:от|на|для)\s+меня|мне\s+(?:на\s+)?(?:ревью|поревьюить)|запрос\p{L}*\s+(?:на\s+)?ревью|review[- ]requested)/iu;
// Code pasted into the message is reviewed by the skills, not here.
const PASTED=/```|[:\n]\s*(?:function\s|def\s|class\s|const\s|let\s|var\s|public\s|private\s|import\s|#include)|\n.*[;{}]\s*$/mu;
const PR_WORD='(?:pr|pull[- ]?request|пулл?[- ]?ре[кc]?вест\\p{L}*|пул[- ]?риквест\\p{L}*|пиар\\p{L}*)';
const PR_NUMBER=new RegExp('(?:^|[^\\p{L}])'+PR_WORD+'\\s*(?:([A-Za-z0-9][A-Za-z0-9-]{0,38}\\/[A-Za-z0-9._-]{1,100})\\s*)?(?:#|№\\s*)?(\\d{1,7})(?!\\d)|([A-Za-z0-9][A-Za-z0-9-]{0,38}\\/[A-Za-z0-9._-]{1,100})#(\\d{1,7})','iu');
const PR_URL=/https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\/pull\/(\d{1,7})/u;
const BASE=/(?:относительно|против|vs\.?|base|от|с|в|на)\s+(?:ветк\p{L}*\s+|бранч\p{L}*\s+)?[«"]?([A-Za-z0-9][\w.\/-]{0,80})[»"]?/giu;
const KNOWN_BASE=/^(?:main|master|develop|dev|trunk|staging|release[\w.\/-]*|origin\/[\w.\/-]+)$/i;

// {kind:'local', base} | {kind:'pr', repo, number} | null
function route(text){
 const t=String(text||'').trim().replace(/^петя[\s,!:—-]+/iu,'');
 if(!t||t.length>600||CONCEPT.test(t)||NOT_OURS.test(t)||REVIEW_ME.test(t)||PASTED.test(t))return null;
 const review=REVIEW.test(t),check=CHECK.test(t);
 const url=t.match(PR_URL),pr=url?{repo:url[1],number:Number(url[2])}:(()=>{const m=t.match(PR_NUMBER);return m?{repo:m[1]||m[3]||'',number:Number(m[2]||m[4])}:null;})();
 if(pr&&(review||/найди\s+(?:баги|ошибки|проблемы)/iu.test(t)))return {kind:'pr',repo:pr.repo,number:pr.number};
 if(pr)return null;
 const local=MINE.test(t)||DIFF.test(t)||UNCOMMITTED.test(t)||BEFORE.test(t)&&(BRANCH.test(t)||/изменени|правк|код/iu.test(t))||review&&(BRANCH.test(t)||/изменени\p{L}*|правк\p{L}*|коммит\p{L}*/iu.test(t));
 const bare=review&&/(?:код[- ]?ревью|code[- ]?review)/iu.test(t)&&/(?:сделай|проведи|нужн\p{L}*|давай|запусти|начни|устрой)/iu.test(t);
 if(!(local&&(review||check))&&!bare&&!(review&&BEFORE.test(t)))return null;
 return {kind:'local',base:baseIn(t)};
}
function baseIn(t){
 for(const m of t.matchAll(BASE)){
  const name=m[1],word=m[0].toLowerCase();
  if(/^(?:pr|github|git|гит)$/i.test(name))continue;
  if(/ветк|бранч|относительно|против|vs|base/u.test(word)||KNOWN_BASE.test(name))return name;
 }
 return '';
}

// --- Notifications and the PR write --------------------------------------------------------------------------
function publish(s,text,busy,kind='info',version){try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',{id:'code-review',title:BY,text,busy,kind,...version?{version}:{}});}catch{/* window closed */}}
const prReady=settings=>settings?.['extension_pull-requests']==='true'&&!!String(settings?.githubToken||'').trim();
const SEV_LABEL={blocker:'блокер',warning:'замечание',nit:'нит-пик'};
// GitHub review comment: severity and category, the text, and a suggestion block GitHub can apply in one click.
function commentBody(c){return '**'+SEV_LABEL[c.severity]+' · '+c.category+'** '+c.comment+(c.suggestion?'\n\n```suggestion\n'+c.suggestion+'\n```':'');}

function setup(s){
 const shown=new Map(),sending=new Set(),posted=new Set();
 const remember=(key,value)=>{shown.set(key,{...value,company:s.companyId,at:Date.now()});while(shown.size>50)shown.delete(shown.keys().next().value);};
 // One review with every chosen comment (line comments on the right side of the diff; file-level ones in the body).
 async function postReview(key,ids){
  const r=shown.get(String(key||''));
  if(!r||r.company!==s.companyId||Date.now()-r.at>6*3600000)throw Error('Сделайте ревью заново: эта карточка устарела.');
  if(!prReady(s.settings))throw Error('Подключите «Pull requests» (GitHub), чтобы оставлять комментарии.');
  const chosen=(Array.isArray(ids)?ids:[]).map(id=>r.comments.find(c=>c.id===id)).filter(Boolean);
  if(!chosen.length)throw Error('Нет комментариев для отправки.');
  if(chosen.length>50)throw Error('Не больше 50 комментариев за раз.');
  if(posted.has(key))throw Error('Комментарии этого ревью уже оставлены в PR.');
  if(sending.has(key))throw Error('Комментарии уже отправляются.');
  sending.add(key);publish(s,'Оставляю '+chosen.length+' '+kit.plural(chosen.length,['комментарий','комментария','комментариев'])+' в '+r.ref+'…',true);
  try{
   const api=require('../github/client.cjs').create(s);
   const lines=chosen.filter(c=>c.line),general=chosen.filter(c=>!c.line);
   const body='Ревью Пети: '+chosen.length+' '+kit.plural(chosen.length,['замечание','замечания','замечаний'])+'.'+(general.length?'\n\n'+general.map(c=>'- `'+c.file+'` — '+commentBody(c)).join('\n'):'');
   const res=await api.send('POST','/repos/'+r.repo+'/pulls/'+r.number+'/reviews',{commit_id:r.sha,event:'COMMENT',body,comments:lines.map(c=>({path:c.file,line:c.line,side:'RIGHT',body:commentBody(c)}))});
   posted.add(key);
   const text='Оставил '+chosen.length+' '+kit.plural(chosen.length,['комментарий','комментария','комментариев'])+' в '+r.ref+' одним ревью.';
   publish(s,text,false,'success');
   return {text,url:/^https:\/\/github\.com\//.test(res?.html_url||'')?res.html_url:''};
  }catch(e){publish(s,'Комментарии в '+r.ref+' не оставлены: '+e.message,false,'error');throw e;}
  finally{sending.delete(key);}
 }
 return {codeReview:{remember},ipc:{postReview}};
}

// --- Building the review --------------------------------------------------------------------------------------
async function build(s,changes,{progress}){
 const found=checks.run(changes);
 let model=null;
 if(s.settings.model&&changes.files.length){
  publish(s,'Читаю изменения: '+changes.files.length+' '+kit.plural(changes.files.length,['файл','файла','файлов'])+'…',true);
  model=await review.modelReview(s,changes.files,{progress});
 }
 return {...review.assemble(changes,found,model),model:!!model,dropped:model?.dropped||0,failed:model?.failed||0,cut:!!model?.cut};
}
function summary(card,where){
 const t=card.totals,parts=[];
 if(t.blocker)parts.push(t.blocker+' '+kit.plural(t.blocker,['блокер','блокера','блокеров']));
 if(t.warning)parts.push(t.warning+' '+kit.plural(t.warning,['замечание','замечания','замечаний']));
 if(t.nit)parts.push(t.nit+' '+kit.plural(t.nit,['нит-пик','нит-пика','нит-пиков']));
 const files=t.files+' '+kit.plural(t.files,['файл','файла','файлов']);
 return 'Ревью '+where+': '+files+(t.skipped?' (ещё '+t.skipped+' пропущено)':'')+'. '+(parts.length?parts.join(', ')+'.':'Проблем не нашёл.')+
  (card.model?(card.dropped?' Отбросил '+card.dropped+' '+kit.plural(card.dropped,['замечание','замечания','замечаний'])+' модели, которые не указывали на изменённую строку.':''):' Модель не выбрана — только автоматические проверки.');
}

async function localTurn(s,command,want){
 if(!s.gitWorkspace)return kit.reply(s,command,{by:BY,question:true,text:'Git недоступен. Откройте чат в проекте с папкой, где есть Git-репозиторий.'});
 let found;
 try{found=await s.gitWorkspace.discover();}
 catch(e){return kit.reply(s,command,{by:BY,question:true,text:/локальных папок/iu.test(e.message)?'Чтобы проверить изменения, добавьте папку проекта с Git в настройках проекта этого чата.':e.message});}
 const run=root=>localReview(s,command,want,root);
 if(found.selected)return run(found.selected);
 if(found.repositories.length>1)return ask({text:'В каком репозитории проверить изменения?',label:'Репозиторий',options:found.repositories,strictChoices:true},value=>{const root=found.repositories.find(r=>r===value);if(!root)throw Error('Выберите репозиторий из списка.');return run(root);});
 return kit.reply(s,command,{by:BY,question:true,text:'В папках проекта нет Git-репозитория — проверять нечего. Создайте его («git init») или откройте чат другого проекта.'});
}
async function localReview(s,command,want,root){
 s.requestProgress?.report('Собираю изменения относительно '+(want.base||'основной ветки'));
 const git=(...a)=>s.gitWorkspace.git(...a);
 const changes=await diff.local(git,root,{base:want.base});
 if(changes.missingBase)return ask({text:'Ветки «'+changes.missingBase+'» нет. С какой веткой сравнить?',label:'Ветка',options:changes.branches,placeholder:'main'},value=>{
  const name=String(value||'').trim();if(!diff.branchLike(name))throw Error('Нужно имя ветки, например main.');return localReview(s,command,{...want,base:name},root);});
 const where=changes.mode==='branch'?changes.branch+' → '+changes.base:'незакоммиченные изменения'+(changes.branch?' в '+changes.branch:'');
 if(!changes.files.length&&!changes.skipped.length)return kit.reply(s,command,{by:BY,text:changes.mode==='branch'?'Ветка '+changes.branch+' не отличается от '+changes.base+' — проверять нечего.':'Незакоммиченных изменений нет — проверять нечего.'});
 const card=await build(s,changes,{progress:file=>s.requestProgress?.report('Смотрю '+file)});
 const data={source:'local',repo:changes.name,title:where,branch:changes.branch,base:changes.base,mode:changes.mode,head:changes.head.slice(0,12),...card,at:new Date().toISOString()};
 const text=summary(card,where);
 if(card.model)publish(s,text,false,card.totals.blocker?'attention':'success',String(Date.now()));
 return kit.reply(s,command,{by:BY,text,data:{codeReview:data}});
}

// A GitHub PR: needs «Pull requests» with a token; the repository from the request, the settings or the project.
async function prTurn(s,command,want){
 if(!prReady(s.settings)){
  const text='Для ревью PR нужно приложение «Pull requests» с подключённым GitHub. Подключить? Локальные изменения могу проверить и без него: «проверь мои изменения».';
  const offered=s.extensionOffers?.propose?.(command,['pull-requests'],text,BY);
  return offered||kit.reply(s,command,{by:BY,question:true,text});
 }
 const github=require('../github/client.cjs');
 const repos=want.repo?[want.repo]:await github.repos(s);
 if(repos.length===1)return prReview(s,command,repos[0],want.number);
 if(repos.length>1)return ask({text:'В каком репозитории PR #'+want.number+'?',label:'Репозиторий',options:repos,strictChoices:true},value=>prReview(s,command,repos.find(r=>r.toLowerCase()===String(value).toLowerCase())||github.validRepo(value),want.number));
 return ask({text:'В каком репозитории PR #'+want.number+'? Укажите owner/repo.',label:'Репозиторий',placeholder:'owner/repo'},value=>prReview(s,command,github.parseRepos(value)[0]||github.validRepo(value),want.number));
}
async function prReview(s,command,repo,number){
 const github=require('../github/client.cjs');
 const api=github.create(s);
 s.requestProgress?.report('Читаю PR '+repo+'#'+number);
 const pr=await api.get('/repos/'+github.validRepo(repo)+'/pulls/'+Number(number));
 const list=[];
 for(let page=1;page<=3;page++){const part=await api.get('/repos/'+repo+'/pulls/'+number+'/files',{per_page:100,page});if(!Array.isArray(part))break;list.push(...part);if(part.length<100)break;}
 const changes=diff.fromGitHub(list);
 // Tests that exist in the repository are not known from the PR alone: only changed files count.
 const card=await build(s,{...changes,repoFiles:[]},{progress:file=>s.requestProgress?.report('Смотрю '+file)});
 const ref=repo+'#'+number,key=ref+'@'+String(pr.head?.sha||'').slice(0,12);
 s.codeReview?.remember(key,{repo,number:Number(number),sha:String(pr.head?.sha||''),ref,comments:card.comments.map(({id,file,line,severity,category,comment,suggestion})=>({id,file,line,severity,category,comment,suggestion}))});
 const url=/^https:\/\/github\.com\//.test(pr.html_url||'')?pr.html_url:'';
 const data={source:'pr',key,repo,number:Number(number),url,title:String(pr.title||'').slice(0,300),branch:String(pr.head?.ref||''),base:String(pr.base?.ref||''),head:String(pr.head?.sha||'').slice(0,12),...card,at:new Date().toISOString()};
 const text=summary(card,ref+' «'+data.title+'»');
 if(card.model)publish(s,text,false,card.totals.blocker?'attention':'success',String(Date.now()));
 return kit.reply(s,command,{by:BY,text,sources:url?[{title:ref,url}]:[],data:{codeReview:data}});
}

async function turn(s,command){
 const text=String(command||'');
 const want=route(text);
 if(!want||!kit.installed(s,ID))return null;
 try{
  return want.kind==='pr'?await prTurn(s,text,want):await localTurn(s,text,want);
 }catch(e){
  if(e instanceof InputRequired)throw e;
  publish(s,'Ревью не получилось: '+e.message,false,'error');
  return e.github?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);
 }
}
module.exports={name:'codeReview',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,route,summary,commentBody,prReady};
