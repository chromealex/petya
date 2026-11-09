// Google Drive API v3 and Google Docs API v1 client.
// Reads: files.list (https://developers.google.com/drive/api/reference/rest/v3/files/list) with a `q` query —
// names (prefix match), full text, MIME type, trashed=false — over My Drive and shared drives; files.get for one
// file's metadata; documents.get (https://developers.google.com/docs/api/reference/rest/v1/documents/get) with
// includeTabsContent=true for a document's text and headings. Write: one multipart files.create upload of HTML
// converted to a Google Doc (drive.file scope), called only from a card button the user pressed.
// `request(url, options)` is Petya's HTTP helper (JSON in, JSON out, errors carry `status` and `detail`).
const workspace=require('../../google-workspace.cjs');
const {randomBytes}=require('node:crypto');
const DRIVE='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const DOCS='https://docs.googleapis.com/v1/documents';
const FIELDS='id,name,mimeType,modifiedTime,createdTime,webViewLink,size,shortcutDetails(targetId,targetMimeType),owners(displayName,emailAddress,me),lastModifyingUser(displayName,me),driveId';
const ID=workspace.FILE_ID;

// A `q` string literal: backslashes and single quotes escaped (https://developers.google.com/drive/api/guides/ref-search-terms).
const literal=v=>"'"+String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
// The query for a search: every name word as a prefix (name contains), or the words in the full text; a kind filter;
// never trashed files. `fullText` cannot be sorted, so `order` is only for name-only and recent listings.
function query({words=[],phrase='',kind='',fullText=true}={}){
 const parts=['trashed = false'];
 const name=words.map(w=>'name contains '+literal(w));
 const text=phrase||words.join(' ');
 if(name.length&&fullText&&text)parts.push('(('+name.join(' and ')+') or fullText contains '+literal(text)+')');
 else if(name.length)parts.push(name.join(' and '));
 else if(fullText&&text)parts.push('fullText contains '+literal(text));
 if(kind&&workspace.MIME_OF[kind])parts.push('mimeType = '+literal(workspace.MIME_OF[kind]));
 else if(!kind)parts.push("mimeType != 'application/vnd.google-apps.folder'");
 return parts.join(' and ');
}
// A Drive file in the shape the cards and the index use.
function file(f){
 const target=f.shortcutDetails?.targetId&&ID.test(f.shortcutDetails.targetId)?f.shortcutDetails:null;
 const mime=target?.targetMimeType||f.mimeType;
 const kind=workspace.kindOf(mime),id=target?.targetId||String(f.id||'');
 const owner=(f.owners||[])[0];
 return {id,name:String(f.name||'Без названия').slice(0,300),kind,mime:String(mime||''),modified:String(f.modifiedTime||''),
  url:/^https:\/\/(?:docs|drive)\.google\.com\//.test(String(f.webViewLink||''))&&!target?String(f.webViewLink):workspace.fileUrl(kind,id),
  // The owner's name (empty on a shared drive, which owns its files); `mine` when it is the signed-in user.
  owner:owner?String(owner.displayName||owner.emailAddress||'').slice(0,120):'',mine:!!owner?.me,shared:!owner&&!!f.driveId,
  editor:f.lastModifyingUser&&!f.lastModifyingUser.me?String(f.lastModifyingUser.displayName||'').slice(0,120):'',
  size:Number(f.size)||0};
}

