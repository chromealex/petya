// «Найм», the pipeline on disk: `<company data>/hiring/hiring.json` (folder 0700, file 0600), encrypted with the OS
// keychain (Electron safeStorage) when `crypt` is given; without the keychain an encrypted file reads as empty.
// Written only after a card button (adding a candidate, saving interview notes, moving a stage). Shape: feature.cjs.
const fs=require('node:fs'),path=require('node:path');
function create({dir,crypt=null,file='hiring.json',empty=()=>({version:1,candidates:[]})}){
 const where=()=>typeof dir==='function'?dir():dir;
 const full=()=>path.join(where(),file);
 function load(){
  if(!where())return empty();
  try{
   let raw=fs.readFileSync(full(),'utf8');
   if(raw.startsWith('enc:')){if(!crypt)return empty();raw=crypt.decrypt(Buffer.from(raw.slice(4),'base64'));}
   return {...empty(),...JSON.parse(raw)};
  }catch{return empty();}
 }
 function save(data){
  const d=where();if(!d)throw Error('Нет папки компании для данных приложения.');
  fs.mkdirSync(d,{recursive:true,mode:0o700});
  const json=JSON.stringify(data);
  fs.writeFileSync(full()+'.tmp',crypt?'enc:'+crypt.encrypt(json).toString('base64'):json,{mode:0o600});fs.renameSync(full()+'.tmp',full());
 }
 function update(change){const data=load();const out=change(data);save(data);return out;}
 return {load,save,update,wipe(){const d=where();if(d)fs.rmSync(d,{recursive:true,force:true});},encrypted:()=>!!crypt,folder:()=>where()||''};
}
function keychain(){
 try{const safe=require('electron').safeStorage;if(safe?.isEncryptionAvailable?.())return {encrypt:v=>safe.encryptString(v),decrypt:b=>safe.decryptString(b)};}catch{/* not in Electron */}
 return null;
}
module.exports={create,keychain};
