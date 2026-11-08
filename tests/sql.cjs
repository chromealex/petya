// «SQL по словам»: routing and near-misses, not added / not connected, a fake ClickHouse HTTP server (readonly=1, limits,
// schema, EXPLAIN ESTIMATE, errors), a fake PostgreSQL server speaking the wire protocol (SCRAM-SHA-256, read-only
// transaction, extended protocol), BigQuery REST stubs (token, schema, dry run, run, bytes limit), the model writing
// SQL with a retry after the validator or an unknown table, auto-run under the threshold, the card's «Выполнить»,
// typed SQL without a model, charts by result shape, connection settings and secrets.
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/sql/feature.cjs');
const C=require('../src/extensions/sql/connections.cjs');
const S=require('../src/extensions/sql/schema.cjs');
const chart=require('../src/extensions/sql/chart.cjs');
const sources=require('../src/extensions/sql/sources.cjs');
const pg=require('../src/extensions/sql/postgres.cjs');
const offer=require('../src/extensions/sql/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

// The request function as main.cjs has it: JSON answers, HTTP errors with status and body detail.
async function request(url,options={}){
 const {timeoutMs,...rest}=options;
 const r=await fetch(url,{...rest,redirect:'error',signal:AbortSignal.timeout(timeoutMs||10000)});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.json();
}

// --- Fake ClickHouse ----------------------------------------------------------------------------------------------------
function clickhouse(){
 const seen=[];
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const u=new URL(req.url,'http://x');seen.push({method:req.method,params:Object.fromEntries(u.searchParams),order:[...u.searchParams.keys()],body,user:req.headers['x-clickhouse-user'],key:req.headers['x-clickhouse-key']});
   const json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
   const fail=(code,text)=>{res.statusCode=code===516?401:500;res.end('Code: '+code+'. DB::Exception: '+text+'. (version 24.8.1.1)');};
   if(req.headers['x-clickhouse-key']!=='pa55')return fail(516,'default: Authentication failed: password is incorrect');
   if(u.searchParams.get('readonly')!=='1')return fail(164,'Cannot execute query in readonly mode');
   if(server.readonlyProfile&&u.searchParams.has('max_result_rows'))return fail(164,"Cannot modify 'max_result_rows' setting in readonly mode");
   if(/FROM system\.columns/.test(body)){assert.equal(u.searchParams.get('param_db'),'game');return json({meta:[{name:'table',type:'String'},{name:'name',type:'String'},{name:'type',type:'String'},{name:'comment',type:'String'}],
    data:[['events','event_date','Date','день события'],['events','user_id','UInt64',''],['events','level','UInt16','достигнутый уровень'],['events','event','LowCardinality(String)','level_up, purchase…'],
     ['payments','user_id','UInt64',''],['payments','country','String','ISO-код страны'],['payments','amount_usd','Decimal(18, 2)','сумма платежа в долларах']],rows:7});}
   if(/FROM system\.tables/.test(body))return json({meta:[{name:'name',type:'String'},{name:'comment',type:'String'},{name:'engine',type:'String'},{name:'total_rows',type:'Nullable(UInt64)'}],data:[['events','События клиента','MergeTree','125000000'],['payments','Платежи','MergeTree','2400000']],rows:2});
   if(/^EXPLAIN ESTIMATE/.test(body))return json({meta:[{name:'database',type:'String'},{name:'table',type:'String'},{name:'parts',type:'UInt64'},{name:'rows',type:'UInt64'},{name:'marks',type:'UInt64'}],data:[['game','events','12','2300000','290']],rows:1});
   if(/missing_table/.test(body))return fail(60,"Table game.missing_table doesn't exist");
   if(/country/.test(body))return json({meta:[{name:'country',type:'String'},{name:'revenue',type:'Decimal(18, 2)'}],data:[['US','1520.5'],['DE','880'],['BR','410.25']],rows:3,statistics:{elapsed:0.012,rows_read:2400000,bytes_read:52428800}});
   return json({meta:[{name:'players',type:'UInt64'}],data:[['4182']],rows:1,statistics:{elapsed:0.2,rows_read:2300000,bytes_read:91000000}});
  });
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,seen,url:'http://127.0.0.1:'+server.address().port})));
}

