// «API-клиент», environments: saved base URLs with headers («staging», «прод»). Ordinary headers live in the
// setting `httpClientEnvironments`; secret header values in `httpClientCredential`, a feature secret encrypted by
// the OS and never sent to the renderer. A secret is attached only to requests to its own environment's origin.
const crypto=require('node:crypto');
const {isSecretHeader}=require('./request.cjs');
const LIMIT=2000;

// Usual names people say for environments.
const GROUPS=[
 ['staging','stage','стейдж','стейджинг','стэйдж','стэйджинг','стейдж\\p{L}*','стейджинг\\p{L}*'],
 ['prod','production','прод','прода','проде','продакшн','продакшен','продакшене','продакшна','боевой','боевом','прод\\p{L}*'],
 ['dev','development','дев','дева','деве','девелоп\\p{L}*'],
 ['test','testing','qa','тест','тестовый','тестовом','тестового'],
 ['local','localhost','локал','локальный','локальном','локалк\\p{L}*']
];
const word=w=>new RegExp('(?:^|[^\\p{L}\\d_-])(?:'+w+')(?=$|[^\\p{L}\\d_-])','iu');

function parse(json,fallback){try{const v=JSON.parse(json||'');return v??fallback;}catch{return fallback;}}
function cleanUrl(value){
 const u=new URL(String(value||'').trim());
 if(!['http:','https:'].includes(u.protocol))throw Error('Адрес окружения должен начинаться с http:// или https://');
 if(u.username||u.password)throw Error('Не указывайте логин и пароль в адресе: добавьте заголовок Authorization как секрет.');
 u.hash='';u.search='';
 return u.toString().replace(/\/$/,'');
}
function load(settings){
 const list=parse(settings.httpClientEnvironments,[]);
 return (Array.isArray(list)?list:[]).filter(e=>e&&typeof e.id==='string'&&typeof e.name==='string'&&typeof e.baseUrl==='string').map(e=>({
  id:e.id,name:e.name,baseUrl:e.baseUrl,health:typeof e.health==='string'?e.health:'',aliases:Array.isArray(e.aliases)?e.aliases.filter(a=>typeof a==='string'):[],
  headers:Array.isArray(e.headers)?e.headers.filter(h=>h&&typeof h.name==='string'&&typeof h.value==='string'):[],
  secretHeaders:Array.isArray(e.secretHeaders)?e.secretHeaders.filter(n=>typeof n==='string'):[]}));
}
function secrets(settings){const v=parse(settings.httpClientCredential,{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
const host=url=>{try{return new URL(url).host.toLowerCase();}catch{return '';}};
const origin=url=>{try{return new URL(url).origin;}catch{return '';}};
const hosts=envs=>new Set(envs.map(e=>host(e.baseUrl)).filter(Boolean));

// The environment the text names: its own name or alias, or a usual synonym of it («прод» for «production»).
function named(envs,text){
 const t=String(text||'');
 for(const e of envs){
  const own=[e.name,...e.aliases].filter(Boolean).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(own.length&&word(own.join('|')).test(t))return e;
 }
 for(const group of GROUPS){
  if(!word(group.join('|')).test(t))continue;
  const e=envs.find(x=>[x.name,...x.aliases].some(n=>word(group.join('|')).test(n)));
  if(e)return e;
 }
 return null;
}
// A word that sounds like an environment even when none is saved under it («отвечает ли staging»).
function soundsLikeEnvironment(text){return GROUPS.some(g=>word(g.join('|')).test(String(text||'')));}
function byHost(envs,url){const h=host(url);return h?envs.find(e=>host(e.baseUrl)===h)||null:null;}

// Headers of the environment for this URL: secrets only when the URL is on the environment's own origin.
function headersFor(env,secretMap,url){
 if(!env)return [];
 const same=origin(url)===origin(env.baseUrl);
 const out=env.headers.map(h=>({name:h.name,value:h.value,secret:false,source:'env'}));
 if(same)for(const name of env.secretHeaders){const v=secretMap[env.id]?.[name];if(typeof v==='string'&&v)out.push({name,value:v,secret:true,source:'env'});}
 return out;
}
function join(base,path){
 if(!path)return base;
 const b=base.replace(/\/$/,'');
 return b+(path.startsWith('/')?path:'/'+path);
}

// For the settings form: everything but secret values (only whether one is stored).
function publicList(envs,secretMap){
 return envs.map(e=>({...e,headers:[...e.headers.map(h=>({name:h.name,value:h.value,secret:false})),...e.secretHeaders.map(name=>({name,value:'',secret:true,stored:!!secretMap[e.id]?.[name]}))]}));
}
// The settings form's list → the two stored settings. An empty secret value keeps the stored one.
function fromForm(list,oldSecrets){
 if(!Array.isArray(list)||list.length>20)throw Error('Не больше 20 окружений.');
 const envs=[],secretMap={},names=new Set();
 for(const raw of list){
  const name=String(raw?.name||'').trim().slice(0,40);
  if(!name)throw Error('У окружения должно быть имя.');
  if(names.has(name.toLowerCase()))throw Error('Окружение «'+name+'» уже есть.');names.add(name.toLowerCase());
  const id=typeof raw.id==='string'&&/^[a-z0-9-]{4,40}$/.test(raw.id)?raw.id:crypto.randomUUID().slice(0,8);
  const baseUrl=cleanUrl(raw.baseUrl);
  const health=String(raw.health||'').trim();
  if(health&&!health.startsWith('/'))throw Error('Путь health-check начинается с «/», например /health.');
  const headers=[],secretHeaders=[];
  for(const h of Array.isArray(raw.headers)?raw.headers:[]){
   const hn=String(h?.name||'').trim();
   if(!hn)continue;
   if(!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$/.test(hn))throw Error('Некорректное имя заголовка: '+hn);
   const value=String(h.value??'');
   if(/[\r\n]/.test(value))throw Error('Значение заголовка '+hn+' не должно содержать перевод строки.');
   if(h.secret||isSecretHeader(hn)){
    const keep=!value&&oldSecrets?.[id]?.[hn];
    if(!value&&!keep)continue;
    secretHeaders.push(hn);(secretMap[id]||={})[hn]=value||oldSecrets[id][hn];
   }else headers.push({name:hn,value});
  }
  const aliases=(Array.isArray(raw.aliases)?raw.aliases:String(raw.aliases||'').split(',')).map(a=>String(a).trim()).filter(Boolean).slice(0,5);
  envs.push({id,name,baseUrl,health,aliases,headers,secretHeaders});
 }
 const environments=JSON.stringify(envs),credential=JSON.stringify(secretMap);
 if(environments.length>LIMIT)throw Error('Слишком много окружений и заголовков: настройки ограничены 2000 символами. Уберите лишние заголовки.');
 if(credential.length>LIMIT)throw Error('Секреты окружений не помещаются в хранилище (2000 символов). Уберите лишние токены.');
 return {httpClientEnvironments:environments,httpClientCredential:credential,envs};
}
module.exports={load,secrets,named,byHost,hosts,host,origin,headersFor,join,publicList,fromForm,soundsLikeEnvironment,cleanUrl,GROUPS};
