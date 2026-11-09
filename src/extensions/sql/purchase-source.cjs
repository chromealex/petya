// A purchases table of a connected database as a «purchase-source» (src/features/purchase-sources.cjs) for «Покупки в
// игре». The table is found in the cached schema by its columns (buyer, time, product, price; currency, refund flag,
// platform when present); the query is written by code for the connection's dialect, passes this app's read-only
// check (validate.cjs) and is shown on the card — the source has `confirm`, so it runs only after «Выполнить».
// One query returns several parts in one shape (part, d, product, currency, platform, refund, units, amount, payers):
//  sales        — per day, product, currency, platform and refund flag: purchases and the amount;
//  payers_day   — distinct buyers per day;           payers_cur — distinct buyers and amount per currency;
//  payers_total — distinct buyers of the period;     new_payers — buyers whose first purchase ever is in the period;
//  first_product — the product of those first purchases.
// Distinct buyers are counted by the database (they cannot be added up from rows).
const V=require('./validate.cjs');
const S=require('./schema.cjs');
const C=require('./connections.cjs');
const COLS={
 user:/^(?:user_?id|player_?id|uid|user_pseudo_id|appmetrica_device_id|device_?id|account_?id|profile_?id|customer_?id|buyer_?id)$/i,
 time:/^(?:purchase_?(?:time|date|ts|at|timestamp)|purchased_?at|paid_?at|event_?time|event_?timestamp|ts|timestamp|time|created_?at|datetime|order_?time|transaction_?(?:time|date))$/i,
 product:/^(?:product_?id|product_?sku|sku|product|item_?id|item|offer_?id|bundle_?id|pack_?id)$/i,
 amount:/^(?:price(?:_usd|_local)?|amount(?:_usd|_local)?|revenue(?:_usd)?|value(?:_usd)?|sum|paid|price_?paid|gross)$/i,
 currency:/^(?:currency|currency_?code|price_?currency|currency_?iso)$/i,
 refund:/^(?:is_?refund(?:ed)?|refund(?:ed)?|status|state|kind|type|transaction_?type)$/i,
 platform:/^(?:platform|os|os_?name|store)$/i
};
const pick=(cols,re,avoid=[])=>cols.find(c=>re.test(c.name)&&!avoid.includes(c.name))||null;
function detect(schema){
 let best=null;
 for(const t of schema?.tables||[]){
  const cols=t.columns||[];
  const user=pick(cols,COLS.user),time=pick(cols,COLS.time),product=pick(cols,COLS.product),amount=pick(cols,COLS.amount);
  if(!user||!time||!product||!amount)continue;
  let score=4+(/purchase|payment|transaction|iap|order|покуп|платеж/i.test(t.name)?3:0);
  const currency=pick(cols,COLS.currency),refund=pick(cols,COLS.refund,[product.name]),platform=pick(cols,COLS.platform);
  score+=(currency?1:0)+(refund?0.5:0)+(platform?0.5:0);
  if(!best||score>best.score){
   const hint=/usd/i.test(amount.name)?'USD':/rub/i.test(amount.name)?'RUB':/eur/i.test(amount.name)?'EUR':'';
   best={score,table:t.name,user:user.name,time:time.name,timeKind:kind(time),product:product.name,amount:amount.name,currency:currency?.name||null,currencyHint:hint,
    refund:refund?.name||null,refundType:refund?(/bool|int|num/i.test(refund.type||'')?'number':'text'):null,platform:platform?.name||null};
  }
 }
 if(!best)return null;
 const {score,...out}=best;return out;
}
function kind(col){
 if(!/int|long|number|numeric|decimal/i.test(String(col.type||'')))return 'timestamp';
 if(/micro|_us$/i.test(col.name)||/^event_timestamp$/i.test(col.name))return 'micros';
 if(/milli|_ms$/i.test(col.name))return 'millis';
 return 'seconds';
}
const quote=(dialect,name)=>String(name).split('.').map(p=>dialect==='postgres'?'"'+p.replace(/"/g,'""')+'"':'`'+p.replace(/`/g,'')+'`').join('.');
function ts(dialect,col,k){
 const c=quote(dialect,col);if(k==='timestamp')return c;
 const f={clickhouse:{seconds:'toDateTime('+c+')',millis:'fromUnixTimestamp64Milli(toInt64('+c+'))',micros:'fromUnixTimestamp64Micro(toInt64('+c+'))'},
  postgres:{seconds:'to_timestamp('+c+')',millis:'to_timestamp('+c+' / 1000.0)',micros:'to_timestamp('+c+' / 1000000.0)'},
  bigquery:{seconds:'TIMESTAMP_SECONDS('+c+')',millis:'TIMESTAMP_MILLIS('+c+')',micros:'TIMESTAMP_MICROS('+c+')'},
  mysql:{seconds:'FROM_UNIXTIME('+c+')',millis:'FROM_UNIXTIME('+c+' / 1000)',micros:'FROM_UNIXTIME('+c+' / 1000000)'}};
 return f[dialect]?.[k]||c;
}
const at=(dialect,date)=>dialect==='bigquery'?"TIMESTAMP('"+date+" 00:00:00+00')":dialect==='postgres'?"TIMESTAMP '"+date+" 00:00:00'":"'"+date+" 00:00:00'";
const nextDay=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const str=(dialect,e)=>dialect==='clickhouse'?'toString('+e+')':dialect==='bigquery'?'CAST('+e+' AS STRING)':dialect==='mysql'?'CAST('+e+' AS CHAR)':'CAST('+e+' AS TEXT)';
const dateOf=(dialect,e)=>({clickhouse:'toString(toDate('+e+'))',postgres:"to_char("+e+", 'YYYY-MM-DD')",bigquery:"FORMAT_DATE('%F', DATE("+e+'))',mysql:"DATE_FORMAT("+e+", '%Y-%m-%d')"})[dialect];
const num=(dialect,e)=>dialect==='bigquery'?'CAST('+e+' AS FLOAT64)':dialect==='clickhouse'?'toFloat64('+e+')':dialect==='mysql'?'CAST('+e+' AS DECIMAL(20,4))':'CAST('+e+' AS DOUBLE PRECISION)';
const distinct=(dialect,e)=>dialect==='clickhouse'?'uniqExact('+e+')':'COUNT(DISTINCT '+e+')';

