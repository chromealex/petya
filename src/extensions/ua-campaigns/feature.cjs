// «Закупка трафика»: what buying users costs — spend, installs and CPI by network, campaign and day, from the
// `ua-source` providers (src/features/ua-sources.cjs; AppLovin, Unity Ads and Meta in this directory). When
// «Реклама и монетизация» has ad revenue for the same days, a blended ROAS (ad revenue ÷ spend) is shown too.
// Everything is computed from the networks' reports; no model is involved. Nothing here writes anywhere.
const kit=require('../app-kit.cjs');
const UA=require('../../features/ua-sources.cjs');
const applovin=require('./applovin-ua-source.cjs');
const unity=require('./unity-ua-source.cjs');
const meta=require('./meta-ua-source.cjs');
const ID='ua-campaigns',BY='Закупка трафика';
const registry=s=>s.uaSources||UA.create(s);

// --- Routing -------------------------------------------------------------------------------------------------
const ABOUT=/закупк\p{L}*\s+(?:\p{L}+\s+)?(?:трафик\p{L}*|пользовател\p{L}*|игрок\p{L}*|юзер\p{L}*)|(?:^|[^\p{L}])(?:ua|cpi|cpa|roas|роас)(?=$|[^\p{L}])|(?:потратил\p{L}*|потрачен\p{L}*|расход\p{L}*|затрат\p{L}*|spend|бюджет\p{L}*)[^.?!]{0,30}(?:реклам\p{L}*|кампани\p{L}*|закупк\p{L}*|трафик\p{L}*|(?:^|[^\p{L}])ua(?=$|[^\p{L}])|сет(?:и|ям|ей|ях))|реклам\p{L}*\s+кампани\p{L}*|кампани\p{L}*\s+(?:в|из|по)\s+(?:unity|юнити|applovin|аппловин\p{L}*|meta|мет[еау]|facebook|фейсбук\p{L}*)|стоимост\p{L}*\s+(?:установк\p{L}*|инсталл\p{L}*|привлечени\p{L}*)|цен\p{L}*\s+(?:установк\p{L}*|инсталл\p{L}*)|установк\p{L}*\s+(?:по|из|с)\s+(?:сет\p{L}*|кампани\p{L}*)/iu;
// Neighbours: ad revenue (earnings from ads in our games), starting or stopping campaigns (not supported, writes),
// marketing in general, store reviews, in-app purchases.
const AVOID=/заработ\p{L}*|выручк\p{L}*\s+(?:с|от)\s+реклам|e-?cpm|fill[- ]?rate|arpdau|(?:запусти|останови|выключи|отключи|создай|поставь|увеличь|уменьши)\p{L}*\s+(?:\p{L}+\s+)?(?:реклам|кампани|бюджет)|отзыв\p{L}*|покупк\p{L}* в приложении/iu;
const about=text=>{const t=String(text||'');return !AVOID.test(t)&&ABOUT.test(t)||/roas|роас/iu.test(t)&&ABOUT.test(t);};

function validate(next){
 const check=(key,re,name)=>{if(next[key]===undefined)return;const v=String(next[key]||'').trim();if(v&&!re.test(v))throw Error(name+' указан неверно.');next[key]=v;};
 check('uaApplovinKey',applovin.KEY,'Report Key AppLovin');
 check('uaUnityOrg',unity.ORG,'Organization core ID Unity');check('uaUnityKeyId',unity.KEY_ID,'Key ID Unity');check('uaUnitySecret',unity.SECRET,'Secret key Unity');
 check('uaMetaToken',meta.TOKEN,'Токен Meta');
 if(next.uaMetaAccounts!==undefined){const v=String(next.uaMetaAccounts||'').trim();if(v&&v.split(/[\s,;]+/).some(x=>x&&!meta.ACCOUNT.test(x)))throw Error('ID рекламных аккаунтов Meta — числа (можно с act_), через запятую.');next.uaMetaAccounts=v;}
}

// --- Numbers --------------------------------------------------------------------------------------------------
const money=(v,c='USD')=>{try{return Number(v||0).toLocaleString('ru-RU',{style:'currency',currency:c,maximumFractionDigits:v>=1000?0:2});}catch{return Number(v||0).toFixed(2)+' '+c;}};
const big=n=>Number(n||0).toLocaleString('ru-RU');
// ROAS from ad revenue of the same days, when «Реклама и монетизация» has a ready source (USD only).
async function adRevenue(s,start,end){
 try{
  if(!kit.installed(s,'ad-revenue'))return null;
  const ready=require('../ad-revenue/sources.cjs').create(s).ready();
  if(!ready.length)return null;
  let revenue=0;
  for(const x of ready){const r=await x.source.fetch(s,{start,end,current:{start,end},check:()=>{}});revenue+=(r.rows||[]).reduce((a,row)=>a+(Number(row.revenue)||0),0);}
  return {revenue,sources:ready.map(x=>x.name)};
 }catch{return null;}
}

