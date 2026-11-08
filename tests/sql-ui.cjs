// «SQL по словам» cards in the real chat: a query waiting for «Выполнить» with its cost gauge, results drawn as a line
// chart, bars and a big number above the table, a refused query, and the schema cards (tables with sizes, one table).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const conn={id:'c1',name:'Аналитика',kind:'clickhouse',dialect:'clickhouse',label:'Аналитика · ClickHouse'};
 const bqConn={id:'c2',name:'Firebase',kind:'bigquery',dialect:'bigquery',label:'Firebase · BigQuery'};
 const pending={id:'q1',state:'pending',question:'Сколько игроков дошли до 10 уровня за неделю',connection:conn,
  sql:"SELECT uniqExact(user_id) AS players\nFROM events\nWHERE event = 'level_up' AND level >= 10\n  AND event_date >= today() - 7\nLIMIT 500",
  explanation:'Считает уникальных игроков, получивших 10-й уровень за последние 7 дней.',assumptions:['«дошли до 10 уровня» — событие level_up с level ≥ 10','неделя — последние 7 дней, включая сегодня'],
  limited:true,limit:500,estimate:{kind:'rows',value:2300000,tables:1,of:125000000},at:Date.now()};
 const days=Array.from({length:14},(_,i)=>new Date(Date.UTC(2026,9,27+i)).toISOString().slice(0,10));
 const line={id:'q2',state:'done',question:'DAU по дням за две недели',connection:{id:'p',name:'Склад',kind:'postgres',dialect:'postgres',label:'Склад · PostgreSQL'},
  sql:'SELECT day, dau, payers FROM stats.daily WHERE day >= current_date - 14 ORDER BY day\nLIMIT 500',explanation:'DAU и платящие по дням.',assumptions:[],limited:true,limit:500,estimate:{kind:'rows',value:14,cost:12.4},
  result:{columns:[{name:'day',type:'date'},{name:'dau',type:'int4'},{name:'payers',type:'int4'}],rows:days.map((d,i)=>[d,1200+Math.round(180*Math.sin(i/2))+i*15,90+i*3]),total:14,kept:14,truncated:false,elapsedMs:38,bytesRead:0,
   chart:{type:'line',x:days,series:[{column:1,points:days.map((d,i)=>({x:d,y:1200+Math.round(180*Math.sin(i/2))+i*15}))},{column:2,points:days.map((d,i)=>({x:d,y:90+i*3}))}]}},at:Date.now()};
 const bars={id:'q3',state:'done',autoRun:true,question:'Топ стран по платежам',connection:bqConn,sql:'SELECT country, ROUND(SUM(usd), 2) AS revenue\nFROM purchases\nGROUP BY country\nORDER BY revenue DESC\nLIMIT 500',
  explanation:'Сумма платежей в долларах по странам.',assumptions:['страна — из профиля покупателя'],limited:true,limit:500,estimate:{kind:'bytes',value:314572800,limit:2*1024**3},
  result:{columns:[{name:'country',type:'STRING'},{name:'revenue',type:'FLOAT'}],rows:[['US',15200.5],['DE',8800],['BR',4100.25],['JP',3900],['<img src=x onerror=alert(1)>',120]],total:5,kept:5,truncated:false,elapsedMs:1840,bytesRead:314572800,
   chart:{type:'bars',column:1,bars:[{label:'US',value:15200.5},{label:'DE',value:8800},{label:'BR',value:4100.25},{label:'JP',value:3900},{label:'<img src=x onerror=alert(1)>',value:120}]}},at:Date.now()};
 const number={id:'q4',state:'done',question:'Сколько платящих за вчера',connection:conn,sql:'SELECT uniqExact(user_id) AS payers FROM payments WHERE event_date = yesterday()\nLIMIT 500',explanation:'',assumptions:[],limited:true,limit:500,
  estimate:{kind:'rows',value:41000,tables:1},result:{columns:[{name:'payers',type:'UInt64'}],rows:[[4182]],total:1,kept:1,truncated:false,elapsedMs:120,bytesRead:910000,chart:{type:'number',value:4182,column:0}},at:Date.now()};
 const rejected={id:'q5',state:'rejected',question:'SQL-запрос: события за вчера',connection:conn,sql:'SELECT * FROM events; DROP TABLE events',explanation:'',assumptions:[],error:'В запросе несколько команд через «;». Нужен один запрос SELECT.',at:Date.now()};
 const tables={connection:conn,database:'game',total:3,tables:[{name:'events',comment:'События клиента',rows:125000000,columns:14,names:['event_date','user_id','level','event','platform','app_version','country','session_id']},
  {name:'payments',comment:'Платежи',rows:2400000,columns:6,names:['user_id','country','amount_usd','product','store','ts']},{name:'levels',comment:'',rows:120,columns:4,names:['level','name','difficulty','reward']}]};
 const table={connection:conn,database:'game',table:{name:'events',comment:'События клиента, одна строка на событие',rows:125000000,columns:[{name:'event_date',type:'Date',comment:'день события (UTC)'},{name:'user_id',type:'UInt64',comment:''},{name:'level',type:'UInt16',comment:'достигнутый уровень'},{name:'event',type:'LowCardinality(String)',comment:'level_up, purchase, session_start…'}]}};
 const msg=(text,data)=>({role:'assistant',text,by:'SQL по словам',extensionData:data});
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'Сколько игроков дошли до 10 уровня за неделю?'},msg('Запрос готов.',{sqlQuery:pending}),msg('Готово.',{sqlQuery:line}),msg('Готово.',{sqlQuery:bars}),msg('Ответ.',{sqlQuery:number}),msg('Не прошёл проверку.',{sqlQuery:rejected}),msg('Таблицы.',{sqlSchema:tables}),msg('Таблица.',{sqlSchema:table})])},'SQL')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.sql-card').length===7"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.sql-card').length"),7);
 assert.equal(await js("document.querySelector('.sql-card[data-sql-id=\"q1\"] .kit-actions button.primary').textContent"),'Выполнить');
 assert.equal(await js("document.querySelectorAll('.sql-card[data-sql-id=\"q1\"] .sql-code .sql-k').length>5"),true,'keywords are highlighted');
 assert.equal(await js("document.querySelector('.sql-card[data-sql-id=\"q1\"] .sql-code').textContent"),pending.sql,'the SQL is shown exactly');
 assert.equal(await js("!!document.querySelector('.sql-card[data-sql-id=\"q1\"] .sql-gauge')"),true);
 assert.equal(await js("document.querySelectorAll('.sql-card[data-sql-id=\"q2\"] svg polyline').length"),2,'two series');
 assert.equal(await js("document.querySelectorAll('.sql-card[data-sql-id=\"q3\"] .sql-bar-row').length"),5);
 assert.equal(await js("document.querySelectorAll('.sql-card img').length"),0,'result text is never HTML');
 assert.equal(await js("document.querySelector('.sql-card[data-sql-id=\"q4\"] .sql-number strong').textContent.replace(/\\s/g,'')"),'4182');
 assert.equal(await js("document.querySelector('.sql-card[data-sql-id=\"q5\"] .kit-actions').textContent.includes('Выполнить')"),false,'a refused query cannot run');
 assert.equal(await js("document.querySelectorAll('.sql-table-row').length"),3);
 assert.equal(await js("document.querySelectorAll('.sql-col').length"),4);
 assert.equal(await js("document.querySelector('.sql-card[data-sql-id=\"q2\"] .kit-table').closest('[data-no-i18n]')!==null"),true,'result values are not translated');
 await require('./card-shot.cjs')(win,'.sql-card[data-sql-id="q1"]','petya-sql');
 await require('./card-shot.cjs')(win,'.sql-card[data-sql-id="q2"]','petya-sql-line');
 await require('./card-shot.cjs')(win,'.sql-card[data-sql-id="q3"]','petya-sql-bars');
 await require('./card-shot.cjs')(win,'.sql-card[data-sql-id="q4"],.sql-card[data-sql-id="q5"],.sql-schema','petya-sql-schema');
 console.log('SQL cards: pending query with cost gauge, line/bars/number charts with tables, refused query, schema list and table passed');
}};
require('../src/main.cjs');
