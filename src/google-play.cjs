const {createSign,createPrivateKey}=require('node:crypto');
const ROOT='https://playdeveloperreporting.googleapis.com/v1beta1/';
function credential(value){const c=typeof value==='string'?JSON.parse(value):value;if(c?.type==='oauth'){if(typeof c.refresh_token!=='string'||!c.client?.client_id)throw new Error('Подключите Google Play заново.');return {type:'oauth',client:{client_id:c.client.client_id,client_secret:c.client.client_secret},refresh_token:c.refresh_token,email:String(c.email||'')};}if(c?.type!=='service_account'||typeof c.client_email!=='string'||!c.client_email.endsWith('.gserviceaccount.com')||typeof c.private_key!=='string')throw new Error('Выберите JSON ключ сервисного аккаунта Google.');createPrivateKey(c.private_key);return {type:c.type,client_email:c.client_email,private_key:c.private_key};}
const date=d=>({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),timeZone:{id:'America/Los_Angeles'}});
const day=t=>new Date(Date.UTC(t.year,t.month-1,t.day));
const fmt=t=>`${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`;
function metric(row,name){const raw=row?.metrics?.find(m=>m.metric===name)?.decimalValue?.value;return raw!==undefined&&Number.isFinite(Number(raw))?Number(raw):null;}
// One-click connection: the Google account of the Play Console user signs in in the browser (OAuth for desktop apps,
// loopback redirect with PKCE) and grants read access to Android vitals reports. Resolves with the credential to save.
const SCOPE='https://www.googleapis.com/auth/playdeveloperreporting';
async function login({client,open,request,timeout=300000}){
 if(!client?.client_id)throw new Error('В сборке нет OAuth-клиента Google. Импортируйте ключ сервисного аккаунта.');
 const http=require('node:http'),{randomBytes,createHash}=require('node:crypto');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');let redirect,done,fail;
 const result=new Promise((resolve,reject)=>{done=resolve;fail=reject;});
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');
  if(req.method!=='GET'||u.pathname!=='/callback'||u.searchParams.get('state')!==state){require('./oauth-page.cjs').reply(res,{status:400,ok:false,title:'Недопустимый ответ авторизации.',text:'Нажмите «Подключить» в Пете ещё раз.',close:false});return;}
  try{if(u.searchParams.has('error')||!u.searchParams.get('code'))throw new Error('Вход отменён в Google.');
   const tokens=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...client,grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect,code_verifier:verifier}).toString()});
   if(!tokens.refresh_token||!String(tokens.scope||'').split(' ').includes(SCOPE))throw new Error('Google не дал постоянный доступ к отчётам Google Play.');
   require('./oauth-page.cjs').reply(res,{title:'Google Play подключён.'});done({type:'oauth',client,refresh_token:tokens.refresh_token});
  }catch(e){require('./oauth-page.cjs').reply(res,{ok:false,title:'Не удалось подключить.',text:e.message,close:false});fail(e);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 redirect='http://127.0.0.1:'+server.address().port+'/callback';
 const timer=setTimeout(()=>fail(new Error('Время входа истекло. Нажмите «Подключить» ещё раз.')),timeout);timer.unref?.();
 try{await open('https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPE,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'}));return await result;}
 finally{clearTimeout(timer);server.close();}
}
// Google's 403 says why in its body: the reporting API is off in the OAuth client's Google Cloud project, or the
// signed-in account (or service account) has no access to apps in Play Console. Say which, instead of «HTTP 403».
function explain(error){
 if(error?.status!==403&&error?.status!==401)return error;
 let body={};try{body=JSON.parse(error.detail||'{}').error||{};}catch{}
 const text=String(body.message||error.detail||''),reasons=(body.details||[]).map(d=>d.reason||'').join(' ');
 let message;
 if(/SERVICE_DISABLED|has not been used in project|is disabled/i.test(reasons+' '+text)){
  const project=/project (\d+)/.exec(text)?.[1];
  message='В Google Cloud не включён Google Play Developer Reporting API'+(project?' (проект '+project+')':'')+'. Включите его: '+('https://console.cloud.google.com/apis/library/playdeveloperreporting.googleapis.com'+(project?'?project='+project:''))+' — и через пару минут нажмите «Проверить».';
 }else if(error.status===401)message='Google не принял вход в Google Play. Нажмите «Отключить» и подключите заново.';
 else message='У аккаунта нет доступа к отчётам Google Play. В Play Console → «Пользователи и разрешения» пригласите этот аккаунт (или сервисный аккаунт) с правом «Просмотр информации о приложении» и подождите до суток'+(text?'. Ответ Google: '+text.slice(0,200):'.');
 const out=new Error(message);out.status=error.status;out.detail=error.detail;return out;
}
class GooglePlay {
 constructor({settings,request}){this.settings=settings;this.request=request;}
 async token(){
  const s=this.settings();if(s.module_googleplay==='false')throw new Error('Включите Google Play в подключениях.');if(!s.googlePlayCredential)throw new Error('Подключите Google Play: импортируйте ключ сервисного аккаунта с доступом к Android vitals.');
  if(this.cached?.key===s.googlePlayCredential&&this.cached.until>Date.now()+60000)return this.cached.token;
  const c=credential(s.googlePlayCredential);
  if(c.type==='oauth'){const result=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...c.client,grant_type:'refresh_token',refresh_token:c.refresh_token}).toString()});if(!result.access_token)throw new Error('Вход Google Play истёк. Нажмите «Подключить» ещё раз.');this.cached={key:s.googlePlayCredential,token:result.access_token,until:Date.now()+Number(result.expires_in||3600)*1000};return result.access_token;}
  const token=await require('./google-service-account.cjs').token(c,SCOPE,this.request);
  this.cached={key:s.googlePlayCredential,token,until:Date.now()+3000000};return token;
 }
 async api(route,body){const token=await this.token();try{return await this.request(ROOT+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{}});}catch(error){throw explain(error);}}
 async apps(){let pageToken;const all=[];for(let page=0;page<100;page++){const result=await this.api('apps:search?'+new URLSearchParams({pageSize:100,...pageToken?{pageToken}:{}}));all.push(...result.apps||[]);pageToken=result.nextPageToken;if(!pageToken)return all.map(a=>({id:a.name,label:a.displayName||a.packageName||a.name,packageName:a.packageName||a.name.replace(/^apps\//,'')}));}throw new Error('Слишком много приложений Google Play.');}
 // Android vitals errors (the «Крэши» crash source, src/extensions/google-play/crash-source.cjs).
 // The last complete day of a DAILY metric set (America/Los_Angeles calendar date), or null.
 async freshness(app,set){const info=await this.api(app+'/'+set);const end=info?.freshnessInfo?.freshnesses?.find(f=>f.aggregationPeriod==='DAILY')?.latestEndTime;return end?.year?day(end):null;}
 // Error issues with reports in [start, end) (UTC, hour-aligned), most reports first: vitals.errors.issues.search.
 async errorIssues(app,{start,end,filter,pageSize=100}){
  const hour=d=>new Date(Math.floor(d.getTime()/3600000)*3600000);
  const at=(prefix,d)=>({[prefix+'.year']:d.getUTCFullYear(),[prefix+'.month']:d.getUTCMonth()+1,[prefix+'.day']:d.getUTCDate(),[prefix+'.hours']:d.getUTCHours()});
  const query=new URLSearchParams({...at('interval.startTime',hour(start)),...at('interval.endTime',hour(end)),...filter?{filter}:{},orderBy:'errorReportCount desc',pageSize:String(pageSize)});
  const result=await this.api(app+'/errorIssues:search?'+query);
  return {issues:Array.isArray(result?.errorIssues)?result.errorIssues:[],more:!!result?.nextPageToken};
 }
 // Rows of a DAILY metric set between two dates (end exclusive), all pages: errorCountMetricSet, crashRateMetricSet.
 async metricRows(app,set,{start,end,dimensions=[],metrics,filter}){
  const body={timelineSpec:{aggregationPeriod:'DAILY',startTime:date(start),endTime:date(end)},...dimensions.length?{dimensions}:{},metrics,...filter?{filter}:{},pageSize:10000};
  const rows=[];let pageToken;
  for(let page=0;page<10;page++){const result=await this.api(app+'/'+set+':query',{...body,...pageToken?{pageToken}:{}});rows.push(...result?.rows||[]);pageToken=result?.nextPageToken;if(!pageToken)return rows;}
  throw new Error('Google вернул слишком много строк.');
 }
 async read(command,topic,context=''){
  const apps=await this.apps();if(!apps.length)throw new Error('Нет доступных приложений Google Play. Проверьте права сервисного аккаунта.');const hay=(command+' '+context).toLowerCase();
  const explicit=apps.filter(a=>[a.label,a.packageName].some(n=>n&&command.toLowerCase().includes(n.toLowerCase())));
  let app=explicit.length===1?explicit[0]:apps.find(a=>a.id===topic.playApp);
  if(explicit.length>1)app=null;
  if(!app){const found=apps.filter(a=>[a.label,a.packageName].some(n=>n&&hay.includes(n.toLowerCase())));if(found.length===1)app=found[0];}
  if(!app&&apps.length===1)app=apps[0];
  if(!app)return {question:'Для какого приложения проверить ANR?',field:'playApp',options:apps.map(a=>({id:a.id,label:a.label+' · '+a.packageName}))};
  if(!/^apps\/[a-zA-Z0-9._-]+$/.test(app.id))throw new Error('Google вернул некорректный идентификатор приложения.');topic.playApp=app.id;
  const name=app.id+'/anrRateMetricSet',info=await this.api(name),end=info.freshnessInfo?.freshnesses?.find(f=>f.aggregationPeriod==='DAILY')?.latestEndTime;
  if(!end?.year)throw new Error('Google Play пока не сообщает дату доступных данных ANR.');
  let endDate=day(end),startDate=new Date(endDate-7*86400000);
  const requestedDate=command.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if(/вчера|сегодня/iu.test(command)||requestedDate){
   const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
   const get=k=>Number(parts.find(p=>p.type===k).value);
   startDate=requestedDate?new Date(requestedDate[1]+'T00:00:00Z'):new Date(Date.UTC(get('year'),get('month')-1,get('day'))-(/вчера/iu.test(command)?86400000:0));
   if(!Number.isFinite(startDate.getTime())||(requestedDate&&fmt(date(startDate))!==requestedDate[1]))throw new Error('Уточните дату в формате ГГГГ-ММ-ДД.');
   endDate=new Date(startDate.getTime()+86400000);
   if(endDate>day(end))return {text:`За ${fmt(date(startDate))} данные ещё не готовы. Последний доступный день — ${fmt(date(new Date(day(end)-86400000)))}.`,title:'ANR · '+app.label};
  }
  const requestedVersion=command.match(/(?:верс(?:ия|ии|ию)|versionCode)\s*[:=]?\s*(\d+(?:\.\d+)*)/iu);
  if(requestedVersion?.[1].includes('.'))throw new Error('Для фильтра ANR нужен числовой versionCode сборки Google Play, а не имя версии. Назовите versionCode.');

  if(requestedVersion)topic.versionCode=requestedVersion[1];
  if(/все версии|всем версиям/iu.test(command))delete topic.versionCode;
  const body={timelineSpec:{aggregationPeriod:'DAILY',startTime:date(startDate),endTime:date(endDate)},...((requestedVersion||topic.versionCode)?{filter:'versionCode = '+(requestedVersion?.[1]||topic.versionCode)}:{}),metrics:['anrRate','userPerceivedAnrRate','userPerceivedAnrRate7dUserWeighted'],pageSize:1000};
  let rows=[],pageToken;for(let page=0;page<20;page++){const result=await this.api(name+':query',{...body,...pageToken?{pageToken}:{}});rows.push(...result.rows||[]);pageToken=result.nextPageToken;if(!pageToken)break;}
  if(pageToken)throw new Error('Google вернул слишком много строк ANR.');
  rows.sort((a,b)=>day(b.startTime)-day(a.startTime));const latest=rows[0];
  const sources=[{title:'Android vitals · Google Play Console',url:'https://play.google.com/console/'}];
  if(!latest)return {text:`${app.label}: Google Play не вернул данные ANR за ${fmt(date(startDate))} — ${fmt(date(new Date(endDate-86400000)))}. Это не означает, что ANR равен нулю.`,sources,title:'ANR · '+app.label};
  const rate=metric(latest,'anrRate'),perceived=metric(latest,'userPerceivedAnrRate'),week=metric(latest,'userPerceivedAnrRate7dUserWeighted');
  const value=n=>n===null?'нет данных':(n*100).toLocaleString('ru-RU',{maximumFractionDigits:4})+'%';
  return {text:`${app.label}${topic.versionCode?' · versionCode '+topic.versionCode:''}: последние доступные данные за ${fmt(latest.startTime)}, часовой пояс Google Play — Лос-Анджелес. ANR: ${value(rate)}; заметные пользователям ANR: ${value(perceived)}. Средневзвешенный показатель заметных ANR за 7 дней: ${value(week)}. Это доля пользователей, а не число зависаний.`,title:'ANR · '+app.label,sources,data:{app:app.id,date:fmt(latest.startTime),versionCode:topic.versionCode||null,rate,perceived,week,at:Date.now(),rows}};
 }
}
module.exports={GooglePlay,explain,credential,metric,login,SCOPE,date,day,fmt};