async function uaTurn(s,command,now=Date.now()){
 const reg=registry(s);
 const ready=reg.list();
 const p=UA.period(command,now);
 const named=reg.named(command).filter(id=>ready.some(x=>x.id===id));
 s.requestProgress?.report?.('Читаю отчёты о закупке');
 const all=await reg.fetchAll({start:p.start,end:p.end});
 if(!all.used.length)return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+all.failed.map(f=>f.name+': '+f.error).join(' ')});
 const rows=named.length?all.rows.filter(r=>named.includes(r.source)):all.rows;
 const byCurrency=UA.summarize(rows,[]);
 const main=byCurrency[0]||{currency:'USD',spend:0,installs:0,clicks:0,impressions:0,cpi:null,ctr:null,cvr:null};
 const cur=rows.filter(r=>r.currency===main.currency);
 const notes=[...all.notes];
 if(byCurrency.length>1)notes.push('Есть расходы в других валютах: '+byCurrency.slice(1).map(x=>money(x.spend,x.currency)).join(', ')+' — они не сложены с '+main.currency+'.');
 for(const f of all.failed)notes.unshift(f.name+': '+f.error);
 if(p.partial)notes.push('За сегодня данные неполные: сети обновляют отчёты с задержкой.');
 let roas=null;
 if(main.currency==='USD'&&main.spend>0&&!named.length){const r=await adRevenue(s,p.start,p.end);if(r)roas={revenue:Math.round(r.revenue*100)/100,value:UA.roas(r.revenue,main.spend),sources:r.sources};}
 const card={period:{start:p.start,end:p.end,label:p.label,partial:!!p.partial},sources:all.used.map(x=>x.name),filter:named,currency:main.currency,
  totals:{spend:main.spend,installs:main.installs,clicks:main.clicks,impressions:main.impressions,cpi:main.cpi,ctr:main.ctr,cvr:main.cvr},
  networks:UA.summarize(cur,'network').slice(0,10),campaigns:UA.summarize(cur,'campaign').slice(0,15),
  daily:UA.summarize(cur,'date').sort((a,b)=>a.date.localeCompare(b.date)),countries:UA.summarize(cur,'country').filter(x=>x.country).slice(0,8),
  roas,notes:notes.slice(0,6),empty:!cur.length,at:Date.now()};
 let text;
 if(card.empty)text='Расходов на закупку '+p.label+' нет'+(named.length?' в '+named.map(id=>ready.find(x=>x.id===id)?.name).join(', '):'')+'.';
 else{
  const n=card.networks[0];
  text=p.label[0].toUpperCase()+p.label.slice(1)+' на закупку ушло '+money(main.spend,main.currency)+': '+big(main.installs)+' '+kit.plural(main.installs,['установка','установки','установок'])+(main.cpi!=null?', CPI '+money(main.cpi,main.currency):'')+'.'+
   (card.networks.length>1&&n?' Больше всего — '+n.network+': '+money(n.spend,main.currency)+(n.cpi!=null?' (CPI '+money(n.cpi,main.currency)+')':'')+'.':'')+
   (roas?.value!=null?' ROAS по выручке с рекламы: '+Math.round(roas.value*100)+'%.':'');
 }
 return kit.reply(s,command,{by:BY,text:text+(all.failed.length?' Не удалось прочитать: '+all.failed.map(f=>f.name).join(', ')+'.':''),data:{uaCampaigns:card}});
}

async function turn(s,command){
 const text=String(command||'');
 if(!about(text)||!kit.installed(s,ID))return null;
 if(!registry(s).list().length)return kit.reply(s,command,{by:BY,question:true,text:'Отчёты о закупке ещё не подключены. Откройте Настройки → «Закупка трафика» и укажите ключ AppLovin, сервисный аккаунт Unity Ads или токен Meta — потом повторите вопрос.'});
 try{return await uaTurn(s,text);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'Отчёт недоступен.')});}
}
function setup(s){
 return {ipc:{
  status:()=>({sources:registry(s).all(),reusesApplovinKey:!s.settings.uaApplovinKey&&!!s.settings.adRevenueApplovinKey}),
  // «Проверить подключение»: yesterday from each ready source, nothing stored.
  async check(){
   const out=[];const day=UA.shift(new Date().toISOString().slice(0,10),-1);
   for(const x of registry(s).list()){try{const r=await registry(s).fetch(x.id,{start:day,end:day});out.push({id:x.id,name:x.name,ok:true,rows:r.rows.length});}catch(e){out.push({id:x.id,name:x.name,ok:false,error:e.message});}}
   if(!out.length)throw Error('Сначала сохраните ключ хотя бы одной сети.');
   return out;
  }
 }};
}
module.exports={name:'uaCampaigns',defaults:{['extension_'+ID]:'false',uaApplovinKey:'',uaUnityOrg:'',uaUnityKeyId:'',uaUnitySecret:'',uaMetaAccounts:'',uaMetaToken:''},
 secrets:['uaApplovinKey','uaUnitySecret','uaMetaToken'],validate,setup,turn,about,uaTurn};
