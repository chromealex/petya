// Petya's own coding workspace: every coding task gets a separate git worktree on a `petya/…` branch, so the
// project folder the user works in is never touched until they accept the result. All file access is confined
// to that worktree; commands run without a shell, from an allowlist, with secrets removed from the environment.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomUUID}=require('node:crypto');
const exec=promisify(execFile);

const LINKED=['node_modules','.venv','venv'];
const SECRET_FILE=/(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore|jks|mobileprovision)|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\.json)?|secrets?\.(?:json|ya?ml|toml))$/i;
const SECRET_ENV=/token|secret|password|passwd|credential|api_?key|private_?key|auth|session|cookie/i;
const MAX_FILE=512*1024;
const MAX_OUTPUT=24000;

// Commands Petya may run in the worktree. The value checks the arguments; `true` allows any arguments.
const COMMANDS={
 npm:args=>args[0]==='test'||args[0]==='t'||((args[0]==='run'||args[0]==='run-script')&&/^[\w:.-]+$/.test(args[1]||'')&&!/^(?:publish|deploy|release)/i.test(args[1])),
 node:args=>!args.some(a=>/^(?:-e|--eval|-p|--print)$/.test(a)),
 python3:args=>!args.includes('-c'),python:args=>!args.includes('-c'),
 pytest:true,
 go:args=>['test','build','vet','run'].includes(args[0]),
 cargo:args=>['test','build','check','clippy','run'].includes(args[0]),
 make:args=>!args.some(a=>/install|deploy|publish|release|clean/i.test(a)),
 dotnet:args=>['build','test'].includes(args[0]),
 swift:args=>['build','test'].includes(args[0]),
 mvn:args=>args.every(a=>/^(?:-q|test|verify|compile|-D[\w.]+=[\w.-]*)$/.test(a)),
 './gradlew':args=>args.every(a=>/^(?:test|build|check|assemble\w*|--offline|-q|:[\w:-]+)$/.test(a)),
 tsc:true,eslint:true,ruff:true,mypy:true,
 git:args=>['status','diff','log','show'].includes(args[0])
};
// Dangerous code written by the model is not run: the user's computer is not a sandbox.
const DANGEROUS=[
 [/\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/|~|\$HOME|\.\.)/i,'удаление файлов вне проекта'],
 [/\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z)?sh\b/i,'загрузка и запуск скрипта из сети'],
 [/\b(?:sudo|chmod\s+-R\s+777|mkfs|diskutil\s+erase|format\s+c:)/i,'системная команда'],
 [/(?:rmtree|rmSync|rmdirSync|\.rm|rimraf|remove_tree|RemoveAll)\s*\(\s*[^;\n]{0,60}?(?:homedir|expanduser|Path\.home|process\.env\.HOME|os\.environ\[?['"]HOME|['"`]\/['"`]|['"`]~)/i,'удаление каталогов вне проекта'],
 [/\bgit\s+push\b/i,'публикация в удалённый репозиторий'],
 [/\.ssh\/|Keychain|security\s+find-generic-password|\/Library\/Application Support\/Google\/Chrome/i,'доступ к ключам и паролям']
];

function split(command){
 const text=String(command||'').trim();
 if(!text)throw Error('Пустая команда.');
 if(text.length>400)throw Error('Слишком длинная команда.');
 if(/[;&|<>`$\n\r\\]/.test(text))throw Error('Можно запускать одну команду без операторов оболочки (; | & > $ `).');
 const parts=[];const re=/"([^"]*)"|'([^']*)'|(\S+)/g;let m;
 while((m=re.exec(text)))parts.push(m[1]??m[2]??m[3]);
 return parts;
}
function allowed(parts){
 const [program,...args]=parts;const rule=COMMANDS[program];
 if(!rule)return 'Команда «'+program+'» не разрешена. Разрешены: '+Object.keys(COMMANDS).join(', ')+'.';
 if(rule!==true&&!rule(args))return 'Такие аргументы для «'+program+'» не разрешены (только сборка, тесты и проверки).';
 if(args.some(a=>path.isAbsolute(a)||a.split(/[\\/]/).includes('..')))return 'Пути в команде должны быть внутри проекта.';
 return '';
}
function scan(text){for(const [re,label] of DANGEROUS)if(re.test(text))return label;return '';}
// Commands see a separate home folder, so code that goes after ~ (keys, dotfiles, «delete home») only reaches
// an empty stand-in. Toolchains that live in the real home keep working through their own variables.
const TOOL_HOMES=[['CARGO_HOME','.cargo'],['RUSTUP_HOME','.rustup'],['GOPATH','go'],['GOMODCACHE','go/pkg/mod'],['GOCACHE',process.platform==='darwin'?'Library/Caches/go-build':'.cache/go-build'],['npm_config_cache','.npm'],['PYENV_ROOT','.pyenv'],['GRADLE_USER_HOME','.gradle'],['NUGET_PACKAGES','.nuget/packages'],['NVM_DIR','.nvm'],['VOLTA_HOME','.volta'],['DOTNET_CLI_HOME','']];
function cleanEnv(home){
 const env={},real=require('node:os').homedir();
 for(const [key,value] of Object.entries(process.env))if(!SECRET_ENV.test(key)&&!/^(?:GIT_|SSH_|GH_|GITHUB_|AWS_|GOOGLE_|AZURE_|OPENAI|ANTHROPIC|SLACK|JIRA|NPM_CONFIG_)/i.test(key))env[key]=value;
 if(home){
  for(const [key,dir] of TOOL_HOMES)if(!env[key]){const full=dir?path.join(real,dir):real;if(require('node:fs').existsSync(full))env[key]=full;}
  Object.assign(env,{HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(home,'.config'),XDG_DATA_HOME:path.join(home,'.local/share')});
 }
 return {...env,CI:'1',FORCE_COLOR:'0',NO_COLOR:'1',GIT_TERMINAL_PROMPT:'0',npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false'};
}
function tail(text,limit=MAX_OUTPUT){text=String(text||'');return text.length>limit?'…\n'+text.slice(-limit):text;}
const LATIN={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ы:'y',э:'e',ю:'yu',я:'ya'};
function slug(text){return String(text||'task').toLowerCase().replace(/[а-яё]/g,c=>LATIN[c]||'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32).replace(/-+$/,'')||'task';}

class CoderWorkspace{
 constructor({root,run=exec}){this.root=root;this.run=run;}
 async git(cwd,args,{timeout=60000}={}){
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',LC_ALL:'C'};
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'])delete env[key];
  try{return (await this.run('git',['-C',cwd,'--no-pager','-c','color.ui=false',...args],{env,timeout,maxBuffer:16*1024*1024,windowsHide:true,shell:false})).stdout;}
  catch(e){if(e.code==='ENOENT')throw Error('Git не установлен.');const error=Error(String(e.stderr||e.message).trim().slice(0,800)||'Git завершился ошибкой.');error.code=e.code;throw error;}
 }
 // A new worktree on a new branch from the repository's current HEAD.
 async create(repo,title){
  const head=(await this.git(repo,['rev-parse','HEAD']).catch(()=>{throw Error('В репозитории нет ни одного коммита: сначала сделай первый коммит.');})).trim();
  const id=randomUUID(),branch='petya/'+slug(title)+'-'+id.slice(0,6),dir=path.join(this.root,path.basename(repo).replace(/[^\w.-]/g,'_')+'-'+id.slice(0,8));
  await fs.mkdir(this.root,{recursive:true});
  await this.git(repo,['worktree','add','-b',branch,dir,head]);
  const linked=[];
  for(const name of LINKED){
   const source=path.join(repo,name);
   try{if((await fs.stat(source)).isDirectory()){await fs.symlink(source,path.join(dir,name),'junction');linked.push(name);}}catch{}
  }
  const dirty=(await this.git(repo,['status','--porcelain','--untracked-files=no'])).trim();
  return {id,repo,path:dir,branch,base:head,linked,dirtyBase:!!dirty};
 }
 async exists(record){try{return (await fs.stat(record.path)).isDirectory();}catch{return false;}}
 // Resolves a project-relative path inside the worktree; refuses .git, secrets, linked dependencies and escapes.
 async resolve(record,relative,{write=false}={}){
  const rel=String(relative||'.').replace(/\\/g,'/').replace(/^\.\/+/,'')||'.';
  if(path.isAbsolute(rel)||rel.split('/').includes('..'))throw Error('Путь должен быть внутри проекта: '+rel);
  const first=rel.split('/')[0];
  if(first==='.git')throw Error('Каталог .git недоступен.');
  if(record.linked?.includes(first)&&(write||rel!==first))throw Error(first+' — зависимости проекта, их не меняют.');
  if(SECRET_FILE.test(rel))throw Error('Файл похож на секрет и недоступен: '+rel);
  const full=path.resolve(record.path,rel);
  if(full!==record.path&&!full.startsWith(record.path+path.sep))throw Error('Путь вне проекта.');
  // A symbolic link must not lead outside the worktree.
  let probe=full;
  for(;;){try{const real=await fs.realpath(probe);const base=await fs.realpath(record.path);if(real!==base&&!real.startsWith(base+path.sep)&&!record.linked?.includes(first))throw Error('Ссылка ведёт за пределы проекта.');break;}catch(e){if(e.code!=='ENOENT')throw e;const up=path.dirname(probe);if(up===probe)break;probe=up;}}
  return {full,rel};
 }
 async files(record){
  const out=await this.git(record.path,['ls-files','--cached','--others','--exclude-standard','-z']);
  return out.split('\0').filter(f=>f&&!LINKED.some(l=>f===l||f.startsWith(l+'/')));
 }
 async list(record,relative='.',depth=3){
  const {rel}=await this.resolve(record,relative);const prefix=rel==='.'?'':rel.replace(/\/$/,'')+'/';
  const rows=(await this.files(record)).filter(f=>f.startsWith(prefix)).map(f=>f.slice(prefix.length));
  const seen=new Set(),out=[];
  for(const f of rows){const parts=f.split('/');const shown=parts.length>depth?parts.slice(0,depth).join('/')+'/':f;if(!seen.has(shown)){seen.add(shown);out.push(shown);}if(out.length>=400)break;}
  return {path:rel,entries:out,total:rows.length,truncated:out.length>=400};
 }
 async read(record,relative,start=1,end){
  const {full,rel}=await this.resolve(record,relative);
  const stat=await fs.stat(full).catch(()=>null);if(!stat?.isFile())throw Error('Файл не найден: '+rel);
  if(stat.size>MAX_FILE*4)throw Error('Файл слишком большой ('+Math.round(stat.size/1024)+' КБ): ищи нужное место через search.');
  const buffer=await fs.readFile(full);if(buffer.subarray(0,8000).includes(0))throw Error('Это двоичный файл: '+rel);
  const lines=buffer.toString('utf8').split('\n');
  const from=Math.max(1,Number(start)||1),to=Math.min(lines.length,Number(end)||from+249,from+299);
  let text='',i=from;
  for(;i<=to;i++){const row=i+'\t'+lines[i-1]+'\n';if(text.length+row.length>12000)break;text+=row;}
  return {path:rel,lines:lines.length,from,to:i-1,text,more:i-1<lines.length};
 }
 async search(record,pattern,relative='.'){
  const {rel}=await this.resolve(record,relative);
  if(!pattern||String(pattern).length>200)throw Error('Нужен шаблон поиска до 200 символов.');
  let out='';
  try{out=await this.git(record.path,['grep','-n','-I','-E','--untracked','--max-count','20','-e',String(pattern),'--',...rel==='.'?[]:[rel],...LINKED.map(l=>':(exclude)'+l)]);}
  catch(e){if(e.code===1)out='';else throw Error(/regex|regular expression/i.test(e.message)?'Некорректное регулярное выражение: '+pattern:e.message);}
  const rows=out.split('\n').filter(Boolean).filter(r=>!SECRET_FILE.test(r.split(':')[0]));
  return {pattern:String(pattern),matches:rows.slice(0,80).map(r=>r.slice(0,300)),total:rows.length,truncated:rows.length>80};
 }
 async write(record,relative,content){
  const {full,rel}=await this.resolve(record,relative,{write:true});
  const text=String(content??'');if(Buffer.byteLength(text)>MAX_FILE)throw Error('Слишком большой файл для записи.');
  await fs.mkdir(path.dirname(full),{recursive:true});
  const existed=await fs.stat(full).then(()=>true,()=>false);
  await fs.writeFile(full,text,'utf8');
  return {path:rel,created:!existed,lines:text.split('\n').length};
 }
 // Exact replacement of one unique fragment; keeps CRLF files as CRLF.
 async edit(record,relative,before,after,all=false){
  const {full,rel}=await this.resolve(record,relative,{write:true});
  const original=await fs.readFile(full,'utf8').catch(()=>{throw Error('Файл не найден: '+rel+'. Для нового файла используй write_file.');});
  const crlf=original.includes('\r\n');const text=crlf?original.replace(/\r\n/g,'\n'):original;
  const old=String(before??'').replace(/\r\n/g,'\n'),next=String(after??'').replace(/\r\n/g,'\n');
  if(!old)throw Error('Пустой фрагмент old: укажи точный текст, который нужно заменить.');
  const count=text.split(old).length-1;
  if(!count){
   const loose=old.trim().split('\n')[0].trim();const line=loose?text.split('\n').findIndex(l=>l.includes(loose)):-1;
   throw Error('Фрагмент old не найден в '+rel+(line>=0?'. Похожая строка '+(line+1)+': прочитай файл заново и скопируй фрагмент точно, с отступами.':'. Прочитай файл заново.'));
  }
  if(count>1&&!all)throw Error('Фрагмент встречается '+count+' раз в '+rel+': добавь соседние строки, чтобы он стал уникальным.');
  let result=all?text.split(old).join(next):text.replace(old,()=>next);
  if(crlf)result=result.replace(/\n/g,'\r\n');
  await fs.writeFile(full,result,'utf8');
  return {path:rel,replaced:all?count:1};
 }
 async remove(record,relative){
  const {full,rel}=await this.resolve(record,relative,{write:true});
  const stat=await fs.stat(full).catch(()=>null);if(!stat?.isFile())throw Error('Файл не найден: '+rel);
  await fs.unlink(full);return {path:rel,deleted:true};
 }
 // Runs one allowlisted command in the worktree. Code changed in this task is checked for dangerous patterns first.
 async exec(record,command,{timeout=180000,signal}={}){
  const parts=split(command);const problem=allowed(parts);if(problem)throw Error(problem);
  for(const file of await this.changed(record)){
   const {full}=await this.resolve(record,file).catch(()=>({}));if(!full)continue;
   const text=await fs.readFile(full,'utf8').catch(()=>'');const found=scan(text);
   if(found)throw Error('Не запускаю: в '+file+' найдено опасное действие ('+found+'). Убери его из кода.');
  }
  const home=path.join(this.root,'.home');await fs.mkdir(home,{recursive:true});
  const started=Date.now();
  try{
   const r=await this.run(parts[0]==='./gradlew'&&process.platform==='win32'?'gradlew.bat':parts[0],parts.slice(1),{cwd:record.path,env:cleanEnv(home),timeout,maxBuffer:8*1024*1024,windowsHide:true,shell:process.platform==='win32'&&/^(?:npm|npx)$/.test(parts[0]),signal});
   return {command:parts.join(' '),exitCode:0,ok:true,ms:Date.now()-started,output:tail([r.stdout,r.stderr].filter(Boolean).join('\n'))};
  }catch(e){
   if(e.code==='ENOENT')return {command:parts.join(' '),exitCode:127,ok:false,ms:Date.now()-started,output:'Программа «'+parts[0]+'» не найдена на компьютере.'};
   if(e.name==='AbortError')throw e;
   return {command:parts.join(' '),exitCode:typeof e.code==='number'?e.code:1,ok:false,timedOut:!!e.killed,ms:Date.now()-started,output:tail([e.stdout,e.stderr].filter(Boolean).join('\n')||e.message)};
  }
 }
 // Files changed against the base commit, including new untracked files.
 async changed(record){
  const tracked=(await this.git(record.path,['diff','--name-only','-z',record.base])).split('\0');
  const untracked=(await this.git(record.path,['ls-files','--others','--exclude-standard','-z'])).split('\0');
  return [...new Set([...tracked,...untracked])].filter(f=>f&&!LINKED.some(l=>f===l||f.startsWith(l+'/')));
 }
 async stage(record){
  await this.git(record.path,['add','-A']);
  // Linked dependency folders are symlinks to the project's own; they never go into a commit.
  for(const name of record.linked||[])if((await this.git(record.path,['diff','--cached','--name-only','--',name])).trim())await this.git(record.path,['reset','-q','--',name]);
 }
 async diff(record,limit=60000){
  await this.stage(record);
  const numstat=(await this.git(record.path,['diff','--cached','--numstat',record.base])).trim();
  const files=numstat?numstat.split('\n').map(r=>{const [a,d,...p]=r.split('\t');return {path:p.join('\t'),added:a==='-'?0:Number(a),removed:d==='-'?0:Number(d),binary:a==='-'};}):[];
  const patch=await this.git(record.path,['diff','--cached','--no-ext-diff','-U3',record.base]);
  return {files,patch:patch.length>limit?patch.slice(0,limit)+'\n… дифф сокращён, полный — в ветке '+record.branch:patch,added:files.reduce((n,f)=>n+f.added,0),removed:files.reduce((n,f)=>n+f.removed,0)};
 }
 async commit(record,message){
  await this.stage(record);
  if(!(await this.git(record.path,['diff','--cached','--name-only'])).trim()){
   const ahead=(await this.git(record.path,['rev-list','--count',record.base+'..HEAD'])).trim();
   if(ahead==='0')throw Error('Изменений нет.');return;
  }
  const name=(await this.git(record.repo,['config','user.name']).catch(()=>'')).trim(),email=(await this.git(record.repo,['config','user.email']).catch(()=>'')).trim();
  await this.git(record.path,[...(!name?['-c','user.name=Петя']:[]),...(!email?['-c','user.email=petya@localhost']:[]),'commit','--no-verify','-q','-m',String(message).slice(0,200)]);
 }
 // Accept: commit on the branch and merge into the branch checked out in the project folder.
 // `keep` commits without merging and leaves the branch for the user.
 async accept(record,message,{merge=true}={}){
  if(!await this.exists(record))throw Error('Рабочая копия задачи не найдена: её удалили вручную.');
  await this.commit(record,message);
  if(!merge){await this.cleanup(record,{branch:false});return {merged:false,branch:record.branch};}
  const current=(await this.git(record.repo,['rev-parse','--abbrev-ref','HEAD'])).trim();
  if(current==='HEAD')throw Error('В папке проекта не выбрана ветка (detached HEAD). Переключись на ветку или скажи «оставь в ветке».');
  const dirty=(await this.git(record.repo,['status','--porcelain','--untracked-files=no'])).trim();
  if(dirty)throw Error('В папке проекта есть незакоммиченные изменения:\n'+dirty.split('\n').slice(0,8).join('\n')+'\nЗакоммить или спрячь их (git stash) и скажи «прими» ещё раз — или «оставь в ветке».');
  try{await this.git(record.repo,['merge','--no-edit','-m','Merge '+record.branch,record.branch],{timeout:120000});}
  catch(e){await this.git(record.repo,['merge','--abort']).catch(()=>{});throw Error('Не удалось влить без конфликтов: '+e.message.split('\n')[0]+'. Изменения сохранены в ветке '+record.branch+'. Скажи «оставь в ветке» или разреши конфликт сам.');}
  await this.cleanup(record,{branch:true});
  return {merged:true,into:current,branch:record.branch};
 }
 async discard(record){await this.cleanup(record,{branch:true,force:true});}
 async cleanup(record,{branch=false,force=false}={}){
  for(const name of record.linked||[])await fs.unlink(path.join(record.path,name)).catch(()=>{});
  if(await this.exists(record))await this.git(record.repo,['worktree','remove','--force',record.path]).catch(async()=>{await fs.rm(record.path,{recursive:true,force:true});await this.git(record.repo,['worktree','prune']).catch(()=>{});});
  if(branch)await this.git(record.repo,['branch',force?'-D':'-d',record.branch]).catch(()=>this.git(record.repo,['branch','-D',record.branch]).catch(()=>{}));
 }
 // The test command this project most likely uses.
 async testCommand(record){
  const has=async f=>fs.stat(path.join(record.path,f)).then(()=>true,()=>false);
  try{const pkg=JSON.parse(await fs.readFile(path.join(record.path,'package.json'),'utf8'));if(pkg.scripts?.test&&!/no test specified/.test(pkg.scripts.test))return 'npm test';}catch{}
  if(await has('pytest.ini')||await has('conftest.py')||await has('tests/conftest.py'))return 'pytest -q';
  if(await has('pyproject.toml')&&/pytest/.test(await fs.readFile(path.join(record.path,'pyproject.toml'),'utf8').catch(()=>'')))return 'pytest -q';
  if(await has('go.mod'))return 'go test ./...';
  if(await has('Cargo.toml'))return 'cargo test';
  if(await has('Makefile')&&/^test:/m.test(await fs.readFile(path.join(record.path,'Makefile'),'utf8').catch(()=>'')))return 'make test';
  return '';
 }
 // Short orientation for the model: project instructions, README head and file tree.
 async overview(record){
  const read=async f=>{try{const t=await fs.readFile(path.join(record.path,f),'utf8');return t.length>3000?t.slice(0,3000)+'\n…':t;}catch{return '';}};
  const files=await this.files(record);
  const instructions=[];for(const f of ['AGENTS.md','CLAUDE.md','.cursorrules','CONTRIBUTING.md']){const t=await read(f);if(t)instructions.push('### '+f+'\n'+t);if(instructions.length>=2)break;}
  const readme=await read('README.md');
  return {files:files.length,tree:(await this.list(record,'.',2)).entries.slice(0,150),instructions:instructions.join('\n\n'),readme:readme.slice(0,1500)};
 }
}
module.exports={CoderWorkspace,split,allowed,scan,slug,cleanEnv,COMMANDS};
