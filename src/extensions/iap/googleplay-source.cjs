// Google Play as a «purchase-source» (src/features/purchase-sources.cjs): the monthly sales reports Google Play
// writes to the developer account's Cloud Storage bucket (Play Console → «Скачать отчёты» → «Финансовые»:
// gs://pubsite_rev_<developer id>/sales/salesreport_YYYYMM.zip, one CSV per month, updated daily).
// Read with the Cloud Storage JSON API, GET https://storage.googleapis.com/storage/v1/b/<bucket>/o/<object>?alt=media,
// with an OAuth token of a service account (scope devstorage.read_only) that was invited to the Play Console with
// «Просмотр финансовых данных» — signed by the shared adapter src/google-service-account.cjs.
// CSV columns used: Order Charged Date, Financial Status (Charged / Refund / …), Product Title, Product ID (package),
// Product Type (inapp / subscription), SKU ID, Currency of Sale, Item Price, Country of Buyer. A refund row is a
// refund whatever the sign of its price. The key: this app's own (iapPlayCredential) or the service-account key of
// «Подключения → Google Play» (googlePlayCredential) when it is one.
const zip=require('./zip.cjs');
const account=require('../../google-service-account.cjs');
const SCOPE='https://www.googleapis.com/auth/devstorage.read_only';
const deps={base:'https://storage.googleapis.com',fetch:(...a)=>fetch(...a)};
const BUCKET=/^pubsite_rev_\d{6,25}$/;

function bucket(settings){const v=String(settings.iapPlayBucket||'').trim().replace(/^gs:\/\//,'').replace(/\/.*$/,'');return BUCKET.test(v)?v:'';}
function credential(settings){
 for(const v of [settings.iapPlayCredential,settings.googlePlayCredential]){if(!v)continue;try{account.parse(v);return v;}catch{/* not a service-account key */}}
 return '';
}
const packages=settings=>String(settings.iapPlayPackages||'').split(/[\s,;]+/).map(x=>x.trim()).filter(x=>/^[A-Za-z][\w.]{2,150}$/.test(x));
const ready=settings=>settings.extension_iap==='true'&&!!bucket(settings)&&!!credential(settings);

// RFC 4180 CSV → objects by header name.
function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 const t=String(text||'').replace(/^﻿/,'');
 for(let i=0;i<t.length;i++){
  const c=t[i];
  if(quoted){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x!==''))rows.push(row);row=[];}else cell+=c;
 }
 row.push(cell);if(row.some(x=>x!==''))rows.push(row);
 if(!rows.length)return [];
 const head=rows[0].map(h=>h.trim());
 return rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]??'').trim()])));
}
const decode=buf=>buf[0]===0xff&&buf[1]===0xfe?buf.subarray(2).toString('utf16le'):buf.toString('utf8');
function rows(text,{only=[]}={}){
 const out=[];
 for(const r of csv(text)){
  const status=String(r['Financial Status']||'').toLowerCase();
  if(!status||/cancel|отмен/.test(status))continue;
  if(only.length&&!only.includes(r['Product ID']))continue;
  const price=Number(String(r['Item Price']||'').replace(/[\s,]/g,''));
  const refund=/refund|chargeback|возврат/.test(status);
  out.push({date:String(r['Order Charged Date']||'').slice(0,10),store:'googleplay',product:r['SKU ID']||r['Product ID'],title:r['Product Title'],
   type:/subscription/i.test(r['Product Type']||'')?'subscription':'iap',kind:refund?'refund':'purchase',units:1,amount:Math.abs(Number.isFinite(price)?price:0),
   currency:r['Currency of Sale'],country:r['Country of Buyer'],platform:'android'});
 }
 return out;
}
const months=(a,b)=>{const out=[];let y=Number(a.slice(0,4)),m=Number(a.slice(5,7));const ey=Number(b.slice(0,4)),em=Number(b.slice(5,7));while(y<ey||y===ey&&m<=em){out.push(String(y)+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}return out;};

module.exports={
 id:'googleplay',name:'Google Play',maxDays:365,
 names:[/(?:^|[^\p{L}])(?:google ?play|гугл ?плей\p{L}*|андроид\p{L}*|android)(?=$|[^\p{L}])/iu],
 ready,
 hint:settings=>!bucket(settings)?'Бакет отчётов Google Play (pubsite_rev_…) из Play Console → «Скачать отчёты»':!credential(settings)?'Ключ сервисного аккаунта с доступом к финансовым отчётам':'',
 async fetch(s,{start,end,check=()=>{}}){
  const b=bucket(s.settings),cred=credential(s.settings);
  if(!b||!cred)throw Error('Google Play не подключён.');
  const token=await account.token(cred,SCOPE,s.request);
  const out=[],notes=[],only=packages(s.settings);
  for(const ym of months(start,end)){
   check();
   const object='sales/salesreport_'+ym+'.zip';
   const r=await deps.fetch(deps.base+'/storage/v1/b/'+encodeURIComponent(b)+'/o/'+encodeURIComponent(object)+'?alt=media',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(120000)});
   if(r.status===404){await r.text().catch(()=>'');notes.push('Google Play: отчёта за '+ym.slice(0,4)+'-'+ym.slice(4)+' ещё нет.');continue;}
   if(r.status===401||r.status===403){await r.text().catch(()=>'');const e=Error('У сервисного аккаунта нет доступа к бакету '+b+': пригласите его в Play Console с правом «Просмотр финансовых данных».');e.status=r.status;throw e;}
   if(!r.ok){await r.text().catch(()=>'');const e=Error('Cloud Storage вернул HTTP '+r.status+'.');e.status=r.status;throw e;}
   const buf=Buffer.from(await r.arrayBuffer());
   out.push(...rows(decode(zip.file(buf)),{only}).filter(x=>x.date>=start&&x.date<=end));
  }
  return {rows:out,notes};
 },
 deps,rows,csv,bucket,credential,months,SCOPE
};
