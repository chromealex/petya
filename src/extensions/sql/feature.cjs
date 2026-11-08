// «SQL по словам»: a question in words → one read-only SQL query over a connected database, shown with its estimated
// cost before it runs; the result comes back as a table and, when its shape fits, a chart.
// Flow: the schema of the connection (tables, columns, types, comments; cached per connection) → the local model writes
// SQL for the question using only that schema ({sql, explanation, assumptions}) → code checks it (validate.cjs: one
// read-only statement, LIMIT, no dangerous functions; every table it reads must be in the schema; one retry with the
// reason) → an estimate (BigQuery dry run bytes, ClickHouse EXPLAIN ESTIMATE rows, PostgreSQL EXPLAIN rows) → the card
// with «Выполнить». It runs right away only when the user turned on auto-run and the estimate is under the threshold.
// SQL the user typed («выполни SELECT …») skips the model and goes through the same checks.
const kit=require('../app-kit.cjs');
const C=require('./connections.cjs');
const V=require('./validate.cjs');
const S=require('./schema.cjs');
const sources=require('./sources.cjs');
const chart=require('./chart.cjs');
const ID='sql',BY='SQL по словам';
const GB=1024**3;
const deps={now:()=>Date.now()};

// --- Routing ---------------------------------------------------------------------------------------------------------
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?=$|[^\\p{L}\\p{N}_])';
const re=(body,flags='iu')=>new RegExp(body,flags);
const EXPLICIT=re(W+'(?:sql|clickhouse|bigquery|postgres(?:ql)?|psql)'+E+'|кликхаус\\p{L}*|бигквери|биг квери|постгре\\p{L}*|постгрес\\p{L}*|баз\\p{L}* данных|'+W+'(?:в|из|по|к) баз[еуы]'+E+'|(?:запрос\\p{L}*|выборк\\p{L}*|селект\\p{L}*) (?:к|в|из|по) баз\\p{L}*|'+W+'селект\\p{L}*');
const SCHEMA=re('схем\\p{L}* (?:таблиц\\p{L}*|баз\\p{L}*|данных)|структур\\p{L}* таблиц\\p{L}*|какие (?:есть )?(?:таблиц\\p{L}*|столбц\\p{L}*|колонк\\p{L}*|пол[яей] )|список таблиц|(?:столбц|колонк|пол)\\p{L}* (?:в )?таблиц\\p{L}*|покажи таблиц\\p{L}*|таблиц\\p{L}* в баз\\p{L}*');
const REFRESH=re('(?:обнови|перечитай|перезагрузи)\\p{L}* схем\\p{L}*');
// Neighbours: code and migrations (coder), explanations, knowledge bases, changes to the database.
const AVOID=re('миграц\\p{L}*|'+W+'(?:что такое|что значит|объясни|расскажи|чем отлича\\p{L}*|как работает|как устроен\\p{L}*|зачем нуж\\p{L}*)|баз\\p{L}* знани\\p{L}*|индекс\\p{L}*|храним\\p{L}* процедур|процедур\\p{L}*|триггер\\p{L}*|спроектируй|нормализ\\p{L}*|'+W+'orm'+E+'|(?:create|alter|drop) table|(?:создай|удали|измени|переименуй|добавь|очисти)\\p{L}* (?:таблиц|столб|колонк|строк|запис|индекс|баз)|оптимизир\\p{L}*|ускорь|рефактор\\p{L}*|бэкап\\p{L}*|резервн\\p{L}* копи|google sheets|гугл[- ]?таблиц\\p{L}*|эксел\\p{L}*|excel');
// A request to change data in a named database: answered with what this app does (only reads), never drafted.
const WRITE=re(W+'(?:удали\\p{L}*|измени\\p{L}*|вставь|добавь|очисти|перенеси|переименуй|запиши|исправь|поправь|обнови(?!\\p{L}*\\s+схем)\\p{L}*|insert|update|delete|drop|truncate)'+E);
// A data question in words; taken only when a database is connected and the question is not another app's metric.
const DATA_Q=re('^(?:а\\s+|петя,?\\s+)?(?:сколько|топ(?:[- ]?\\d+)?|какой процент|какая доля|какое среднее|средн\\p{L}*|медиан\\p{L}*|распределени\\p{L}*|динамик\\p{L}*|посчитай|покажи (?:число|количество|динамику|разбивку|распределение|топ|сколько)|у скольких|кто из игроков|какие страны|какие уровни)');
const DATA_NOUN=re('игрок\\p{L}*|пользовател\\p{L}*|юзер\\p{L}*|платеж\\p{L}*|платёж\\p{L}*|покупк\\p{L}*|транзакц\\p{L}*|заказ\\p{L}*|событи\\p{L}*|ивент\\p{L}*|сесси\\p{L}*|уровн\\p{L}*|уровен\\p{L}*|матч\\p{L}*|'+W+'бо[йёия]\\p{L}*|стран\\p{L}*|устройств\\p{L}*|регистрац\\p{L}*|инсталл\\p{L}*|установ\\p{L}*');
const ELSEWHERE=re(W+'(?:dau|mau|wau|arpu|arppu|arpdau|ltv|ecpm|ецпм|cpi|roas)'+E+'|ретеншн\\p{L}*|retention|удержани\\p{L}*|новых игроков|выручк\\p{L}*|revenue|реклам\\p{L}*|крэш\\p{L}*|креш\\p{L}*|краш\\p{L}*|падени\\p{L}*|отзыв\\p{L}*|задач\\p{L}*|тикет\\p{L}*|спринт\\p{L}*|билд\\p{L}*|сборк\\p{L}*|коммит\\p{L}*|встреч\\p{L}*|писем|письм\\p{L}*|диск\\p{L}*|a\\s?/\\s?b|аб[- ]?тест');
// SQL typed into the request: from a SELECT/WITH word to the end (or inside backticks).
function typedSql(text){
 const fenced=/```(?:sql)?\s*([\s\S]+?)```|`([^`]+)`/i.exec(text);
 const candidate=fenced?(fenced[1]||fenced[2]):text.slice(Math.max(0,text.search(/(?:^|[\s:«"])(?:select|with)\s/i)));
 const t=String(candidate||'').replace(/^[\s:«"]+/,'').replace(/[»"]\s*$/,'').trim();
 return /^(?:select|with)\s[\s\S]*\bfrom\b|^select\s+[\s\S]+$/i.test(t)&&/^(?:select|with)\s/i.test(t)?t:'';
}
// 'schema' | 'refresh' | 'typed' | 'query' | 'data' (a question in words without database words) | null
function kind(text){
 const t=String(text||'').trim();
 if(!t)return null;
 const typed=typedSql(t);
 if(typed&&/(?:выполни|запусти|прогони|посчитай|проверь|оцени|покажи|run|сколько стоит)/iu.test(t.replace(typed,'')))return 'typed';
 if(AVOID.test(t))return null;
 if(REFRESH.test(t))return 'refresh';
 if(SCHEMA.test(t))return 'schema';
 if(EXPLICIT.test(t))return WRITE.test(t)?'write':'query';
 if(DATA_Q.test(t)&&DATA_NOUN.test(t)&&!ELSEWHERE.test(t))return 'data';
 return null;
}

// --- Helpers ---------------------------------------------------------------------------------------------------------
const ask=(spec,resume)=>require('../../input-required.cjs').ask(spec,resume);
const num=(n,digits=1)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:digits});
function bytes(n){if(n>=GB)return num(n/GB,n<10*GB?2:1)+' ГБ';if(n>=1024**2)return num(n/1024**2)+' МБ';if(n>=1024)return num(n/1024)+' КБ';return num(n,0)+' Б';}
function rowsText(n){if(n>=1e9)return num(n/1e9)+' млрд';if(n>=1e6)return num(n/1e6)+' млн';if(n>=1e4)return num(n/1e3,0)+' тыс.';return num(n,0);}
function estimateText(e,dialect){
 if(!e||e.kind==='unknown')return 'оценку стоимости получить не удалось'+(e?.note?' ('+String(e.note).slice(0,120)+')':'');
 if(e.kind==='bytes')return 'прочитает ≈ '+bytes(e.value)+(e.limit?' (лимит '+bytes(e.limit)+')':'');
 if(e.kind==='rows')return (dialect==='postgres'?'планировщик ожидает ≈ ':'прочитает ≈ ')+rowsText(e.value)+' '+kit.plural(Math.round(e.value),['строку','строки','строк']);
 return '';
}
function cheap(s,e){
 if(s.settings.sqlAutoRun!=='true'||!e)return false;
 if(e.kind==='bytes')return e.value<=Number(s.settings.sqlAutoRunGb||1)*GB&&(!e.limit||e.value<=e.limit);
 if(e.kind==='rows')return e.value<=Number(s.settings.sqlAutoRunRows||1e6);
 return false;
}
const maxRows=s=>Math.min(5000,Math.max(10,Number(s.settings.sqlMaxRows)||500));
const publicConn=c=>({id:c.id,name:c.name,kind:c.kind,dialect:c.dialect,label:c.label||C.label(c)});

// The schema of a connection, from the cache or read now.
async function schemaOf(s,conn,{refresh=false}={}){
 if(!refresh){const hit=S.cached(s.dataRoot,conn.id,{now:deps.now()});if(hit)return hit;}
 s.requestProgress?.report('Читаю схему базы «'+conn.name+'»');
 const fresh=await sources.engine(s,conn).schema();
 return S.store(s.dataRoot,conn.id,{database:fresh.database||'',tables:(fresh.tables||[]).slice(0,2000),more:fresh.more||0},{now:deps.now()});
}

// Which connection: the only one, the one the text names (by name or kind), or a question with the choices.
function pick(conns,text,resume){
 if(conns.length===1)return conns[0];
 const t=String(text||'').toLowerCase();
 const byName=conns.filter(c=>c.name.length>=2&&t.includes(c.name.toLowerCase()));
 if(byName.length===1)return byName[0];
 const kinds={clickhouse:/clickhouse|кликхаус/i,postgres:/postgres|постгре/i,bigquery:/bigquery|бигквери|биг квери/i};
 const byKind=conns.filter(c=>kinds[c.kind]?.test(t)||kinds[c.dialect]?.test(t));
 if(byKind.length===1)return byKind[0];
 return ask({text:'В какой базе посмотреть?',label:'База',options:conns.slice(0,6).map(c=>c.label||c.name)},answer=>resume(String(answer||'').trim()));
}

// --- The model writes SQL ----------------------------------------------------------------------------------------
const SCHEMA_JSON={type:'object',properties:{sql:{type:'string'},explanation:{type:'string'},assumptions:{type:'array',items:{type:'string'},maxItems:6}},required:['sql','explanation','assumptions']};
const NAMES={clickhouse:'ClickHouse',postgres:'PostgreSQL',bigquery:'BigQuery (GoogleSQL)',mysql:'MySQL'};
async function draft(s,question,conn,schema,limit){
 const today=new Date(deps.now()).toISOString().slice(0,10);
 const system='Ты пишешь ровно один запрос '+NAMES[conn.dialect]+' только для чтения (SELECT или WITH … SELECT) по вопросу пользователя. Используй только таблицы и столбцы из схемы ниже, их имена пиши точно как в схеме. '+
  'Если в схеме нет нужных данных, верни пустой sql и объясни в explanation, чего не хватает. Не больше '+limit+' строк. Сегодня '+today+' (UTC). '+
  'Для ответа «по дням/неделям» первым столбцом верни дату, потом числа; для разбивки — сначала категорию, потом число, по убыванию. Давай столбцам понятные имена. '+
  'explanation — одно-два предложения по-русски, что считает запрос. assumptions — допущения: как понял период, какая таблица и какой столбец что значат.';
 let feedback='';
 for(let attempt=0;attempt<2;attempt++){
  const r=await kit.modelJSON(s,{system,user:{question:question+feedback,dialect:conn.dialect,schema:S.compact(schema,question)},schema:SCHEMA_JSON,predict:900,temperature:attempt?0.1:0.2});
  if(!r)return null;
  const out={sql:String(r.sql||'').trim(),explanation:String(r.explanation||'').slice(0,400),assumptions:(Array.isArray(r.assumptions)?r.assumptions:[]).map(a=>String(a).slice(0,200)).filter(Boolean).slice(0,6)};
  if(!out.sql)return {...out,missing:true};
  try{
   const checked=V.check(out.sql,{dialect:conn.dialect,maxRows:limit});
   const missing=S.unknown(schema,V.tables(checked.sql,conn.dialect));
   if(missing.length){if(attempt)return {...out,rejected:'В схеме нет таблиц: '+missing.join(', ')+'.'};feedback='\nПрошлый запрос обращался к таблицам, которых нет в схеме: '+missing.join(', ')+'. Используй только таблицы схемы.';continue;}
   return {...out,checked};
  }catch(e){
   if(!e.rejected)throw e;
   if(attempt)return {...out,rejected:e.message};
   feedback='\nПрошлый вариант отклонён проверкой: '+e.message+' Напиши один SELECT без изменений данных.';
  }
 }
 return null;
}

// --- Running ---------------------------------------------------------------------------------------------------------
async function execute(s,conn,sql){
 const limit=maxRows(s);
 const r=await sources.engine(s,conn).run(sql,{maxRows:limit});
 const columns=(r.columns||[]).map(c=>({name:String(c.name),type:String(c.type||'')}));
 const rows=(r.rows||[]).slice(0,limit);
 const shape=chart.detect(columns,rows);
 return {columns,rows:rows.slice(0,200),total:rows.length,kept:Math.min(rows.length,200),truncated:!!r.truncated||rows.length>=limit,elapsedMs:Math.round(Number(r.elapsedMs)||0),bytesRead:Number(r.bytesRead)||0,chart:chart.points(shape,rows)};
}
function resultText(card){
 const r=card.result;
 if(!r.total)return 'Запрос выполнен: строк нет.';
 if(r.chart?.type==='number')return 'Ответ: '+num(r.chart.value,2)+' ('+r.columns[r.chart.column].name+').';
 return 'Готово: '+r.total+(r.truncated?'+':'')+' '+kit.plural(r.total,['строка','строки','строк'])+' за '+num(r.elapsedMs/1000,2)+' с.';
}
// Notification center: one stable id per run.
const notices=new Map();
function publish(s,id,item){
 const notice={id:'sql:'+id,title:BY,...item};notices.set(notice.id,notice);
 while(notices.size>10)notices.delete(notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
async function runCard(s,card,conn){
 publish(s,card.id,{text:'Выполняю запрос в «'+conn.name+'»',busy:true,kind:'info',version:'running:'+card.id});
 try{
  const result=await execute(s,conn,card.sql);
  const next={...card,state:'done',result,error:'',ranAt:deps.now()};
  publish(s,card.id,{text:'Запрос выполнен: '+result.total+' '+kit.plural(result.total,['строка','строки','строк']),busy:false,kind:'success',version:'done:'+card.id+':'+next.ranAt});
  return next;
 }catch(e){
  publish(s,card.id,{text:'Запрос не выполнен: '+e.message,busy:false,kind:'attention',version:'error:'+card.id+':'+deps.now()});
  return {...card,state:'error',error:e.message};
 }
}

// --- Turns -----------------------------------------------------------------------------------------------------------
async function schemaTurn(s,text,conn,{refresh=false}={}){
 let schema;
 try{schema=await schemaOf(s,conn,{refresh});}catch(e){return kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message});}
 const table=S.find(schema,text);
 const base={connection:publicConn(conn),database:schema.database||'',at:schema.at};
 if(table)return kit.reply(s,text,{by:BY,text:'Таблица '+table.name+': '+table.columns.length+' '+kit.plural(table.columns.length,['столбец','столбца','столбцов'])+(table.comment?' — '+table.comment:'')+'.',
  data:{sqlSchema:{...base,table:{name:table.name,comment:table.comment||'',rows:table.rows??null,columns:table.columns.slice(0,300)}}}});
 const n=schema.tables.length;
 return kit.reply(s,text,{by:BY,text:(refresh?'Схема обновлена. ':'')+'В «'+conn.name+'» '+n+' '+kit.plural(n,['таблица','таблицы','таблиц'])+'. Нажмите на таблицу, чтобы увидеть столбцы.',
  data:{sqlSchema:{...base,total:n,tables:schema.tables.slice(0,80).map(t=>({name:t.name,comment:t.comment||'',rows:t.rows??null,columns:t.columns.length,names:t.columns.slice(0,8).map(c=>c.name)}))}}});
}

async function queryTurn(s,text,conn,typed=''){
 const limit=maxRows(s);
 let schema=null;
 try{schema=await schemaOf(s,conn);}catch(e){if(!typed)return kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message});}
 let d;
 if(typed){
  try{d={sql:typed,explanation:'Запрос из сообщения.',assumptions:[],checked:V.check(typed,{dialect:conn.dialect,maxRows:limit})};}
  catch(e){if(!e.rejected)throw e;d={sql:typed,explanation:'',assumptions:[],rejected:e.message};}
 }else{
  if(!s.settings.model)return kit.reply(s,text,{by:BY,question:true,text:'Чтобы написать SQL по вопросу, выберите локальную модель в настройках. Готовый запрос («выполни SELECT …») проверю и выполню и без неё.'});
  s.requestProgress?.report('Пишу SQL по схеме «'+conn.name+'»');
  d=await draft(s,text,conn,schema,limit);
  if(!d)return kit.reply(s,text,{by:BY,error:true,text:'Модель не написала запрос. Переформулируйте вопрос: какие данные и за какой период.'});
  if(d.missing)return kit.reply(s,text,{by:BY,question:true,text:(d.explanation||'В схеме нет данных для этого вопроса.')+' Уточните, в какой таблице это искать.'});
 }
 const id=require('node:crypto').randomUUID();
 const card={id,question:String(text).slice(0,500),connection:publicConn(conn),sql:d.checked?.sql||d.sql,explanation:d.explanation,assumptions:d.assumptions,typed:!!typed,at:deps.now()};
 if(d.rejected)return kit.reply(s,text,{by:BY,error:true,text:'Запрос не прошёл проверку: '+d.rejected,data:{sqlQuery:{...card,state:'rejected',error:d.rejected}}});
 card.limit=d.checked.limit;card.limited=d.checked.limited;
 s.requestProgress?.report('Оцениваю стоимость запроса');
 let estimate;try{estimate=await sources.engine(s,conn).estimate(card.sql);}catch(e){estimate={kind:'unknown',note:e.message};}
 card.estimate=estimate;
 if(estimate.kind==='bytes'&&estimate.limit&&estimate.value>estimate.limit){
  return kit.reply(s,text,{by:BY,error:true,text:'Запрос прочитал бы ≈ '+bytes(estimate.value)+' — больше лимита '+bytes(estimate.limit)+'. Сузьте период или увеличьте лимит в настройках.',data:{sqlQuery:{...card,state:'blocked'}}});
 }
 if(cheap(s,estimate)){
  s.requestProgress?.report('Выполняю запрос');
  const done=await runCard(s,{...card,autoRun:true},conn);
  if(done.state==='error')return kit.reply(s,text,{by:BY,error:true,text:done.error,data:{sqlQuery:done}});
  return kit.reply(s,text,{by:BY,text:resultText(done),data:{sqlQuery:done}});
 }
 return kit.reply(s,text,{by:BY,text:'Запрос к «'+conn.name+'» готов: '+estimateText(estimate,conn.dialect)+'. Проверьте SQL и нажмите «Выполнить».',data:{sqlQuery:{...card,state:'pending'}}});
}

async function turn(s,command,{connection=''}={}){
 const text=String(command||'');
 const k=kind(text);
 if(!k||!kit.installed(s,ID))return null;
 if(k==='write')return kit.reply(s,text,{by:BY,text:'«SQL по словам» только читает данные: изменять базу Петя не будет. Спросите, что посчитать или показать, — напишу SELECT.'});
 const conns=await sources.all(s);
 if(!conns.length){
  if(k==='data')return null;
  return kit.reply(s,text,{by:BY,question:true,text:'Подключите базу в настройках «SQL по словам»: ClickHouse, PostgreSQL или BigQuery. Лучше пользователем только с правами на чтение.'});
 }
 // A data question in words is taken only when it is about this database's data: the schema of a connection is cached
 // and one of its tables or columns is close to the question, or there is a single connection.
 if(k==='data'&&conns.length>1&&!conns.some(c=>{const hit=S.cached(s.dataRoot,c.id,{now:deps.now()});return hit&&hit.tables.some(t=>S.score(t,S.words(text))>=3);}))return null;
 const conn=connection?conns.find(c=>(c.label||c.name)===connection||c.name===connection):pick(conns,text,answer=>turn(s,text,{connection:answer}));
 if(!conn)return kit.reply(s,text,{by:BY,question:true,text:'Такой базы нет в настройках «SQL по словам».'});
 if(k==='refresh'){S.forget(s.dataRoot,conn.id);return schemaTurn(s,text,conn,{refresh:true});}
 if(k==='schema')return schemaTurn(s,text,conn);
 return queryTurn(s,text,conn,k==='typed'?typedSql(text):'');
}

// --- Card and settings calls -----------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.sqlQuery?.id===id)return {topic,message:m,card:m.extensionData.sqlQuery};
 return null;
}
function setup(s){
 const status=()=>({connections:C.publicList(s.settings),hasKey:!!s.settings.sqlBigQueryCredential,sharedKey:!s.settings.sqlBigQueryCredential&&!!s.settings.crashlyticsCredential,
  account:(()=>{try{return C.bigQueryKey(s.settings)?require('../../google-service-account.cjs').parse(C.bigQueryKey(s.settings)).client_email:'';}catch{return '';}})(),
  autoRun:s.settings.sqlAutoRun==='true',autoRunGb:Number(s.settings.sqlAutoRunGb||1),autoRunRows:Number(s.settings.sqlAutoRunRows||1e6),maxRows:maxRows(s)});
 return {ipc:{
  // «Выполнить» / «Обновить» under a card: the SQL is taken from the stored message (never from the renderer),
  // checked again for the connection's dialect, then run; the message keeps the result.
  async run(id){
   const hit=findCard(s,String(id||''));
   if(!hit)throw Error('Карточка запроса не найдена. Повторите вопрос в чате.');
   const {card}=hit;
   if(['rejected','blocked'].includes(card.state))throw Error('Этот запрос не прошёл проверку и не может быть выполнен.');
   const conn=(await sources.all(s)).find(c=>c.id===card.connection.id);
   if(!conn)throw Error('Подключение «'+card.connection.name+'» удалено или отключено.');
   const checked=V.check(card.sql,{dialect:conn.dialect,maxRows:maxRows(s)});
   const next=await runCard(s,{...card,sql:checked.sql},conn);
   hit.message.extensionData={...hit.message.extensionData,sqlQuery:next};
   s.dialogue.persist();
   return next;
  },
  status,
  async saveConnections(list){
   const saved=C.fromForm(list,C.secrets(s.settings));
   const before=new Set(C.load(s.settings).map(c=>c.id));
   s.saveSettings(saved,true);
   // A changed or removed connection forgets its cached schema.
   for(const id of before)S.forget(s.dataRoot,id);
   return status();
  },
  saveOptions(o={}){
   const gb=Number(String(o.autoRunGb??1).replace(',','.')),rows=Number(o.autoRunRows??1e6),max=Number(o.maxRows??500);
   if(!Number.isFinite(gb)||gb<0.001||gb>100)throw Error('Порог для BigQuery — от 0,001 до 100 ГБ.');
   if(!Number.isFinite(rows)||rows<1||rows>1e10)throw Error('Порог в строках — от 1 до 10 млрд.');
   if(!Number.isInteger(max)||max<10||max>5000)throw Error('Строк в ответе — от 10 до 5000.');
   s.saveSettings({sqlAutoRun:o.autoRun?'true':'false',sqlAutoRunGb:String(gb),sqlAutoRunRows:String(rows),sqlMaxRows:String(max)},true);
   return status();
  },
  saveKey(text){
   if(typeof text!=='string'||text.length>20000)throw Error('Выберите JSON ключ сервисного аккаунта Google.');
   const key=require('../../google-service-account.cjs').parse(text);
   const value=JSON.stringify(key);
   if(value.length>2000)throw Error('Ключ не помещается в хранилище настроек. Создайте ключ RSA 2048.');
   s.saveSettings({sqlBigQueryCredential:value},true);return status();
  },
  clearKey(){s.saveSettings({clear_sqlBigQueryCredential:true},true);return status();},
  // «Проверить»: reads the schema now (and caches it).
  async test(id){
   const conn=(await sources.all(s)).find(c=>c.id===id);
   if(!conn)throw Error('Сначала сохраните подключение.');
   S.forget(s.dataRoot,conn.id);
   const schema=await schemaOf(s,conn,{refresh:true});
   return {tables:schema.tables.length,columns:schema.tables.reduce((n,t)=>n+t.columns.length,0),database:schema.database||''};
  },
  async schema(id){const conn=(await sources.all(s)).find(c=>c.id===id);if(!conn)throw Error('Подключение не найдено.');return schemaOf(s,conn);}
 }};
}
function validate(next){
 for(const key of ['sqlConnections','sqlCredential']){const v=next[key];if(typeof v==='string'&&v)try{JSON.parse(v);}catch{next[key]=key==='sqlConnections'?'[]':'';}}
 if(!['true','false'].includes(next.sqlAutoRun))next.sqlAutoRun='false';
}
module.exports={name:'sqlWords',defaults:{['extension_'+ID]:'false',sqlConnections:'[]',sqlCredential:'',sqlBigQueryCredential:'',sqlAutoRun:'false',sqlAutoRunGb:'1',sqlAutoRunRows:'1000000',sqlMaxRows:'500'},
 secrets:['sqlCredential','sqlBigQueryCredential'],validate,setup,turn,kind,typedSql,draft,execute,estimateText,deps};
