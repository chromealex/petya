// A local stand-in for the Google Sheets API v4 and Google's OAuth token endpoint, for unit tests without network.
// Spreadsheets live in memory as {id, title, sheets:[{id, title, rows:[[...]], frozen}]}; values.get/batchGet return
// FORMATTED_VALUE (numbers as text, «12,5» style when `ru`) or UNFORMATTED_VALUE (numbers stay numbers), writes
// change the cells. Every request is recorded. `request(url, options)` mimics Petya's main-process helper.
const http=require('node:http');

function col(letters){let n=0;for(const ch of letters)n=n*26+ch.charCodeAt(0)-64;return n-1;}
function parseRange(a1){
 const m=/^(?:'((?:[^']|'')+)'|([^!]+))(?:!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?)?$/.exec(a1);
 if(!m)return null;
 const sheet=(m[1]??m[2]).replace(/''/g,"'");
 if(!m[3])return {sheet,r1:0,c1:0,r2:999999,c2:999};
 return {sheet,r1:Number(m[4])-1,c1:col(m[3]),r2:m[5]?Number(m[6])-1:Number(m[4])-1,c2:m[5]?col(m[5]):col(m[3])};
}
function create({spreadsheets=[]}={}){
 const state={spreadsheets,requests:[],fail:null,nextSheet:500,nextBook:1};
 const book=id=>state.spreadsheets.find(b=>b.id===id);
 const formatted=v=>typeof v==='number'?String(v).replace('.',','):v===true?'TRUE':v===false?'FALSE':String(v??'');
 function read(b,a1,render){
  const r=parseRange(a1);const sh=b.sheets.find(s=>s.title===r?.sheet);if(!sh)return {error:[400,'Unable to parse range: '+a1]};
  const out=[];
  for(let i=r.r1;i<=Math.min(r.r2,sh.rows.length-1);i++){
   const row=(sh.rows[i]||[]).slice(r.c1,r.c2+1).map(v=>render==='UNFORMATTED_VALUE'?v:formatted(v));
   while(row.length&&(row.at(-1)===''||row.at(-1)===null||row.at(-1)===undefined))row.pop();
   out.push(row);
  }
  while(out.length&&!out.at(-1).length)out.pop();
  return {range:a1,majorDimension:'ROWS',...out.length?{values:out}:{}};
 }
 function write(b,a1,values){
  const r=parseRange(a1);const sh=b.sheets.find(s=>s.title===r?.sheet);if(!sh)return false;
  values.forEach((row,i)=>row.forEach((v,j)=>{const y=r.r1+i,x=r.c1+j;while(sh.rows.length<=y)sh.rows.push([]);sh.rows[y][x]=v;}));
  return true;
 }
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const url=new URL(req.url,'http://x');
  const entry={method:req.method,path:decodeURIComponent(url.pathname),query:Object.fromEntries(url.searchParams),ranges:url.searchParams.getAll('ranges'),auth:req.headers.authorization||'',body:body?(()=>{try{return JSON.parse(body);}catch{return body;}})():null};
  state.requests.push(entry);
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(state.fail){const f=state.fail;if(!f.match||f.match(entry)){if(f.once)state.fail=null;return send(f.status,{error:{code:f.status,message:f.message||'fail'}});}}
  if(entry.path==='/token')return send(200,{access_token:'sa-'+'token',expires_in:3600,token_type:'Bearer'});
  let m=/^\/v4\/spreadsheets\/([^/:]+)$/.exec(entry.path);
  if(m&&req.method==='GET'){const b=book(m[1]);if(!b)return send(404,{error:{code:404,message:'Requested entity was not found.'}});
   return send(200,{spreadsheetId:b.id,spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+b.id+'/edit',properties:{title:b.title,locale:'ru_RU'},
    sheets:b.sheets.map((s,i)=>({properties:{sheetId:s.id,title:s.title,index:i,sheetType:'GRID',...s.hidden?{hidden:true}:{},gridProperties:{rowCount:s.rowCount||Math.max(100,s.rows.length),columnCount:s.columnCount||26,...s.frozen?{frozenRowCount:s.frozen}:{},...s.frozenCols?{frozenColumnCount:s.frozenCols}:{}}}}))});}
  m=/^\/v4\/spreadsheets\/([^/:]+)\/values\/(.+?)(:append)?$/.exec(entry.path);
  if(m){const b=book(m[1]);if(!b)return send(404,{error:{code:404}});
   if(m[3]){const r=parseRange(m[2]);const sh=b.sheets.find(s=>s.title===r.sheet);const y=sh.rows.length;write(b,"'"+sh.title.replace(/'/g,"''")+"'!A"+(y+1),entry.body.values);return send(200,{updates:{updatedRange:sh.title+'!A'+(y+1),updatedCells:entry.body.values[0].length}});}
   const r=read(b,m[2],entry.query.valueRenderOption);if(r.error)return send(r.error[0],{error:{code:400,message:r.error[1]}});return send(200,r);}
  m=/^\/v4\/spreadsheets\/([^/:]+)\/values:batchGet$/.exec(entry.path);
  if(m){const b=book(m[1]);if(!b)return send(404,{error:{code:404}});const out=[];for(const a1 of entry.ranges){const r=read(b,a1,entry.query.valueRenderOption);if(r.error)return send(r.error[0],{error:{code:400,message:r.error[1]}});out.push(r);}return send(200,{spreadsheetId:b.id,valueRanges:out});}
  m=/^\/v4\/spreadsheets\/([^/:]+)\/values:batchUpdate$/.exec(entry.path);
  if(m){const b=book(m[1]);let cells=0;for(const d of entry.body.data){if(!write(b,d.range,d.values))return send(400,{error:{code:400,message:'Unable to parse range: '+d.range}});cells+=d.values.reduce((n,r)=>n+r.length,0);}return send(200,{totalUpdatedCells:cells});}
  m=/^\/v4\/spreadsheets\/([^/:]+):batchUpdate$/.exec(entry.path);
  if(m){const b=book(m[1]);const title=entry.body.requests[0].addSheet.properties.title;if(b.sheets.some(s=>s.title===title))return send(400,{error:{code:400,message:'A sheet with the name "'+title+'" already exists.'}});const sh={id:state.nextSheet++,title,rows:[]};b.sheets.push(sh);return send(200,{replies:[{addSheet:{properties:{sheetId:sh.id,title}}}]});}
  if(entry.path==='/v4/spreadsheets'&&req.method==='POST'){const id='NewBook'+(state.nextBook++)+'x'.repeat(20);const sh={id:0,title:entry.body.sheets[0].properties.title,rows:[]};state.spreadsheets.push({id,title:entry.body.properties.title,sheets:[sh]});return send(200,{spreadsheetId:id,spreadsheetUrl:'https://docs.google.com/spreadsheets/d/'+id+'/edit',sheets:[{properties:{sheetId:0,title:sh.title}}]});}
  send(404,{error:{code:404,message:'no route '+entry.path}});
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{
  const base='http://127.0.0.1:'+server.address().port;
  // Petya's request helper: JSON, errors with status and detail, real hosts mapped to this server.
  async function request(url,options={}){
   const target=String(url).replace('https://sheets.googleapis.com',base).replace('https://oauth2.googleapis.com',base);
   const {timeoutMs,...rest}=options;
   const r=await fetch(target,rest);
   if(!r.ok){const detail=(await r.text()).slice(0,500);const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=detail;throw e;}
   return r.status===204?null:r.json();
  }
  resolve({state,base,request,book,close:()=>new Promise(r=>server.close(r))});
 }));
}
module.exports={create,parseRange};
