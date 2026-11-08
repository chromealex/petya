// A small PostgreSQL client over the wire protocol v3 (no native dependencies): TLS through SSLRequest (certificate
// verified unless the connection says «require»), password authentication by SCRAM-SHA-256, MD5 or cleartext (the
// last only over TLS or to localhost), and one query per connection:
//   BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout   (simple query)
//   Parse → Bind → Describe → Execute(max rows) → Sync           (extended protocol: exactly one statement)
//   ROLLBACK
// The extended protocol refuses several statements in one Parse, and the read-only transaction refuses any write —
// two server-side walls behind the validator. Values come back in text format and are converted by type OID.
const net=require('node:net');
const tls=require('node:tls');
const crypto=require('node:crypto');
const MAX_MESSAGE=64*1024*1024,MAX_TOTAL=32*1024*1024;
const TYPES={16:'bool',20:'int8',21:'int2',23:'int4',26:'oid',700:'float4',701:'float8',1700:'numeric',1082:'date',1083:'time',1114:'timestamp',1184:'timestamptz',
 1186:'interval',25:'text',1043:'varchar',1042:'bpchar',18:'char',19:'name',114:'json',3802:'jsonb',2950:'uuid',17:'bytea',1009:'text[]',1007:'int4[]',1016:'int8[]'};

class PgError extends Error{constructor(fields){super(fields.M||'Ошибка PostgreSQL');this.code=fields.C||'';this.severity=fields.S||'';this.detail=fields.D||'';this.hint=fields.H||'';this.position=fields.P||'';this.pg=true;}}

