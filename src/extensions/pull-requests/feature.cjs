// «Pull requests»: GitHub PRs in the chat — review requested from me, my open PRs, a repository's PRs, and one PR
// with its files, checks, reviews and (on request) a summary written by the local model from a capped diff.
// A comment is posted only from the card, after the user confirms the text there.
const kit=require('../app-kit.cjs');
const github=require('../github/client.cjs');
const prs=require('./prs.cjs');
const {ask,InputRequired}=require('../../input-required.cjs');
const ID='pull-requests',BY='Pull requests';

const PR=/(?:^|[^\p{L}])(?:pr|prs|pull[- ]?requests?|пулл?[- ]?ре[кc]?вест\p{L}*|пул[- ]?риквест\p{L}*|пулреквест\p{L}*|пиар\p{L}*)(?=$|[^\p{L}])/iu;
const REVIEW_ME=/(?:жд\p{L}*\s+(?:моего\s+|моих\s+|от меня\s+)?(?:ревью|review|проверк)|(?:на|для)\s+(?:мо[её]м|мое)\s+ревью|ревью\s+(?:от|на|для)\s+меня|мне\s+(?:на\s+)?(?:ревью|поревьюить|посмотреть)|мне\s+поревьюить|review[- ]requested|запрос\p{L}*\s+(?:на\s+)?ревью|ревью\s+на\s+мне|на мне\s+ревью)/iu;
const MINE=/(?:^|[^\p{L}])(?:мои|моих|мой|моё|мое|моим|я открыл\p{L}*|открыт\p{L}* мной|my)(?=$|[^\p{L}])/iu;
const SUMMARY=/(?:резюме|кратко|вкратце|о ч[её]м|что в |что внутри|что меняет|опиши|перескажи|summary|summari[sz]e|разбери)/iu;
const LIST=/(?:какие|покажи|показать|список|открыт\p{L}*|что (?:с|по|там)|сколько|ждут|висят|мои|статус)/iu;
// Not ours: translation, Jira tasks «на ревью», a list follow-up, explanations, store reviews, code review of pasted code.
const NOT_OURS=[/^(?:а\s+)?(?:переведи|перевести|translate|что такое|зачем нуж|как (?:сделать|открыть|создать|настроить|подключить))/iu,
 /(?:задач\p{L}*|тикет\p{L}*|jira|джир\p{L}*|из них|баг\p{L}*\s+на\s+ревью|отзыв\p{L}*|app store|google play|сделай код[- ]?ревью|проверь (?:этот )?код)/iu];
