const {createSign,createPrivateKey}=require('node:crypto');
const ROOT='https://playdeveloperreporting.googleapis.com/v1beta1/';
function credential(value){const c=typeof value==='string'?JSON.parse(value):value;if(c?.type!=='service_account'||typeof c.client_email!=='string'||!c.client_email.endsWith('.gserviceaccount.com')||typeof c.private_key!=='string')throw new Error('Выберите JSON ключ сервисного аккаунта Google.');createPrivateKey(c.private_key);return {type:c.type,client_email:c.client_email,private_key:c.private_key};}
const date=d=>({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),timeZone:{id:'America/Los_Angeles'}});
const day=t=>new Date(Date.UTC(t.year,t.month-1,t.day));
const fmt=t=>`${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`;
function metric(row,name){const raw=row?.metrics?.find(m=>m.metric===name)?.decimalValue?.value;return raw!==undefined&&Number.isFinite(Number(raw))?Number(raw):null;}
class GooglePlay {
 constructor({settings,request}){this.settings=settings;this.request=request;}
 async token(){
  const s=this.settings();if(s.module_googleplay==='false')throw new Error('Включите Google Play в подключениях.');if(!s.googlePlayCredential)throw new Error('Подключите Google Play: импортируйте ключ сервисного аккаунта с доступом к Android vitals.');
  if(this.cached?.key===s.googlePlayCredential&&this.cached.until>Date.now()+60000)return this.cached.token;
  const c=credential(s.googlePlayCredential),now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:c.client_email,scope:'https://www.googleapis.com/auth/playdeveloperreporting',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const sign=createSign('RSA-SHA256');sign.update(unsigned);const assertion=unsigned+'.'+sign.sign(c.private_key,'base64url');
  const result=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()});
  if(!result.access_token)throw new Error('Google не выдал доступ к отчётам.');this.cached={key:s.googlePlayCredential,token:result.access_token,until:Date.now()+Number(result.expires_in||3600)*1000};return result.access_token;
 }
 async api(route,body){const token=await this.token();return this.request(ROOT+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{}});}
 async apps(){let pageToken;const all=[];for(let page=0;page<100;page++){const result=await this.api('apps:search?'+new URLSearchParams({pageSize:100,...pageToken?{pageToken}:{}}));all.push(...result.apps||[]);pageToken=result.nextPageToken;if(!pageToken)return all.map(a=>({id:a.name,label:a.displayName||a.packageName||a.name,packageName:a.packageName||a.name.replace(/^apps\//,'')}));}throw new Error('Слишком много приложений Google Play.');}
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
module.exports={GooglePlay,credential,metric};
