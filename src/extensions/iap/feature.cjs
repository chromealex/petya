// «Покупки в игре»: in-app purchases of the user's games — revenue by product, refunds, payers, ARPPU, first-purchase
// products and conversion to payers, blended with ad revenue and UA spend (ROAS with purchases) when those apps are
// connected. Source-agnostic: the rows come from «purchase-source» providers (src/features/purchase-sources.cjs):
// App Store Connect sales reports and Google Play sales reports in Cloud Storage (this directory), a purchases table
// of «SQL по словам» (src/extensions/sql/purchase-source.cjs). Stores are read at once (read-only reports); a database
// query is shown on the card and runs only on «Выполнить» (ipc `run`). Every number is computed by code
// (analysis.cjs); money is never added across currencies.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const analysis=require('./analysis.cjs');
const PS=require('../../features/purchase-sources.cjs');
const appstore=require('./appstore-source.cjs');
const googleplay=require('./googleplay-source.cjs');
const ID='iap',BY='Покупки в игре';
const deps={now:()=>Date.now(),purchases:null,metrics:null,ads:null,ua:null};

const registry=s=>deps.purchases?deps.purchases(s):PS.create(s,{now:deps.now});
const plain=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:0});
function money(v,code){
 if(!code)return Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' (валюта не указана)';
 try{return Number(v).toLocaleString('ru-RU',{style:'currency',currency:code,maximumFractionDigits:Math.abs(v)>=1000?0:2});}catch{return Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+code;}
}
const pct=v=>(Math.round(v*1000)/10).toLocaleString('ru-RU')+'%';

// --- Blending sources (read only; failures become notes) ------------------------------------------------------------
async function dauSeries(s,period){
 try{
  const list=deps.metrics?deps.metrics:require('../metrics/sources.cjs').create(s).ready();
  const x=list[0];if(!x)return null;
  const r=await x.source.fetch(s,{from:period.start,to:period.end,metrics:['dau'],platform:null,version:null,app:null});
  const dau=(r?.series||[]).find(v=>v.metric==='dau');
  return dau?{name:x.name,points:dau.series.filter(p=>Number.isFinite(Number(p.value))).map(p=>({date:p.date,value:Number(p.value)}))}:null;
 }catch{return null;}
}
async function adRevenue(s,period){
 const list=deps.ads?deps.ads:(()=>{try{return require('../ad-revenue/sources.cjs').create(s).ready();}catch{return [];}})();
 let total=0,used=[];
 for(const x of list){
  try{const r=await x.source.fetch(s,{start:period.start,end:period.end,current:{start:period.start,end:period.end},check:()=>{}});
   total+=(r?.rows||[]).filter(row=>row.day>=period.start&&row.day<=period.end).reduce((a,row)=>a+(Number(row.revenue)||0),0);used.push(x.name);}catch{/* the ad app reports its own failures */}
 }
 return used.length?{total:Math.round(total*100)/100,currency:'USD',sources:used}:null;
}
async function uaSpend(s,period){
 try{
  const reg=deps.ua?deps.ua:require('../../features/ua-sources.cjs').create(s);
  if(!reg.list().length)return null;
  const r=await reg.fetchAll({start:period.start,end:period.end});
  if(!r.rows.length)return null;
  const by=new Map();for(const row of r.rows)by.set(row.currency,(by.get(row.currency)||0)+row.spend);
  return {rows:[...by].map(([currency,spend])=>({currency,spend:Math.round(spend*100)/100})),sources:r.used.map(u=>u.name)};
 }catch{return null;}
}

