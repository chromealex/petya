// Whether a name is used in the stores and as a .com domain. App Store: the public iTunes Search API, one request
// per candidate, sequential. Google Play has no search API: one web search through Petya's own search tool for
// all candidates together, or a note when web search is off. Domain: RDAP (rdap.org redirects to the registry).
const checks=require('./checks.cjs');
const ITUNES='https://itunes.apple.com/search';

function classify(name,listings){
 const out=[];
 for(const l of listings){
  const main=checks.title(l.name);
  const r=checks.compare(name,main,{contains:true})==='exact'?'exact':checks.compare(name,l.name,{contains:true});
  if(r)out.push({kind:r,name:l.name,url:l.url||'',seller:l.seller||''});
 }
 out.sort((a,b)=>(a.kind==='exact'?0:1)-(b.kind==='exact'?0:1));
 return {status:out.some(m=>m.kind==='exact')?'taken':out.length?'similar':'free',matches:out.slice(0,3)};
}
async function appStore(name,{fetcher=globalThis.fetch,timeout=10000}={}){
 const country=checks.script(name)==='cyrillic'?'RU':'US';
 const q=new URLSearchParams({term:name,entity:'software',limit:'15',country});
 try{
  const r=await fetcher(ITUNES+'?'+q,{signal:AbortSignal.timeout(timeout),headers:{Accept:'application/json'}});
  if(!r.ok)return {status:'unknown',error:'App Store: HTTP '+r.status};
  const data=await r.json();
  return {...classify(name,(data.results||[]).map(x=>({name:String(x.trackName||''),url:String(x.trackViewUrl||''),seller:String(x.sellerName||x.artistName||'')}))),country};
 }catch(e){return {status:'unknown',error:'App Store недоступен ('+(e.name==='TimeoutError'?'истекло время ожидания':e.message)+')'};}
}
// One search for all candidates; titles are «<App> - Apps on Google Play» / «<App> – Приложения в Google Play».
async function googlePlay(names,s){
 const web=s.webSearchEngine;
 if(!web?.searchAPI||!web.enabled?.())return {skipped:'Google Play не проверен: включите «Поиск в интернете» в «Подключениях».'};
 const query='site:play.google.com/store/apps '+names.slice(0,8).map(n=>'"'+n.replace(/"/g,'')+'"').join(' OR ');
 let links;
 try{links=await web.searchAPI(query,false);}catch(e){return {skipped:'Google Play не проверен: '+e.message};}
 const listings=(links||[]).filter(l=>/^https:\/\/play\.google\.com\/store\/apps\//.test(String(l.url||''))).map(l=>({name:String(l.title||'').replace(/\s[-–—]\s(?:Apps on Google Play|Приложения в Google Play|Google Play)\s*$/iu,'').trim(),url:l.url}));
 return {results:Object.fromEntries(names.map(n=>[n,classify(n,listings)])),count:listings.length};
}
// RDAP: 404 → not registered, 200 → registered.
function slug(name){return checks.toLatin(String(name)).toLowerCase().replace(/[^a-z0-9]+/g,'');}
async function domain(name,{fetcher=globalThis.fetch,timeout=10000}={}){
 const s=slug(name);if(s.length<3||s.length>63)return null;
 const host=s+'.com';
 try{
  const r=await fetcher('https://rdap.org/domain/'+host,{redirect:'follow',signal:AbortSignal.timeout(timeout),headers:{Accept:'application/rdap+json'}});
  if(r.status===404)return {domain:host,status:'free'};
  if(r.ok)return {domain:host,status:'taken'};
  return {domain:host,status:'unknown',error:'RDAP: HTTP '+r.status};
 }catch(e){return {domain:host,status:'unknown',error:'RDAP недоступен'};}
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports={appStore,googlePlay,domain,classify,slug,pause};
