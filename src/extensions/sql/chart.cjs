// Which chart fits a result, decided by its shape (the card draws it):
// - one row with one number → a big number;
// - a date/time column and 1–4 number columns over ≥2 rows → lines over time (sorted by time);
// - a text column and one number column over 2–50 rows → horizontal bars (largest first, top 15);
// - anything else → the table alone.
const DATE=/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const TIME_TYPE=/date|time/i,NUM_TYPE=/^(?:nullable\()?(?:u?int|float|decimal|numeric|double|real|bigint|smallint|integer|int\d|float\d|bignumeric|money)/i;

function kind(column,rows,index){
 const values=rows.map(r=>r[index]).filter(v=>v!==null&&v!==undefined&&v!=='');
 if(!values.length)return 'empty';
 if(TIME_TYPE.test(column.type||'')&&values.every(v=>typeof v==='string'&&DATE.test(v)||typeof v==='number'))return 'time';
 if(values.every(v=>typeof v==='string'&&DATE.test(v)))return 'time';
 if(values.every(v=>typeof v==='number'&&Number.isFinite(v)))return 'number';
 if(NUM_TYPE.test(column.type||'')&&values.every(v=>Number.isFinite(Number(v))))return 'number';
 return 'text';
}
function detect(columns,rows){
 if(!Array.isArray(columns)||!Array.isArray(rows)||!rows.length||!columns.length)return null;
 const kinds=columns.map((c,i)=>kind(c,rows,i));
 const numbers=kinds.map((k,i)=>k==='number'?i:-1).filter(i=>i>=0);
 if(rows.length===1&&numbers.length===1&&columns.length<=2)return {type:'number',value:numbers[0],label:kinds.findIndex(k=>k==='text')};
 const time=kinds.indexOf('time');
 if(time>=0&&rows.length>=2&&numbers.length>=1){
  const ys=numbers.filter(i=>i!==time).slice(0,4);
  const text=kinds.findIndex(k=>k==='text');
  // «date, country, value» (long format) is drawn as one line per category, up to 5 categories.
  if(ys.length===1&&text>=0){
   const groups=[...new Set(rows.map(r=>String(r[text])))];
   if(groups.length<=5)return {type:'line',x:time,ys,series:text};
   return null;
  }
  if(ys.length&&text<0)return {type:'line',x:time,ys};
  if(ys.length)return {type:'line',x:time,ys};
 }
 const text=kinds.indexOf('text');
 if(text>=0&&numbers.length>=1&&rows.length>=2&&rows.length<=50&&kinds.filter(k=>k==='text').length===1)return {type:'bars',x:text,y:numbers[0]};
 return null;
}
// Points for the card: lines sorted by time; bars sorted by value, top 15.
function points(chart,rows){
 if(!chart)return null;
 const num=v=>Number(v);
 if(chart.type==='line'){
  const sorted=[...rows].sort((a,b)=>String(a[chart.x]).localeCompare(String(b[chart.x])));
  if(chart.series!==undefined){
   const names=[...new Set(sorted.map(r=>String(r[chart.series])))];
   return {type:'line',x:[...new Set(sorted.map(r=>String(r[chart.x])))],series:names.map(name=>({name,points:sorted.filter(r=>String(r[chart.series])===name).map(r=>({x:String(r[chart.x]),y:num(r[chart.ys[0]])}))}))};
  }
  return {type:'line',x:sorted.map(r=>String(r[chart.x])),series:chart.ys.map(i=>({column:i,points:sorted.map(r=>({x:String(r[chart.x]),y:num(r[i])}))}))};
 }
 if(chart.type==='bars')return {type:'bars',bars:[...rows].map(r=>({label:String(r[chart.x]??'—'),value:num(r[chart.y])})).sort((a,b)=>b.value-a.value).slice(0,15),column:chart.y};
 if(chart.type==='number')return {type:'number',value:num(rows[0][chart.value]),column:chart.value};
 return null;
}
module.exports={detect,points,kind,DATE};
