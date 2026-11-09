const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash}=require('node:crypto');
const exec=promisify(execFile);
const reads=new Set(['status','diff','log','branches','version']);
const actions=new Set([...reads,'stage','unstage','commit','createBranch','switchBranch','fetch','pull','push']);
function redact(s){return String(s||'').replace(/(https?:\/\/)[^\s/@]+@/g,'$1[скрыто]@').replace(/\x1b\[[0-9;]*m/g,'').slice(0,16000);}
function parseStatus(raw){const parts=raw.split('\0'),files=[];for(let i=0;i<parts.length;i++){const row=parts[i];if(!row)continue;const status=row.slice(0,2),file={path:row.slice(3),status,staged:![' ','?'].includes(status[0]),unstaged:status[1]!==' ',conflict:/U/.test(status)||['AA','DD'].includes(status)};if(/[RC]/.test(status))file.oldPath=parts[++i];files.push(file);}return files;}
// Read requests in conversational form; never infer a write from a question.
// Version numbers declared in project manifests (package.json here, other kinds through project detectors), read-only.
async function manifestVersions(root){
 const fs=require('node:fs/promises'),path=require('node:path'),found=[];
 try{const p=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(typeof p.version==='string')found.push('Версия в package.json: '+p.version);}catch{}
 // Versions other project kinds declare, read by the apps that know them (src/features/project-detectors.cjs).
 found.push(...await require('../../features/project-detectors.cjs').versions(root));
 return found;
}
function conversationalRead(value){
 const s=value.toLowerCase().replace(/[.!?]+$/u,'').trim();
 if(/^(?:не |не надо |как |зачем |почему |что такое |объясни |если |[«"“`])/u.test(s)||/(?:^|\s)не\s|[«"“`]/u.test(s))return null;
 const body=s.replace(/^(?:(?:а|сейчас|теперь|пожалуйста|ещ[её] раз|ты|можешь|можете|мог бы)[,\s]+)+/u,'');
 const target='(?:git|гит(?:а|е)?|(?:git[- ]|гит[- ])?репозиторий|репозитория)';
 const verb='(?:посмотри|посмотреть|проверь|проверить|покажи|показать|глянь|глянуть)';
 const suffix='(?:\\s+(?:проекта|этого проекта|текущего проекта|сейчас|теперь|пожалуйста|ещ[её] раз))*';
 if(new RegExp('^(?:'+verb+'\\s+(?:состояние\\s+|статус\\s+)?'+target+'|'+target+'\\s+'+verb+')'+suffix+'$','u').test(body))return {action:'status'};
 if(/^(?:что (?:сейчас )?(?:в гите|в git|с гитом)|какие изменения (?:в гите|в git|в репозитории)|(?:какой|покажи) (?:сейчас )?статус (?:гита|git|репозитория))(?: проекта)?$/u.test(body))return {action:'status'};
 if(/^(?:какая (?:сейчас |текущая )?ветка(?: (?:в гите|git|проекта))?|на какой (?:мы )?ветке|покажи (?:текущую )?ветку)$/u.test(body))return {action:'branches'};
 if(/^(?:(?:покажи|посмотри|какой) (?:последний коммит|последние коммиты)|(?:покажи|посмотри) историю (?:гита|git|репозитория))(?: (?:в гите|в git|проекта))?$/u.test(body))return {action:'log'};
 // Version questions: «посмотри версию в гите», «какой последний тег», «какая версия проекта».
 const mentionsGit=/(?:^|[\s,])(?:git|гит(?:а|е|у|ом)?|репозитори\p{L}*)(?=[\s,]|$)/u.test(body);
 const read=/^(?:посмотри|посмотреть|проверь|проверить|покажи|показать|глянь|скажи|узнай|какая|какой|какие|что|сколько|есть ли)(?=[\s,])/u;
 // Compound requests («посмотри гит и запушь») are not a single read; leave them to the full pipeline.
 const compound=/(?:\s|,)(?:и|а|потом|затем|после)\s|;/u.test(body);
 if(compound)return null;
 if(read.test(body)&&(mentionsGit&&/(?:верси|тег|релиз)/u.test(body)||/(?:^|\s)(?:верси[яюи]) (?:проекта|приложения|сборки|игры|билда)(?=\s|$)|(?:последн|текущ)\p{L}* (?:тег|верси|релиз)/u.test(body)))return {action:'version'};
 // Branches and history in any wording: «какие ветки есть в гите», «в какой я ветке», «последние коммиты».
 if(read.test(body)||/^в какой/u.test(body)){if(/(?:^|\s)ветк\p{L}*/u.test(body)&&(mentionsGit||/(?:какие|список|в какой|на какой)/u.test(body)))return {action:'branches'};if(/(?:^|\s)(?:коммит\p{L}*|истори\p{L}*\s+(?:коммитов|гита|git))/u.test(body)&&!/(?:сделай|создай)/u.test(body))return {action:'log'};}
 // Any other read-style question about git shows the repository status instead of going to the model.
 if(read.test(body)&&mentionsGit)return {action:'status'};
 return null;
}
function commandRoute(value){
 const s=String(value||'').trim().replace(/^петя[\s,:.!—-]*/iu,'');
 if(/^(?:git init|создай (?:git|гит|репозиторий git)(?: для проекта)?)[.!?]*$/iu.test(s))return {action:'init'};
 const natural=require('./intent.cjs').naturalGit(s);if(natural)return natural;
 const read=conversationalRead(s);if(read)return read;
 const exact=[[/^(?:git status|статус (?:git|гита)|покажи (?:статус|изменения) (?:git|гита))[.!?]*$/iu,'status'],[/^(?:git diff|покажи (?:git )?diff|покажи дифф)[.!?]*$/iu,'diff'],[/^(?:git log|история (?:git|гита|коммитов)|покажи историю коммитов)[.!?]*$/iu,'log'],[/^(?:git branch|ветки (?:git|гита)|покажи ветки)[.!?]*$/iu,'branches'],[/^(?:git fetch|сделай fetch)[.!?]*$/iu,'fetch'],[/^(?:git pull|сделай pull|сделай пулл|подтяни изменения из гита)[.!?]*$/iu,'pull'],[/^(?:git push|сделай push|сделай пуш|запушь(?: изменения)?)[.!?]*$/iu,'push']];
 for(const [re,action]of exact)if(re.test(s))return {action};
 let m;if((m=s.match(/^git (fetch|pull|push) ([A-Za-z0-9_][A-Za-z0-9_.\/-]*)$/iu)))return {action:m[1].toLowerCase(),remote:m[2]};if((m=s.match(/^(?:создай ветку|git switch -c)\s+(\S+)$/iu)))return {action:'createBranch',branch:m[1]};
 if((m=s.match(/^(?:переключись на ветку|git switch)\s+(\S+)$/iu)))return {action:'switchBranch',branch:m[1]};
 if((m=s.match(/^git commit -m\s+(.+)$/iu)))return {action:'commit',message:m[1].replace(/^[«"]|[»"]$/g,'')};
 if((m=s.match(/^(?:добавь в коммит|git add)\s+(.+)$/iu)))return {action:'stage',paths:[m[1].replace(/^[«"]|[»"]$/g,'')]};
 if((m=s.match(/^(?:убери из коммита)\s+(.+)$/iu)))return {action:'unstage',paths:[m[1].replace(/^[«"]|[»"]$/g,'')]};
 if(/^(?:git\s|сделай коммит$|закоммить$)/iu.test(s))return {action:'help'};
 return null;
}
class GitWorkspace{
 constructor({context,run=exec}){this.context=context;this.run=run;this.busy=new Set();this.selected=new Map();}
 async git(root,args,network=false){
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_OPTIONAL_LOCKS:'0',GIT_LITERAL_PATHSPECS:'1',GIT_SSH_COMMAND:'ssh -o BatchMode=yes -o ConnectTimeout=15',LC_ALL:'C'};
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  try{const r=await this.run('git',['-C',root,'--no-pager','-c','color.ui=false',...args],{env,timeout:network?120000:30000,maxBuffer:4*1024*1024,windowsHide:true,shell:false});return r.stdout;}
  catch(e){if(e.code==='ENOENT')throw Error('Git не установлен. Установите Git и перезапустите Петю.');if(e.killed||e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')throw Error('Git не завершился вовремя или ответ слишком большой. Проверьте репозиторий перед повтором.');throw Error(redact(e.stderr||e.message)||'Команда Git завершилась ошибкой.');}
 }
 async discover(){
  const context=this.context();const configured=Array.isArray(context?.folders)?context.folders:context?.folder?[context.folder]:[];
  if(!configured.length)throw Error('В контексте текущего проекта нет локальных папок.');
  const folders=[];for(const folder of configured)folders.push(await fs.realpath(folder));
  const projectId=String(context.id),repositories=new Set(),warnings=[];let visited=0,partial=false;
  const probe=async folder=>{try{return await fs.realpath((await this.git(folder,['rev-parse','--show-toplevel'])).trim());}catch(error){if(/not a git repository/i.test(error.message))return null;throw error;}};
  const scan=async(folder,depth)=>{
   if(++visited>1000){partial=true;return;}
   let entries;try{entries=await fs.readdir(folder,{withFileTypes:true});}catch{warnings.push('Не удалось прочитать '+folder);return;}
   if(entries.some(e=>e.name==='.git')){try{const root=await probe(folder);if(root)repositories.add(root);else warnings.push('Некорректный Git: '+folder);}catch(error){warnings.push(error.message);}return;}
   for(const entry of entries){if(!entry.isDirectory()||entry.name.startsWith('.')||/^(?:node_modules|vendor|runtime|Library|build|dist|target|bin|obj)$/i.test(entry.name))continue;if(depth>=4){partial=true;continue;}await scan(path.join(folder,entry.name),depth+1);if(visited>1000)break;}
  };
  for(const folder of folders){const root=await probe(folder);if(root)repositories.add(root);else await scan(folder,0);}
  const missing=folders.filter(folder=>![...repositories].some(root=>root===folder||root.startsWith(folder+path.sep)||folder.startsWith(root+path.sep)));
  const scope=JSON.stringify([projectId,folders]);const chosen=this.selected.get(scope);if(chosen&&!repositories.has(chosen))this.selected.delete(scope);
  return {projectId,name:context.name||'Проект',folders,repositories:[...repositories].sort(),missing,warnings,partial,scope,selected:repositories.has(chosen)?chosen:repositories.size===1?[...repositories][0]:''};
 }
 async select(root,projectId){const found=await this.discover();if(found.projectId!==projectId||!found.repositories.includes(root))throw Error('Контекст проекта изменился. Повторите запрос Git.');this.selected.set(found.scope,root);return this.status();}
 async init(folder,projectId){
  const found=await this.discover();if(found.projectId!==projectId)throw Error('Контекст проекта изменился. Повторите запрос Git.');
  if(!folder&&!found.missing.length)throw Error('В папках проекта уже есть Git.');folder=folder|| (found.missing.length===1?found.missing[0]:'');
  if(found.partial||found.warnings.length)throw Error('Поиск Git завершён не полностью. Уточните папки проекта перед созданием репозитория.');
  if(!folder){const error=Error('В какой папке проекта создать Git?');error.gitDiscovery={...found,repositories:[]};throw error;}if(!found.missing.includes(folder))throw Error('В этой папке проекта уже есть Git либо она больше не относится к проекту.');
  if(this.busy.has(folder))throw Error('Дождитесь текущей операции Git.');this.busy.add(folder);
  try{const current=await this.discover();if(current.scope!==found.scope||!current.missing.includes(folder)||current.partial||current.warnings.length)throw Error('Контекст проекта или состояние Git изменились. Повторите запрос.');await this.git(folder,['init','-b','main']);this.selected.set(found.scope,folder);return {state:await this.status(),text:'Создан Git-репозиторий: '+folder+'. Файлы ещё не добавлены в коммит.'};}finally{this.busy.delete(folder);}
 }
 async repository(expected){
  const found=await this.discover();if(expected&&expected.projectId!==found.projectId)throw Error('Выбранный проект изменился. Обновите панель Git.');
  if(expected&&(!found.repositories.includes(expected.root)||expected.root!==found.selected))throw Error('Выбранный репозиторий изменился. Повторите запрос Git.');
  if(!found.selected){const error=Error(found.repositories.length?'В папках проекта найдено несколько Git-репозиториев. Выберите нужный.':found.partial||found.warnings.length?'Не удалось полностью проверить папки проекта на наличие Git.':'В папках проекта Git-репозиторий не найден. Создать его для проекта?');error.gitDiscovery=found;throw error;}
  return {root:found.selected,projectId:found.projectId,name:found.name};
 }
 async snapshot(repo){
  const raw=await this.git(repo.root,['status','--porcelain=v1','-z','--untracked-files=all']);const files=parseStatus(raw);
  let head='';try{head=(await this.git(repo.root,['rev-parse','--verify','HEAD'])).trim();}catch{}
  let branch='';try{branch=(await this.git(repo.root,['symbolic-ref','--short','HEAD'])).trim();}catch{}
  const staged=await this.git(repo.root,['diff','--cached','--raw','--no-abbrev','--no-ext-diff','--no-textconv']);
  const branches=(await this.git(repo.root,['for-each-ref','--format=%(refname:short)','refs/heads/'])).trim().split('\n').filter(Boolean);
  const remoteBranches=(await this.git(repo.root,['for-each-ref','--format=%(refname:short)','refs/remotes/'])).trim().split('\n').filter(b=>b&&!b.endsWith('/HEAD'));
  const remotes=(await this.git(repo.root,['remote'])).trim().split('\n').filter(Boolean);
  const upstream=branch?(await this.git(repo.root,['for-each-ref','--format=%(upstream:remotename)%09%(upstream:remoteref)','refs/heads/'+branch])).trim().split('\t'):[];
  const token=createHash('sha256').update(JSON.stringify([repo.root,head,branch,raw,staged,remotes,upstream])).digest('hex');
  return {...repo,head,branch,files,branches,remoteBranches,remotes,upstream:upstream.length===2?{remote:upstream[0],ref:upstream[1]}:null,token};
 }
 async status(){return this.snapshot(await this.repository());}
 async execute(input={}){
  if(!actions.has(input.action))throw Error('Неизвестное действие Git.');const repo=await this.repository(input.expected);if(this.busy.has(repo.root))throw Error('Дождитесь текущей операции Git в этом репозитории.');this.busy.add(repo.root);
  try{
   const state=await this.snapshot(repo);if(!reads.has(input.action)&&input.expected?.token&&input.expected.token!==state.token)throw Error('Состояние Git изменилось. Обновите список и проверьте файлы перед действием.');
   await this.repository(repo);
   let args,network=false;
   if(input.action==='status')return {state,text:summary(state)};
   if(input.action==='branches')return {state,text:'Текущая ветка: '+(state.branch||'detached HEAD')+'\n'+([...state.branches,...state.remoteBranches].join('\n')||'Нет коммитов и веток.')};
   if(input.action==='version'){
    if(!state.head)return {state,text:'В репозитории ещё нет коммитов.'};
    const quiet=async args=>{try{return (await this.git(repo.root,args)).trim();}catch{return '';}};
    const tag=await quiet(['describe','--tags','--abbrev=0']),described=await quiet(['describe','--tags','--always','--dirty']);
    const last=await quiet(['log','-1','--date=short','--format=%h %ad %s']),tagDate=tag?await quiet(['log','-1','--date=short','--format=%ad',tag]):'';
    const lines=[tag?'Последний тег: '+tag+(tagDate?' ('+tagDate+')':''):'Тегов версий в репозитории нет.'];
    if(described&&described!==tag)lines.push('Текущее состояние: '+described+(tag?' (коммиты после тега и -dirty, если есть незакоммиченные изменения)':''));
    for(const v of await manifestVersions(repo.root))lines.push(v);
    lines.push('Последний коммит: '+(last||state.head));
    return {state,text:lines.join('\n')};
   }
   if(input.action==='log'){if(!state.head)return {state,text:'В репозитории ещё нет коммитов.'};args=['log','-30','--date=short','--format=%h %ad %s'];}
   if(input.action==='diff')args=['diff','--no-ext-diff','--no-textconv',...(input.staged?['--cached']:[]),'--'];
   if(['stage','unstage'].includes(input.action)){
    const requested=input.all===true?state.files.filter(f=>input.action==='stage'?f.unstaged:f.staged).map(f=>f.path):input.paths;
    if(!Array.isArray(requested)||!requested.length||requested.length>200)throw Error('Выберите от 1 до 200 файлов.');
    const names=new Set(state.files.flatMap(f=>[f.path,f.oldPath].filter(Boolean)));const selected=[];
    for(const name of requested){if(typeof name!=='string'||!names.has(name))throw Error('Файл не найден в текущих изменениях: '+String(name));selected.push(name);const rename=state.files.find(f=>f.path===name&&f.oldPath);if(rename)selected.push(rename.oldPath);}
    args=input.action==='stage'?['add','--',...new Set(selected)]:state.head?['restore','--staged','--',...new Set(selected)]:['rm','--cached','--',...new Set(selected)];
   }
   if(input.action==='commit'){
    if(state.files.some(f=>f.conflict))throw Error('Сначала разрешите конфликты в файлах и подготовьте их к коммиту.');
    if(!state.files.some(f=>f.staged))throw Error('Нет подготовленных файлов. Выберите файлы в панели Git и нажмите «В коммит».');
    if(typeof input.message!=='string'||!input.message.trim()||input.message.length>2000||input.message.includes('\0'))throw Error('Напишите сообщение коммита (до 2000 символов).');
    args=['commit','-m',input.message.trim()];
   }
   if(['createBranch','switchBranch'].includes(input.action)){
    if(typeof input.branch!=='string'||input.branch.startsWith('-')||input.branch.length>200)throw Error('Укажите имя ветки.');await this.git(repo.root,['check-ref-format','refs/heads/'+input.branch]);
    if(input.action==='switchBranch'&&state.files.length)throw Error('Перед переключением ветки сохраните изменения коммитом.');
    if(input.action==='switchBranch'&&!state.branches.includes(input.branch)&&!state.remoteBranches.includes(input.branch))throw Error('Выберите существующую ветку.');
    args=['switch',...(input.action==='createBranch'?['-c']:!state.branches.includes(input.branch)&&state.remoteBranches.includes(input.branch)?['--track']:[]),input.branch];
   }
   if(['fetch','pull','push'].includes(input.action)){
    let remote=input.remote||state.upstream?.remote||(state.remotes.length===1?state.remotes[0]:'');
    if(!remote||!state.remotes.includes(remote)||remote.startsWith('-')||remote==='.')throw Error('Выберите удалённый репозиторий в панели Git.');
    network=true;
    if(input.action==='fetch')args=['fetch','--no-recurse-submodules','--',remote];
    else{
     if(!state.branch||!state.head)throw Error('Для pull/push нужен коммит и выбранная локальная ветка.');
     const ref=state.upstream?.remote===remote?state.upstream.ref:'refs/heads/'+state.branch;
     if(!ref.startsWith('refs/heads/'))throw Error('Не удалось определить удалённую ветку.');
     if(input.action==='pull'){if(state.files.length)throw Error('Перед pull сохраните локальные изменения коммитом.');args=['-c','rebase.autoStash=false','-c','merge.autoStash=false','pull','--ff-only','--no-rebase','--no-recurse-submodules',remote,ref];}
     else args=['-c','remote.'+remote+'.mirror=false','push','--no-follow-tags','--recurse-submodules=no','--set-upstream',remote,'HEAD:'+ref];
    }
   }
   const output=await this.git(repo.root,args,network);let next;try{next=await this.snapshot(repo);}catch{ return {state,text:'Команда Git завершена, но не удалось обновить статус. Обновите панель перед следующим действием.'};}
   return {state:next,text:(redact(output).trim()+(output.length>16000?'\n… Показан фрагмент ответа Git.':''))||(reads.has(input.action)?'Изменений нет.':'Готово: '+({stage:'файлы подготовлены к коммиту',unstage:'файлы убраны из коммита',commit:'коммит создан',createBranch:'ветка создана',switchBranch:'ветка переключена',fetch:'данные удалённого репозитория обновлены',pull:'изменения получены',push:'ветка отправлена в '+(input.remote||state.upstream?.remote||state.remotes[0])}[input.action]||input.action)+'.'),action:input.action};
  }finally{this.busy.delete(repo.root);}
 }
}
// A spoken/chat summary stays short: large repositories can have thousands of changed files.
function summary(s,limit=15){const head=s.name+' · '+(s.branch||'detached HEAD');if(!s.files.length)return head+'\nРабочая папка чистая.';
 const staged=s.files.filter(f=>f.staged).length,untracked=s.files.filter(f=>/\?/.test(f.status)).length;
 const lines=s.files.slice(0,limit).map(f=>f.status+' '+f.path+(f.oldPath?' ← '+f.oldPath:''));
 const rest=s.files.length-lines.length;
 return head+'\nИзменено файлов: '+s.files.length+(untracked?' (новых: '+untracked+')':'')+'.\n'+lines.join('\n')+(rest>0?'\n…и ещё '+rest+'. Полный список — в панели Git.':'')+'\nВ коммит: '+staged+' файлов.';}
module.exports={GitWorkspace,commandRoute,parseStatus,summary};
