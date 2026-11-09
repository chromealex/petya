// «История буфера», storage: the copied text and pictures of one company in <company data>/extensions/clipboard/.
// history.json holds the list (text, source app, a small preview of each picture); every picture is its own file in
// images/. Both are encrypted with the OS keychain (Electron safeStorage) when available, otherwise plain with 0600.
// Kept: the last 200 copies and only the last 7 days; a copy of the same thing again moves it to the top.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const LIMIT=200,DAYS=7,DAY=86400000,MAX_TEXT=20000;

function create(dir,{encrypt=null,decrypt=null,now=()=>Date.now()}={}){
 const file=path.join(dir,'history.json'),images=path.join(dir,'images');
 const seal=buf=>encrypt?Buffer.from(encrypt(buf.toString('base64'))):buf;
 const open=buf=>decrypt?Buffer.from(decrypt(buf),'base64'):buf;
 let items=[];
 try{
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  const body=raw.encrypted&&decrypt?JSON.parse(decrypt(Buffer.from(raw.encrypted,'base64'))):raw.data||{};
  items=Array.isArray(body.items)?body.items.filter(i=>i&&typeof i.id==='string'&&(i.kind==='text'||i.kind==='image')):[];
 }catch{items=[];}
 const imageFile=id=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Нет такой записи.');return path.join(images,id+'.bin');};
 function save(){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const json=JSON.stringify({items});
  const out=encrypt?JSON.stringify({version:1,encrypted:Buffer.from(encrypt(json)).toString('base64')}):JSON.stringify({version:1,data:{items}});
  fs.writeFileSync(file+'.tmp',out,{mode:0o600});fs.renameSync(file+'.tmp',file);
 }
 // Older than 7 days or beyond 200: gone, with their picture files.
 function prune(){
  const cut=now()-DAYS*DAY,keep=items.filter(i=>i.at>=cut).slice(0,LIMIT),gone=items.filter(i=>!keep.includes(i));
  for(const i of gone)if(i.kind==='image')fs.rmSync(imageFile(i.id),{force:true});
  const changed=gone.length>0;items=keep;return changed;
 }
 const hashOf=(kind,data)=>createHash('sha256').update(kind+'\0').update(data).digest('hex');
 return {
  file,dir,encrypted:!!encrypt,
  hashOf,
  // {kind:'text', text, app} or {kind:'image', png:Buffer, width, height, thumb, app}; the same content moves to the top.
  add(entry){
   const kind=entry.kind,at=now();
   const data=kind==='text'?String(entry.text||'').slice(0,MAX_TEXT):entry.png;
   if(kind==='text'&&!data.trim())return null;
   if(kind==='image'&&!Buffer.isBuffer(data))return null;
   const hash=entry.hash||hashOf(kind,data);
   const old=items.find(i=>i.hash===hash);
   if(old){old.at=at;old.app=entry.app||old.app;items=[old,...items.filter(i=>i!==old)];save();return old;}
   const item={id:randomUUID(),at,kind,hash,app:String(entry.app||'').slice(0,80)};
   if(kind==='text')item.text=data;
   else{
    fs.mkdirSync(images,{recursive:true,mode:0o700});
    fs.writeFileSync(imageFile(item.id),seal(data),{mode:0o600});
    Object.assign(item,{width:entry.width||0,height:entry.height||0,bytes:data.length,thumb:typeof entry.thumb==='string'&&/^data:image\/(?:png|jpeg);base64,/.test(entry.thumb)?entry.thumb:''});
   }
   items.unshift(item);prune();save();return item;
  },
  list(){if(prune())save();return items.slice();},
  get:id=>items.find(i=>i.id===id)||null,
  image(id){const i=items.find(x=>x.id===id&&x.kind==='image');if(!i)throw Error('Нет такой картинки в истории.');return open(fs.readFileSync(imageFile(id)));},
  remove(id){const i=items.find(x=>x.id===id);if(!i)return false;if(i.kind==='image')fs.rmSync(imageFile(id),{force:true});items=items.filter(x=>x!==i);save();return true;},
  // «Стереть всё»: the list and every picture.
  wipe(){const n=items.length;items=[];fs.rmSync(images,{recursive:true,force:true});fs.rmSync(file,{force:true});return n;},
  bytes(){let n=0;try{n+=fs.statSync(file).size;}catch{/* none */}try{for(const f of fs.readdirSync(images))n+=fs.statSync(path.join(images,f)).size;}catch{/* none */}return n;}
 };
}
module.exports={create,LIMIT,DAYS};
