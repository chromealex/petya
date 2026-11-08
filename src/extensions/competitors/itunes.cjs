// App Store facts of any app without credentials: Apple's public iTunes Search and Lookup APIs.
//   https://itunes.apple.com/lookup?id=<id>[,<id>…]&country=<cc>&entity=software
//   https://itunes.apple.com/search?term=<text>&country=<cc>&entity=software&limit=<n>
// Answers {resultCount, results:[{trackId, trackName, artistName, version, releaseNotes, averageUserRating,
// userRatingCount, averageUserRatingForCurrentVersion, price, currency, formattedPrice, fileSizeBytes,
// currentVersionReleaseDate, releaseDate, trackViewUrl, bundleId, primaryGenreName}]}. The figures are per storefront
// (country). Apple asks to keep to about 20 calls a minute; Petya batches lookups (up to 50 ids per call).
const BASE='https://itunes.apple.com/';
const ID=/^\d{5,15}$/;
const COUNTRY=/^[a-z]{2}$/;
const BATCH=50;

const country=v=>{const c=String(v||'').trim().toLowerCase();return COUNTRY.test(c)?c:'us';};
// «https://apps.apple.com/us/app/clash-of-clans/id529479190» → {id, country}.
function fromUrl(text){
 const m=String(text||'').match(/https?:\/\/(?:apps|itunes)\.apple\.com\/(?:([a-z]{2})\/)?(?:app\/)?(?:[^\s/?#]+\/)?id(\d{5,15})/i);
 return m?{id:m[2],country:m[1]?m[1].toLowerCase():null}:null;
}
function shape(r){
 const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
 return {key:'appstore:'+r.trackId,store:'appstore',id:String(r.trackId),name:String(r.trackName||'').slice(0,200),developer:String(r.artistName||r.sellerName||'').slice(0,200),
  bundle:String(r.bundleId||''),version:String(r.version||'').slice(0,40),notes:String(r.releaseNotes||'').slice(0,4000),
  rating:num(r.averageUserRating)!=null?Math.round(num(r.averageUserRating)*100)/100:null,ratings:num(r.userRatingCount),
  ratingCurrent:num(r.averageUserRatingForCurrentVersion)!=null?Math.round(num(r.averageUserRatingForCurrentVersion)*100)/100:null,ratingsCurrent:num(r.userRatingCountForCurrentVersion),
  price:num(r.price),currency:String(r.currency||''),formattedPrice:String(r.formattedPrice||''),size:num(r.fileSizeBytes),
  updated:r.currentVersionReleaseDate||null,released:r.releaseDate||null,genre:String(r.primaryGenreName||''),
  url:/^https:\/\/apps\.apple\.com\//.test(r.trackViewUrl||'')?String(r.trackViewUrl).replace(/\?.*$/,''):'https://apps.apple.com/app/id'+r.trackId};
}
async function call(s,path,params){
 let r;try{r=await s.request(BASE+path+'?'+new URLSearchParams(params),{headers:{Accept:'application/json'}});}
 catch(e){const x=Error(e.status===403||e.status===429?'App Store ограничил число запросов. Повторите через минуту.':'App Store недоступен'+(e.status?' (HTTP '+e.status+')':'')+'.');x.status=e.status;x.cause=e;throw x;}
 if(!r||typeof r!=='object'||!Array.isArray(r.results))throw Error('App Store вернул некорректный ответ.');
 return r.results.filter(x=>x&&x.trackId&&(x.kind==='software'||x.wrapperType==='software'||!x.kind));
}
// Facts of the given ids in one storefront: Map id → app (missing ids are not in this country's store).
async function lookup(s,ids,cc){
 const list=[...new Set(ids.map(String).filter(i=>ID.test(i)))],out=new Map();
 for(let i=0;i<list.length;i+=BATCH){
  for(const r of await call(s,'lookup',{id:list.slice(i,i+BATCH).join(','),country:country(cc),entity:'software'}))out.set(String(r.trackId),shape(r));
 }
 return out;
}
async function search(s,term,cc,limit=6){
 const t=String(term||'').trim().slice(0,100);
 if(!t)return [];
 return (await call(s,'search',{term:t,country:country(cc),entity:'software',limit:String(limit)})).map(shape);
}
module.exports={lookup,search,fromUrl,country,shape,ID,COUNTRY};
