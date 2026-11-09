// Mail records (a foundation for apps such as «Подписки и продления»): structured records extracted from the mail
// Petya can already read — receipts and subscriptions, bookings (flights, hotels, trains), renewals (domains,
// certificates, licenses) — each with a link to its message and the evidence it was read from. Opt-in (off by
// default), local only (stored encrypted with the OS keychain when available), wiped on request; mail is only read.
// Contract for apps: docs/foundations/mail-records.md.
// - Settings: mailRecords ('false'), mailRecordsDays (365: how far back the first scan reads), mailRecordsModel
//   ('true': the local model reads what the parsers did not, with verbatim evidence checked by code).
// - Services: `s.mailRecords` {list(filter), status(), enable(on), scan(), forget(id), wipe(), extract(message)}.
//   IPC: window.petya.feature('mailRecords', 'status' | 'enable' | 'scan' | 'list' | 'forget' | 'wipe').
// - Parsers: an app declares `"provides": {"mail-record": "<file>.cjs"}`; the file exports {id, name?,
//   match({from, subject}) -> bool, parse(message) -> [record]} for the senders it knows (see the doc for the shape).
// Extraction order per message: schema.org JSON-LD → app parsers → built-in parsers → the model (when allowed).
const path=require('node:path');
const html=require('../mail-records/html.cjs');
const jsonld=require('../mail-records/jsonld.cjs');
const parsers=require('../mail-records/parsers.cjs');
const model=require('../mail-records/model.cjs');
const dates=require('../mail-records/dates.cjs');
const KIND='mail-record',NOTE='mail-records-scan',TYPES=['subscription','receipt','booking','renewal'],PERIODS=['month','year','week','quarter'];

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.parse!=='function'||typeof p.match!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id))throw Error('Invalid mail record parser '+x.extension+'/'+x.file);
  return {id:p.id,extension:x.extension,setting:x.setting,name:p.name||x.name,parser:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
const text=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&dates.iso(+v.slice(0,4),+v.slice(5,7),+v.slice(8,10))?v:'';
// One record in the stored shape, or null when it does not hold together.
function normalize(r,message,source){
 if(!r||!TYPES.includes(r.type))return null;
 const out={type:r.type,merchant:text(r.merchant,80),date:day(r.date)||dates.ymd(message.at||Date.now()),source:r.source||source,
  message:{id:text(message.id,200),account:text(message.account,200),provider:message.provider==='microsoft'?'microsoft':'google',from:text(message.from,200),subject:text(message.subject,200),at:Number(message.at)||0,url:/^https:\/\//.test(message.url||'')?message.url:''},
  evidence:Object.fromEntries(Object.entries(r.evidence||{}).filter(([,v])=>typeof v==='string'&&v.trim()).slice(0,10).map(([k,v])=>[k.slice(0,20),text(v,300)]))};
 const amount=Number(r.amount);
 if(Number.isFinite(amount)&&amount>0&&amount<1e8&&/^[A-Z]{3}$/.test(String(r.currency||''))){out.amount=Math.round(amount*100)/100;out.currency=r.currency;}
 if(r.type==='subscription'||r.type==='receipt'){
  if(!out.merchant||out.amount===undefined)return null;
  out.period=PERIODS.includes(r.period)?r.period:null;out.nextCharge=day(r.nextCharge);
  if(r.item)out.item=text(r.item,80);if(r.platform)out.platform=text(r.platform,40);if(r.order)out.order=text(r.order,60);
 }
 if(r.type==='booking'){
  const b=r.booking||{};const kind=['flight','hotel','train','bus','car','event'].includes(b.kind)?b.kind:'';
  out.booking={kind,code:text(b.code,20).toUpperCase(),number:text(b.number,20),from:text(b.from,80),to:text(b.to,80),place:text(b.place,160),start:day(b.start),startTime:/^\d{2}:\d{2}$/.test(b.startTime||'')?b.startTime:'',end:day(b.end),endTime:/^\d{2}:\d{2}$/.test(b.endTime||'')?b.endTime:''};
  if(!kind||!(out.booking.code||out.booking.start))return null;
 }
 if(r.type==='renewal'){
  const x=r.renewal||{};const kind=['domain','certificate','license','subscription'].includes(x.kind)?x.kind:'';
  out.renewal={kind,name:text(x.name,120),expires:day(x.expires)};
  if(!kind||!out.renewal.name||!out.renewal.expires)return null;
 }
 return out;
}
// Records of one message {id, account, provider, from, subject, at, text, html, url}.
async function extract(message,{registry=[],ask=null}={}){
 const found=[];
 const ld=jsonld.records(html.jsonld(message.html));
 for(const r of ld)found.push(normalize(r,message,'jsonld'));
 if(!ld.length){
  for(const x of registry){let ok=false;try{ok=!!x.parser.match({from:message.from,subject:message.subject});}catch{ok=false;}
   if(!ok)continue;try{for(const r of [].concat(await x.parser.parse(message)||[]))found.push(normalize(r,message,'parser:'+x.id));}catch{/* a broken app parser skips the message */}}
  if(!found.filter(Boolean).length)for(const r of parsers.parse(message))found.push(normalize(r,message,'parser:builtin'));
  // The model reads only messages that look like receipts, bookings or renewals and that the parsers did not read.
  if(!found.filter(Boolean).length&&ask&&(parsers.RECEIPT.test(message.subject)||/(?:бронир|booking|reservation|expir|истека|ticket|билет)/iu.test(message.subject))){
   try{for(const r of await model.extract(ask,message))found.push(normalize(r,message,'model'));}catch{/* the model is optional */}
  }
 }
 return found.filter(Boolean);
}

function create(s,{fetchAccounts,now=()=>Date.now(),dir,crypt,registry,publish=()=>{}}={}){
 const parsersOf=registry||(()=>{let all=null;return ()=>{if(!all){try{all=load();}catch(e){console.error('Mail record parsers:',e.message);all=[];}}return all.filter(x=>!x.setting||s.settings?.[x.setting]==='true');};})();
 const where=dir||(()=>s.dataRoot?path.join(s.dataRoot,'mail-records'):'');
 const store=require('../mail-records/store.cjs').create({dir:where,crypt});
 const enabled=()=>s.settings?.mailRecords==='true';
 const accounts=()=>(fetchAccounts||(()=>require('../mail-records/fetch.cjs').accounts(s.mailAccounts)))();
 const ask=async(system,user,schema)=>{
  if(s.settings?.mailRecordsModel==='false'||!s.settings?.model)return null;
  const {localEndpoint}=require('../core.cjs');
  const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,format:schema,options:{temperature:0,num_predict:900,num_ctx:8192},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(user)}]})});
  try{return JSON.parse(response?.message?.content||'null');}catch{return null;}
 };
 let running=null,last=null;
 const note=(text,{busy=false,kind='info'}={})=>publish({id:NOTE,title:'Записи из почты',text,busy,kind,version:kind+':'+text.slice(0,80)});
 async function scan({quiet=false}={}){
  if(!enabled())throw Error('Чтение записей из почты выключено. Включите его в настройках «Подписок и продлений».');
  if(running)return running;
  running=(async()=>{
   const started=now(),list=accounts();
   if(!list.length)throw Error('Почта не подключена: добавьте аккаунт в «Подключения → Почта».');
   const days=Math.max(30,Math.min(730,Number(s.settings.mailRecordsDays)||365));
   let read=0,added=0;const errors=[];
   if(!quiet)note('Читаю письма с чеками, подписками и бронями…',{busy:true});
   for(const a of list){
    try{
     const prev=store.scanned(a.key);
     const opened=await a.open({days,after:prev?.at?prev.at-2*86400000:0});
     const fresh=opened.ids.filter(id=>!store.seen(a.key+':'+id));
     const done=[];
     for(const id of fresh){
      if(!enabled())throw Error('Чтение записей из почты выключено.');
      const m=await opened.get(id);read++;
      added+=store.add(await extract(m,{registry:parsersOf(),ask}));done.push(a.key+':'+id);
      if(!quiet&&read%10===0)note('Прочитано писем: '+read+'. Найдено новых записей: '+added+'.',{busy:true});
     }
     store.markSeen(done);
     store.setScanned(a.key,{at:started,email:a.email});
    }catch(e){errors.push({account:a.email||a.provider,error:text(e.message,200)});}
   }
   last={at:started,read,added,errors};
   if(!quiet||added)note(errors.length===list.length?'Не удалось прочитать почту: '+errors[0].error:'Готово: прочитано писем '+read+', новых записей '+added+'.'+(errors.length?' Не прочитано: '+errors.map(e=>e.account).join(', ')+'.':''),{kind:errors.length===list.length?'error':'success'});
   if(errors.length===list.length)throw Error(errors[0].error);
   return last;
  })().finally(()=>{running=null;});
  return running;
 }
 const api={
  // Records, newest first. filter: {types, from:'YYYY-MM-DD', to, merchant}.
  list(filter={}){
   const types=Array.isArray(filter.types)?filter.types:null;
   return store.list().filter(r=>(!types||types.includes(r.type))&&(!filter.from||r.date>=filter.from)&&(!filter.to||r.date<filter.to)&&(!filter.merchant||require('../mail-records/store.cjs').merchantKey(r.merchant)===require('../mail-records/store.cjs').merchantKey(filter.merchant)));
  },
  status(){
   let connected=0;try{connected=accounts().length;}catch{connected=0;}
   const data=store.load();
   return {enabled:enabled(),running:!!running,connected,records:data.records.length,last,scanned:Object.values(data.scanned).map(x=>x.at).sort().at(-1)||0,encrypted:store.encrypted(),model:s.settings?.mailRecordsModel!=='false'&&!!s.settings?.model,days:Number(s.settings?.mailRecordsDays)||365};
  },
  enable(on=true){s.saveSettings?.({mailRecords:on?'true':'false'});return api.status();},
  scan,
  forget:id=>store.forget(String(id||'')),
  wipe(){store.wipe();last=null;return api.status();},
  extract:message=>extract(message,{registry:parsersOf(),ask}),
  parsers:()=>parsersOf().map(x=>({id:x.id,name:x.name}))
 };
 return api;
}