// --- Reading ----------------------------------------------------------------------------------------------------------------
async function readStores(s,reg,list,period){
 const out=[];
 for(const x of list){
  s.requestProgress?.report('Читаю продажи '+x.name);
  try{const r=await reg.fetch(x.id,{start:period.start,end:period.end});out.push({id:x.id,name:x.name,ok:true,rows:r.rows,payers:r.payers,notes:r.notes,truncated:r.truncated});}
  catch(e){out.push({id:x.id,name:x.name,ok:false,error:e.message,rows:[],payers:null,notes:[]});}
 }
 return out;
}
async function build(s,{period,ask,stores,sql=null}){
 const read=[...stores,...(sql?[sql]:[])];
 const payersKnown=read.some(x=>x.payers);
 const [dau,ads,spend]=await Promise.all([payersKnown?dauSeries(s,period):null,adRevenue(s,period),uaSpend(s,period)]);
 const a=analysis.analyse({sources:read.filter(x=>x.ok),period,dau:dau?.points||null,ads,spend:spend?.rows||null});
 return {a,dau,ads,spend,read};
}
function cardOf({id,period,ask,read,a,dau,ads,spend,plan=null,state}){
 return {id,period:{from:period.start,to:period.end,label:period.label,days:PS.span(period.start,period.end)},view:ask.view,filter:{store:ask.store,currency:ask.currency},state,
  sources:read.map(x=>({id:x.id,name:x.name,ok:x.ok,error:x.error||'',notes:x.notes||[],rows:x.rows?.length||0,truncated:!!x.truncated})),
  currencies:a.currencies,payers:a.payers,blend:a.blend?{...a.blend,adSources:ads?.sources||[],uaSources:spend?.sources||[]}:null,dauSource:dau?.name||'',
  plan:plan?{source:plan.source,sql:plan.sql,connection:plan.connection,table:plan.table,estimate:plan.estimate}:null,empty:a.empty,at:deps.now()};
}
function summary(c){
 const head=BY+' '+c.period.label;
 if(c.empty&&c.state==='pending')return head+': магазины ничего не вернули. Запрос к базе «'+c.plan.connection.name+'» готов — проверьте SQL и нажмите «Выполнить».';
 if(c.empty)return head+': покупок нет'+(c.sources.some(x=>!x.ok)?' (не ответили: '+c.sources.filter(x=>!x.ok).map(x=>x.name).join(', ')+')':'')+'.';
 const main=(c.filter.currency&&c.currencies.find(b=>b.currency===c.filter.currency))||c.currencies[0];
 let text=head+': '+plain(main.units)+' '+kit.plural(main.units,['покупка','покупки','покупок'])+' на '+money(main.amount,main.currency)+(main.refunds?', возвратов '+plain(main.refunds)+' ('+pct(main.refundRate||0)+', '+money(main.refunded,main.currency)+')':'')+'.';
 const top=main.products[0];
 if(c.view==='refunds'){const worst=[...main.products].filter(p=>p.refunds).sort((x,y)=>y.refunded-x.refunded)[0];if(worst)text+=' Больше всего возвратов у «'+(worst.title||worst.product)+'»: '+plain(worst.refunds)+' на '+money(worst.refunded,main.currency)+'.';}
 else if(top)text+=' Больше всего приносит «'+(top.title||top.product)+'»: '+money(top.amount,main.currency)+' ('+pct(top.share)+').';
 const others=c.currencies.filter(b=>b!==main);
 if(others.length)text+=' Ещё '+others.slice(0,3).map(b=>money(b.amount,b.currency)).join(', ')+(others.length>3?' и другие':'')+' — валюты не складываю.';
 if(c.payers){
  const p=c.payers,cur=p.byCurrency.find(x=>x.currency===main.currency);
  text+=' Платящих '+plain(p.total)+(p.newPayers!==null?', из них впервые '+plain(p.newPayers):'')+(cur?.arppu!=null?', ARPPU '+money(cur.arppu,main.currency):'')+(p.conversion?', конверсия в платящих '+pct(p.conversion.value)+' в день':'')+'.';
  if(c.view==='first'&&p.first[0])text+=' Первой покупкой чаще берут «'+(p.first[0].title||p.first[0].product)+'» ('+pct(p.first[0].share)+').';
 }else if(['payers','first'].includes(c.view))text+=' Платящих и первые покупки сторы не сообщают — нужна таблица покупок в базе («SQL по словам»).';
 if(c.blend){const r=c.blend.rows[0];text+=' ROAS '+(c.blend.adsIncluded&&r.ads?'с покупками и рекламой ':'с покупками ')+pct(r.roas)+' ('+money(r.revenue,r.currency)+' на '+money(r.spend,r.currency)+' закупки).';}
 if(c.state==='pending')text+=' Запрос к базе «'+c.plan.connection.name+'» (платящие, первые покупки) ждёт «Выполнить».';
 return text;
}

