// «API-клиент»: HTTP requests from the chat («дерни GET https://…», «отправь POST на /login с телом …», a pasted
// curl, «проверь, отвечает ли staging»), saved environments, and endpoints from the project's OpenAPI file.
// Safety: a GET/HEAD runs at once only to a host the user saved in an environment or typed in this very message;
// any other method, or a host that came from elsewhere, waits in the card for «Отправить» with the exact request
// shown (secrets masked). Petya never adds its own tokens or browser cookies, and refuses a request that carries one.
const kit=require('../app-kit.cjs');
const R=require('./request.cjs');
const E=require('./environments.cjs');
const {send,view,SendError,LIMITS}=require('./send.cjs');
const OpenAPI=require('./openapi.cjs');
const ID='http-client',BY='API-клиент';

const deps={send,now:()=>Date.now()};
const records=new Map();
function keep(record){
 const id=require('node:crypto').randomUUID();
 records.set(id,{...record,id,at:deps.now(),state:record.state||'done'});
 for(const [k,v] of records)if(deps.now()-v.at>60*60000)records.delete(k);
 while(records.size>100)records.delete(records.keys().next().value);
 return id;
}

// --- Routing ----------------------------------------------------------------------------------------------------
const URLISH=/https?:\/\/\S+|(?:^|\s)(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ru|me|cloud|local|internal|test|example)(?::\d+)?(?:\/\S*)?(?=$|[\s,.;!?])|(?:^|\s)localhost:\d+/i;
const PATH=/(?:^|[\s«"'])\/[A-Za-z0-9_\-./{}%?=&:~+]+/;
const METHOD=/(?:^|[^A-Za-z])(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?=$|[^A-Za-z])/;
const VERB=/(?:^|[^\p{L}])(?:дёрни|дерни|дернуть|дёрнуть|отправь|пошли|кинь|сделай|выполни|вызови|запроси|стукни|постучи\p{L}*|запости)(?=$|[^\p{L}])/iu;
const REQUEST_WORD=/запрос\p{L}*|request|эндпоинт\p{L}*|endpoint|ручк\p{L}*|апи(?=$|[^\p{L}])|(?:^|[^\p{L}])api(?=$|[^\p{L}])/iu;
const HEALTH=/health-?check\p{L}*|healthcheck|хелс-?чек\p{L}*|хелсчек\p{L}*|(?:^|[^\p{L}])health(?=$|[^\p{L}])|отвечает ли|жив(?:ой|о)? ли|доступен ли|доступно ли|поднят ли|работает ли|пингани|пинг(?:ани|ни)?(?=$|[^\p{L}])/iu;
const SERVERISH=/(?:^|[^\p{L}])(?:api|апи|бэкенд\p{L}*|бекенд\p{L}*|backend|сервер\p{L}*|сервис\p{L}*)(?=$|[^\p{L}])/iu;
const OPENAPI=/openapi|open api|swagger|сваггер\p{L}*/iu;
const CURL=/(?:^|\s)curl\s+\S/;
// Neighbours: an app's own API (Jira, Slack…) without an address, explanations, and «запрос» meaning a request to people.
const AVOID_TALK=/как работает|что такое|объясни|расскажи|чем отличает|зачем нуж/iu;
const AVOID_NAMED=/jira|джир\p{L}*|confluence|конфлюенс\p{L}*|slack|слак\p{L}*|asana|асан\p{L}*|github|гитхаб\p{L}*|notion|ноушн\p{L}*|sentry|сентри|figma|фигм\p{L}*|поддержк\p{L}*|саппорт\p{L}*|(?:запрос|заявк)\p{L}* (?:на|в) (?:отпуск|доступ|оплат|ревью|встреч|закупк|поддержк|бухгалтер|hr|кадр)/iu;

function kind(text,envs=[]){
 const t=String(text||'');
 if(AVOID_TALK.test(t))return null;
 if(CURL.test(t))return 'request';
 const url=URLISH.test(t),path=PATH.test(t),env=!!E.named(envs,t)||E.soundsLikeEnvironment(t);
 if(AVOID_NAMED.test(t)&&!url&&!CURL.test(t))return null;
 if(OPENAPI.test(t))return 'openapi';
 if(HEALTH.test(t)&&(url||env||SERVERISH.test(t)&&envs.length))return 'health';
 if(METHOD.test(t)&&(url||path))return 'request';
 if(VERB.test(t)&&(url||path&&(REQUEST_WORD.test(t)||METHOD.test(t)||env||envs.length)))return 'request';
 if(url&&/(?:что (?:отда[её]т|возвращает|отвечает)|какой статус|проверь|запроси)/iu.test(t))return 'request';
 return null;
}

// --- Safety ---------------------------------------------------------------------------------------------------------
// Values of Petya's own connections (tokens, OAuth credentials): a request that carries one is refused.
function petyaSecrets(settings){
 const out=new Set();
 const add=v=>{if(typeof v==='string'&&v.length>=12&&!/^\d+$/.test(v))out.add(v);};
 const walk=(v,depth=0)=>{if(depth>4)return;if(typeof v==='string'){add(v);try{const j=JSON.parse(v);if(j&&typeof j==='object')walk(j,depth+1);}catch{/* plain */}}else if(v&&typeof v==='object')for(const x of Object.values(v))walk(x,depth+1);};
 for(const [k,v] of Object.entries(settings||{}))if(/token|credential|secret|password|apikey|api_key/i.test(k)&&!/^httpClient/.test(k))walk(v);
 return out;
}
function carriesPetyaSecret(settings,req){
 const blob=[req.url,req.body||'',...req.headers.map(h=>h.value)].join('\n');
 for(const v of petyaSecrets(settings))if(blob.includes(v))return true;
 return false;
}
const masked=req=>({method:req.method,url:R.maskUrl(req.url),headers:req.headers.map(h=>({name:h.name,value:h.secret?R.mask(h.value):h.value,secret:!!h.secret,source:h.source||'typed'})),body:String(req.body||'').slice(0,8000),bodyCut:String(req.body||'').length>8000,env:req.env?{id:req.env.id,name:req.env.name}:null});
const curlOf=req=>R.toCurl({...req,headers:req.headers.map(h=>({...h,real:h.value}))});

// --- Building the request ------------------------------------------------------------------------------------------
function ask(spec,resume){return require('../../input-required.cjs').ask(spec,resume);}
function build(s,text,mode){
 const envs=E.load(s.settings),secretMap=E.secrets(s.settings);
 const p=R.parseChat(text);
 let env=E.named(envs,text)||(p.url?E.byHost(envs,p.url):null);
 let url=p.url;
 if(!url){
  const path=mode==='health'?'':p.path;
  if(!env){
   if(envs.length===1&&(path||mode==='health'&&!E.soundsLikeEnvironment(text)))env=envs[0];
   else if(envs.length&&(path||!E.soundsLikeEnvironment(text)))return {question:ask({text:'К какому окружению отправить '+(path||'запрос')+'?',label:'Окружение',options:envs.slice(0,6).map(e=>e.name)},answer=>turn(s,text+' ('+String(answer).trim()+')'))};
   else if(E.soundsLikeEnvironment(text)){
    const said=(E.GROUPS.find(g=>new RegExp('(?:^|[^\\p{L}])(?:'+g.join('|')+')(?=$|[^\\p{L}])','iu').test(text))||['staging'])[0];
    return {question:ask({text:'Окружения «'+said+'» ещё нет. Какой у него адрес? Например https://'+said+'.example.com — сохраню его как окружение и продолжу.',label:'Адрес окружения',placeholder:'https://…'},answer=>{
     const base=E.cleanUrl(/^https?:\/\//i.test(String(answer).trim())?String(answer).trim():'https://'+String(answer).trim());
     const saved=E.fromForm([...E.publicList(envs,secretMap),{name:said,baseUrl:base,health:'',headers:[]}],secretMap);
     s.saveSettings({httpClientEnvironments:saved.httpClientEnvironments,httpClientCredential:saved.httpClientCredential},true);
     return turn(s,text);
    })};
   }
   else return {question:ask({text:'Куда отправить запрос? Напишите полный адрес (https://…) или сохраните окружение с базовым адресом в настройках «API-клиента».',label:'Адрес',placeholder:'https://api.example.com/v1/…'},answer=>turn(s,text+' '+String(answer).trim()))};
  }
  url=mode==='health'?E.join(env.baseUrl,p.path||env.health||'/health'):E.join(env.baseUrl,path);
 }
 let u;try{u=new URL(url);}catch{return {error:'Некорректный адрес: '+url};}
 const headers=[...E.headersFor(env,secretMap,url)];
 // user:password in the URL becomes a Basic header (a secret), never part of the shown URL.
 if(u.username||u.password){headers.push({name:'Authorization',value:'Basic '+Buffer.from(decodeURIComponent(u.username)+':'+decodeURIComponent(u.password)).toString('base64'),secret:true,source:'typed'});u.username='';u.password='';url=u.toString();}
 for(const h of p.headers){
  const at=headers.findIndex(x=>x.name.toLowerCase()===h.name.toLowerCase());
  const row={name:h.name,value:h.value,secret:R.isSecretHeader(h.name),source:'typed'};
  if(at>=0)headers[at]=row;else headers.push(row);
 }
 const method=mode==='health'?'GET':(p.method||'GET').toUpperCase();
 if(!R.METHODS.includes(method))return {error:'Метод '+method+' не поддерживается.'};
 // A host counts as known when it is saved in an environment or written out in this very message.
 const host=u.host.toLowerCase();
 const typed=new RegExp('(?:^|[^A-Za-z0-9.-])'+host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Za-z0-9.-])','i').test(text);
 const saved=E.hosts(envs).has(host);
 const reasons=[];
 if(!['GET','HEAD'].includes(method))reasons.push('метод '+method+' может изменить данные');
 if(!saved&&!typed)reasons.push('новый адрес '+host+': его нет в окружениях и он не написан в сообщении');
 return {request:{method,url,headers,body:['GET','HEAD'].includes(method)?'':p.body||'',env},reasons,insecure:!!p.insecure,ignored:p.ignored||[],mode};
}

// --- Running ----------------------------------------------------------------------------------------------------
function sizeText(n){return n>=1e6?(n/1e6).toLocaleString('ru-RU',{maximumFractionDigits:1})+' МБ':n>=1e3?(n/1e3).toLocaleString('ru-RU',{maximumFractionDigits:1})+' КБ':n+' Б';}
async function run(s,req){
 if(carriesPetyaSecret(s.settings,req))throw new SendError('petya','В запросе оказался токен одного из подключений Пети. Такой запрос API-клиент не отправляет.');
 const res=await deps.send({method:req.method,url:req.url,headers:req.headers.map(h=>({name:h.name,value:h.value})),body:req.body});
 const v=view(res);
 return {status:res.status,statusText:res.statusText,httpVersion:res.httpVersion,timing:{ttfb:Math.round(res.timing.ttfb||0),total:Math.round(res.timing.total||0)},
  size:res.size,wire:res.wire,truncated:res.truncated,headers:res.headers.slice(0,80),redirects:res.redirects,stoppedRedirect:res.stoppedRedirect||'',finalUrl:R.maskUrl(res.url),view:v};
}
function cardData(req,{id,command,response,error,mode,reasons}){
 return {mode:error?'error':response?'response':'confirm',id,command,request:masked(req),curl:curlOf(req),response:response||null,error:error?{kind:error.kind||'failed',message:error.message}:null,
  reasons:reasons||[],health:mode==='health',limits:{timeoutMs:LIMITS.timeoutMs,maxBytes:LIMITS.maxBytes,maxRedirects:LIMITS.maxRedirects},at:deps.now()};
}
function summary(req,r,mode){
 const who=req.env&&mode==='health'?req.env.name:R.maskUrl(req.url);
 const kindText={json:' JSON',html:' HTML',text:' текст',image:' изображение',binary:'',empty:''}[r.view.kind]||'';
 if(mode==='health')return who+(r.status<500?' отвечает: ':' отвечает с ошибкой: ')+r.status+(r.statusText?' '+r.statusText:'')+' за '+r.timing.total+' мс.';
 return req.method+' '+who+' → '+r.status+(r.statusText?' '+r.statusText:'')+' · '+r.timing.total+' мс · '+sizeText(r.size)+kindText+(r.truncated?' (обрезано до '+sizeText(LIMITS.maxBytes)+')':'')+'.';
}

async function requestTurn(s,text,mode){
 const b=build(s,text,mode);
 if(b.question)return b.question;
 if(b.error)return kit.reply(s,text,{by:BY,error:true,text:b.error});
 const req=b.request;
 if(carriesPetyaSecret(s.settings,req))return kit.reply(s,text,{by:BY,error:true,text:'В запросе оказался токен одного из подключений Пети. Такой запрос API-клиент не отправляет.'});
 const notes=[b.insecure?'Проверку сертификата (-k) Петя не отключает.':'',b.ignored.length?'Пропущены опции curl: '+b.ignored.join(', ')+'.':''].filter(Boolean).join(' ');
 if(b.reasons.length){
  const id=keep({request:req,state:'pending',mode,command:text,safe:false});
  return kit.reply(s,text,{by:BY,text:'Отправить '+req.method+' '+R.maskUrl(req.url)+'? Проверьте запрос в карточке и нажмите «Отправить»: '+b.reasons.join('; ')+'.'+(notes?' '+notes:''),
   data:{httpRequest:cardData(req,{id,command:text,reasons:b.reasons,mode})}});
 }
 s.requestProgress?.report?.(mode==='health'?'Проверяю '+(req.env?.name||new URL(req.url).host):'Отправляю '+req.method+' '+new URL(req.url).host);
 const id=keep({request:req,state:'done',mode,command:text,safe:true});
 try{
  const r=await run(s,req);
  return kit.reply(s,text,{by:BY,text:summary(req,r,mode)+(notes?' '+notes:''),data:{httpRequest:cardData(req,{id,command:text,response:r,mode})}});
 }catch(e){
  const who=mode==='health'&&req.env?req.env.name:R.maskUrl(req.url);
  return kit.reply(s,text,{by:BY,error:true,text:(mode==='health'?who+' не отвечает: ':req.method+' '+who+': ')+e.message,data:{httpRequest:cardData(req,{id,command:text,error:e,mode})}});
 }
}

async function projectFolders(s){
 try{const found=await s.gitWorkspace?.discover?.();return [...new Set([...(found?.selected?[found.selected]:[]),...(found?.folders||[]),...(found?.repositories||[])])];}catch{return [];}
}
async function openapiTurn(s,text){
 const fs=require('node:fs'),path=require('node:path');
 const named=/(?:^|\s)((?:~|\/|[A-Za-z]:\\|\.{1,2}\/)?[^\s«»"']*(?:openapi|swagger|api)[^\s«»"']*\.(?:json|ya?ml))(?=$|[\s»"'.,])/i.exec(text)?.[1];
 const roots=await projectFolders(s);
 let files=[];
 if(named){
  const candidates=path.isAbsolute(named)?[named]:named.startsWith('~')?[path.join(require('node:os').homedir(),named.slice(1))]:roots.map(r=>path.join(r,named));
  files=candidates.filter(f=>{try{return fs.statSync(f).isFile();}catch{return false;}});
 }
 if(!files.length){
  if(!roots.length&&!named)return kit.reply(s,text,{by:BY,question:true,text:'У проекта нет папки на компьютере. Подключите папку проекта в его настройках или напишите путь к файлу openapi.yaml.'});
  files=OpenAPI.find(roots);
 }
 if(!files.length)return kit.reply(s,text,{by:BY,question:true,text:'В папках проекта не нашёл openapi.(json|yaml) или swagger.(json|yaml). Напишите путь к файлу спецификации.'});
 if(files.length>1&&!named)return ask({text:'Нашёл несколько спецификаций. Какую открыть?',label:'Спецификация',options:files.slice(0,6).map(f=>roots.reduce((p,r)=>p.startsWith(r)?path.relative(r,p):p,f))},answer=>openapiTurn(s,'открой openapi '+(path.isAbsolute(String(answer).trim())?String(answer).trim():path.join(roots[0]||'',String(answer).trim()))));
 const file=files[0];
 let spec;
 try{spec=OpenAPI.parse(fs.readFileSync(file,'utf8'),file);}
 catch(e){return kit.reply(s,text,{by:BY,error:true,text:'Не удалось прочитать '+path.basename(file)+': '+e.message});}
 const envs=E.load(s.settings);
 const known=spec.servers.map(u=>{try{return E.byHost(envs,new URL(u).toString())?.name||'';}catch{return '';}});
 return kit.reply(s,text,{by:BY,text:spec.title+(spec.version?' '+spec.version:'')+': '+spec.total+' '+kit.plural(spec.total,['эндпоинт','эндпоинта','эндпоинтов'])+(spec.servers.length?', серверы: '+spec.servers.join(', '):'')+'. Выберите эндпоинт в карточке — подставлю запрос в поле ввода.',
  data:{httpOpenapi:{...spec,file:path.basename(file),known,at:deps.now()}}});
}

async function turn(s,command){
 const text=String(command||'');
 const envs=E.load(s.settings);
 const k=kind(text,envs);
 if(!k||!kit.installed(s,ID))return null;
 if(k==='openapi')return openapiTurn(s,text);
 return requestTurn(s,text,k==='health'?'health':'request');
}

// --- Card and settings calls ---------------------------------------------------------------------------------------
// Requests live in memory for an hour: after that (or a restart) the card offers to repeat it through the chat.
function lookup(id){const r=records.get(String(id||''));return r&&deps.now()-r.at<=60*60000?r:null;}
const EXPIRED=()=>({expired:true,message:'Запрос устарел: Петя хранит его не дольше часа и не после перезапуска. Повторите его в чате.'});
function record(id){const r=lookup(id);if(!r)throw Error(EXPIRED().message);return r;}
function setup(s){
 // A request the user sent once (typed or confirmed) may be repeated as GET/HEAD without asking again.
 async function execute(r){
  const req=r.request;
  const next={request:req,state:'done',mode:r.mode,command:r.command,safe:['GET','HEAD'].includes(req.method)};
  try{const response=await run(s,req);return cardData(req,{id:keep(next),command:r.command,response,mode:r.mode});}
  catch(e){if(e.kind==='petya')throw e;return cardData(req,{id:keep(next),command:r.command,error:e,mode:r.mode});}
 }
 return {ipc:{
  // «Отправить» under a request that waited for confirmation. Sent once: a second press is refused.
  async send(id){
   const r=lookup(id);if(!r)return EXPIRED();
   if(r.state==='sent')throw Error('Этот запрос уже отправлен. Нажмите «Повторить» в его ответе, если нужно ещё раз.');
   if(r.state!=='pending')throw Error('Этот запрос не ждёт подтверждения.');
   r.state='sent';
   return execute(r);
  },
  cancel(id){records.delete(String(id||''));return {cancelled:true};},
  // «Повторить»: a GET/HEAD to a known host runs; anything else needs the card's confirmation first.
  async repeat(id,{confirmed=false}={}){
   const r=lookup(id);if(!r)return EXPIRED();
   const req=r.request,envs=E.load(s.settings);
   const safe=['GET','HEAD'].includes(req.method)&&(E.hosts(envs).has(new URL(req.url).host.toLowerCase())||r.safe);
   if(!safe&&!confirmed)return {confirm:true,message:'Нужно подтверждение: нажмите «Отправить» в карточке.'};
   return execute(r);
  },
  environments:()=>E.publicList(E.load(s.settings),E.secrets(s.settings)),
  async saveEnvironments(list){
   const saved=E.fromForm(list,E.secrets(s.settings));
   s.saveSettings({httpClientEnvironments:saved.httpClientEnvironments,httpClientCredential:saved.httpClientCredential},true);
   return E.publicList(E.load(s.settings),E.secrets(s.settings));
  },
  // «Сохранить в окружение»: the request's origin with its headers; secret ones go to the secret store.
  async saveEnvironment(id,name){
   const r=record(id);const req=r.request;
   const envs=E.load(s.settings),secretMap=E.secrets(s.settings);
   const base=new URL(req.url).origin;
   if(E.byHost(envs,base))throw Error('Этот адрес уже есть в окружении «'+E.byHost(envs,base).name+'».');
   const keepHeader=h=>!/^(?:content-type|content-length|user-agent|accept-encoding|host)$/i.test(h.name);
   const title=String(name||'').trim()||new URL(req.url).host;
   const next=E.fromForm([...E.publicList(envs,secretMap),{name:title,baseUrl:base,health:'',headers:req.headers.filter(keepHeader).map(h=>({name:h.name,value:h.value,secret:h.secret}))}],secretMap);
   s.saveSettings({httpClientEnvironments:next.httpClientEnvironments,httpClientCredential:next.httpClientCredential},true);
   const env=next.envs.at(-1);
   return {name:env.name,baseUrl:env.baseUrl,headers:env.headers.length,secrets:env.secretHeaders.length};
  }
 }};
}
function validate(next){
 for(const key of ['httpClientEnvironments','httpClientCredential']){
  const v=next[key];
  if(typeof v!=='string'||!v)continue;
  try{JSON.parse(v);}catch{next[key]=key==='httpClientEnvironments'?'[]':'{}';}
 }
}
module.exports={name:'httpClient',defaults:{['extension_'+ID]:'false',httpClientEnvironments:'[]',httpClientCredential:''},secrets:['httpClientCredential'],validate,setup,turn,kind,build,petyaSecrets,records,deps,summary};
