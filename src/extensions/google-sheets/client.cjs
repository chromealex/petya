// Google Sheets API v4 client (https://developers.google.com/sheets/api/reference/rest).
// Reads: spreadsheets.get (title, tabs, grid size, frozen rows), values.get / values.batchGet (FORMATTED_VALUE for
// display, UNFORMATTED_VALUE for numbers). Writes: values.batchUpdate, values.append, spreadsheets.create and
// spreadsheets.batchUpdate (addSheet), always with valueInputOption=RAW so text that looks like a formula stays text.
// Every write is called only from a card button the user pressed, after a preview of the exact cells.
// `request(url, options)` is Petya's HTTP helper (JSON in, JSON out, errors carry `status` and `detail`).
const ROOT='https://sheets.googleapis.com/v4/spreadsheets';
const {read:READ,write:WRITE}=require('../../google-workspace.cjs').SCOPES.sheets;
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const MAX_TITLE=100;

// A spreadsheet link → {id, gid}. Accepts /d/<id>/edit#gid=…, ?gid=…, /u/1/d/<id>, a bare id is not guessed.
function parseUrl(text){
 const m=/https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,100})(?:\/[^\s#?]*)?(?:\?[^\s#]*)?(?:#[^\s]*)?/u.exec(String(text||''));
 if(!m)return null;
 const gid=/[#?&]gid=(\d{1,12})/.exec(m[0]);
 return {id:m[1],gid:gid?Number(gid[1]):null,url:m[0]};
}
const sheetUrl=(id,gid)=>'https://docs.google.com/spreadsheets/d/'+id+'/edit'+(Number.isInteger(gid)?'#gid='+gid:'');
// A1 notation: a tab name is always quoted ('' escapes a quote), columns are letters from 0.
const quote=title=>"'"+String(title).replace(/'/g,"''")+"'";
function letters(n){let s='';n=Math.floor(n);do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
function columnIndex(text){let n=0;for(const ch of String(text).toUpperCase()){const c=ch.charCodeAt(0)-64;if(c<1||c>26)return -1;n=n*26+c;}return n-1;}
const cell=(row,col)=>letters(col)+(row+1);
const range=(sheet,fromRow,fromCol,toRow,toCol)=>quote(sheet)+'!'+cell(fromRow,fromCol)+(toRow===undefined?'':':'+cell(toRow,toCol));
// 'Юниты'!B5 → {sheet:'Юниты', row:4, col:1}
function parseCell(ref){
 const m=/^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]{1,3})(\d{1,7})$/.exec(String(ref||''));
 if(!m)return null;
 return {sheet:(m[1]??m[2]).replace(/''/g,"'"),col:columnIndex(m[3]),row:Number(m[4])-1};
}

// Service answers in the user's words: access, missing tab, quota; the status stays on the error.
function explain(error){
 const detail=String(error?.detail||'');let text=error?.message||'Google Таблицы недоступны.';
 if(error?.status===401)text='Google не принял вход для Google Таблиц. Подключите доступ заново в настройках «Google Таблицы».';
 else if(error?.status===403)text=/insufficient|scope/i.test(detail)?'Не хватает разрешения Google на это действие с таблицами. Разрешите его в настройках «Google Таблицы».':/has not been used|is disabled|SERVICE_DISABLED/i.test(detail)?'В проекте Google Cloud не включён Google Sheets API. Включите его (APIs & Services → Library → Google Sheets API) и повторите.':'Нет доступа к этой таблице. Поделитесь ею с подключённым аккаунтом или с адресом сервисного аккаунта.';
 else if(error?.status===404)text='Google не нашёл эту таблицу. Проверьте ссылку и доступ.';
 else if(error?.status===400&&/Unable to parse range|not found/i.test(detail))text='В таблице нет такого листа или диапазона.';
 else if(error?.status===400&&/already exists/i.test(detail))text='Лист с таким названием уже есть. Выберите другое название.';
 else if(error?.status===429)text='Google Таблицы временно ограничили запросы. Повторите через минуту.';
 const e=Error(text);e.status=error?.status;e.detail=detail;e.cause=error;
 // No answer at all: a write may or may not have happened.
 if(!error?.status&&error?.name!=='InputRequired')e.unknown=true;
 return e;
}

class SheetsClient{
 constructor({request,token}){this.request=request;this.token=token;}
 async call(path,{method='GET',query,body}={}){
  const access=await this.token();
  const q=query?'?'+query.toString():'';
  try{return await this.request(ROOT+path+q,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{},timeoutMs:60000});}
  catch(e){throw explain(e);}
 }
 static path(id){if(!ID.test(String(id)))throw Error('Неверный ID таблицы.');return '/'+id;}
 // Title, tabs with their grid size and frozen rows/columns; no cell data.
 async meta(id){
  const r=await this.call(SheetsClient.path(id),{query:new URLSearchParams({fields:'spreadsheetId,spreadsheetUrl,properties(title,locale),sheets.properties(sheetId,title,index,sheetType,hidden,gridProperties)'})});
  const sheets=(r?.sheets||[]).map(x=>x.properties||{}).filter(p=>(p.sheetType||'GRID')==='GRID'&&typeof p.title==='string').map(p=>({id:Number(p.sheetId)||0,title:p.title.slice(0,MAX_TITLE),index:Number(p.index)||0,hidden:!!p.hidden,
   rows:Number(p.gridProperties?.rowCount)||0,cols:Number(p.gridProperties?.columnCount)||0,frozenRows:Number(p.gridProperties?.frozenRowCount)||0,frozenCols:Number(p.gridProperties?.frozenColumnCount)||0})).sort((a,b)=>a.index-b.index);
  return {id:String(r?.spreadsheetId||id),title:String(r?.properties?.title||'Таблица').slice(0,200),locale:String(r?.properties?.locale||''),url:sheetUrl(id),sheets};
 }
 async values(id,a1,render='FORMATTED_VALUE'){
  const r=await this.call(SheetsClient.path(id)+'/values/'+encodeURIComponent(a1),{query:new URLSearchParams({valueRenderOption:render,majorDimension:'ROWS',dateTimeRenderOption:'FORMATTED_STRING'})});
  return Array.isArray(r?.values)?r.values:[];
 }
 async batchGet(id,ranges,render='FORMATTED_VALUE'){
  if(!ranges.length)return [];
  const q=new URLSearchParams({valueRenderOption:render,majorDimension:'ROWS',dateTimeRenderOption:'FORMATTED_STRING'});
  for(const r of ranges)q.append('ranges',r);
  const r=await this.call(SheetsClient.path(id)+'/values:batchGet',{query:q});
  return (r?.valueRanges||[]).map(v=>Array.isArray(v.values)?v.values:[]);
 }
 // data: [{range, values:[[...]]}] → total updated cells.
 async update(id,data){
  const r=await this.call(SheetsClient.path(id)+'/values:batchUpdate',{method:'POST',body:{valueInputOption:'RAW',data:data.map(d=>({range:d.range,majorDimension:'ROWS',values:d.values}))}});
  return {cells:Number(r?.totalUpdatedCells)||0};
 }
 async append(id,a1,rows){
  const r=await this.call(SheetsClient.path(id)+'/values/'+encodeURIComponent(a1)+':append',{method:'POST',query:new URLSearchParams({valueInputOption:'RAW',insertDataOption:'INSERT_ROWS'}),body:{majorDimension:'ROWS',values:rows}});
  return {range:String(r?.updates?.updatedRange||''),cells:Number(r?.updates?.updatedCells)||0};
 }
 async create(title,sheet){
  const r=await this.call('',{method:'POST',body:{properties:{title:String(title).slice(0,MAX_TITLE)},sheets:[{properties:{title:String(sheet).slice(0,MAX_TITLE)}}]}});
  if(!ID.test(String(r?.spreadsheetId||'')))throw Error('Google не создал таблицу.');
  const first=r.sheets?.[0]?.properties;
  return {id:r.spreadsheetId,url:String(r.spreadsheetUrl||sheetUrl(r.spreadsheetId)),sheet:{id:Number(first?.sheetId)||0,title:String(first?.title||sheet)}};
 }
 async addSheet(id,title){
  const r=await this.call(SheetsClient.path(id)+':batchUpdate',{method:'POST',body:{requests:[{addSheet:{properties:{title:String(title).slice(0,MAX_TITLE)}}}]}});
  const p=r?.replies?.[0]?.addSheet?.properties;
  return {id:Number(p?.sheetId)||0,title:String(p?.title||title)};
 }
}
module.exports={SheetsClient,ROOT,READ,WRITE,ID,parseUrl,sheetUrl,quote,letters,columnIndex,cell,range,parseCell,explain};
