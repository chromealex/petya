// App Store Connect as a «purchase-source» (src/features/purchase-sources.cjs): the daily Sales and Trends summary
// sales report, GET https://api.appstoreconnect.apple.com/v1/salesReports with
//   filter[frequency]=DAILY, filter[reportType]=SALES, filter[reportSubType]=SUMMARY, filter[version]=1_0,
//   filter[vendorNumber]=<vendor>, filter[reportDate]=YYYY-MM-DD
// and `Authorization: Bearer <ES256 JWT>` signed with the team API key (.p8) — the key needs the Sales (or Finance,
// Admin) role. The answer is a gzip'd tab-separated file; 404 means no sales that day. Only in-app purchase rows are
// kept (product type identifiers IA1, IA9, IAY, IAC, FI1 and their Mac variants); Units < 0 are refunds.
// The amount is Units × Customer Price in Customer Currency (what the player paid); Developer Proceeds are kept
// with Currency of Proceeds. Daily reports exist for the last 365 days.
// The key: this app's own (iapAsc*), or the one saved in «Отзывы в сторах» when this one is empty.
const zlib=require('node:zlib');
const tokens=require('../store-reviews/tokens.cjs');
const deps={base:'https://api.appstoreconnect.apple.com',fetch:(...a)=>fetch(...a),concurrency:4};
const IAP=/^(?:IA1|IA9|IAY|IAC|FI1)(?:-M)?$/;
const SUBSCRIPTION=/^(?:IAY|IAC|IA9)(?:-M)?$/;
const VENDOR=/^\d{5,12}$/;

// The key to sign with: own fields first, the «Отзывы в сторах» key as a whole otherwise (never mixed).
function key(settings){
 const own={storeReviewsAscIssuer:settings.iapAscIssuer,storeReviewsAscKeyId:settings.iapAscKeyId,storeReviewsAscKey:settings.iapAscKey};
 if(String(settings.iapAscIssuer||'').trim()&&String(settings.iapAscKeyId||'').trim()&&String(settings.iapAscKey||'').trim())return {settings:own,shared:false};
 if(String(settings.storeReviewsAscIssuer||'').trim()&&String(settings.storeReviewsAscKeyId||'').trim()&&String(settings.storeReviewsAscKey||'').trim())return {settings,shared:true};
 return null;
}
const vendor=settings=>String(settings.iapAscVendor||'').trim();
const ready=settings=>settings.extension_iap==='true'&&!!key(settings)&&VENDOR.test(vendor(settings));

// Tab-separated report → objects by header name.
function tsv(text){
 const lines=String(text||'').replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());
 if(!lines.length)return [];
 const head=lines[0].split('\t').map(h=>h.trim());
 return lines.slice(1).map(l=>{const v=l.split('\t');return Object.fromEntries(head.map((h,i)=>[h,(v[i]??'').trim()]));});
}
const usDate=v=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v||''));return m?m[3]+'-'+m[1]+'-'+m[2]:String(v||'').slice(0,10);};
function rows(report){
 const out=[];
 for(const r of tsv(report)){
  const type=r['Product Type Identifier'];if(!IAP.test(type))continue;
  const units=Number(r.Units),price=Number(r['Customer Price']),proceeds=Number(r['Developer Proceeds']);
  if(!Number.isFinite(units)||!units)continue;
  out.push({date:usDate(r['Begin Date']),store:'appstore',product:r.SKU||r['Apple Identifier'],title:r.Title,type:SUBSCRIPTION.test(type)?'subscription':'iap',
   kind:units<0?'refund':'purchase',units:Math.abs(units),amount:Math.abs(units*(Number.isFinite(price)?price:0)),currency:r['Customer Currency'],
   proceeds:Number.isFinite(proceeds)?Math.abs(units*proceeds):null,proceedsCurrency:r['Currency of Proceeds'],country:r['Country Code'],platform:'ios'});
 }
 return out;
}

function explain(status,detail){
 const map={401:'App Store Connect не принял ключ API: проверьте Issuer ID, Key ID и файл .p8.',403:'У ключа App Store Connect нет доступа к отчётам о продажах: нужна роль Sales, Finance или Admin.',429:'App Store Connect ограничил число запросов. Повторите позже.'};
 let text='';try{text=JSON.parse(detail)?.errors?.[0]?.detail||'';}catch{text='';}
 const e=Error(map[status]||'App Store Connect вернул HTTP '+status+(text?': '+String(text).slice(0,200):'.'));e.status=status;return e;
}
async function day(s,date,token){
 const q=new URLSearchParams({'filter[frequency]':'DAILY','filter[reportType]':'SALES','filter[reportSubType]':'SUMMARY','filter[version]':'1_0','filter[vendorNumber]':vendor(s.settings),'filter[reportDate]':date});
 const r=await deps.fetch(deps.base+'/v1/salesReports?'+q,{headers:{Authorization:'Bearer '+token,Accept:'application/a-gzip'},redirect:'error',signal:AbortSignal.timeout(90000)});
 if(r.status===404){await r.text().catch(()=>'');return [];}
 if(!r.ok)throw explain(r.status,await r.text().catch(()=>''));
 const buf=Buffer.from(await r.arrayBuffer());
 const text=buf[0]===0x1f&&buf[1]===0x8b?zlib.gunzipSync(buf,{maxOutputLength:64*1024*1024}).toString('utf8'):buf.toString('utf8');
 return rows(text);
}
const days=(a,b)=>{const out=[];for(let t=Date.parse(a+'T00:00:00Z');t<=Date.parse(b+'T00:00:00Z');t+=86400000)out.push(new Date(t).toISOString().slice(0,10));return out;};

module.exports={
 id:'appstore',name:'App Store',maxDays:365,
 names:[/(?:^|[^\p{L}])(?:app ?store|апп? ?стор\p{L}*|эпп? ?стор\p{L}*|ios|айос\p{L}*)(?=$|[^\p{L}])/iu],
 ready,
 hint:settings=>!key(settings)?'Ключ App Store Connect API (Issuer ID, Key ID, .p8) с ролью Sales или Finance':!VENDOR.test(vendor(settings))?'Номер поставщика (Vendor number) из «Платежи и финансовые отчёты»':'',
 async fetch(s,{start,end,check=()=>{}}){
  const k=key(s.settings);if(!k)throw Error('App Store Connect не подключён.');
  const token=tokens.ascToken(k.settings);
  const list=days(start,end),out=[],notes=[];let next=0;
  const worker=async()=>{while(next<list.length){const d=list[next++];check();out.push(...await day(s,d,token));}};
  await Promise.all(Array.from({length:Math.min(deps.concurrency,list.length)},worker));
  if(k.shared)notes.push('App Store: используется ключ из «Отзывы в сторах».');
  return {rows:out,notes};
 },
 deps,rows,tsv,key,IAP
};