const REPO_IN=/(?:^|[\s«"(])([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})(?=$|[\s»")#.,!?])/u;
const URL=/https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\/pull\/(\d{1,7})/u;
const NUMBER=/(?:#|№\s*|(?:pr|pull request|пулл?[- ]?ре[кc]?вест\p{L}*|пул[- ]?риквест\p{L}*|пиар\p{L}*)\s*#?\s*)(\d{1,7})(?!\d)/iu;

// {kind:'pr'|'review'|'mine'|'repo', repo, number, summary}
function route(text){
 const t=String(text||'').trim().replace(/^петя[\s,!:—-]+/iu,'');
 if(!t||t.length>500||NOT_OURS.some(re=>re.test(t)))return null;
 const url=t.match(URL);
 const pr=PR.test(t)||!!url,review=REVIEW_ME.test(t);
 if(!pr&&!review)return null;
 const summary=SUMMARY.test(t);
 const number=url?Number(url[2]):Number((t.match(NUMBER)||[])[1])||0;
 const repo=url?url[1]:(t.match(REPO_IN)||[])[1]||'';
 if(number)return {kind:'pr',repo,number,summary};
 if(review)return {kind:'review',repo:'',number:0,summary:false};
 if(summary)return {kind:'pr',repo,number:0,summary:true};
 if(!LIST.test(t)&&!MINE.test(t)&&!repo)return null;
 if(MINE.test(t))return {kind:'mine',repo:'',number:0,summary:false};
 return {kind:'repo',repo,number:0,summary:false};
}

const SUMMARY_SCHEMA={type:'object',properties:{bullets:{type:'array',items:{type:'string'},maxItems:6},risk:{type:'string'}},required:['bullets','risk']};
async function summarize(s,item){
 const r=await kit.modelJSON(s,{system:'Кратко перескажи pull request по-русски: 3–6 пунктов — что меняется и зачем, без воды. risk — одна фраза о рисках для ревьюера или пустая строка. Только по данным.',
  user:{title:item.title,description:item.body||'',files:(item.fileList||[]).slice(0,40).map(f=>f.name+' +'+f.additions+' −'+f.deletions),diff:item.diff||''},schema:SUMMARY_SCHEMA,predict:700});
 if(!r?.bullets?.length)return null;
 return {bullets:r.bullets.map(b=>String(b).trim().slice(0,300)).filter(Boolean).slice(0,6),risk:String(r.risk||'').trim().slice(0,300)};
}

function setup(s){
 const shown=new Map();
 const remember=item=>{shown.set(item.key,{repo:item.repo,number:item.number,title:item.title,company:s.companyId,at:Date.now()});while(shown.size>100)shown.delete(shown.keys().next().value);};
 const publish=(text,busy,kind='info')=>{try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',{id:'pull-requests',title:BY,text,busy,kind});}catch{/* window closed */}};
 const sending=new Set();
 // Posts a comment the user typed and confirmed in the card, as the token's owner.
 async function comment(key,body){
  const pr=shown.get(String(key||''));
  if(!pr||pr.company!==s.companyId||Date.now()-pr.at>6*3600000)throw Error('Откройте PR заново: эта карточка устарела.');
  const text=String(body||'').trim();
  if(!text)throw Error('Напишите текст комментария.');
  if(text.length>5000)throw Error('Комментарий длиннее 5000 символов.');
  if(sending.has(key))throw Error('Комментарий уже отправляется.');
  sending.add(key);publish('Отправляю комментарий в '+key+'…',true);
  try{const r=await prs.comment(s,pr.repo,pr.number,text);publish('Комментарий добавлен в '+key+'.',false,'success');return {text:'Комментарий добавлен в '+key+'.',url:r.url};}
  catch(e){publish('Комментарий в '+key+' не отправлен: '+e.message,false,'error');throw e;}
  finally{sending.delete(key);}
 }
 return {pullRequests:{remember},ipc:{comment}};
}

const scopeName={review:'Ждут вашего ревью',mine:'Ваши открытые PR',repo:'Открытые PR'};
async function listTurn(s,command,want,repos){
 s.requestProgress?.report(want.kind==='review'?'Ищу PR, где ждут вашего ревью':want.kind==='mine'?'Ищу ваши открытые PR':'Читаю открытые PR');
 const r=await prs.list(s,{scope:want.kind,repos});
 for(const i of r.items)s.pullRequests?.remember(i);
 const failing=r.items.filter(i=>i.checks?.state==='failure').length;
 const n=r.total;
 const text=n?(want.kind==='review'?'Вашего ревью ждут ':want.kind==='mine'?'У вас открыто ':'Открыто ')+n+' '+kit.plural(n,['PR','PR','PR'])+(want.kind==='repo'?' в '+repos.join(', '):'')+'.'+(failing?' С упавшими проверками: '+failing+'.':'')+(n>r.items.length?' Показаны последние '+r.items.length+'.':'')
  :want.kind==='review'?'Сейчас никто не ждёт вашего ревью.':want.kind==='mine'?'У вас нет открытых PR.':'Открытых PR нет'+(repos.length?' в '+repos.join(', '):'')+'.';
 return kit.reply(s,command,{by:BY,text,data:{prCard:{mode:'list',scope:want.kind,title:scopeName[want.kind],repos:want.kind==='repo'?repos:[],total:n,items:r.items}}});
}
async function prTurn(s,command,want,repo){
 s.requestProgress?.report('Читаю PR '+repo+'#'+want.number);
 const item=await prs.one(s,repo,want.number);
 s.pullRequests?.remember(item);
 let summary=null,note='';
 if(want.summary){
  if(!s.settings.model)note=' Чтобы получить резюме, выберите локальную модель в настройках.';
  else{s.requestProgress?.report('Пишу резюме по диффу');summary=await summarize(s,item).catch(()=>null);if(!summary)note=' Резюме составить не получилось.';}
 }
 const checks=item.checks?.state==='failure'?' Проверки упали: '+item.checks.failed+'.':item.checks?.state==='pending'?' Проверки идут.':item.checks?.state==='success'?' Проверки прошли.':'';
 const review={approved:' Одобрен.',changes:' Запрошены изменения.',pending:' Ждёт ревью.',commented:' Есть комментарии.'}[item.review]||'';
 const text=repo+'#'+item.number+' «'+item.title+'» от '+item.author+': +'+(item.additions??0)+' −'+(item.deletions??0)+' в '+(item.files??item.fileList.length)+' '+kit.plural(item.files??item.fileList.length,['файле','файлах','файлах'])+'.'+checks+review+(summary?' '+summary.bullets[0]:'')+note;
 const {diff,body,sha,...card}=item;
 return kit.reply(s,command,{by:BY,text,sources:item.url?[{title:repo+'#'+item.number,url:item.url}]:[],data:{prCard:{mode:'pr',...card,summary,summarized:!!summary,description:(body||'').slice(0,600)}}});
}

async function turn(s,command){
 const text=String(command||'');
 const want=route(text);
 if(!want||!kit.installed(s,ID))return null;
 if(!github.connected(s.settings))return kit.reply(s,command,{by:BY,question:true,text:'Подключите GitHub: настройки → «GitHub», токен доступа. Потом повторите вопрос.'});
 try{
  if(want.kind==='review'||want.kind==='mine')return await listTurn(s,command,want,[]);
  if(want.kind==='pr'&&!want.number)return ask({text:'Какой PR пересказать? Пришлите номер или ссылку.',label:'PR',placeholder:'#123, owner/repo#123 или ссылка'},value=>{
   const m=String(value).match(URL)||String(value).match(/^\s*(?:([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}))?\s*#?(\d{1,7})\s*$/u);
   if(!m)throw Error('Нужен номер PR или ссылка на него.');
   return turn(s,'резюме PR '+(m[1]?m[1]+' ':'')+'#'+m[2]);
  });
  const repos=want.repo?[want.repo]:await github.repos(s);
  if(want.kind==='repo'){
   if(!repos.length)return ask({text:'PR какого репозитория показать? Укажите owner/repo.',label:'Репозиторий',placeholder:'owner/repo'},value=>listTurn(s,command,want,github.parseRepos(value).slice(0,5)));
   return await listTurn(s,command,want,repos);
  }
  if(repos.length===1)return await prTurn(s,command,want,repos[0]);
  if(repos.length>1)return ask({text:'В каком репозитории PR #'+want.number+'?',label:'Репозиторий',options:repos,strictChoices:true},value=>prTurn(s,command,want,repos.find(r=>r.toLowerCase()===value.toLowerCase())||github.validRepo(value)));
  return ask({text:'В каком репозитории PR #'+want.number+'? Укажите owner/repo.',label:'Репозиторий',placeholder:'owner/repo'},value=>prTurn(s,command,want,github.parseRepos(value)[0]||github.validRepo(value)));
 }catch(e){if(e instanceof InputRequired)throw e;
  // GitHub errors already say what to fix (token, permissions, repository); others go through the shared wording.
  return e.github?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);}
}
// Dashboards (src/features/dashboards.cjs): read-only requests refresh there by themselves.
const dashboard={accepts:text=>{const r=route(String(text||''));return !!r&&r.kind!=='pr';},widgets:[{title:'Ждут моего ревью',command:'какие PR ждут моего ревью'},{title:'Мои PR',command:'мои открытые PR'}]};
module.exports={name:'pullRequests',dashboard,defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,route,summarize};