// --- Fake PostgreSQL (wire protocol v3, SCRAM-SHA-256) -------------------------------------------------------------
function pgServer({user='reader',password='s3cret'}={}){
 const log=[];
 const msg=(type,...parts)=>{const body=Buffer.concat(parts.map(p=>Buffer.isBuffer(p)?p:Buffer.from(p)));const len=Buffer.alloc(4);len.writeInt32BE(body.length+4);return Buffer.concat([Buffer.from(type),len,body]);};
 const i32=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b;},i16=n=>{const b=Buffer.alloc(2);b.writeInt16BE(n);return b;},z=s=>Buffer.from(s+'\0');
 const error=(code,text)=>msg('E',Buffer.concat([z('SERROR'),z('C'+code),z('M'+text),Buffer.from([0])]));
 const rowDesc=cols=>msg('T',i16(cols.length),...cols.flatMap(([name,oid])=>[z(name),i32(0),i16(0),i32(oid),i16(-1),i32(-1),i16(0)]));
 const dataRow=row=>msg('D',i16(row.length),...row.flatMap(v=>v===null?[i32(-1)]:[i32(Buffer.byteLength(String(v))),Buffer.from(String(v))]));
 const server=net.createServer(sock=>{
  let buf=Buffer.alloc(0),started=false,scram=null,sql='',failed=false,readOnly=false;
  sock.on('data',d=>{
   buf=Buffer.concat([buf,d]);
   for(;;){
    if(!started){
     if(buf.length<8)return;const len=buf.readInt32BE(0);if(buf.length<len)return;
     const code=buf.readInt32BE(4),body=buf.subarray(8,len);buf=buf.subarray(len);
     if(code===80877103){sock.write('N');continue;}
     const parts=body.toString().split('\0');const params={};for(let i=0;i+1<parts.length;i+=2)if(parts[i])params[parts[i]]=parts[i+1];
     log.push({startup:params});started=true;
     if(params.user!==user){sock.write(error('28P01','password authentication failed for user "'+params.user+'"'));sock.end();return;}
     sock.write(msg('R',i32(10),z('SCRAM-SHA-256'),Buffer.from([0])));continue;
    }
    if(buf.length<5)return;const len=buf.readInt32BE(1);if(buf.length<1+len)return;
    const type=String.fromCharCode(buf[0]),body=buf.subarray(5,1+len);buf=buf.subarray(1+len);
    if(type==='p'&&!scram){
     const mech=body.toString('utf8',0,body.indexOf(0));const n=body.readInt32BE(mech.length+1);const first=body.toString('utf8',mech.length+5,mech.length+5+n);
     const bare=first.replace(/^n,,/,''),nonce=/r=([^,]+)/.exec(bare)[1]+'srv';const salt=crypto.randomBytes(16);
     const serverFirst='r='+nonce+',s='+salt.toString('base64')+',i=4096';scram={bare,serverFirst,salt};
     sock.write(msg('R',i32(11),serverFirst));continue;
    }
    if(type==='p'){
     const final=body.toString(),noProof=final.replace(/,p=[^,]+$/,''),proof=Buffer.from(/p=([^,]+)$/.exec(final)[1],'base64');
     const salted=crypto.pbkdf2Sync(password,scram.salt,4096,32,'sha256'),hmac=(k,t)=>crypto.createHmac('sha256',k).update(t).digest();
     const clientKey=hmac(salted,'Client Key'),stored=crypto.createHash('sha256').update(clientKey).digest(),auth=scram.bare+','+scram.serverFirst+','+noProof;
     const recovered=Buffer.from(proof.map((b,i)=>b^hmac(stored,auth)[i]));
     if(!crypto.createHash('sha256').update(recovered).digest().equals(stored)){sock.write(error('28P01','password authentication failed'));sock.end();return;}
     sock.write(Buffer.concat([msg('R',i32(12),'v='+hmac(hmac(salted,'Server Key'),auth).toString('base64')),msg('R',i32(0)),msg('S',z('server_version'),z('16.4')),msg('K',i32(1),i32(2)),msg('Z','I')]));continue;
    }
    if(type==='Q'){const q=body.toString('utf8',0,body.length-1);log.push({simple:q});if(/BEGIN TRANSACTION READ ONLY/.test(q))readOnly=true;sock.write(Buffer.concat([...q.split(';').map(()=>msg('C',z('OK'))),msg('Z',readOnly?'T':'I')]));continue;}
    if(type==='P'){const name=body.indexOf(0);sql=body.toString('utf8',name+1,body.indexOf(0,name+1));log.push({parse:sql,readOnly});failed=false;
     if(/;\s*\S/.test(sql)){failed=true;sock.write(error('42601','cannot insert multiple commands into a prepared statement'));}else sock.write(msg('1'));continue;}
    if(type==='B'){if(!failed)sock.write(msg('2'));continue;}
    if(type==='D')continue;
    if(type==='E'){
     if(failed)continue;
     const max=body.readInt32BE(body.indexOf(0)+1);
     if(/^EXPLAIN/.test(sql)){sock.write(Buffer.concat([rowDesc([['QUERY PLAN',114]]),dataRow([JSON.stringify([{Plan:{'Node Type':'Aggregate','Total Cost':1834.5,'Plan Rows':48000}}])]),msg('C',z('EXPLAIN'))]));continue;}
     if(/information_schema\.columns/.test(sql)){const rows=[['public','players','id','bigint',null,'Игроки',12000],['public','players','country','text','страна',null,12000],['public','players','created_at','timestamp with time zone',null,null,12000],['stats','daily','day','date',null,'Сводка по дням',90],['stats','daily','dau','integer',null,null,90]];
      sock.write(Buffer.concat([rowDesc([['table_schema',19],['table_name',19],['column_name',19],['data_type',25],['column_comment',25],['table_comment',25],['row_estimate',20]]),...rows.map(dataRow),msg('C',z('SELECT 5'))]));continue;}
     if(/no_such/.test(sql)){sock.write(error('42P01','relation "no_such" does not exist'));failed=true;continue;}
     const rows=[['2026-11-02',1200],['2026-11-03',1350],['2026-11-04',1290],['2026-11-05',1410]];
     const out=rows.slice(0,max);
     sock.write(Buffer.concat([rowDesc([['day',1082],['dau',23]]),...out.map(dataRow),out.length<rows.length?msg('s'):msg('C',z('SELECT '+out.length))]));continue;
    }
    if(type==='S'){sock.write(msg('Z',readOnly?'T':'I'));continue;}
    if(type==='X'){sock.end();return;}
   }
  });
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,log,port:server.address().port})));
}

