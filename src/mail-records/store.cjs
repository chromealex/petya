// Mail records on disk: `<dir>/records.json` (folder 0700, file 0600), encrypted with the OS keychain (Electron
// safeStorage) when `crypt` is given. Holds the records, the last scan per account and messages already read, so a
// scan reads only new mail. Records are deduplicated by key (see `key`): one charge mentioned by JSON-LD and by the
// text, or the same booking in a confirmation and a reminder, is one record; the better source wins.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const RANK={jsonld:3,parser:2,model:1};
const rank=r=>RANK[String(r.source||'').split(':')[0]]||0;
const merchantKey=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/\b(?:inc|llc|ltd|gmbh|limited|corp|co|ооо|ао|пао|ип)\b\.?/g,'').replace(/\.(?:com|ru|io|net|org|app)\b/g,'').replace(/[^\p{L}\d]+/gu,'');
// The identity of a record across messages.
function key(r){
 if(r.type==='booking')return 'booking|'+(r.booking?.code?r.booking.code.toUpperCase():r.message?.id+'|'+(r.booking?.start||''));
 if(r.type==='renewal')return 'renewal|'+r.renewal?.kind+'|'+String(r.renewal?.name||'').toLowerCase()+'|'+r.renewal?.expires;
 return 'charge|'+merchantKey(r.merchant)+'|'+Number(r.amount).toFixed(2)+'|'+r.currency+'|'+r.date;
}
const idOf=k=>createHash('sha256').update(k).digest('hex').slice(0,16);

function create({dir,crypt=null}){
 const where=()=>typeof dir==='function'?dir():dir;
 const file=()=>path.join(where(),'records.json');
 const empty=()=>({version:1,records:[],scanned:{},seen:[]});
 function load(){
  try{
   let raw=fs.readFileSync(file(),'utf8');
   if(raw.startsWith('enc:')){if(!crypt)return empty();raw=crypt.decrypt(Buffer.from(raw.slice(4),'base64'));}
   const d=JSON.parse(raw);
   return {version:1,records:Array.isArray(d.records)?d.records:[],scanned:d.scanned&&typeof d.scanned==='object'?d.scanned:{},seen:Array.isArray(d.seen)?d.seen:[]};
  }catch{return empty();}
 }
 function save(data){
  const d=where();if(!d)return;
  fs.mkdirSync(d,{recursive:true,mode:0o700});
  const json=JSON.stringify({...data,seen:data.seen.slice(-5000)});
  const body=crypt?'enc:'+crypt.encrypt(json).toString('base64'):json;
  fs.writeFileSync(file()+'.tmp',body,{mode:0o600});fs.renameSync(file()+'.tmp',file());
 }
 // Adds records; returns how many are new. A duplicate from a better source replaces the stored one.
 function add(list){
  const data=load();let added=0;
  for(const r of list){
   const k=key(r),id=idOf(k);
   const i=data.records.findIndex(x=>x.id===id);
   const row={...r,id};
   if(i<0){data.records.push(row);added++;}
   else if(rank(row)>rank(data.records[i]))data.records[i]={...row,also:[...new Set([...(data.records[i].also||[]),data.records[i].message?.id].filter(Boolean))]};
   else if(row.message?.id&&row.message.id!==data.records[i].message?.id)data.records[i].also=[...new Set([...(data.records[i].also||[]),row.message.id])].slice(-10);
  }
  data.records.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  save(data);return added;
 }
 return {
  load,add,key,
  list:()=>load().records,
  seen(id){return load().seen.includes(id);},
  markSeen(ids){const data=load();data.seen=[...new Set([...data.seen,...ids])];save(data);},
  scanned(account){return load().scanned[account]||null;},
  setScanned(account,value){const data=load();data.scanned[account]=value;save(data);},
  forget(id){const data=load();const before=data.records.length;data.records=data.records.filter(r=>r.id!==id);save(data);return before!==data.records.length;},
  wipe(){const d=where();if(d)fs.rmSync(d,{recursive:true,force:true});},
  encrypted:()=>!!crypt
 };
}
module.exports={create,key,merchantKey};