function validate(next){
 if(next.mailRecords!==undefined&&!['true','false'].includes(next.mailRecords))throw Error('Некорректная настройка mailRecords');
 if(next.mailRecordsModel!==undefined&&!['true','false'].includes(next.mailRecordsModel))throw Error('Некорректная настройка mailRecordsModel');
 if(next.mailRecordsDays!==undefined&&next.mailRecordsDays!==''){const n=Number(next.mailRecordsDays);if(!Number.isInteger(n)||n<30||n>730)throw Error('Сколько дней почты читать: от 30 до 730.');next.mailRecordsDays=String(n);}
}

function setup(s){
 const electron=(()=>{try{return require('electron');}catch{return null;}})();
 const safe=electron?.safeStorage;
 let crypt=null;try{if(safe?.isEncryptionAvailable?.())crypt={encrypt:v=>safe.encryptString(v),decrypt:b=>safe.decryptString(b)};}catch{crypt=null;}
 const publish=item=>{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);};
 const mailRecords=create(s,{crypt,publish});
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){
  // While enabled, new mail is read twice a day in the background (quietly: only new records are announced).
  const timer=setInterval(()=>{if(s.settings?.mailRecords==='true')mailRecords.scan({quiet:true}).catch(()=>{});},12*3600000);timer.unref?.();
 }
 return {mailRecords,ipc:{status:()=>mailRecords.status(),enable:on=>mailRecords.enable(on!==false),scan:()=>mailRecords.scan(),list:filter=>mailRecords.list(filter&&typeof filter==='object'?filter:{}),
  forget:id=>mailRecords.forget(id),wipe:()=>mailRecords.wipe()}};
}
module.exports={name:'mailRecords',defaults:{mailRecords:'false',mailRecordsDays:'365',mailRecordsModel:'true'},validate,setup,create,extract,normalize,load,KIND};