async function iapTurn(s,command){
 const ask=query.parse(command,deps.now());
 const reg=registry(s);
 let list=reg.list();
 if(ask.store){const named=list.filter(x=>x.id===ask.store);if(named.length)list=named;}
 if(!list.length){
  const added=reg.all().filter(x=>x.added&&!x.ready);
  return kit.reply(s,command,{by:BY,question:true,text:'Чтобы показать покупки, подключите источник в настройках «Покупки в игре»: App Store Connect (ключ API с ролью Sales и номер поставщика) или Google Play (бакет отчётов pubsite_rev_… и сервисный аккаунт) — или базу с таблицей покупок в «SQL по словам».'+(added.length?' Сейчас не хватает: '+added.map(x=>x.name+(x.hint?' — '+x.hint:'')).join('; ')+'.':'')});
 }
 const period=ask.period;
 const stores=await readStores(s,reg,list.filter(x=>!x.confirm),period);
 let plan=null;
 for(const x of list.filter(x=>x.confirm)){try{s.requestProgress?.report('Готовлю запрос к базе');plan=await reg.plan(x.id,{start:period.start,end:period.end});if(plan)break;}catch{/* no purchases table */}}
 if(!stores.length&&!plan)return kit.reply(s,command,{by:BY,question:true,text:'В подключённых базах «SQL по словам» не нашлась таблица покупок (игрок, время, продукт, цена). Подключите App Store Connect или Google Play в настройках «Покупки в игре».'});
 if(stores.length&&stores.every(x=>!x.ok)&&!plan)return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+stores.map(x=>x.name+': '+x.error).join(' ')});
 const {a,dau,ads,spend,read}=await build(s,{period,ask,stores});
 const card=cardOf({id:require('node:crypto').randomUUID(),period,ask,read,a,dau,ads,spend,plan,state:plan?'pending':'done'});
 return kit.reply(s,command,{by:BY,text:summary(card),data:{iapCard:card}});
}

