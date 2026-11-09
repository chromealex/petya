// «SQL по словам», the read-only gate: every statement Petya runs passes through `check` first, whether the model wrote
// it or the user typed it. The check works on tokens, not on regular expressions over the raw text, so keywords inside
// strings, quoted identifiers and comments neither hide nor fake anything:
// - one statement only (a single trailing «;» is dropped; any other «;» outside literals is refused);
// - it starts with SELECT or WITH (optionally inside parentheses);
// - no data-changing or session words anywhere (INSERT/UPDATE/DELETE/MERGE in a CTE, SELECT … INTO, DDL, SET, COPY,
//   CALL, locks, ClickHouse SETTINGS/FORMAT/INTO OUTFILE, BigQuery scripting, MySQL executable comments);
// - no dialect-specific dangerous functions (sleep, file and network table functions, dblink, large objects, admin
//   functions, sequences, dynamic query execution);
// - no invisible or look-alike characters outside string literals (bidi overrides, zero-width, full-width punctuation);
// - a LIMIT: added when missing, lowered when larger than allowed (ClickHouse unions are wrapped, as their LIMIT binds
//   to the last SELECT only).
// Comments are removed from the statement that runs, so what the card shows is exactly what is executed.
// The servers enforce read-only as well (ClickHouse readonly=1, PostgreSQL READ ONLY transaction over the extended
// protocol, which refuses several statements, BigQuery maximumBytesBilled); this check is the first wall, not the only one.
const DIALECTS=['clickhouse','postgres','bigquery','mysql'];
const MAX_LENGTH=20000;

class SqlRejected extends Error{constructor(message,code){super(message);this.code=code;this.rejected=true;}}
const reject=(message,code)=>{throw new SqlRejected(message,code);};

// Words that change data, sessions or the server, refused anywhere outside literals. Words that are also function names
// in some dialect (REPLACE, TRUNCATE, INSERT in MySQL, FORMAT in ClickHouse) are refused only when not called as one.
const STATEMENT=new Set(['insert','update','delete','merge','upsert','replace','drop','create','alter','truncate','rename','grant','revoke',
 'attach','detach','optimize','kill','copy','call','exec','execute','prepare','deallocate','vacuum','reindex','begin','commit','rollback','savepoint',
 'declare','set','listen','notify','unlisten','load','handler','export','backup','restore','shutdown','unlock','lock','into','outfile','dumpfile','undrop']);
const FUNCTION_OK=new Set(['replace','truncate','insert','format']);
const DIALECT_WORDS={clickhouse:new Set(['settings','format']),postgres:new Set([]),bigquery:new Set([]),mysql:new Set([])};

// Dangerous functions per dialect (called as name(…), with or without a schema prefix).
const FUNCTIONS={
 postgres:{names:new Set(['pg_sleep','pg_sleep_for','pg_sleep_until','nextval','setval','set_config','query_to_xml','query_to_xmlschema','query_to_xml_and_xmlschema',
  'cursor_to_xml','cursor_to_xmlschema','database_to_xml','database_to_xmlschema','database_to_xml_and_xmlschema','schema_to_xml','txid_current','pg_current_xact_id',
  'pg_notify','pg_import_system_collations','currval','lastval']),
  prefixes:/^(?:pg_(?:read|ls_|stat_file|file_|terminate|cancel|reload|rotate|promote|advisory|try_advisory|switch|create|drop|replication|logical|stat_reset|wal_replay|backup|start_backup|stop_backup|log_backend|copy)|lo_|dblink)/},
 clickhouse:{names:new Set(['url','urlcluster','file','filecluster','s3','s3cluster','gcs','hdfs','hdfscluster','azureblobstorage','azureblobstoragecluster','remote','remotesecure',
  'cluster','clusterallreplicas','mysql','postgresql','mongodb','redis','sqlite','jdbc','odbc','executable','executablepool','input','deltalake','deltalakecluster','hudi','hudicluster',
  'iceberg','icebergs3','icebergazure','iceberghdfs','icebergcluster','paimon','sleep','sleepeachrow','generaterandom','fuzzjson','fuzzquery','loop','ytsaurus','arrowflight','s3queue',
  'kafka','rabbitmq','nats','dictionary_create','getsetting']),prefixes:null},
 bigquery:{names:new Set(['external_query','external_object_transform']),prefixes:null},
 mysql:{names:new Set(['sleep','benchmark','load_file','get_lock','release_lock','release_all_locks','master_pos_wait','source_pos_wait','sys_exec','sys_eval']),prefixes:null}
};