// --- BigQuery stubs ----------------------------------------------------------------------------------------------------
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const saKey=JSON.stringify({type:'service_account',client_email:'reader@game-analytics.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),project_id:'game-analytics'});

(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sql-'));
 const ch=await clickhouse(),pgs=await pgServer();
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];const bq=[];
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},dataRoot:tmp,requestProgress:{report(){}},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  saveSettings(values){for(const [k,v] of Object.entries(values)){if(k.startsWith('clear_'))s.settings[k.slice(6)]='';else s.settings[k]=v;}},
  async request(url,options={}){
   if(url.startsWith('http://127.0.0.1:11434')){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages.at(-1).content.slice(0,200));return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}
   if(url==='https://oauth2.googleapis.com/token')return {access_token:'bq-token',expires_in:3600};
   if(url.startsWith('https://bigquery.googleapis.com/')){
    assert.equal(options.headers.Authorization,'Bearer bq-token');
    const body=options.body?JSON.parse(options.body):null;bq.push({url,body});
    if(/\/datasets\/analytics_1\/tables\?/.test(url))return {tables:[{tableReference:{tableId:'events_20261101'}},{tableReference:{tableId:'events_20261108'}},{tableReference:{tableId:'purchases'}}]};
    if(/\/tables\/events_20261108$/.test(url))return {description:'Firebase Analytics',numRows:'5000000',schema:{fields:[{name:'event_date',type:'STRING'},{name:'event_name',type:'STRING'},{name:'user_pseudo_id',type:'STRING'},{name:'geo',type:'RECORD',fields:[{name:'country',type:'STRING'}]}]}};
    if(/\/tables\/purchases$/.test(url))return {numRows:'1200',schema:{fields:[{name:'user_id',type:'STRING'},{name:'country',type:'STRING',description:'страна'},{name:'usd',type:'FLOAT'}]}};
    if(/\/queries$/.test(url)&&body.dryRun)return {totalBytesProcessed:String(/huge/.test(body.query)?9*1024**3:/medium/.test(body.query)?Math.round(1.5*1024**3):300*1024**2),jobComplete:true};
    if(/\/queries$/.test(url))return {jobComplete:false,jobReference:{jobId:'job_1',location:'US'}};
    if(/\/queries\/job_1/.test(url))return {jobComplete:true,totalBytesProcessed:'314572800',totalRows:'3',schema:{fields:[{name:'country',type:'STRING'},{name:'payers',type:'INTEGER'}]},rows:[{f:[{v:'US'},{v:'310'}]},{f:[{v:'DE'},{v:'120'}]},{f:[{v:'JP'},{v:'95'}]}]};
   }
   return request(url,options);
  }};
 const last=()=>topic.messages.at(-1);

 // --- Routing --------------------------------------------------------------------------------------------------------
 const kinds={'Сколько игроков дошли до 10 уровня за неделю':'data','топ стран по платежам':'data','покажи схему таблицы events':'schema','какие таблицы есть в базе':'schema',
  'SQL-запрос: сколько игроков в базе данных':'query','топ стран по платежам в ClickHouse':'query','выполни SELECT count(*) FROM events':'typed','обнови схему базы':'refresh',
  'посчитай в бигквери платящих по странам':'query'};
 for(const [text,k] of Object.entries(kinds))assert.equal(app.kind(text),k,text);
 for(const text of ['напиши SQL-миграцию для таблицы players','что такое JOIN','база знаний по проекту','найди в базе знаний про лиги','создай таблицу users в базе','оптимизируй этот SQL запрос',
  'сколько новых игроков вчера','DAU за неделю','сколько крэшей за неделю','сколько задач в спринте','найди в таблице Google Sheets выручку','как работает индекс в PostgreSQL','привет','сколько будет 2+2'])
  assert.equal(app.kind(text),null,'near-miss: '+text);
 assert.equal(app.typedSql('выполни `SELECT 1 FROM t`'),'SELECT 1 FROM t');
 assert.equal(app.typedSql('выполни select count(*) from events where level >= 10'),'select count(*) from events where level >= 10');

 // Not added → nothing here (the offer handles it); added without connections → where to connect, but a data question in
 // words is left to others.
 assert.equal(await app.turn(s,'покажи схему таблицы events'),null);
 s.settings.extension_sql='true';
 const noConn=await app.turn(s,'покажи схему таблицы events');
 assert.equal(noConn.question,true);assert.match(noConn.text,/Подключите базу в настройках «SQL по словам»/);
 assert.equal(await app.turn(s,'Сколько игроков дошли до 10 уровня за неделю'),null,'not connected: a question in words is not taken');
 assert.equal(offer.ready(s.settings),false);

 // --- Connections from the settings form ----------------------------------------------------------------------------
 assert.throws(()=>C.fromForm([{kind:'postgres',name:'Prod',host:'db.example.com',database:'game',user:'r',ssl:'disable'}],{}),/только к localhost/);
 assert.throws(()=>C.fromForm([{kind:'clickhouse',url:'ftp://x'}],{}),/http:\/\/ или https:\/\//);
 assert.throws(()=>C.fromForm([{kind:'clickhouse',url:'https://u:p@x'}],{}),/логин и пароль/);
 assert.throws(()=>C.fromForm([{kind:'bigquery',project:'Bad Project',dataset:'x'}],{}),/ID проекта/);
 const ipc=app.setup(s).ipc;
 let state=await ipc.saveConnections([{kind:'clickhouse',name:'Аналитика',url:ch.url,database:'game',user:'reader',password:'pa55'}]);
 assert.equal(state.connections[0].hasPassword,true);
 assert.ok(!JSON.stringify(state).includes('pa55'),'the password never goes back to the form');
 assert.ok(!s.settings.sqlConnections.includes('pa55'),'the password is not in the plain setting');
 const chId=state.connections[0].id;
 // Saving again with an empty password keeps it.
 state=await ipc.saveConnections([{...state.connections[0],password:''}]);
 assert.equal(JSON.parse(s.settings.sqlCredential)[chId],'pa55');
 assert.equal(offer.ready(s.settings),true);

 // --- ClickHouse: schema (cached), model SQL, estimate, «Выполнить» -------------------------------------------------
 const schemaReply=await app.turn(s,'какие таблицы есть в базе');
 const sc=schemaReply.extensionData.sqlSchema;
 assert.equal(sc.total,2);assert.deepEqual(sc.tables.map(t=>[t.name,t.rows,t.columns]),[['events',125000000,4],['payments',2400000,3]]);
 const req0=ch.seen.find(x=>/system\.columns/.test(x.body));
 assert.equal(req0.method,'POST');assert.equal(req0.params.readonly,'1');assert.equal(req0.order.at(-1),'readonly','readonly=1 is the last setting');
 assert.equal(req0.user,'reader');assert.equal(req0.key,'pa55');assert.match(req0.body,/FORMAT JSONCompact$/);
 const seenBefore=ch.seen.length;
 const table=await app.turn(s,'покажи схему таблицы events');
 assert.equal(ch.seen.length,seenBefore,'the schema comes from the cache');
 assert.deepEqual(table.extensionData.sqlSchema.table.columns.map(c=>c.name),['event_date','user_id','level','event']);
 assert.equal(table.extensionData.sqlSchema.table.columns[2].comment,'достигнутый уровень');
 assert.ok(fs.existsSync(S.file(tmp,chId)),'the schema is cached on disk too');

 // The model first reads a table that is not in the schema, then writes a write statement, then a good query.
 model=[body=>{assert.match(body.messages[0].content,/только для чтения/);const user=JSON.parse(body.messages[1].content);assert.equal(user.dialect,'clickhouse');assert.match(user.schema,/events \(≈125000000 строк\) -- События клиента/);assert.match(user.schema,/level UInt16 -- достигнутый уровень/);
   return {sql:'SELECT count() FROM players WHERE level >= 10',explanation:'',assumptions:[]};},
  body=>{assert.match(JSON.parse(body.messages[1].content).question,/которых нет в схеме: players/);return {sql:"SELECT uniqExact(user_id) AS players FROM events WHERE event = 'level_up' AND level >= 10 AND event_date >= today() - 7",explanation:'Считает уникальных игроков, получивших 10-й уровень за 7 дней.',assumptions:['«дошли до 10 уровня» — событие level_up с level ≥ 10','неделя — последние 7 дней']};}];
 const q=await app.turn(s,'Сколько игроков дошли до 10 уровня за неделю');
 const card=q.extensionData.sqlQuery;
 assert.equal(card.state,'pending');assert.match(card.sql,/LIMIT 500$/);assert.equal(card.limited,true);
 assert.deepEqual(card.estimate,{kind:'rows',value:2300000,tables:1,of:125000000});
 assert.match(q.text,/прочитает ≈ 2,3 млн строк\. Проверьте SQL и нажмите «Выполнить»/);
 assert.equal(card.assumptions.length,2);assert.equal(last().by,'SQL по словам');
 assert.ok(!ch.seen.some(x=>/uniqExact/.test(x.body)&&!/^EXPLAIN/.test(x.body)),'nothing runs before «Выполнить»');
 const ran=await ipc.run(card.id);
 assert.equal(ran.state,'done');assert.deepEqual(ran.result.rows,[[4182]]);assert.equal(ran.result.chart.type,'number');
 const runReq=ch.seen.at(-1);assert.equal(runReq.params.max_result_rows,'500');assert.equal(runReq.params.result_overflow_mode,'break');assert.equal(runReq.params.max_execution_time,'30');
 assert.equal(last().extensionData.sqlQuery.state,'done','the message keeps the result');
 await assert.rejects(ipc.run('nope'),/не найдена/);
 // A stored card whose SQL was tampered with is checked again before it runs.
 last().extensionData.sqlQuery.sql='SELECT 1; DROP TABLE events';
 await assert.rejects(ipc.run(card.id),/несколько команд/);
 // The model refuses twice → the card shows the reason and has no run.
 // A request to change data is answered without the model: this app only reads.
 const refused=await app.turn(s,'SQL: удали тестовые события из базы данных за вчера');
 assert.match(refused.text,/только читает данные/);assert.equal(model.length,0);
 model=[{sql:'SELECT * FROM events; DROP TABLE events',explanation:'',assumptions:[]},{sql:'SELECT 1; SELECT 2',explanation:'',assumptions:[]}];
 const rejected=await app.turn(s,'SQL-запрос: события за вчера');
 assert.equal(rejected.error,true);assert.equal(rejected.extensionData.sqlQuery.state,'rejected');assert.match(rejected.text,/не прошёл проверку: В запросе несколько команд/);
 // No data in the schema → the model says so and Petya asks.
 model=[{sql:'',explanation:'В схеме нет таблицы с отзывами.',assumptions:[]}];
 const missing=await app.turn(s,'SQL-запрос: средняя оценка отзывов');
 assert.equal(missing.question,true);assert.match(missing.text,/В схеме нет таблицы с отзывами/);
 // Bars for a category result; auto-run when cheap.
 s.saveSettings({sqlAutoRun:'true',sqlAutoRunRows:'5000000'});
 model=[{sql:'SELECT country, sum(amount_usd) AS revenue FROM payments GROUP BY country ORDER BY revenue DESC',explanation:'Сумма платежей по странам.',assumptions:[]}];
 const top=await app.turn(s,'топ стран по платежам');
 assert.equal(top.extensionData.sqlQuery.state,'done');assert.equal(top.extensionData.sqlQuery.autoRun,true);
 assert.deepEqual(top.extensionData.sqlQuery.result.chart.bars.map(b=>b.label),['US','DE','BR']);assert.equal(top.extensionData.sqlQuery.result.rows[0][1],1520.5);
 assert.match(top.text,/^Готово: 3 строки/);
 s.saveSettings({sqlAutoRun:'false'});
 // Server errors are reported in words.
 const err=await app.turn(s,'выполни SELECT * FROM missing_table');
 assert.equal(err.extensionData.sqlQuery.state,'pending','typed SQL to an unknown table still waits: the server will say');
 const failedRun=await ipc.run(err.extensionData.sqlQuery.id);
 assert.equal(failedRun.state,'error');assert.match(failedRun.error,/Table game\.missing_table doesn't exist/);
 // A read-only user profile refuses limits in the URL: repeated with readonly=1 alone.
 ch.server.readonlyProfile=true;
 const typedRun=await app.turn(s,'выполни SELECT count() AS players FROM events');
 const again=await ipc.run(typedRun.extensionData.sqlQuery.id);
 assert.equal(again.state,'done');assert.equal(ch.seen.at(-1).params.max_result_rows,undefined);assert.equal(ch.seen.at(-1).params.readonly,'1');
 ch.server.readonlyProfile=false;
 // Typed SQL works without a model.
 const savedModel=s.settings.model;s.settings.model='';
 const typed=await app.turn(s,'выполни SELECT count() FROM events WHERE level >= 10');
 assert.equal(typed.extensionData.sqlQuery.typed,true);assert.equal(typed.extensionData.sqlQuery.state,'pending');
 const typedBad=await app.turn(s,'выполни SELECT * FROM url(\'http://evil\', CSV, \'a String\')');
 assert.equal(typedBad.extensionData.sqlQuery.state,'rejected');assert.match(typedBad.text,/Функция url\(\) не разрешена/);
 assert.match((await app.turn(s,'SQL-запрос: сколько игроков')).text,/выберите локальную модель/);
 s.settings.model=savedModel;
 // Wrong password.
 await ipc.saveConnections([{id:chId,kind:'clickhouse',name:'Аналитика',url:ch.url,database:'game',user:'reader',password:'wrong'}]);
 const wrong=await app.turn(s,'обнови схему базы');
 assert.equal(wrong.error,true);assert.match(wrong.text,/ClickHouse не принял логин или пароль/);

 // --- PostgreSQL over the wire protocol ----------------------------------------------------------------------------
 const conn={id:'pg1',kind:'postgres',dialect:'postgres',host:'127.0.0.1',port:pgs.port,database:'game',user:'reader',ssl:'disable'};
 const r=await pg.query(conn,'s3cret','SELECT day, dau FROM stats.daily ORDER BY day LIMIT 500',{maxRows:3});
 assert.deepEqual(r.columns,[{name:'day',type:'date'},{name:'dau',type:'int4'}]);
 assert.deepEqual(r.rows,[['2026-11-02',1200],['2026-11-03',1350],['2026-11-04',1290]]);assert.equal(r.truncated,true,'PortalSuspended → more rows exist');
 const begin=pgs.log.filter(x=>x.simple).map(x=>x.simple);
 assert.match(begin[0],/^BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'$/);assert.equal(begin[1],'ROLLBACK');
 assert.equal(pgs.log.find(x=>x.parse).readOnly,true,'the query runs inside the read-only transaction');
 assert.equal(pgs.log.find(x=>x.startup).startup.application_name,'Petya');
 await assert.rejects(pg.query(conn,'wrong','SELECT 1'),/не принял логин или пароль/);
 await assert.rejects(pg.query(conn,'s3cret','SELECT 1; DELETE FROM players'),/синтаксическая ошибка — cannot insert multiple commands/,'the extended protocol refuses two statements');
 await assert.rejects(pg.query(conn,'s3cret','SELECT * FROM no_such'),/relation "no_such" does not exist/);
 await assert.rejects(pg.query({...conn,ssl:'require'},'s3cret','SELECT 1'),/не поддерживает TLS/);
 await assert.rejects(pg.query({...conn,port:1},'s3cret','SELECT 1'),/не отвечает/);
 const pgSchema=await pg.schema(conn,'s3cret');
 assert.deepEqual(pgSchema.tables.map(t=>[t.name,t.columns.length,t.comment]),[['players',3,'Игроки'],['stats.daily',2,'Сводка по дням']]);
 assert.deepEqual(await pg.estimate(conn,'s3cret','SELECT 1'),{kind:'rows',value:48000,cost:1834.5});
 // Through the app: a line chart over days.
 const pgState=await ipc.saveConnections([...C.publicList(s.settings),{kind:'postgres',name:'Склад',host:'127.0.0.1',port:pgs.port,database:'game',user:'reader',password:'s3cret',ssl:'disable'}]);
 assert.equal(pgState.connections.length,2);
 // Two connections and no name in the request → the shared question with choices, then the exact request resumes.
 let asked=null;
 try{await app.turn(s,'SQL-запрос: DAU по дням за неделю');}catch(e){asked=e;}
 assert.ok(asked instanceof InputRequired);assert.deepEqual(asked.spec.options,['Аналитика · ClickHouse','Склад · PostgreSQL']);
 model=[body=>{assert.equal(JSON.parse(body.messages[1].content).dialect,'postgres');return {sql:'SELECT day, dau FROM stats.daily WHERE day >= current_date - 7 ORDER BY day',explanation:'DAU по дням.',assumptions:[]};}];
 const resumed=await asked.resume('Склад · PostgreSQL');
 assert.equal(resumed.extensionData.sqlQuery.connection.name,'Склад');
 assert.deepEqual(resumed.extensionData.sqlQuery.estimate,{kind:'rows',value:48000,cost:1834.5});
 const pgRun=await ipc.run(resumed.extensionData.sqlQuery.id);
 assert.equal(pgRun.result.chart.type,'line');assert.equal(pgRun.result.chart.x.length,4);
 // The connection named in the request is chosen without a question.
 model=[{sql:'SELECT country, count(*) AS n FROM players GROUP BY country',explanation:'',assumptions:[]}];
 assert.equal((await app.turn(s,'SQL-запрос в Склад: игроки по странам')).extensionData.sqlQuery.connection.name,'Склад');

 // --- BigQuery: shared Crashlytics key, sharded tables, dry run, bytes limit ---------------------------------------------
 s.settings.crashlyticsCredential=saKey;
 state=await ipc.saveConnections([{kind:'bigquery',name:'Firebase',project:'game-analytics',dataset:'analytics_1',location:'US',limitGb:'2'}]);
 assert.equal(state.sharedKey,true);assert.equal(state.account,'reader@game-analytics.iam.gserviceaccount.com');
 const bqSchema=await app.turn(s,'схема таблиц в бигквери');
 assert.deepEqual(bqSchema.extensionData.sqlSchema.tables.map(t=>t.name),['purchases','events_*'],'sharded tables are one wildcard table');
 assert.ok(!bq.some(x=>/events_20261101$/.test(x.url)),'only the newest shard is read for the schema');
 model=[body=>{assert.match(JSON.parse(body.messages[1].content).schema,/events_\* .*шардированная таблица: events_YYYYMMDD/);assert.match(JSON.parse(body.messages[1].content).schema,/geo\.country STRING/);
  return {sql:'SELECT country, COUNT(DISTINCT user_id) AS payers FROM purchases GROUP BY country ORDER BY payers DESC',explanation:'Платящие по странам.',assumptions:['платящий — есть покупка']};}];
 const bqq=await app.turn(s,'посчитай в бигквери платящих по странам');
 const dry=bq.find(x=>x.body?.dryRun);
 assert.equal(dry.body.maximumBytesBilled,String(2*1024**3));assert.deepEqual(dry.body.defaultDataset,{projectId:'game-analytics',datasetId:'analytics_1'});assert.equal(dry.body.useLegacySql,false);assert.equal(dry.body.location,'US');
 assert.deepEqual(bqq.extensionData.sqlQuery.estimate,{kind:'bytes',value:300*1024**2,limit:2*1024**3});
 assert.match(bqq.text,/прочитает ≈ 300 МБ \(лимит 2 ГБ\)/);
 const bqRun=await ipc.run(bqq.extensionData.sqlQuery.id);
 assert.deepEqual(bqRun.result.rows,[['US',310],['DE',120],['JP',95]]);assert.equal(bqRun.result.bytesRead,314572800);assert.equal(bqRun.result.chart.type,'bars');
 // Over the read limit: blocked before running.
 const huge=await app.turn(s,'выполни SELECT "huge" AS tag, country FROM purchases');
 assert.equal(huge.extensionData.sqlQuery.state,'blocked');assert.match(huge.text,/больше лимита 2 ГБ/);
 await assert.rejects(ipc.run(huge.extensionData.sqlQuery.id),/не прошёл проверку/);
 // Auto-run under the BigQuery threshold only.
 s.saveSettings({sqlAutoRun:'true',sqlAutoRunGb:'1'});
 const medium=await app.turn(s,'выполни SELECT "medium" AS tag, country FROM purchases');
 assert.equal(medium.extensionData.sqlQuery.state,'pending','1.5 GB is above the 1 GB auto-run threshold');
 const cheapRun=await app.turn(s,'выполни SELECT country, COUNT(*) AS payers FROM purchases GROUP BY country');
 assert.equal(cheapRun.extensionData.sqlQuery.state,'done');
 s.saveSettings({sqlAutoRun:'false'});
 // Own key replaces the shared one; a broken key is refused.
 assert.throws(()=>ipc.saveKey('{"type":"user"}'),/JSON ключ сервисного аккаунта/);
 assert.equal(ipc.saveKey(saKey).hasKey,true);assert.equal(s.settings.sqlBigQueryCredential.length<=2000,true);
 assert.equal(ipc.clearKey().sharedKey,true);

 // --- Charts by shape ---------------------------------------------------------------------------------------------------
 assert.equal(chart.detect([{name:'d',type:'Date'},{name:'n',type:'UInt64'}],[['2026-11-01',1],['2026-11-02',2]]).type,'line');
 assert.equal(chart.detect([{name:'d',type:'text'},{name:'c',type:'text'},{name:'n',type:'int'}],[['2026-11-01','US',1],['2026-11-01','DE',2],['2026-11-02','US',3]]).series,1,'long format: one line per category');
 assert.equal(chart.detect([{name:'c',type:'String'},{name:'n',type:'Float64'}],[['a',1],['b',2]]).type,'bars');
 assert.equal(chart.detect([{name:'n',type:'UInt64'}],[[5]]).type,'number');
 assert.equal(chart.detect([{name:'a',type:'String'},{name:'b',type:'String'}],[['x','y'],['z','w']]),null);
 assert.equal(chart.detect([{name:'c',type:'String'},{name:'n',type:'Float64'}],Array.from({length:60},(_,i)=>['c'+i,i])),null,'too many categories for bars');
 const pts=chart.points({type:'line',x:0,ys:[1]},[['2026-11-03',3],['2026-11-01',1]]);
 assert.deepEqual(pts.x,['2026-11-01','2026-11-03'],'lines are sorted by time');

 // --- Query sources of other apps (contract) --------------------------------------------------------------------------
 const grafana={id:'grafana',extension:'grafana',setting:'extension_grafana',name:'Grafana',source:{ready:st=>!!st.grafanaUrl,
  connections:async()=>[{id:'7',name:'ClickHouse prod',dialect:'clickhouse'},{id:'bad',name:'?',dialect:'oracle'}],
  schema:async()=>({tables:[{name:'events',columns:[{name:'ts',type:'DateTime'}]}]}),run:async(svc,id,sql,o)=>({columns:[{name:'n',type:'UInt64'}],rows:[[1]],sql,o})}};
 assert.equal((await sources.all({settings:{}},{sources:[grafana]})).length,0,'not added');
 const ext=await sources.all({settings:{extension_grafana:'true',grafanaUrl:'https://g'}},{sources:[grafana]});
 assert.deepEqual(ext.map(c=>[c.id,c.dialect,c.label]),[['src:grafana:7','clickhouse','ClickHouse prod · Grafana']],'unknown dialects are skipped');
 assert.deepEqual((await sources.engine({},ext[0]).run('SELECT 1',{maxRows:5})).o,{maxRows:5});
 assert.ok(require('../src/features/app-links.cjs').REGISTRIES.includes('query-source'));
 assert.deepEqual(sources.load().map(x=>x.id),['grafana'],'Grafana is a bundled query source');
 // Grafana's SQL datasources as connections: schema and queries through /api/ds/query with rawSql.
 const gq=[];
 const gs={settings:{extension_grafana:'true',grafanaUrl:'https://grafana.example.com',grafanaToken:'g'.repeat(24)},
  async request(url,options={}){
   assert.equal(options.headers.Authorization,'Bearer '+'g'.repeat(24));
   if(url==='https://grafana.example.com/api/frontend/settings')return {datasources:{'CH prod':{uid:'ch1',type:'grafana-clickhouse-datasource'},'Prometheus':{uid:'pr',type:'prometheus'},'Billing':{uid:'my1',type:'mysql'}}};
   if(url==='https://grafana.example.com/api/ds/query'){const body=JSON.parse(options.body),q=body.queries[0];gq.push(q);
    if(/system\.columns/.test(q.rawSql))return {results:{A:{frames:[{schema:{fields:[{name:'table'},{name:'name'},{name:'type'},{name:'comment'}]},data:{values:[['events','events'],['ts','user_id'],['DateTime','UInt64'],['','']]}}]}}};
    if(/broken/.test(q.rawSql))return {results:{A:{error:'Code: 60. Table broken does not exist',frames:[]}}};
    return {results:{A:{frames:[{schema:{fields:[{name:'day',type:'time'},{name:'n',type:'number'}]},data:{values:[[Date.UTC(2026,10,1),Date.UTC(2026,10,2)],[5,7]]}}]}}};}
   throw Error('unexpected '+url);
  }};
 const graf=await sources.all(gs);
 assert.deepEqual(graf.map(c=>[c.id,c.dialect,c.label]),[['src:grafana:ch1','clickhouse','CH prod · Grafana'],['src:grafana:my1','mysql','Billing · Grafana']],'only SQL datasources');
 const gschema=await sources.engine(gs,graf[0]).schema();
 assert.deepEqual(gschema.tables.map(t=>[t.name,t.columns.map(c=>c.name)]),[['events',['ts','user_id']]]);
 assert.equal(gq[0].datasource.uid,'ch1');assert.equal(gq[0].format,1);
 const grun=await sources.engine(gs,graf[0]).run('SELECT day, n FROM events LIMIT 500',{maxRows:500});
 assert.deepEqual(grun.rows,[['2026-11-01T00:00:00.000Z',5],['2026-11-02T00:00:00.000Z',7]]);assert.equal(chart.detect(grun.columns,grun.rows).type,'line');
 await assert.rejects(sources.engine(gs,graf[1]).run('SELECT * FROM broken'),/Grafana: Code: 60/);
 assert.equal(gq.at(-1).format,'table');

 ch.server.close();pgs.server.close();fs.rmSync(tmp,{recursive:true,force:true});
 console.log('SQL по словам: routing and near-misses, not added / not connected, ClickHouse HTTP (readonly=1 last, limits, schema cache, EXPLAIN ESTIMATE, read-only profile, errors), PostgreSQL wire protocol (SCRAM, read-only transaction, one statement, errors), BigQuery (shared key, shards, dry run, bytes limit), model retries, auto-run, «Выполнить», typed SQL without a model, charts, query-source contract passed');
})().catch(e=>{console.error(e);process.exit(1);});