// Service answers in the user's words: access, missing file, disabled API, quota; the status stays on the error.
function explain(error){
 const detail=String(error?.detail||'');let text=error?.message||'Google Диск недоступен.';
 const api=/docs\.googleapis|Google Docs API/i.test(detail)?'Google Docs API':'Google Drive API';
 if(error?.status===401)text='Google не принял вход для Google Диска. Подключите доступ заново в настройках «Google Диск».';
 else if(error?.status===403)text=/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(detail)?'В проекте Google Cloud не включён '+api+'. Включите его (APIs & Services → Library → '+api+') и повторите.':/insufficient|scope/i.test(detail)?'Не хватает разрешения Google на это действие с Диском. Разрешите его в настройках «Google Диск».':/rate|quota/i.test(detail)?'Google Диск временно ограничил запросы. Повторите через минуту.':'Нет доступа к этому файлу. Откройте к нему доступ подключённому аккаунту или адресу сервисного аккаунта.';
 else if(error?.status===404)text='Google не нашёл этот файл. Проверьте ссылку и доступ.';
 else if(error?.status===400&&/Sorting is not supported|Invalid Value|Invalid query/i.test(detail))text='Google Диск не понял запрос поиска. Скажите короче, например «найди в гугл диске план релиза».';
 else if(error?.status===400&&/not supported for this document|operation is not supported/i.test(detail))text='Этот файл не открывается как документ Google. Откройте его в Google Диске.';
 else if(error?.status===429)text='Google Диск временно ограничил запросы. Повторите через минуту.';
 const e=Error(text);e.status=error?.status;e.detail=detail;e.cause=error;
 // No answer at all: a write may or may not have happened.
 if(!error?.status&&error?.name!=='InputRequired')e.unknown=true;
 return e;
}

class DriveClient{
 constructor({request,token}){this.request=request;this.token=token;}
 async call(url,{method='GET',query:q,body,headers={}}={}){
  const access=await this.token();
  const target=url+(q?'?'+q.toString():'');
  try{return await this.request(target,{method,headers:{Authorization:'Bearer '+access,...body&&!headers['Content-Type']?{'Content-Type':'application/json'}:{},...headers},...body?{body:typeof body==='string'?body:JSON.stringify(body)}:{},timeoutMs:60000});}
  catch(e){throw explain(e);}
 }
 // files.list → {files, next}. `order` e.g. 'modifiedTime desc' (ignored with fullText, which Drive cannot sort).
 async list({q,order='',size=25,page=''}={}){
  const params=new URLSearchParams({q,pageSize:String(Math.max(1,Math.min(size,100))),fields:'nextPageToken,files('+FIELDS+')',
   supportsAllDrives:'true',includeItemsFromAllDrives:'true',corpora:'allDrives',spaces:'drive'});
  if(order&&!/fullText contains/.test(q))params.set('orderBy',order);
  if(page)params.set('pageToken',page);
  const r=await this.call(DRIVE+'/files',{query:params});
  return {files:(r?.files||[]).filter(f=>ID.test(String(f.id||''))).map(file),next:String(r?.nextPageToken||'')};
 }
 async get(id){
  if(!ID.test(String(id)))throw Error('Неверный ID файла Google.');
  return file(await this.call(DRIVE+'/files/'+id,{query:new URLSearchParams({fields:FIELDS,supportsAllDrives:'true'})}));
 }
 // A Google Doc with every tab's content.
 async document(id){
  if(!ID.test(String(id)))throw Error('Неверный ID документа Google.');
  return this.call(DOCS+'/'+id,{query:new URLSearchParams({includeTabsContent:'true'})});
 }
 // A new Google Doc from HTML (Drive converts it; headings, lists and tables stay). drive.file is enough.
 async createDoc(title,html){
  const boundary='petya-'+randomBytes(12).toString('hex');
  const meta={name:String(title).slice(0,200),mimeType:'application/vnd.google-apps.document'};
  const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n'+html+'\r\n--'+boundary+'--';
  const r=await this.call(UPLOAD,{method:'POST',query:new URLSearchParams({uploadType:'multipart',supportsAllDrives:'true',fields:'id,name,webViewLink,mimeType'}),headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  if(!ID.test(String(r?.id||'')))throw Error('Google не создал документ.');
  return {id:r.id,title:String(r.name||title),url:/^https:\/\/docs\.google\.com\//.test(String(r.webViewLink||''))?r.webViewLink:workspace.fileUrl('document',r.id)};
 }
}
module.exports={DriveClient,DRIVE,DOCS,UPLOAD,query,literal,file,explain};