// The query of one period. `t` is detect()'s answer.
function build(t,{dialect,start,end}){
 if(!dateOf(dialect,'x'))throw Error('Этот диалект SQL не поддерживается.');
 const time=ts(dialect,t.time,t.timeKind),amount=num(dialect,quote(dialect,t.amount));
 const refundFlag=t.refund?(t.refundType==='number'?'CAST('+quote(dialect,t.refund)+' AS '+(dialect==='bigquery'?'INT64':dialect==='clickhouse'?'Int64':dialect==='mysql'?'SIGNED':'INTEGER')+') = 1':
  'LOWER('+str(dialect,quote(dialect,t.refund))+") IN ('refund', 'refunded', 'chargeback', 'reversed', 'true', '1', 'yes')"):'1 = 0';
 const currency=t.currency?str(dialect,quote(dialect,t.currency)):"'"+(t.currencyHint||'')+"'";
 const platform=t.platform?str(dialect,quote(dialect,t.platform)):"''";
 const lines=[];
 lines.push('WITH p AS (\n SELECT '+quote(dialect,t.user)+' AS buyer, '+time+' AS at, '+dateOf(dialect,time)+' AS d, '+str(dialect,quote(dialect,t.product))+' AS product, '+currency+' AS currency, '+platform+' AS platform,\n  CASE WHEN '+refundFlag+' OR '+amount+' < 0 THEN 1 ELSE 0 END AS refund, '+amount+' AS amount\n FROM '+quote(dialect,t.table)+
  '\n WHERE '+time+' >= '+at(dialect,start)+' AND '+time+' < '+at(dialect,nextDay(end))+'\n)');
 // First purchase ever of the period's buyers (refunds excluded).
 lines.push(', f AS (\n SELECT '+quote(dialect,t.user)+' AS buyer, MIN('+time+') AS first_at\n FROM '+quote(dialect,t.table)+'\n WHERE '+quote(dialect,t.user)+' IN (SELECT buyer FROM p WHERE refund = 0)'+(t.refund?' AND NOT ('+refundFlag+')':'')+'\n GROUP BY '+quote(dialect,t.user)+'\n)');
 const z="''",o='0';
 const arms=[
  "SELECT 'sales' AS part, d, product, currency, platform, refund, COUNT(*) AS units, SUM(CASE WHEN amount < 0 THEN -amount ELSE amount END) AS amount, "+o+' AS payers FROM p GROUP BY d, product, currency, platform, refund',
  "SELECT 'payers_day' AS part, d, "+z+' AS product, '+z+' AS currency, '+z+' AS platform, 0 AS refund, 0 AS units, 0 AS amount, '+distinct(dialect,'buyer')+' AS payers FROM p WHERE refund = 0 GROUP BY d',
  "SELECT 'payers_cur' AS part, "+z+' AS d, '+z+' AS product, currency, '+z+' AS platform, 0 AS refund, 0 AS units, SUM(amount) AS amount, '+distinct(dialect,'buyer')+' AS payers FROM p WHERE refund = 0 GROUP BY currency',
  "SELECT 'payers_total' AS part, "+z+' AS d, '+z+' AS product, '+z+' AS currency, '+z+' AS platform, 0 AS refund, 0 AS units, 0 AS amount, '+distinct(dialect,'buyer')+' AS payers FROM p WHERE refund = 0',
  "SELECT 'new_payers' AS part, "+z+' AS d, '+z+' AS product, '+z+' AS currency, '+z+' AS platform, 0 AS refund, 0 AS units, 0 AS amount, COUNT(*) AS payers FROM f WHERE f.first_at >= '+at(dialect,start)+' AND f.first_at < '+at(dialect,nextDay(end)),
  "SELECT 'first_product' AS part, "+z+' AS d, p.product AS product, '+z+' AS currency, '+z+' AS platform, 0 AS refund, 0 AS units, 0 AS amount, '+distinct(dialect,'p.buyer')+' AS payers FROM p JOIN f ON p.buyer = f.buyer AND p.at = f.first_at WHERE p.refund = 0 GROUP BY p.product'
 ];
 lines.push('SELECT part, d, product, currency, platform, refund, units, amount, payers FROM (\n'+arms.join('\nUNION ALL\n')+'\n) x\nORDER BY CASE WHEN part = \'sales\' THEN 1 ELSE 0 END, d, amount DESC');
 return lines.join('\n');
}
// Result → {rows, payers} in the purchase-source shape.
function parse(result,{start,end}){
 const idx=n=>(result.columns||[]).findIndex(c=>String(c.name).toLowerCase()===n);
 const I=Object.fromEntries(['part','d','product','currency','platform','refund','units','amount','payers'].map(n=>[n,idx(n)]));
 if(Object.values(I).some(i=>i<0))throw Error('Ответ базы не похож на результат запроса покупок.');
 const rows=[],payers={total:0,newPayers:null,days:[],byCurrency:[],first:[]};
 for(const r of result.rows||[]){
  const v=k=>r[I[k]],n=k=>Number(v(k))||0;
  switch(String(v('part'))){
   case 'sales':rows.push({date:String(v('d')).slice(0,10),product:String(v('product')??''),currency:String(v('currency')??''),platform:String(v('platform')??''),kind:Number(v('refund'))?'refund':'purchase',units:n('units'),amount:n('amount')});break;
   case 'payers_day':payers.days.push({date:String(v('d')).slice(0,10),payers:n('payers')});break;
   case 'payers_cur':payers.byCurrency.push({currency:String(v('currency')??''),payers:n('payers'),amount:n('amount')});break;
   case 'payers_total':payers.total=n('payers');break;
   case 'new_payers':payers.newPayers=n('payers');break;
   case 'first_product':payers.first.push({product:String(v('product')??''),payers:n('payers')});break;
  }
 }
 return {rows:rows.filter(x=>x.date>=start&&x.date<=end),payers};
}

