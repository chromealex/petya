// Shared GitHub adapter for the «Сборки» (ci-builds) and «Pull requests» apps: one token, default repositories,
// the repository of the current project's git remote, REST calls with GitHub's required headers and readable errors.
// JSON reads go through s.request (cancellation, request progress); writes and job logs use fetch directly
// because a write may answer with an empty body and the logs endpoint answers with a redirect to a signed URL.
const BASE='https://api.github.com';
const REPO=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
// Fine-grained token permissions the two apps need (shown in settings and in errors).
const PERMISSIONS='Actions: read and write (перезапуск), Pull requests: read and write (комментарии), Contents: read, Metadata: read';
const MAX_LOG=4*1024*1024;

const connected=settings=>!!String(settings?.githubToken||'').trim();
// «owner/repo, owner/other» → ['owner/repo','owner/other']; GitHub URLs are accepted too.
function parseRepos(text){
 const out=[];
 for(let part of String(text||'').split(/[\s,;]+/)){
  part=part.trim().replace(/^https:\/\/github\.com\//i,'').replace(/\.git$/i,'').replace(/\/+$/,'');
  if(!part)continue;
  if(!REPO.test(part)||part.split('/')[1]==='.'||part.split('/')[1]==='..')throw Error('Репозиторий GitHub указывается как owner/repo: «'+part.slice(0,80)+'» не подходит.');
  if(!out.some(r=>r.toLowerCase()===part.toLowerCase()))out.push(part);
 }
 if(out.length>10)throw Error('Укажите не больше 10 репозиториев GitHub.');
 return out;
}
const validRepo=repo=>{if(typeof repo!=='string'||!REPO.test(repo))throw Error('Некорректный репозиторий GitHub: нужен owner/repo.');return repo;};
// git@github.com:owner/repo.git, https://github.com/owner/repo(.git), ssh://git@github.com/owner/repo → owner/repo.
function repoFromRemote(url){
 const m=String(url||'').trim().match(/^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
 return m&&REPO.test(m[1])?m[1]:'';
}
// The repository of the current project's git folder, when it has a GitHub remote. Best effort: '' otherwise.
async function projectRepo(s){
 try{
  const found=await s.gitWorkspace?.discover?.();
  if(!found?.selected)return '';
  const remotes=String(await s.gitWorkspace.git(found.selected,['remote','-v'])).split('\n');
  const origin=remotes.find(l=>/^origin\s/.test(l))||remotes[0]||'';
  return repoFromRemote(origin.split(/\s+/)[1]);
 }catch{return '';}
}
// Repositories to look at: the configured ones, otherwise the project's remote.
async function repos(s){
 let configured=[];try{configured=parseRepos(s.settings.githubRepos);}catch{configured=[];}
 if(configured.length)return configured;
 const own=await projectRepo(s);return own?[own]:[];
}

function headers(token,extra={}){return {Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Petya',...extra};}
// A GitHub failure in words: missing access is told apart from «not found» and from rate limits.
function problem(error){
 const status=error?.status,detail=String(error?.detail||'');
 let text;
 if(status===401)text='GitHub не принял токен. Обновите его в настройках «GitHub».';
 else if(status===403||status===429)text=/rate limit/i.test(detail)||status===429?'GitHub временно ограничил запросы (лимит API). Повторите позже.':'У токена GitHub нет нужного доступа. Нужны права: '+PERMISSIONS+'.';
 else if(status===404)text='GitHub: не найдено. Проверьте репозиторий и что токен имеет к нему доступ.';
 else if(status===422)text='GitHub отклонил запрос'+(detail?': '+(()=>{try{return JSON.parse(detail).message;}catch{return detail.slice(0,200);}})():'.');
 else return error instanceof Error?error:Error(String(error));
 const e=Error(text);e.status=status;e.github=true;return e;
}

function create(s){
 const token=String(s.settings.githubToken||'').trim();
 if(!token){const e=Error('Подключите GitHub: настройки → «GitHub», токен доступа.');e.notConnected=true;throw e;}
 const doFetch=s.fetch||globalThis.fetch;
 const url=(path,query)=>{const u=new URL(path.startsWith('https://')?path:BASE+path);if(u.origin!==BASE)throw Error('Недопустимый адрес GitHub.');for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!=='')u.searchParams.set(k,String(v));return u.href;};
 async function get(path,query){try{return await s.request(url(path,query),{headers:headers(token)});}catch(e){throw problem(e);}}
 // Writes: only from an explicit user action (a card button). An empty 201/204 body is a success.
 async function send(method,path,body){
  const r=await doFetch(url(path),{method,headers:headers(token,{'Content-Type':'application/json'}),body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  const text=await r.text().catch(()=>'');
  if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;e.detail=text.slice(0,500);throw problem(e);}
  try{return text?JSON.parse(text):{};}catch{return {};}
 }
 // Job logs: the API answers 302 with a short-lived signed URL; the token is not sent there.
 async function log(path){
  const first=await doFetch(url(path),{headers:headers(token),redirect:'manual',signal:AbortSignal.timeout(30000)});
  let r=first;
  if([301,302,303,307,308].includes(first.status)){
   const next=first.headers.get('location');let target;
   try{target=new URL(next);}catch{throw Error('GitHub вернул некорректную ссылку на лог.');}
   if(target.protocol!=='https:')throw Error('GitHub вернул небезопасную ссылку на лог.');
   r=await doFetch(target.href,{redirect:'follow',signal:AbortSignal.timeout(60000)});
  }
  if(!r.ok){const e=Error('HTTP '+r.status);e.status=r.status;e.detail=await r.text().catch(()=>'');throw problem(e);}
  return readText(r);
 }
 return {get,send,log,token};
}
// Reads a text body, keeping only the tail of a huge log (errors are at the end).
async function readText(response,limit=MAX_LOG){
 const buffer=Buffer.from(await response.arrayBuffer());
 if(buffer.length>=2&&buffer[0]===0x50&&buffer[1]===0x4b)throw Error('Лог пришёл архивом, его нельзя прочитать здесь.');
 return (buffer.length>limit?buffer.subarray(buffer.length-limit):buffer).toString('utf8');
}

module.exports={BASE,PERMISSIONS,REPO,connected,parseRepos,validRepo,repoFromRemote,projectRepo,repos,headers,problem,create,readText};
