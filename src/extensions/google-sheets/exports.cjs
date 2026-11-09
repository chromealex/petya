// Tables other apps' cards hand over for «Выгрузить в Google Таблицы» (cross-app kind `spreadsheet-export`), kept
// in memory until the chat turn turns them into an export card. Nothing is written here: the card shows a preview,
// the user picks the destination and confirms.
const {randomBytes}=require('node:crypto');
const TTL=2*3600000,MAX_ROWS=2000,MAX_COLS=40,MAX_CELL=5000;
const pending=new Map();

function value(v){
 if(v===null||v===undefined)return '';
 if(typeof v==='number')return Number.isFinite(v)?v:'';
 if(typeof v==='boolean')return v;
 return String(v).slice(0,MAX_CELL);
}
const text=(v,n)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
// payload: {title, sheet?, app?, header:[...], rows:[[...]]} → a clean table or an error.
function clean(payload){
 const header=(Array.isArray(payload?.header)?payload.header:[]).slice(0,MAX_COLS).map(h=>text(h,200));
 const rows=(Array.isArray(payload?.rows)?payload.rows:[]).filter(Array.isArray);
 if(!rows.length)throw Error('Нет данных для выгрузки.');
 const width=Math.min(MAX_COLS,Math.max(header.length,...rows.slice(0,MAX_ROWS).map(r=>r.length)));
 const title=text(payload?.title,100)||'Выгрузка Пети';
 return {title,sheet:text(payload?.sheet,100)||title.slice(0,100),app:text(payload?.app,60),header:header.length?[...header,...Array(width-header.length).fill('')]:[],
  rows:rows.slice(0,MAX_ROWS).map(r=>Array.from({length:width},(_,i)=>value(r[i]))),total:rows.length,truncated:rows.length>MAX_ROWS};
}
function put(payload,now=Date.now()){
 for(const [k,v] of pending)if(now-v.at>TTL)pending.delete(k);
 const id=randomBytes(4).toString('hex');
 pending.set(id,{...clean(payload),at:now});
 return id;
}
function take(id,now=Date.now()){const v=pending.get(String(id||''));if(!v||now-v.at>TTL)return null;pending.delete(String(id));return v;}
module.exports={put,take,clean,MAX_ROWS,MAX_COLS,_pending:pending};
