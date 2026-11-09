// «Воронки» over a connected database («SQL по словам» connections and query sources): the events table is found
// in the cached schema by its columns (player, event name, time; platform, country and version when present), and
// the queries are written by code for the connection's dialect — never by a model. Every query passes the SQL app's
// read-only check (src/extensions/sql/validate.cjs) and runs only after the user pressed «Выполнить».
//  - events(): the event names of the period with how many players sent them (to resolve a preset);
//  - funnel(): per segment value, step and time bucket the number of players (compute.fromBuckets), plus the
//    '__all__' total that survives row limits because it is ordered first.
const {BUCKETS}=require('./compute.cjs');
const COLS={
 user:/^(?:user_?id|player_?id|uid|user_pseudo_id|appmetrica_device_id|device_?id|account_?id|profile_?id|client_?id)$/i,
 event:/^(?:event_?name|event|event_?type|action|name)$/i,
 time:/^(?:event_?time|event_?timestamp|event_?datetime|ts|timestamp|time|datetime|created_?at|client_?time|server_?time|event_?date_?time)$/i,
 platform:/^(?:platform|os|os_?name|device_?platform|os_?type)$/i,
 country:/^(?:country|country_?code|country_?iso_?code|geo_?country|country_?iso)$/i,
 version:/^(?:app_?version|version|app_?version_?name|build|client_?version|game_?version)$/i
};
const pick=(columns,re,avoid=[])=>columns.find(c=>re.test(c.name)&&!avoid.includes(c.name))||null;
// The best events table of a schema, or null: {table, user, event, time, timeKind, platform?, country?, version?}.
function detect(schema){
 let best=null;
 for(const t of schema?.tables||[]){
  const cols=t.columns||[];
  const user=pick(cols,COLS.user),event=pick(cols,COLS.event,[user?.name]),time=pick(cols,COLS.time);
  if(!user||!event||!time)continue;
  let score=3+(/event|событ|log/i.test(t.name)?2:0)+(/^event/i.test(event.name)?1:0);
  const extra={platform:pick(cols,COLS.platform),country:pick(cols,COLS.country),version:pick(cols,COLS.version,[event.name])};
  score+=Object.values(extra).filter(Boolean).length*0.5;
  if(!best||score>best.score)best={score,table:t.name,user:user.name,event:event.name,time:time.name,timeKind:timeKind(time),platform:extra.platform?.name||null,country:extra.country?.name||null,version:extra.version?.name||null};
 }
 if(!best)return null;
 const {score,...out}=best;return out;
}
// A time column of an integer type is an epoch: seconds, or milli/micro by its name (Firebase's event_timestamp is μs).
function timeKind(col){
 if(!/int|long|number|numeric|decimal/i.test(String(col.type||'')))return 'timestamp';
 if(/micro|_us$/i.test(col.name)||/^event_timestamp$/i.test(col.name))return 'micros';
 if(/milli|_ms$/i.test(col.name))return 'millis';
 return 'seconds';
}

