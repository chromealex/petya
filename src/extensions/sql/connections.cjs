// «SQL по словам», connections: the list of databases (setting `sqlConnections`, no secrets in it) and their passwords
// (feature secret `sqlCredential`, a JSON map id → password, encrypted by the OS and never sent to the renderer).
// BigQuery uses a Google Cloud service-account key: its own (`sqlBigQueryCredential`, a feature secret) or, when none
// is loaded, the key already saved for «Firebase Crashlytics» (one service account, not a copy of it).
// Both settings are limited to 2000 characters by the settings store; more connections are refused with a message.
const crypto=require('node:crypto');
const KINDS={clickhouse:'ClickHouse',postgres:'PostgreSQL',bigquery:'BigQuery'};
const DIALECT={clickhouse:'clickhouse',postgres:'postgres',bigquery:'bigquery'};
const PROJECT=/^(?:[a-z][a-z0-9.-]{0,61}[a-z0-9]:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DATASET=/^[A-Za-z0-9_]{1,1024}$/;
const LOCATION=/^[A-Za-z0-9-]{2,40}$/;
const NAME=/^[^\u0000-\u001f]{1,40}$/;
const LIMIT=2000;

function parse(json,fallback){try{const v=JSON.parse(json||'');return v??fallback;}catch{return fallback;}}
function load(settings){
 const list=parse(settings.sqlConnections,[]);
 return (Array.isArray(list)?list:[]).filter(c=>c&&typeof c.id==='string'&&KINDS[c.kind]&&typeof c.name==='string').map(c=>({
  id:c.id,name:c.name,kind:c.kind,dialect:DIALECT[c.kind],url:String(c.url||''),host:String(c.host||''),port:Number(c.port)||(c.kind==='postgres'?5432:0),
  database:String(c.database||''),user:String(c.user||''),ssl:['verify','require','disable'].includes(c.ssl)?c.ssl:'verify',
  project:String(c.project||''),dataset:String(c.dataset||''),location:String(c.location||''),limitGb:Number(c.limitGb)>0?Number(c.limitGb):5}));
}
function secrets(settings){const v=parse(settings.sqlCredential,{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
// The service-account key for BigQuery: the app's own, else the one «Firebase Crashlytics» keeps.
function bigQueryKey(settings){return settings.sqlBigQueryCredential||settings.crashlyticsCredential||'';}
function connected(settings){
 return load(settings).some(c=>c.kind!=='bigquery'||!!bigQueryKey(settings));
}

function cleanUrl(value){
 let u;try{u=new URL(String(value||'').trim());}catch{throw Error('Адрес ClickHouse: укажите его в виде https://host:8443 или http://localhost:8123.');}
 if(!['http:','https:'].includes(u.protocol))throw Error('Адрес ClickHouse должен начинаться с http:// или https://');
 if(u.username||u.password)throw Error('Не указывайте логин и пароль в адресе: для них есть отдельные поля.');
 u.hash='';u.search='';
 return u.toString().replace(/\/$/,'');
}
const local=host=>/^(?:localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(host);

// The settings form's list → the two stored settings. An empty password keeps the stored one.
function fromForm(list,oldSecrets){
 if(!Array.isArray(list)||list.length>12)throw Error('Не больше 12 подключений.');
 const out=[],secretMap={},names=new Set();
 for(const raw of list){
  const kind=String(raw?.kind||'');
  if(!KINDS[kind])throw Error('Выберите вид базы: ClickHouse, PostgreSQL или BigQuery.');
  const name=String(raw.name||'').trim().slice(0,40)||KINDS[kind];
  if(!NAME.test(name))throw Error('Некорректное имя подключения.');
  if(names.has(name.toLowerCase()))throw Error('Подключение «'+name+'» уже есть.');names.add(name.toLowerCase());
  const id=typeof raw.id==='string'&&/^[a-z0-9-]{4,40}$/.test(raw.id)?raw.id:crypto.randomUUID().slice(0,8);
  const c={id,name,kind};
  if(kind==='clickhouse'){
   c.url=cleanUrl(raw.url);
   c.database=String(raw.database||'').trim()||'default';
   if(!/^[A-Za-z0-9_.-]{1,120}$/.test(c.database))throw Error('База ClickHouse: латиница, цифры, «_», «.», «-».');
   c.user=String(raw.user||'').trim()||'default';
  }else if(kind==='postgres'){
   c.host=String(raw.host||'').trim();
   if(!/^[A-Za-z0-9.-]{1,253}$|^\[[0-9a-fA-F:]+\]$/.test(c.host))throw Error('Хост PostgreSQL: имя или IP-адрес, без http://.');
   c.port=Number(raw.port||5432);if(!Number.isInteger(c.port)||c.port<1||c.port>65535)throw Error('Порт PostgreSQL — число от 1 до 65535.');
   c.database=String(raw.database||'').trim();if(!c.database||c.database.length>63)throw Error('Укажите базу PostgreSQL.');
   c.user=String(raw.user||'').trim();if(!c.user||c.user.length>63)throw Error('Укажите пользователя PostgreSQL (лучше с правами только на чтение).');
   c.ssl=['verify','require','disable'].includes(raw.ssl)?raw.ssl:'verify';
   if(c.ssl==='disable'&&!local(c.host))throw Error('Без шифрования можно подключаться только к localhost. Для удалённой базы выберите TLS.');
  }else{
   c.project=String(raw.project||'').trim();if(!PROJECT.test(c.project))throw Error('ID проекта Google Cloud: строчные латинские буквы, цифры и «-», например my-game-12345.');
   c.dataset=String(raw.dataset||'').trim();if(!DATASET.test(c.dataset))throw Error('Набор данных BigQuery: латиница, цифры и «_».');
   c.location=String(raw.location||'').trim();if(c.location&&!LOCATION.test(c.location))throw Error('Регион BigQuery указан неверно, например US, EU или europe-west1.');
   const limit=Number(String(raw.limitGb||'5').replace(',','.'));if(!Number.isFinite(limit)||limit<0.1||limit>1000)throw Error('Лимит чтения BigQuery — от 0,1 до 1000 ГБ.');
   c.limitGb=limit;
  }
  const password=typeof raw.password==='string'?raw.password:'';
  if(kind!=='bigquery'){
   const kept=!password&&oldSecrets?.[id];
   if(password||kept)secretMap[id]=password||oldSecrets[id];
  }
  out.push(c);
 }
 const connections=JSON.stringify(out),credential=JSON.stringify(secretMap);
 if(connections.length>LIMIT)throw Error('Слишком много подключений: настройки ограничены 2000 символами.');
 if(credential.length>LIMIT)throw Error('Пароли подключений не помещаются в хранилище (2000 символов).');
 return {sqlConnections:connections,sqlCredential:credential};
}
// For the settings form: everything but passwords (only whether one is stored).
function publicList(settings){const map=secrets(settings);return load(settings).map(c=>({...c,hasPassword:!!map[c.id]}));}
const label=c=>c.name+(c.name===KINDS[c.kind]?'':' · '+KINDS[c.kind]);

module.exports={KINDS,DIALECT,PROJECT,DATASET,LOCATION,load,secrets,bigQueryKey,connected,fromForm,publicList,cleanUrl,label};
