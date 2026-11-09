// Search source of «Google Диск» for «Поиск по всему» (`search-source`, src/extensions/search-all/registry.cjs):
// files.list by name and full text (the same query as «найди в гугл диске …», through this app's service). Drive
// gives no snippets, so the text of up to three Google Docs found by their text alone is read (documents.get, the
// app's cache) for the ranking and the snippet; when the user turned on the Drive collection of the local index,
// documents found by meaning come too. Read-only, with the access already granted in this app's settings.
const auth=require('./auth.cjs');
const workspace=require('../../google-workspace.cjs');
const COLLECTION='google-drive',READS=3;
const KIND={document:'Документ',spreadsheet:'Таблица',presentation:'Презентация',pdf:'PDF',folder:'Папка'};
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const https=u=>/^https:\/\//.test(String(u||''))?String(u):'';
const meta=f=>[KIND[f.kind]||'',one(f.editor||f.owner).slice(0,80)].filter(Boolean).join(' · ');
module.exports={
 id:'google-drive',label:'Google Диск',order:35,icon:'drive',color:'#a8d5b0',in:'в Google Диске',
 names:/(?:гугл|google)[\s-]*(?:диск|драйв|drive|док)\p{L}*/iu,
 ready:(settings,s)=>auth.connected(settings)&&typeof s?.googleDrive?.search==='function',
 off:'Google Диск не подключён.',
 async search(s,{topic,own,terms}){
  const drive=s.googleDrive;
  const files=(await drive.search(own.slice(0,8).join(' '),{size:15})).filter(f=>f.kind!=='folder');
  const re=require('../search-all/query.cjs').pattern(terms);
  const named=f=>{if(!re)return false;re.lastIndex=0;return re.test(require('../search-all/query.cjs').norm(f.name));};
  const texts=new Map();
  // Found by the text alone: read a few documents so the card can show where the words are.
  await Promise.all(files.filter(f=>f.kind==='document'&&!named(f)).slice(0,READS).map(async f=>{
   try{const d=await drive.document(f.id);texts.set(f.id,String(d?.text||'').slice(0,6000));}catch{/* the name alone */}
  }));
  const items=files.map(f=>({source:'google-drive',id:'gdrive:'+f.id,title:one(f.name).slice(0,200),text:texts.get(f.id)||'',url:https(f.url),at:Date.parse(f.modified)||0,meta:meta(f)}));
  let note='';
  if(s.semanticIndex?.enabled?.(COLLECTION)){
   try{
    const hits=(await s.semanticIndex.search(COLLECTION,topic,{k:5}))?.hits||[];
    for(const h of hits){
     if(!workspace.FILE_ID.test(String(h.id||''))||items.some(i=>i.id==='gdrive:'+h.id))continue;
     items.push({source:'google-drive',id:'gdrive:'+h.id,title:one(h.meta?.title||'Документ').slice(0,200),text:String(h.text||'').slice(0,1200),url:workspace.fileUrl('document',h.id),at:Date.parse(h.meta?.modified||'')||0,meta:'Документ · по смыслу'});
    }
   }catch{note='Поиск по смыслу в Google Диске не ответил.';}
  }
  return {items,note};
 }
};