const quote=(dialect,name)=>String(name).split('.').map(p=>dialect==='postgres'?'"'+p.replace(/"/g,'""')+'"':'`'+p.replace(/`/g,'')+'`').join('.');
const EVENT=/^[\p{L}\p{N}_.:$ -]{1,80}$/u;
const literal=v=>{const s=String(v);if(!EVENT.test(s)||/['\\]/.test(s))throw Error('Название события «'+s.slice(0,40)+'» содержит недопустимые символы.');return "'"+s+"'";};
function ts(dialect,col,kind){
 const c=quote(dialect,col);
 if(kind==='timestamp')return c;
 const f={clickhouse:{seconds:'toDateTime('+c+')',millis:'fromUnixTimestamp64Milli(toInt64('+c+'))',micros:'fromUnixTimestamp64Micro(toInt64('+c+'))'},
  postgres:{seconds:'to_timestamp('+c+')',millis:'to_timestamp('+c+' / 1000.0)',micros:'to_timestamp('+c+' / 1000000.0)'},
  bigquery:{seconds:'TIMESTAMP_SECONDS('+c+')',millis:'TIMESTAMP_MILLIS('+c+')',micros:'TIMESTAMP_MICROS('+c+')'},
  mysql:{seconds:'FROM_UNIXTIME('+c+')',millis:'FROM_UNIXTIME('+c+' / 1000)',micros:'FROM_UNIXTIME('+c+' / 1000000)'}};
 return f[dialect]?.[kind]||c;
}
const at=(dialect,date)=>dialect==='bigquery'?"TIMESTAMP('"+date+" 00:00:00+00')":dialect==='postgres'?"TIMESTAMP '"+date+" 00:00:00'":"'"+date+" 00:00:00'";
const nextDay=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const seconds=(dialect,a,b)=>({clickhouse:"dateDiff('second', "+a+', '+b+')',postgres:'EXTRACT(EPOCH FROM ('+b+' - '+a+'))',bigquery:'TIMESTAMP_DIFF('+b+', '+a+', SECOND)',mysql:'TIMESTAMPDIFF(SECOND, '+a+', '+b+')'})[dialect];
const minimum=(dialect,expr)=>dialect==='clickhouse'?'minIfOrNull('+expr.value+', '+expr.when+')':'MIN(CASE WHEN '+expr.when+' THEN '+expr.value+' END)';
const anyOf=(dialect,col)=>dialect==='clickhouse'?'any('+col+')':'MIN('+col+')';
const str=(dialect,expr)=>dialect==='clickhouse'?'toString('+expr+')':dialect==='bigquery'?'CAST('+expr+' AS STRING)':dialect==='mysql'?'CAST('+expr+' AS CHAR)':'CAST('+expr+' AS TEXT)';

// The event names of the period and how many players sent each.
function events(t,{dialect,from,to,limit=300}){
 const time=ts(dialect,t.time,t.timeKind);
 return 'SELECT '+quote(dialect,t.event)+' AS event_name, COUNT(DISTINCT '+quote(dialect,t.user)+') AS players\nFROM '+quote(dialect,t.table)+
  '\nWHERE '+time+' >= '+at(dialect,from)+' AND '+time+' < '+at(dialect,nextDay(to))+
  '\nGROUP BY '+quote(dialect,t.event)+'\nORDER BY players DESC\nLIMIT '+limit;
}

// The funnel query. `segment` is 'platform' | 'country' | 'version' | null (needs that column).
function funnel(t,{dialect,from,to,steps,segment=null}){
 if(!seconds(dialect,'a','b'))throw Error('Этот диалект SQL не поддерживается для воронок.');
 const time=ts(dialect,t.time,t.timeKind),ev=quote(dialect,t.event),user=quote(dialect,t.user);
 const segCol=segment&&t[segment]?quote(dialect,t[segment]):null;
 const names=steps.map(s=>literal(s.event));
 const lines=[];
 // u: per player the first time of each step event in the period (+ the segment value).
 lines.push('WITH u AS (\n SELECT '+user+' AS player'+(segCol?', '+anyOf(dialect,str(dialect,segCol))+' AS seg':'')+','+
  names.map((n,i)=>'\n  '+minimum(dialect,{when:ev+' = '+n,value:time})+' AS t'+(i+1)).join(',')+
  '\n FROM '+quote(dialect,t.table)+'\n WHERE '+time+' >= '+at(dialect,from)+' AND '+time+' < '+at(dialect,nextDay(to))+' AND '+ev+' IN ('+[...new Set(names)].join(', ')+')\n GROUP BY '+user+'\n)');
 // r1..rN: the moment each step was reached, only when the previous one was reached no later.
 let prev='u';
 lines.push(', r1 AS (SELECT u.*, t1 AS r_1 FROM u WHERE t1 IS NOT NULL)');prev='r1';
 for(let k=2;k<=steps.length;k++){lines.push(', r'+k+' AS (SELECT '+prev+'.*, CASE WHEN t'+k+' >= r_'+(k-1)+' THEN t'+k+' END AS r_'+k+' FROM '+prev+')');prev='r'+k;}
 const bucket=d=>'CASE '+BUCKETS.slice(1).map((b,i)=>'WHEN '+d+' < '+b+' THEN '+i).join(' ')+' ELSE '+(BUCKETS.length-1)+' END';
 const arms=[];
 const segExpr=segCol?str(dialect,'COALESCE(seg, \'\')'):null;
 arms.push("SELECT '__all__' AS seg, 1 AS step, -1 AS bucket, COUNT(*) AS users FROM "+prev);
 for(let k=2;k<=steps.length;k++)arms.push("SELECT '__all__' AS seg, "+k+' AS step, '+bucket('d')+' AS bucket, COUNT(*) AS users FROM (SELECT '+seconds(dialect,'r_'+(k-1),'r_'+k)+' AS d FROM '+prev+' WHERE r_'+k+' IS NOT NULL) d'+k+' GROUP BY 3');
 if(segExpr)for(let k=1;k<=steps.length;k++)arms.push('SELECT '+segExpr+' AS seg, '+k+' AS step, -1 AS bucket, COUNT(*) AS users FROM '+prev+(k>1?' WHERE r_'+k+' IS NOT NULL':'')+' GROUP BY 1');
 lines.push('SELECT seg, step, bucket, users FROM (\n'+arms.join('\nUNION ALL\n')+'\n) x\nORDER BY CASE WHEN seg = \'__all__\' THEN 0 ELSE 1 END, step, users DESC');
 return lines.join('\n');
}
// Result rows of `funnel` by column name → [{seg, step, bucket, users}].
function rows(result){
 const idx=n=>(result.columns||[]).findIndex(c=>String(c.name).toLowerCase()===n);
 const [a,b,c,d]=['seg','step','bucket','users'].map(idx);
 if([a,b,c,d].some(i=>i<0))throw Error('Ответ базы не похож на результат воронки.');
 return (result.rows||[]).map(r=>({seg:r[a]===null?'':String(r[a]),step:Number(r[b]),bucket:Number(r[c]),users:Number(r[d])}));
}
function eventRows(result){
 const n=(result.columns||[]).findIndex(c=>/event/i.test(c.name)),p=(result.columns||[]).findIndex(c=>/player|users|cnt|count/i.test(c.name));
 return (result.rows||[]).map(r=>({name:String(r[n<0?0:n]??''),users:Number(r[p<0?1:p])||0})).filter(e=>e.name);
}
module.exports={detect,timeKind,events,funnel,rows,eventRows,quote,COLS};
