// A local stand-in for the Google Drive API v3, the Google Docs API v1 and Google's OAuth token endpoint, for unit
// tests without network. Files live in memory as {id, name, mimeType, modifiedTime, owners, text, doc?, trashed?}.
// files.list evaluates the `q` language Petya sends (and/or, parentheses, name contains — prefix match per word —,
// fullText contains, mimeType =/!=, trashed = false) and refuses orderBy with fullText like Drive does; documents.get
// returns the file's `doc`; the multipart upload creates a Google Doc and keeps its metadata and HTML. Every request is
// recorded. `request(url, options)` mimics Petya's main-process helper.
const http=require('node:http');

// --- The `q` language -------------------------------------------------------------------------------------------
function tokens(q){
 const out=[];const re=/\s*(\(|\)|!=|=|'(?:\\.|[^'\\])*'|[A-Za-z]+)/y;let m;
 while(re.lastIndex<q.length&&(m=re.exec(q)))out.push(m[1]);
 if(re.lastIndex<q.length&&q.slice(re.lastIndex).trim())throw Error('Invalid query');
 return out;
}
const unquote=t=>t.slice(1,-1).replace(/\\(.)/g,'$1');
function parse(q){
 const t=tokens(q);let i=0;
 const peek=()=>t[i],next=()=>t[i++];
 function or(){let a=and();while(peek()==='or'){next();const b=and(),x=a;a=f=>x(f)||b(f);}return a;}
 function and(){let a=term();while(peek()==='and'){next();const b=term(),x=a;a=f=>x(f)&&b(f);}return a;}
 function term(){
  if(peek()==='('){next();const e=or();if(next()!==')')throw Error('Invalid query');return e;}
  const field=next(),op=next(),value=next();
  if(field==='trashed')return f=>!!f.trashed===(value==='true');
  if(!value||value[0]!=="'")throw Error('Invalid query');
  const v=unquote(value);
  if(field==='name'&&op==='contains'){const want=v.toLocaleLowerCase();return f=>f.name.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).some(w=>w.startsWith(want));}
  if(field==='fullText'&&op==='contains'){const words=v.toLocaleLowerCase().split(/\s+/).filter(Boolean);return f=>{const hay=(f.name+' '+(f.text||'')).toLocaleLowerCase();return words.every(w=>hay.includes(w));};}
  if(field==='mimeType'&&op==='=')return f=>f.mimeType===v;
  if(field==='mimeType'&&op==='!=')return f=>f.mimeType!==v;
  throw Error('Invalid query');
 }
 const e=or();if(i!==t.length)throw Error('Invalid query');return e;
}