async function turn(s,command){
 const text=String(command||'');
 if(!query.about(text)||!kit.installed(s,ID))return null;
 try{return await iapTurn(s,text);}
 catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

// --- Card calls ------------------------------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.iapCard?.id===id)return {topic,message:m,card:m.extensionData.iapCard};
 return null;
}
const notices=new Map();
function publish(s,id,item){
 const notice={id:'iap:'+id,title:BY,...item};notices.set(notice.id,notice);while(notices.size>10)notices.delete(notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
// «Выполнить»: the plan stored on the card (never text from the page) is run by its source; the stores are read again.
async function run(s,id){
 const hit=findCard(s,String(id||''));
 if(!hit)throw Error('Карточка покупок не найдена. Повторите вопрос в чате.');
 const {card}=hit;
 if(card.state!=='pending'||!card.plan)throw Error('Запрос уже выполнен.');
 const reg=registry(s),period={start:card.period.from,end:card.period.to,label:card.period.label};
 const ask={view:card.view,store:card.filter.store,currency:card.filter.currency};
 publish(s,card.id,{text:'Выполняю запрос покупок в «'+card.plan.connection.name+'»',busy:true,kind:'info'});
 let sql;
 try{const r=await reg.fetch(card.plan.source,{start:period.start,end:period.end},{plan:{...card.plan,source:card.plan.source}});sql={id:card.plan.source,name:reg.find(card.plan.source)?.name||'База',ok:true,rows:r.rows,payers:r.payers,notes:r.notes,truncated:r.truncated};}
 catch(e){publish(s,card.id,{text:'Запрос покупок не выполнен: '+e.message,busy:false,kind:'attention'});throw e;}
 const stores=await readStores(s,reg,reg.list().filter(x=>!x.confirm&&card.sources.some(y=>y.id===x.id)),period);
 const {a,dau,ads,spend,read}=await build(s,{period,ask,stores,sql});
 const next={...cardOf({id:card.id,period,ask,read,a,dau,ads,spend,plan:card.plan,state:'done'}),ranAt:deps.now()};
 hit.message.extensionData={...hit.message.extensionData,iapCard:next};
 hit.message.text=summary(next);
 s.dialogue.persist();
 publish(s,card.id,{text:'Покупки посчитаны: '+card.period.label,busy:false,kind:'success'});
 return next;
}

function validate(next){
 if(next.iapAscKey)require('../store-reviews/tokens.cjs').checkAscKey(next.iapAscKey);
 if(next.iapAscIssuer&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(next.iapAscIssuer).trim()))throw Error('Issuer ID App Store Connect — это UUID из раздела «Ключи API».');
 if(next.iapAscKeyId&&!/^[A-Z0-9]{10}$/.test(String(next.iapAscKeyId).trim()))throw Error('Key ID App Store Connect — 10 латинских букв и цифр.');
 if(next.iapAscVendor&&!/^\d{5,12}$/.test(String(next.iapAscVendor).trim()))throw Error('Номер поставщика (Vendor number) — только цифры, из «Платежи и финансовые отчёты».');
 if(next.iapPlayBucket&&!googleplay.bucket({iapPlayBucket:next.iapPlayBucket}))throw Error('Бакет отчётов Google Play выглядит как pubsite_rev_0123456789 (Play Console → «Скачать отчёты»).');
}
function setup(s){
 const status=()=>{
  const k=appstore.key(s.settings||{});
  let account='';try{const c=googleplay.credential(s.settings||{});account=c?require('../../google-service-account.cjs').parse(c).client_email:'';}catch{account='';}
  return {appstore:appstore.ready(s.settings),googleplay:googleplay.ready(s.settings),ascShared:!!k?.shared,hasAscKey:!!String(s.settings.iapAscKey||'').trim(),vendor:String(s.settings.iapAscVendor||''),
   bucket:googleplay.bucket(s.settings)||'',account,ownPlayKey:!!s.settings.iapPlayCredential,sql:s.settings.extension_sql==='true'};
 };
 return {ipc:{
  run:id=>run(s,id),
  status,
  saveKey(text){
   if(typeof text!=='string'||text.length>20000)throw Error('Выберите JSON ключ сервисного аккаунта Google.');
   const value=JSON.stringify(require('../../google-service-account.cjs').parse(text));
   if(value.length>2000)throw Error('Ключ не помещается в хранилище настроек. Создайте ключ RSA 2048.');
   s.saveSettings({iapPlayCredential:value},true);return status();
  },
  clearKey(){s.saveSettings({clear_iapPlayCredential:true},true);return status();},
  progress:()=>[...notices.values()]
 }};
}
// Dashboards (src/features/dashboards.cjs): reading purchases is read-only; a database query still waits for «Выполнить».
const dashboard={accepts:text=>query.about(String(text||'')),widgets:[{title:'Покупки в игре за неделю',command:'Покупки в игре за неделю'}]};
module.exports={name:'iap',dashboard,defaults:{['extension_'+ID]:'false',iapAscIssuer:'',iapAscKeyId:'',iapAscKey:'',iapAscVendor:'',iapPlayBucket:'',iapPlayPackages:'',iapPlayCredential:''},
 secrets:['iapAscKey','iapPlayCredential'],validate,setup,turn,run,summary,deps,teardown(){notices.clear();}};
