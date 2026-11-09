// «Google Диск» as an index collection for search by meaning (src/features/semantic-index.cjs,
// docs/foundations/semantic-index.md): the text of Google Docs the connection can read, with their headings
// (Markdown, so pieces follow the sections). Off until the user turns it on (settings of «Google Диск» or of
// «Поиск файлов по смыслу»); the index keeps everything on this computer.
const auth=require('./auth.cjs');
const workspace=require('../../google-workspace.cjs');
const {DriveClient,query}=require('./client.cjs');
const MAX_DOCS=500,PAGE=100;
const clientFor=s=>new DriveClient({request:(url,o)=>s.request(url,o),token:()=>auth.token(s)});

module.exports={
 id:'google-drive',name:'Google Диск',type:'markdown',refresh:60,
 description:'Google Документы, к которым есть доступ у подключения «Google Диск»',
 collects:'Текст Google Документов (заголовки, абзацы, списки и таблицы), доступных подключённому аккаунту Google или сервисному аккаунту, — до 500 последних изменённых. Таблицы, презентации и другие файлы не читаются. Всё хранится на этом компьютере; похожий на пароли и токены текст заменяется на «[скрыто]».',
 ready:settings=>auth.connected(settings),
 // Ids and versions only: the modified time decides whether a document is read again.
 async list(s,{gate}={}){
  const client=clientFor(s),out=[];let page='';
  do{
   await gate?.();
   const r=await client.list({q:query({kind:'document',fullText:false}),order:'modifiedTime desc',size:PAGE,page});
   for(const f of r.files)if(f.kind==='document'&&out.length<MAX_DOCS)out.push({id:f.id,version:f.modified||'0',meta:{title:f.name,url:f.url,owner:f.owner,modified:f.modified,type:'document'}});
   page=r.next;
  }while(page&&out.length<MAX_DOCS);
  return out;
 },
 async read(s,entry){
  const doc=workspace.docText(await clientFor(s).document(entry.id));
  if(!doc.text.trim())return null;
  return {text:doc.text,type:'markdown',title:doc.title||entry.meta?.title||'',meta:{...entry.meta,title:doc.title||entry.meta?.title||''}};
 }
};
