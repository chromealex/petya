// «Договоры в PDF»: the text of read contracts (pages with their lines), kept in the company folder
// (<dataRoot>/pdf-contracts/<id>.json, mode 600) so a later question, «Показать на странице» and a comparison with the
// next version need no re-reading or OCR. The newest 30 documents are kept. The PDF files themselves are not copied.
const fs=require('node:fs'),path=require('node:path');
const KEEP=30;
const dir=s=>s.dataRoot?path.join(s.dataRoot,'pdf-contracts'):'';
const memory=new Map();
const valid=id=>/^[0-9a-f]{16}$/.test(String(id||''));
function save(s,doc){
 if(!valid(doc.id))throw Error('bad document id');
 const d=dir(s);if(!d){memory.set(doc.id,doc);return;}
 fs.mkdirSync(d,{recursive:true,mode:0o700});
 const file=path.join(d,doc.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify({...doc,savedAt:Date.now()}),{mode:0o600});fs.renameSync(file+'.tmp',file);
 const all=fs.readdirSync(d).filter(f=>/^[0-9a-f]{16}\.json$/.test(f)).map(f=>({f,t:fs.statSync(path.join(d,f)).mtimeMs})).sort((a,b)=>b.t-a.t);
 for(const x of all.slice(KEEP))fs.rmSync(path.join(d,x.f),{force:true});
}
function load(s,id){
 if(!valid(id))return null;
 const d=dir(s);if(!d)return memory.get(id)||null;
 try{return JSON.parse(fs.readFileSync(path.join(d,id+'.json'),'utf8'));}catch{return null;}
}
module.exports={save,load};