const sources=()=>require('./sources.cjs');
const maxRows=s=>Math.min(5000,Math.max(10,Number(s.settings.sqlMaxRows)||5000));
// The first connection whose schema (cached, or read now) has a purchases table.
async function target(s){
 let conns=[];try{conns=await sources().all(s);}catch{conns=[];}
 for(const conn of conns.slice(0,6)){
  let schema=S.cached(s.dataRoot,conn.id);
  if(!schema)try{const fresh=await sources().engine(s,conn).schema();schema=S.store(s.dataRoot,conn.id,{database:fresh.database||'',tables:(fresh.tables||[]).slice(0,2000),more:fresh.more||0});}catch{continue;}
  const table=detect(schema);if(table)return {conn,table};
 }
 return null;
}
module.exports={
 id:'sql-purchases',name:'База (SQL)',confirm:true,maxDays:365,
 names:[/(?:^|[^\p{L}])(?:sql|clickhouse|bigquery|postgres(?:ql)?|кликхаус\p{L}*|бигквери|постгрес\p{L}*)(?=$|[^\p{L}])|баз\p{L}* данных/iu],
 ready:settings=>settings.extension_sql==='true'&&C.connected(settings),
 hint:()=>'Таблица покупок в базе «SQL по словам» (игрок, время, продукт, цена)',
 async plan(s,{start,end}){
  const t=await target(s);if(!t)return null;
  const sql=V.check(build(t.table,{dialect:t.conn.dialect,start,end}),{dialect:t.conn.dialect,maxRows:maxRows(s)}).sql;
  let estimate={kind:'unknown'};try{estimate=await sources().engine(s,t.conn).estimate(sql);}catch(e){estimate={kind:'unknown',note:e.message};}
  return {sql,connection:{id:t.conn.id,name:t.conn.name,dialect:t.conn.dialect},table:t.table.table,currency:t.table.currency?'':t.table.currencyHint||'',estimate};
 },
 // Runs only the confirmed plan (re-checked here), never a new text.
 async fetch(s,{start,end,plan,check=()=>{}}){
  const conn=(await sources().all(s)).find(c=>c.id===plan?.connection?.id);
  if(!conn)throw Error('Подключение к базе удалено или отключено.');
  const sql=V.check(plan.sql,{dialect:conn.dialect,maxRows:maxRows(s)}).sql;
  check();
  const result=await sources().engine(s,conn).run(sql,{maxRows:maxRows(s)});
  const out=parse(result,{start,end});
  return {...out,truncated:!!result.truncated,notes:[...(out.rows.some(r=>!r.currency)?['В таблице покупок нет валюты: суммы показаны «в валюте таблицы».']:[])]};
 },
 detect,build,parse,target
};