const int32=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b;};
const int16=n=>{const b=Buffer.alloc(2);b.writeInt16BE(n);return b;};
const cstr=s=>Buffer.concat([Buffer.from(String(s),'utf8'),Buffer.from([0])]);
const message=(type,...parts)=>{const body=Buffer.concat(parts);return Buffer.concat([Buffer.from(type,'ascii'),int32(body.length+4),body]);};
const local=host=>/^(?:localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/i.test(host);

function fields(body){const out={};let i=0;while(i<body.length&&body[i]!==0){const code=String.fromCharCode(body[i]);const end=body.indexOf(0,i+1);out[code]=body.toString('utf8',i+1,end);i=end+1;}return out;}

// Frames incoming bytes into messages {type, body}; next() resolves with the next one.
function framer(socket,onFail){
 let buf=Buffer.alloc(0),total=0;const queue=[],waiters=[];let failed=null;
 const fail=e=>{if(failed)return;failed=e;while(waiters.length)waiters.shift().reject(e);onFail?.(e);};
 socket.on('data',d=>{
  total+=d.length;if(total>MAX_TOTAL)return fail(Error('Ответ PostgreSQL слишком большой.'));
  buf=buf.length?Buffer.concat([buf,d]):d;
  while(buf.length>=5){
   const len=buf.readInt32BE(1);if(len<4||len>MAX_MESSAGE)return fail(Error('PostgreSQL прислал повреждённое сообщение.'));
   if(buf.length<1+len)break;
   const m={type:String.fromCharCode(buf[0]),body:buf.subarray(5,1+len)};buf=buf.subarray(1+len);
   if(waiters.length)waiters.shift().resolve(m);else queue.push(m);
  }
 });
 socket.on('error',fail);
 socket.on('close',()=>fail(Error('PostgreSQL закрыл соединение.')));
 return {next:()=>queue.length?Promise.resolve(queue.shift()):failed?Promise.reject(failed):new Promise((resolve,reject)=>waiters.push({resolve,reject})),fail};
}

function scram(password){
 const nonce=crypto.randomBytes(18).toString('base64');
 const first='n=,r='+nonce;
 return {
  initial:'n,,'+first,
  final(serverFirst){
   const attrs=Object.fromEntries(serverFirst.split(',').map(p=>[p[0],p.slice(2)]));
   if(!attrs.r?.startsWith(nonce)||!attrs.s||!(Number(attrs.i)>0))throw Error('Сервер PostgreSQL прислал неверный ответ SCRAM.');
   const salted=crypto.pbkdf2Sync(String(password).normalize('NFKC'),Buffer.from(attrs.s,'base64'),Number(attrs.i),32,'sha256');
   const hmac=(key,text)=>crypto.createHmac('sha256',key).update(text).digest();
   const clientKey=hmac(salted,'Client Key'),stored=crypto.createHash('sha256').update(clientKey).digest();
   const withoutProof='c=biws,r='+attrs.r,auth=first+','+serverFirst+','+withoutProof;
   const signature=hmac(stored,auth),proof=Buffer.from(clientKey.map((b,i)=>b^signature[i]));
   this.expected=hmac(hmac(salted,'Server Key'),auth).toString('base64');
   return withoutProof+',p='+proof.toString('base64');
  },
  verify(serverFinal){if(!serverFinal.startsWith('v=')||serverFinal.slice(2)!==this.expected)throw Error('Сервер PostgreSQL не подтвердил подпись SCRAM.');}
 };
}

async function open({host,port=5432,ssl='verify',user,password='',database,timeoutMs=15000,connect=net.connect}){
 let socket=connect({host:host.replace(/^\[|\]$/g,''),port});
 const deadline=setTimeout(()=>socket.destroy(Error('PostgreSQL не ответил за '+Math.round(timeoutMs/1000)+' с.')),timeoutMs);
 deadline.unref?.();
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 let secure=false;
 if(ssl!=='disable'){
  socket.write(Buffer.concat([int32(8),int32(80877103)]));
  const answer=await new Promise((resolve,reject)=>{socket.once('data',d=>resolve(d));socket.once('error',reject);});
  if(String.fromCharCode(answer[0])!=='S')throw Error('Сервер PostgreSQL не поддерживает TLS. Включите SSL на сервере или подключайтесь к localhost без шифрования.');
  socket=tls.connect({socket,servername:net.isIP(host)?undefined:host,rejectUnauthorized:ssl==='verify'});
  await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',e=>reject(ssl==='verify'?Error('Сертификат PostgreSQL не прошёл проверку: '+e.message+'. Если сервер использует свой сертификат, выберите «TLS без проверки».'):e));});
  secure=true;
 }
 const wire=framer(socket);
 const send=buf=>socket.write(buf);
 const params=[['user',user],['database',database],['application_name','Petya'],['client_encoding','UTF8'],['DateStyle','ISO']];
 const startup=Buffer.concat([int32(196608),...params.flatMap(([k,v])=>[cstr(k),cstr(v)]),Buffer.from([0])]);
 send(Buffer.concat([int32(startup.length+4),startup]));
 let sasl=null;
 for(;;){
  const m=await wire.next();
  if(m.type==='E')throw new PgError(fields(m.body));
  if(m.type==='R'){
   const code=m.body.readInt32BE(0);
   if(code===0)continue;
   if(code===3){if(!secure&&!local(host))throw Error('PostgreSQL просит пароль открытым текстом без шифрования. Включите TLS.');send(message('p',cstr(password)));continue;}
   if(code===5){const salt=m.body.subarray(4,8),md5=v=>crypto.createHash('md5').update(v).digest('hex');send(message('p',cstr('md5'+md5(Buffer.concat([Buffer.from(md5(password+user)),salt])))));continue;}
   if(code===10){
    const mechanisms=m.body.subarray(4).toString('utf8').split('\0').filter(Boolean);
    if(!mechanisms.includes('SCRAM-SHA-256'))throw Error('PostgreSQL предлагает неподдерживаемый способ входа: '+mechanisms.join(', '));
    sasl=scram(password);const data=Buffer.from(sasl.initial,'utf8');
    send(message('p',cstr('SCRAM-SHA-256'),int32(data.length),data));continue;
   }
   if(code===11){if(!sasl)throw Error('Неожиданный шаг SCRAM.');send(message('p',Buffer.from(sasl.final(m.body.subarray(4).toString('utf8')),'utf8')));continue;}
   if(code===12){if(!sasl)throw Error('Неожиданный шаг SCRAM.');sasl.verify(m.body.subarray(4).toString('utf8'));continue;}
   throw Error('PostgreSQL просит неподдерживаемый способ входа (код '+code+'). Поддерживаются SCRAM-SHA-256, MD5 и пароль.');
  }
  if(m.type==='Z')break;
 }
 return {
  wire,send,secure,
  // Simple query: waits for ReadyForQuery; an error is thrown after it.
  async simple(sql){send(message('Q',cstr(sql)));let error=null;for(;;){const m=await wire.next();if(m.type==='E')error=new PgError(fields(m.body));if(m.type==='Z'){if(error)throw error;return;}}},
  async extended(sql,maxRows){
   send(Buffer.concat([message('P',cstr(''),cstr(sql),int16(0)),message('B',cstr(''),cstr(''),int16(0),int16(0),int16(0)),message('D',Buffer.from('P'),cstr('')),message('E',cstr(''),int32(maxRows)),message('S')]));
   const columns=[],rows=[];let error=null,suspended=false;
   for(;;){
    const m=await wire.next();
    if(m.type==='E')error=new PgError(fields(m.body));
    else if(m.type==='T'){
     const n=m.body.readInt16BE(0);let i=2;
     for(let k=0;k<n;k++){const end=m.body.indexOf(0,i);const name=m.body.toString('utf8',i,end);i=end+1;const oid=m.body.readInt32BE(i+6);i+=18;columns.push({name,oid,type:TYPES[oid]||'oid:'+oid});}
    }else if(m.type==='D'){
     const n=m.body.readInt16BE(0);let i=2;const row=[];
     for(let k=0;k<n;k++){const len=m.body.readInt32BE(i);i+=4;if(len<0){row.push(null);continue;}row.push(convert(columns[k]?.oid,m.body.toString('utf8',i,i+len)));i+=len;}
     rows.push(row);
    }else if(m.type==='s')suspended=true;
    else if(m.type==='Z'){if(error)throw error;return {columns:columns.map(({name,type})=>({name,type})),rows,suspended};}
   }
  },
  end(){clearTimeout(deadline);try{socket.end(message('X'));}catch{/* already closed */}socket.destroy();}
 };
}
// Text-format values by type: numbers when exact, booleans, ISO-like dates as text.
function convert(oid,text){
 if([21,23,26,700,701].includes(oid))return Number(text);
 if(oid===20||oid===1700){const n=Number(text);return Number.isFinite(n)&&(oid===1700||Number.isSafeInteger(n))?n:text;}
 if(oid===16)return text==='t';
 if(oid===1114)return text.replace(' ','T');
 if(oid===1184)return text.replace(' ','T').replace(/([+-]\d\d)$/,'$1:00');
 return text;
}
function explain(error){
 if(error?.pg){
  const map={'28P01':'PostgreSQL не принял логин или пароль. Проверьте их в настройках «SQL по словам».','28000':'PostgreSQL не пустил этого пользователя (pg_hba.conf).','3D000':'Базы данных с таким именем нет на сервере PostgreSQL.',
   '42501':'У пользователя PostgreSQL нет прав на эту таблицу.','57014':'PostgreSQL не уложился в 30 секунд. Сузьте период или добавьте фильтр.','25006':'PostgreSQL отказал: транзакция только для чтения.','42601':'PostgreSQL: синтаксическая ошибка — '+error.message};
  const e=Error(map[error.code]||'PostgreSQL: '+error.message+(error.hint?' ('+error.hint+')':''));e.code=error.code;e.cause=error;return e;
 }
 if(/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/.test(String(error?.code||error?.message)))return Object.assign(Error('PostgreSQL не отвечает по адресу из настроек.'),{cause:error});
 return error instanceof Error?error:Error(String(error));
}
async function withConnection(conn,password,fn,{connect}={}){
 let c;
 try{
  c=await open({host:conn.host,port:conn.port,ssl:conn.ssl,user:conn.user,password,database:conn.database,...connect?{connect}:{}});
  await c.simple("BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'");
  const result=await fn(c);
  await c.simple('ROLLBACK').catch(()=>{});
  return result;
 }catch(e){throw explain(e);}
 finally{c?.end();}
}
async function query(conn,password,sql,{maxRows=500,connect}={}){
 const started=Date.now();
 return withConnection(conn,password,async c=>{const r=await c.extended(sql,maxRows);return {...r,truncated:r.suspended,elapsedMs:Date.now()-started};},{connect});
}
const SCHEMA_SQL=`SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
 col_description(pc.oid, c.ordinal_position::int) AS column_comment, obj_description(pc.oid, 'pg_class') AS table_comment, pc.reltuples::bigint AS row_estimate
FROM information_schema.columns c
JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
JOIN pg_catalog.pg_class pc ON pc.relname = c.table_name AND pc.relnamespace = n.oid
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') AND c.table_schema NOT LIKE 'pg_toast%'
ORDER BY c.table_schema, c.table_name, c.ordinal_position
LIMIT 5000`;
async function schema(conn,password,{connect}={}){
 const r=await query(conn,password,SCHEMA_SQL,{maxRows:5000,connect});
 const tables=new Map();
 for(const [schemaName,table,column,type,comment,tableComment,rows] of r.rows){
  const name=schemaName==='public'?table:schemaName+'.'+table;
  if(!tables.has(name))tables.set(name,{name,comment:tableComment||'',rows:Number(rows)>=0?Number(rows):null,columns:[]});
  tables.get(name).columns.push({name:column,type,comment:comment||''});
 }
 return {database:conn.database,tables:[...tables.values()]};
}
// The planner's estimate: rows and total cost of the plan's top node (EXPLAIN without ANALYZE runs nothing).
async function estimate(conn,password,sql,{connect}={}){
 try{
  const r=await withConnection(conn,password,c=>c.extended('EXPLAIN (FORMAT JSON) '+sql,10),{connect});
  const plan=JSON.parse(String(r.rows[0]?.[0]||'[]'))[0]?.Plan||{};
  return {kind:'rows',value:Number(plan['Plan Rows'])||0,cost:Number(plan['Total Cost'])||0};
 }catch(e){return {kind:'unknown',note:explain(e).message};}
}
module.exports={open,query,schema,estimate,explain,convert,PgError,SCHEMA_SQL,TYPES};
