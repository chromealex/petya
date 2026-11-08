// Store clients: list apps, read reviews and post a reply, normalized to one review shape:
// {id, store:'play'|'appstore', app, rating, title, text, author, date, territory, language, version, reply}
const tokens=require('./tokens.cjs');
const PLAY='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';
const ASC='https://api.appstoreconnect.apple.com/v1/';
const PACKAGE=/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;
const APP_ID=/^\d{5,15}$/;
// Reply limits of the stores: Google Play rejects replies over 350 characters; Apple allows about 5970.
const LIMITS={play:350,appstore:5970};
const RELEASED=/^(?:READY_FOR_SALE|READY_FOR_DISTRIBUTION|REPLACED_WITH_NEW_VERSION|REMOVED_FROM_SALE|DEVELOPER_REMOVED_FROM_SALE|PROCESSING_FOR_DISTRIBUTION|ACCEPTED)$/;

// «Bunker Wars = com.jw.bunker» or just «com.jw.bunker», one per line or comma separated.
function list(value,valid){
 return String(value||'').split(/[\n,;]+/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const m=line.match(/^(.*?)\s*=\s*(\S+)$/),id=(m?m[2]:line).trim(),label=(m?m[1]:'').trim();
  if(!valid.test(id))throw Error('Некорректный идентификатор «'+id+'».');
  return {id,label};
 });
}
const safe=(fn,fallback)=>{try{return fn();}catch{return fallback;}};

// --- Google Play ---------------------------------------------------------------------------------
async function playApps(s){
 const configured=safe(()=>list(s.settings.storeReviewsPlayPackages,PACKAGE),[]);
 // Names (and packages when none are configured) come from the shared Google Play adapter when it can list apps.
 let known=[];
 if(!configured.length||configured.some(a=>!a.label)){
  try{const {GooglePlay}=require('../../google-play.cjs');known=await new GooglePlay({settings:()=>s.settings,request:s.request}).apps();}catch{known=[];}
 }
 const rows=configured.length?configured.map(a=>({id:a.id,label:a.label||known.find(k=>k.packageName===a.id)?.label||a.id})):known.map(k=>({id:k.packageName,label:k.label||k.packageName}));
 return rows.filter(a=>PACKAGE.test(a.id)).map(a=>({...a,store:'play'}));
}
const seconds=t=>t?.seconds?new Date(Number(t.seconds)*1000+Math.round(Number(t.nanos||0)/1e6)).toISOString():null;
function playReview(pkg,r){
 const user=r.comments?.find(c=>c.userComment)?.userComment,dev=r.comments?.find(c=>c.developerComment)?.developerComment;
 if(!user)return null;
 // The text of a Play review is «title\tbody» when the reviewer wrote a title.
 const [title,...rest]=String(user.text||'').split('\t');
 return {id:String(r.reviewId),store:'play',app:pkg,rating:Number(user.starRating)||0,title:rest.length?title.trim():'',text:(rest.length?rest.join(' '):title).trim(),
  author:String(r.authorName||''),date:seconds(user.lastModified),territory:'',language:String(user.reviewerLanguage||''),
  version:String(user.appVersionName||''),versionCode:user.appVersionCode?Number(user.appVersionCode):null,device:String(user.deviceMetadata?.productName||user.device||''),
  reply:dev?{text:String(dev.text||''),date:seconds(dev.lastModified),state:'published'}:null};
}
// Google keeps only reviews with text from the last 7 days in this API.
async function playReviews(s,pkg,{pages=10}={}){
 if(!PACKAGE.test(pkg))throw Error('Некорректное имя пакета Google Play.');
 const token=await tokens.playToken(s.settings,s.request);
 const rows=[];let next;
 for(let page=0;page<pages;page++){
  const query=new URLSearchParams({maxResults:'100',...next?{token:next}:{}});
  const result=await s.request(PLAY+encodeURIComponent(pkg)+'/reviews?'+query,{headers:{Authorization:'Bearer '+token}});
  for(const r of result?.reviews||[]){const row=playReview(pkg,r);if(row)rows.push(row);}
  next=result?.tokenPagination?.nextPageToken;if(!next)break;
 }
 return rows;
}
async function playReply(s,pkg,reviewId,text){
 const token=await tokens.playToken(s.settings,s.request);
 const result=await s.request(PLAY+encodeURIComponent(pkg)+'/reviews/'+encodeURIComponent(reviewId)+':reply',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({replyText:text})});
 return {text:String(result?.result?.replyText??text),date:seconds(result?.result?.lastEdited)||new Date().toISOString(),state:'published'};
}