// Characters never allowed outside string literals: controls, format characters (bidi, zero-width, BOM), private use,
// surrogates, and full-width/compatibility punctuation that only looks like SQL syntax.
const INVISIBLE=/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\u2028\u2029]/u;
const ODD_SPACE=/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u;
const LOOKALIKE=/[\uFF00-\uFF65\uFE10-\uFE6B\u2018\u2019\u201C\u201D\u2032\u2033\u02BC\u055A\u05F3\u0589\u037E\u2024\u2027\u2044\u2215\u29F8]/u;

// --- Tokenizer -------------------------------------------------------------------------------------------------------
// Token: {type:'ws'|'comment'|'word'|'quoted'|'string'|'number'|'punct'|'param', text, start, end}.
function tokenize(sql,dialect){
 const out=[],n=sql.length;let i=0;
 const backslash=dialect!=='postgres';// PostgreSQL plain strings keep backslashes literally (standard_conforming_strings)
 const push=(type,start,end)=>out.push({type,text:sql.slice(start,end),start,end});
 const quoted=(start,quote,{escapes,doubled=true})=>{
  let j=start+1;
  for(;;){
   if(j>=n)reject('Незакрытая кавычка '+quote+' в запросе.','unterminated');
   const c=sql[j];
   if(escapes&&c==='\\'){j+=2;continue;}
   if(c===quote){if(doubled&&sql[j+1]===quote){j+=2;continue;}return j+1;}
   j++;
  }
 };
 while(i<n){
  const c=sql[i],next=sql[i+1];
  if(/[ \t\r\n\f]/.test(c)){let j=i+1;while(j<n&&/[ \t\r\n\f]/.test(sql[j]))j++;push('ws',i,j);i=j;continue;}
  if(c==='-'&&next==='-'){let j=i+2;while(j<n&&sql[j]!=='\n')j++;push('comment',i,j);i=j;continue;}
  if(c==='#'&&dialect!=='postgres'){let j=i+1;while(j<n&&sql[j]!=='\n')j++;push('comment',i,j);i=j;continue;}
  if(c==='/'&&next==='*'){
   if(sql[i+2]==='!'||sql[i+2]==='+')reject('Исполняемые комментарии и подсказки /*! … */, /*+ … */ не допускаются.','executable-comment');
   // PostgreSQL nests block comments; the others end at the first «*/».
   let j=i+2,depth=1;
   while(depth>0){
    if(j>=n)reject('Незакрытый комментарий /* в запросе.','unterminated');
    if(dialect==='postgres'&&sql[j]==='/'&&sql[j+1]==='*'){depth++;j+=2;continue;}
    if(sql[j]==='*'&&sql[j+1]==='/'){depth--;j+=2;continue;}
    j++;
   }
   push('comment',i,j);i=j;continue;
  }
  // BigQuery triple-quoted strings and string prefixes (r, b, rb, br); PostgreSQL E'…' with escapes.
  if(dialect==='bigquery'){
   const m=/^(?:[rR][bB]?|[bB][rR]?)?(?:'''|""")/.exec(sql.slice(i,i+5));
   if(m){const q=m[0].slice(-3),raw=/r/i.test(m[0].slice(0,-3));let j=i+m[0].length;
    for(;;){if(j>=n)reject('Незакрытая строка '+q+' в запросе.','unterminated');if(!raw&&sql[j]==='\\'){j+=2;continue;}if(sql.startsWith(q,j)){j+=3;break;}j++;}
    push('string',i,j);i=j;continue;}
   const p=/^(?:[rR][bB]?|[bB][rR]?)(?=['"])/.exec(sql.slice(i,i+3));
   if(p&&!/[\p{L}\p{N}_]/u.test(sql[i-1]||'')){const q=sql[i+p[0].length],raw=/r/i.test(p[0]);const j=quoted(i+p[0].length,q,{escapes:!raw,doubled:false});push('string',i,j);i=j;continue;}
  }
  if(dialect==='postgres'&&(c==='E'||c==='e')&&next==="'"&&!/[\p{L}\p{N}_$]/u.test(sql[i-1]||'')){const j=quoted(i+1,"'",{escapes:true});push('string',i,j);i=j;continue;}
  if(c==="'"){
   const j=quoted(i,"'",{escapes:backslash,doubled:dialect!=='bigquery'});
   if(dialect==='postgres'&&sql.slice(i,j).includes('\\'))reject('Обратная косая черта в строке PostgreSQL неоднозначна. Используйте E\'…\' или уберите её.','backslash');
   push('string',i,j);i=j;continue;
  }
  if(c==='"'){
   // Identifiers in PostgreSQL and ClickHouse, strings in BigQuery and MySQL.
   const ident=dialect==='postgres'||dialect==='clickhouse';
   const j=quoted(i,'"',{escapes:dialect!=='postgres',doubled:dialect!=='bigquery'});
   push(ident?'quoted':'string',i,j);i=j;continue;
  }
  if(c==='`'){
   if(dialect==='postgres')reject('Обратные кавычки ` в PostgreSQL не используются.','backtick');
   const j=quoted(i,'`',{escapes:dialect!=='mysql',doubled:dialect==='mysql'||dialect==='clickhouse'});push('quoted',i,j);i=j;continue;
  }
  if(c==='$'&&(dialect==='postgres'||dialect==='clickhouse')){
   const tag=/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i,i+66));
   if(tag&&!(dialect==='postgres'&&/[\p{L}\p{N}_]/u.test(sql[i-1]||''))){
    const end=sql.indexOf(tag[0],i+tag[0].length);if(end<0)reject('Незакрытая строка '+tag[0]+' в запросе.','unterminated');
    push('string',i,end+tag[0].length);i=end+tag[0].length;continue;
   }
   if(/\d/.test(next||'')){let j=i+1;while(j<n&&/\d/.test(sql[j]))j++;push('param',i,j);i=j;continue;}
  }
  if(/\d/.test(c)||c==='.'&&/\d/.test(next||'')){
   const m=/^(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(sql.slice(i));push('number',i,i+m[0].length);i+=m[0].length;continue;
  }
  if(/[\p{L}_]/u.test(c)){let j=i+1;while(j<n&&/[\p{L}\p{N}\p{M}_$]/u.test(sql[j]))j++;push('word',i,j);i=j;continue;}
  if(c==='@'&&dialect==='bigquery'&&/[A-Za-z_]/.test(next||'')){let j=i+1;while(j<n&&/[A-Za-z0-9_]/.test(sql[j]))j++;push('param',i,j);i=j;continue;}
  if(INVISIBLE.test(c))reject('В запросе есть невидимый символ (U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')+'). Перепишите запрос обычным текстом.','invisible');
  if(ODD_SPACE.test(c)){push('ws',i,i+1);i++;continue;}
  if(LOOKALIKE.test(c)||c.codePointAt(0)>0x7f)reject('В запросе есть символ, похожий на знак SQL, но им не являющийся: «'+c+'».','lookalike');
  push('punct',i,i+1);i++;
 }
 return out;
}

// --- Checks ----------------------------------------------------------------------------------------------------------
const significant=t=>t.type!=='ws'&&t.type!=='comment';
const lower=t=>t.type==='word'?t.text.toLowerCase():'';

function check(sql,{dialect='postgres',maxRows=500}={}){
 if(!DIALECTS.includes(dialect))throw Error('Неизвестный диалект SQL: '+dialect);
 const text=String(sql??'');
 if(!text.trim())reject('Пустой запрос.','empty');
 if(text.length>MAX_LENGTH)reject('Запрос длиннее '+MAX_LENGTH+' символов.','too-long');
 const tokens=tokenize(text,dialect);
 // Strings may hold anything visible, but never invisible formatting characters.
 for(const t of tokens)if((t.type==='string'||t.type==='quoted')&&/[\p{Cf}\p{Co}\p{Cs}\u0000]/u.test(t.text))reject('В строке запроса есть невидимый символ. Перепишите запрос обычным текстом.','invisible');
 // Comments are dropped and odd spaces become plain ones: the statement that runs is the one shown.
 let parts=[];
 for(const t of tokens.filter(t=>t.type!=='comment')){
  if(t.type!=='ws'){parts.push(t);continue;}
  const prev=parts.at(-1),text=/\n/.test(t.text)?'\n':' ';
  if(prev?.type==='ws'){if(text==='\n')prev.text='\n';continue;}
  parts.push({...t,text});
 }
 // A comment between two tokens still separates them («a/**/b» is «a b»).
 for(let k=1;k<parts.length;k++)if(parts[k].type!=='ws'&&parts[k-1].type!=='ws'&&parts[k].start!==parts[k-1].end)parts.splice(k,0,{type:'ws',text:' ',start:parts[k-1].end,end:parts[k].start});
 // One trailing «;» is allowed and dropped; any other semicolon means a second statement.
 const sig=parts.filter(significant);
 if(sig.length&&sig.at(-1).text===';'){const last=sig.at(-1);parts=parts.filter(p=>p!==last);sig.pop();}
 if(sig.some(t=>t.type==='punct'&&t.text===';'))reject('В запросе несколько команд через «;». Нужен один запрос SELECT.','multiple');
 if(!sig.length)reject('Пустой запрос.','empty');
 // Parentheses balance, and each token's nesting depth.
 let depth=0;
 for(const t of sig){
  if(t.text==='('&&t.type==='punct')depth++;
  t.depth=depth;
  if(t.text===')'&&t.type==='punct'){depth--;t.depth=depth;if(depth<0)reject('Лишняя закрывающая скобка в запросе.','parens');}
 }
 if(depth!==0)reject('Скобки в запросе не сбалансированы.','parens');
 // Starts with SELECT or WITH, possibly inside parentheses.
 const first=sig.find(t=>!(t.type==='punct'&&t.text==='('));
 if(!first||!['select','with'].includes(lower(first)))reject('Разрешены только запросы на чтение: SELECT или WITH … SELECT.','not-select');
 const dialectWords=DIALECT_WORDS[dialect],fns=FUNCTIONS[dialect];
 for(let k=0;k<sig.length;k++){
  const t=sig[k],w=lower(t);if(!w)continue;
  const after=sig[k+1],call=after&&after.type==='punct'&&after.text==='(';
  const before=sig[k-1],qualified=before&&before.type==='punct'&&before.text==='.';
  // A column or table qualified by a dot («t.update», «system.settings») is a name, not a keyword.
  const name=qualified||(after&&after.type==='punct'&&after.text==='.');
  if(!name&&(STATEMENT.has(w)||dialectWords.has(w))&&!(call&&FUNCTION_OK.has(w)))
   reject('Запрос содержит «'+t.text.toUpperCase()+'» — это не чтение данных. Разрешены только SELECT-запросы.','forbidden-word');
  if(call&&(fns.names.has(w)||fns.prefixes?.test(w)))reject('Функция '+t.text+'() не разрешена: она обращается к файлам, сети, серверу или меняет состояние.','forbidden-function');
  // Row locks: FOR UPDATE / FOR SHARE / FOR KEY SHARE / LOCK IN SHARE MODE.
  if(w==='for'&&after&&['share','key','no'].includes(lower(after)))reject('Блокировки строк (FOR SHARE/UPDATE) не допускаются.','lock');
 }
 return limit(parts,sig,{dialect,maxRows});
}

// Adds or lowers the top-level LIMIT. Returns {sql, limit, limited}.
function limit(parts,sig,{dialect,maxRows}){
 const max=Math.max(1,Math.floor(maxRows));
 const top=sig.filter(t=>t.depth===0);
 const join=list=>list.map(p=>p.text).join('').trim();
 // ClickHouse binds a trailing LIMIT to the last SELECT of a UNION: wrap the whole query instead.
 const setOp=top.some(t=>['union','except','intersect'].includes(lower(t)));
 if(dialect==='clickhouse'&&setOp)return {sql:'SELECT * FROM (\n'+join(parts)+'\n)\nLIMIT '+max,limit:max,limited:true};
 // The outermost LIMIT that is not ClickHouse's «LIMIT n BY».
 let at=-1;
 for(let k=top.length-1;k>=0;k--){
  if(lower(top[k])!=='limit')continue;
  let j=k+1;
  while(j<top.length&&(top[j].type==='number'||top[j].text===','))j++;
  if(lower(top[j]||{})==='by')continue;
  at=k;break;
 }
 if(at<0){
  // ANSI FETCH FIRST n ROWS ONLY counts as a limit too.
  const fetch=top.findIndex(t=>lower(t)==='fetch');
  if(fetch>=0){
   const n=top.slice(fetch+1,fetch+4).find(t=>t.type==='number');
   if(!n)reject('FETCH без числа строк не поддерживается — используйте LIMIT.','limit');
   if(Number(n.text)>max){n.text=String(max);return {sql:join(parts),limit:max,limited:true};}
   return {sql:join(parts),limit:Number(n.text),limited:false};
  }
  return {sql:join(parts)+'\nLIMIT '+max,limit:max,limited:true};
 }
 const rest=top.slice(at+1);
 const a=rest[0];
 if(!a)reject('После LIMIT нет числа строк.','limit');
 if(lower(a)==='all'){a.text=String(max);return {sql:join(parts),limit:max,limited:true};}
 if(a.type!=='number'||!/^\d+$/.test(a.text))reject('LIMIT должен быть целым числом.','limit');
 // MySQL/ClickHouse «LIMIT offset, count».
 let count=a;
 if(rest[1]?.text===','){if(rest[2]?.type!=='number'||!/^\d+$/.test(rest[2].text))reject('LIMIT должен быть целым числом.','limit');count=rest[2];}
 if(Number(count.text)>max){count.text=String(max);return {sql:join(parts),limit:max,limited:true};}
 return {sql:join(parts),limit:Number(count.text),limited:false};
}

// Table names a statement reads (after FROM / JOIN, also «FROM a, b»), without CTE names, subqueries and table
// functions — to check that the model used only tables of the schema. Returns [{name, parts:[…]}].
function tables(sql,dialect){
 let tokens;try{tokens=tokenize(String(sql||''),dialect).filter(significant);}catch{return [];}
 const unquote=t=>t.type==='quoted'?t.text.slice(1,-1).replace(/""|``/g,m=>m[0]):t.text;
 // The function whose parentheses hold each token: FROM inside EXTRACT(… FROM …), SUBSTRING, TRIM is not a table.
 const owner=[],stack=[];
 tokens.forEach((t,k)=>{if(t.text==='('&&t.type==='punct'){stack.push(lower(tokens[k-1]||{}));owner[k]=stack.at(-2)||'';return;}if(t.text===')'&&t.type==='punct'){stack.pop();}owner[k]=stack.at(-1)||'';});
 const ctes=new Set();
 for(let k=0;k<tokens.length;k++){
  // «WITH name AS (», «, name AS (», also «name (cols) AS (».
  if((lower(tokens[k])==='with'||lower(tokens[k])==='recursive'||tokens[k].text===',')&&(tokens[k+1]?.type==='word'||tokens[k+1]?.type==='quoted')){
   let j=k+2;if(tokens[j]?.text==='('){let d=1;j++;while(j<tokens.length&&d){if(tokens[j].text==='(')d++;else if(tokens[j].text===')')d--;j++;}}
   if(lower(tokens[j]||{})==='as')ctes.add(unquote(tokens[k+1]).toLowerCase());
  }
 }
 const out=[];
 const read=k=>{
  const names=[];let j=k;
  while(tokens[j]&&(tokens[j].type==='word'||tokens[j].type==='quoted')){
   names.push(unquote(tokens[j]));
   if(tokens[j+1]?.text==='.'){j+=2;continue;}
   j++;break;
  }
  if(!names.length||tokens[j]?.text==='(')return j;// a subquery or a table function
  // BigQuery: `project.dataset.table` in one quoted token.
  const parts=names.length===1&&dialect==='bigquery'?names[0].split('.'):names;
  const name=parts.at(-1);
  if(!(parts.length===1&&ctes.has(name.toLowerCase())))out.push({name,parts});
  return j;
 };
 for(let k=0;k<tokens.length;k++){
  const w=lower(tokens[k]);
  if(w!=='from'&&w!=='join')continue;
  if(w==='from'&&(['extract','substring','trim','overlay','position'].includes(owner[k])||lower(tokens[k-1]||{})==='distinct'))continue;
  read(k+1);
  if(w!=='from')continue;
  // «FROM a [AS] x, b y JOIN c ON …, d»: a comma at the FROM's own level until the clause ends starts another table.
  let d=0;
  for(let j=k+1;j<tokens.length;j++){
   const t=tokens[j];
   if(t.type==='punct'&&t.text==='('){d++;continue;}
   if(t.type==='punct'&&t.text===')'){if(--d<0)break;continue;}
   if(d)continue;
   if(['where','group','order','limit','having','union','except','intersect','window','qualify','prewhere','settings','format','fetch','offset','select'].includes(lower(t)))break;
   if(t.text===','&&(tokens[j+1]?.type==='word'||tokens[j+1]?.type==='quoted'))read(j+1);
  }
 }
 return out;
}

module.exports={check,tokenize,tables,SqlRejected,DIALECTS,MAX_LENGTH};