function create({files=[]}={}){
 const state={files,requests:[],fail:null,created:[],next:1};
 const find=id=>state.files.find(f=>f.id===id);
 const view=f=>({id:f.id,name:f.name,mimeType:f.mimeType,modifiedTime:f.modifiedTime,createdTime:f.createdTime||f.modifiedTime,webViewLink:f.webViewLink||'',
  ...f.owners?{owners:f.owners}:{},...f.driveId?{driveId:f.driveId}:{},...f.lastModifyingUser?{lastModifyingUser:f.lastModifyingUser}:{},...f.size?{size:String(f.size)}:{}});
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const url=new URL(req.url,'http://x');
  const entry={method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),auth:req.headers.authorization||'',type:req.headers['content-type']||'',body:body?(()=>{try{return JSON.parse(body);}catch{return body;}})():null};
  state.requests.push(entry);
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(state.fail){const f=state.fail;if(!f.match||f.match(entry)){if(f.once)state.fail=null;return send(f.status,{error:{code:f.status,message:f.message||'fail'}});}}
  if(entry.path==='/token')return send(200,{access_token:'sa-'+'token',expires_in:3600,token_type:'Bearer'});
  if(entry.path==='/drive/v3/files'&&req.method==='GET'){
   let test;try{test=parse(entry.query.q||'trashed = false');}catch{return send(400,{error:{code:400,message:'Invalid Value'}});}
   if(entry.query.orderBy&&/fullText contains/.test(entry.query.q||''))return send(400,{error:{code:400,message:'Sorting is not supported for queries with fullText terms. Results are always in descending relevance order.'}});
   let list=state.files.filter(test);
   if(/modifiedTime desc/.test(entry.query.orderBy||''))list=[...list].sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
   const size=Number(entry.query.pageSize)||100,from=Number(entry.query.pageToken||0);
   const page=list.slice(from,from+size);
   return send(200,{files:page.map(view),...from+size<list.length?{nextPageToken:String(from+size)}:{}});
  }
  let m=/^\/drive\/v3\/files\/([^/]+)$/.exec(entry.path);
  if(m&&req.method==='GET'){const f=find(m[1]);if(!f)return send(404,{error:{code:404,message:'File not found: '+m[1]}});return send(200,view(f));}
  m=/^\/v1\/documents\/([^/]+)$/.exec(entry.path);
  if(m&&req.method==='GET'){const f=find(m[1]);if(!f)return send(404,{error:{code:404,message:'Requested entity was not found.'}});if(!f.doc)return send(400,{error:{code:400,message:'This operation is not supported for this document. The document must not be a Microsoft Office file.'}});return send(200,f.doc);}
  if(entry.path==='/upload/drive/v3/files'&&req.method==='POST'){
   const boundary=/boundary=([^;]+)/.exec(entry.type)?.[1];
   const parts=String(body).split('--'+boundary).slice(1,-1).map(p=>{const [head,...rest]=p.replace(/^\r\n/,'').split('\r\n\r\n');return {head,body:rest.join('\r\n\r\n').replace(/\r\n$/,'')};});
   const meta=JSON.parse(parts[0].body),html=parts[1].body;
   const id='NewDoc'+(state.next++)+'x'.repeat(20);
   const f={id,name:meta.name,mimeType:meta.mimeType,modifiedTime:'2026-11-09T12:00:00.000Z',owners:[{displayName:'Я',me:true}],text:html.replace(/<[^>]+>/g,' '),webViewLink:'https://docs.google.com/document/d/'+id+'/edit?usp=drivesdk'};
   state.files.push(f);state.created.push({meta,html,query:entry.query});
   return send(200,{id,name:f.name,mimeType:f.mimeType,webViewLink:f.webViewLink});
  }
  send(404,{error:{code:404,message:'no route '+entry.path}});
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{
  const base='http://127.0.0.1:'+server.address().port;
  // Petya's request helper: JSON, errors with status and detail, real hosts mapped to this server.
  async function request(url,options={}){
   const target=String(url).replace('https://www.googleapis.com',base).replace('https://docs.googleapis.com',base).replace('https://oauth2.googleapis.com',base);
   const {timeoutMs,...rest}=options;
   const r=await fetch(target,rest);
   if(!r.ok){const detail=(await r.text()).slice(0,500);const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=detail;throw e;}
   return r.status===204?null:r.json();
  }
  resolve({state,base,request,find,close:()=>new Promise(r=>server.close(r))});
 }));
}

// A Docs API document from a compact outline: [['h1','Text'], ['p','Text'], ['li','Text'], ['table',[[…],[…]]]].
function doc(id,title,items,{tabs=false}={}){
 const style={title:'TITLE',h1:'HEADING_1',h2:'HEADING_2',h3:'HEADING_3',p:'NORMAL_TEXT',li:'NORMAL_TEXT'};
 const para=(kind,text)=>({paragraph:{elements:[{textRun:{content:text+'\n'}}],paragraphStyle:{namedStyleType:style[kind]},...kind==='li'?{bullet:{listId:'l1'}}:{}}});
 const content=items.map(([kind,v])=>kind==='table'?{table:{tableRows:v.map(r=>({tableCells:r.map(c=>({content:[para('p',c)]}))}))}}:para(kind,v));
 const body={content:[{sectionBreak:{}},...content]};
 return tabs?{documentId:id,title,revisionId:'r1',tabs:[{tabProperties:{tabId:'t.0',title:'Вкладка 1'},documentTab:{body}}]}:{documentId:id,title,revisionId:'r1',body};
}
module.exports={create,parse,doc};