// --- App Store Connect -------------------------------------------------------------------------------
async function asc(s,route,options={}){
 const url=route.startsWith('https://')?route:ASC+route;
 if(!url.startsWith(ASC))throw Error('Недопустимый адрес App Store Connect.');
 return s.request(url,{...options,headers:{Authorization:'Bearer '+tokens.ascToken(s.settings),...options.body?{'Content-Type':'application/json'}:{},...options.headers}});
}
async function ascApps(s){
 const configured=safe(()=>list(s.settings.storeReviewsAscApps,APP_ID),[]);
 const query=new URLSearchParams({'fields[apps]':'name,bundleId',limit:'200',...configured.length?{'filter[id]':configured.map(a=>a.id).join(',')}:{}});
 let found=[];
 try{found=(await asc(s,'apps?'+query))?.data||[];}catch(e){if(!configured.length)throw e;}
 const rows=configured.length?configured.map(a=>{const f=found.find(x=>x.id===a.id);return {id:a.id,label:a.label||f?.attributes?.name||a.id,bundle:f?.attributes?.bundleId||''};})
  :found.map(f=>({id:String(f.id),label:f.attributes?.name||f.id,bundle:f.attributes?.bundleId||''}));
 return rows.filter(a=>APP_ID.test(a.id)).map(a=>({...a,store:'appstore'}));
}
function ascReview(appId,r,included){
 const a=r.attributes||{},link=r.relationships?.response?.data,resp=link&&included.find(x=>x.type==='customerReviewResponses'&&x.id===link.id)?.attributes;
 return {id:String(r.id),store:'appstore',app:appId,rating:Number(a.rating)||0,title:String(a.title||'').trim(),text:String(a.body||'').trim(),author:String(a.reviewerNickname||''),
  date:a.createdDate?new Date(a.createdDate).toISOString():null,territory:String(a.territory||''),language:'',version:'',versionCode:null,
  reply:resp?{text:String(resp.responseBody||''),date:resp.lastModifiedDate||null,state:resp.state==='PENDING_PUBLISH'?'pending':'published'}:null};
}
// Newest first until the reviews are older than `since` (or the page limit).
async function ascReviews(s,appId,{since,territory,pages=5}={}){
 if(!APP_ID.test(appId))throw Error('Некорректный id приложения App Store.');
 const query=new URLSearchParams({sort:'-createdDate',limit:'200',include:'response','fields[customerReviews]':'rating,title,body,reviewerNickname,createdDate,territory,response','fields[customerReviewResponses]':'responseBody,lastModifiedDate,state',...territory?{'filter[territory]':territory}:{}});
 const rows=[];let url='apps/'+appId+'/customerReviews?'+query;
 for(let page=0;page<pages&&url;page++){
  const result=await asc(s,url);
  for(const r of result?.data||[])rows.push(ascReview(appId,r,result.included||[]));
  url=result?.links?.next||null;
  if(since&&rows.length&&new Date(rows.at(-1).date)<since)break;
 }
 return rows;
}
// The app-level list has no version; the latest versions' own review lists tell which review belongs to them.
async function ascVersions(s,appId,{count=2}={}){
 const versions=((await asc(s,'apps/'+appId+'/appStoreVersions?'+new URLSearchParams({'fields[appStoreVersions]':'versionString,createdDate,appStoreState,appVersionState',limit:'10'})))?.data||[])
  .map(v=>({id:v.id,version:String(v.attributes?.versionString||''),created:v.attributes?.createdDate||'',state:v.attributes?.appVersionState||v.attributes?.appStoreState||''}))
  // Only versions players could have installed.
  .filter(v=>v.version&&RELEASED.test(v.state)).sort((a,b)=>String(b.created).localeCompare(String(a.created))).slice(0,count);
 const byReview=new Map();
 for(const v of versions){
  const result=await asc(s,'appStoreVersions/'+v.id+'/customerReviews?'+new URLSearchParams({sort:'-createdDate',limit:'200','fields[customerReviews]':'createdDate'}));
  for(const r of result?.data||[])if(!byReview.has(r.id))byReview.set(String(r.id),v.version);
 }
 return {versions,byReview};
}
async function ascReply(s,reviewId,text){
 const result=await asc(s,'customerReviewResponses',{method:'POST',body:JSON.stringify({data:{type:'customerReviewResponses',attributes:{responseBody:text},relationships:{review:{data:{type:'customerReviews',id:reviewId}}}}})});
 const a=result?.data?.attributes||{};
 return {text:String(a.responseBody??text),date:a.lastModifiedDate||new Date().toISOString(),state:a.state==='PUBLISHED'?'published':'pending'};
}
module.exports={PACKAGE,APP_ID,LIMITS,list,playApps,playReviews,playReply,playReview,ascApps,ascReviews,ascVersions,ascReply,ascReview};
