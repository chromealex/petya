// Calendar REST clients over the mail accounts Petya already has (Google OAuth / Microsoft OAuth, shared tokens):
// Google Calendar API v3 and Microsoft Graph. Read: events of a period and free/busy of people. Write: one event,
// called only from the card's confirm button. Access tokens come from the shared account client (`token()`).
const GOOGLE='https://www.googleapis.com/calendar/v3';
const GRAPH='https://graph.microsoft.com/v1.0';
// Scopes the calendar asks for on top of mail reading (incremental consent).
const SCOPES={
 google:['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.freebusy'],
 microsoft:['Calendars.ReadWrite']
};
// Whether a stored token grant already covers the calendar.
function granted(provider,scope){
 const list=String(scope||'').split(/\s+/).map(s=>s.replace(/^https:\/\/graph\.microsoft\.com\//,''));
 return provider==='microsoft'?list.includes('Calendars.ReadWrite'):SCOPES.google.every(s=>list.includes(s))||list.includes('https://www.googleapis.com/auth/calendar');
}
class CalendarError extends Error{constructor(message,{status=0,unknown=false,scope=false}={}){super(message);Object.assign(this,{status,unknown,scope});}}

class CalendarClient{
 constructor({provider,email,token,fetcher=fetch,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}){Object.assign(this,{provider,email,token,fetcher,timeZone});}
 get name(){return this.provider==='microsoft'?'Outlook':'Google Календарь';}
 async call(url,{method='GET',body,headers={}}={}){
  const access=await this.token();
  let r;
  try{r=await this.fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+access,...body?{'Content-Type':'application/json'}:{},...headers},...body?{body:JSON.stringify(body)}:{}});}
  // No answer at all: for a write the outcome is unknown and must not be repeated automatically.
  catch(e){throw new CalendarError(this.name+': нет ответа сервиса ('+(e.name==='TimeoutError'?'истекло время ожидания':e.message)+').',{unknown:true});}
  let data={};try{data=await r.json();}catch{data={};}
  if(!r.ok)throw this.error(r.status,data);
  return data;
 }
 error(status,data){
  const e=data?.error||{},text=JSON.stringify(e);
  if(status===401)return new CalendarError(this.name+': вход истёк. Подключите календарь заново в настройках «Календаря».',{status,scope:true});
  if(this.provider==='google'&&/accessNotConfigured|SERVICE_DISABLED/.test(text))return new CalendarError('В проекте Google Cloud не включён Google Calendar API. Включите его (APIs & Services → Library → Google Calendar API) и повторите.',{status});
  if(status===403&&/insufficient|SCOPE_INSUFFICIENT|ErrorAccessDenied|AccessDenied/i.test(text))return new CalendarError(this.name+': нет разрешения на календарь. Нажмите «Разрешить доступ к календарю» в настройках «Календаря».',{status,scope:true});
  if(status===429||/rateLimit/i.test(text))return new CalendarError(this.name+': слишком много запросов, повторите через минуту.',{status});
  return new CalendarError(this.name+': запрос не выполнен (HTTP '+status+')'+(e.message?' — '+String(e.message).slice(0,200):'')+'.',{status});
 }

 // Events of [from,to): [{id,title,start,end,allDay,location,link,url,declined,tentative}] sorted by start.
 async events(from,to){
  if(this.provider==='microsoft'){
   const q=new URLSearchParams({startDateTime:from.toISOString(),endDateTime:to.toISOString(),$top:'250',$orderby:'start/dateTime',$select:'id,subject,start,end,isAllDay,location,onlineMeeting,onlineMeetingUrl,webLink,isCancelled,showAs,responseStatus,bodyPreview,attendees,organizer'});
   const data=await this.call(GRAPH+'/me/calendarView?'+q,{headers:{Prefer:'outlook.timezone="UTC"'}});
   return (data.value||[]).filter(e=>!e.isCancelled).map(e=>({id:String(e.id||''),title:clip(e.subject)||'(без названия)',start:utc(e.start),end:utc(e.end),allDay:!!e.isAllDay,
    location:clip(e.location?.displayName),link:safe(e.onlineMeeting?.joinUrl||e.onlineMeetingUrl),url:safe(e.webLink),declined:e.responseStatus?.response==='declined',tentative:e.showAs==='tentative',free:e.showAs==='free',
    meta:{description:clip(e.bodyPreview,2000),attendees:(e.attendees||[]).map(a=>String(a.emailAddress?.address||'').toLowerCase()).filter(Boolean).slice(0,50),organizer:String(e.organizer?.emailAddress?.address||'').toLowerCase()}})).sort(byStart);
  }
  const q=new URLSearchParams({timeMin:from.toISOString(),timeMax:to.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250'});
  const data=await this.call(GOOGLE+'/calendars/primary/events?'+q);
  return (data.items||[]).filter(e=>e.status!=='cancelled').map(e=>{
   const self=(e.attendees||[]).find(a=>a.self),allDay=!!e.start?.date;
   const video=conferenceLink(e);
   return {id:String(e.id||''),title:clip(e.summary)||'(без названия)',start:allDay?localDate(e.start.date):new Date(e.start?.dateTime).toISOString(),end:allDay?localDate(e.end?.date||e.start.date):new Date(e.end?.dateTime).toISOString(),allDay,
    location:clip(e.location),link:safe(video),url:safe(e.htmlLink),declined:self?.responseStatus==='declined',tentative:self?.responseStatus==='tentative',free:e.transparency==='transparent',
    meta:{description:clip(e.description,2000),attendees:(e.attendees||[]).map(a=>String(a.email||'').toLowerCase()).filter(Boolean).slice(0,50),organizer:String(e.organizer?.email||'').toLowerCase()}};
  }).filter(e=>!Number.isNaN(Date.parse(e.start))).sort(byStart);
 }

 // Busy intervals of people (the user first): [{email,busy:[{start,end}],error}].
 async busy(emails,from,to){
  const list=[...new Set(emails.map(e=>e.toLowerCase()))];
  if(this.provider==='microsoft'){
   let data;
   try{data=await this.call(GRAPH+'/me/calendar/getSchedule',{method:'POST',body:{schedules:list,startTime:{dateTime:from.toISOString().slice(0,19),timeZone:'UTC'},endTime:{dateTime:to.toISOString().slice(0,19),timeZone:'UTC'},availabilityViewInterval:30}});}
   catch(e){
    // Personal Microsoft accounts have no getSchedule: the user's own busy time comes from their events.
    if(e.status!==400&&e.status!==403&&e.status!==404&&e.status!==501)throw e;
    const own=await this.events(from,to);
    return list.map(email=>email===this.email.toLowerCase()?{email,busy:own.filter(x=>!x.free&&!x.declined&&!x.allDay).map(({start,end})=>({start,end}))}:{email,busy:[],error:'Microsoft не показывает занятость коллег для этого аккаунта'});
   }
   return list.map(email=>{
    const row=(data.value||[]).find(v=>String(v.scheduleId||'').toLowerCase()===email);
    if(!row)return {email,busy:[],error:'нет данных'};
    if(row.error)return {email,busy:[],error:row.error.responseCode==='ErrorMailRecipientNotFound'?'адрес не найден':'нет доступа к календарю'};
    return {email,busy:(row.scheduleItems||[]).filter(i=>!['free','workingElsewhere'].includes(i.status)).map(i=>({start:utc(i.start),end:utc(i.end)}))};
   });
  }
  const self=this.email.toLowerCase();
  const data=await this.call(GOOGLE+'/freeBusy',{method:'POST',body:{timeMin:from.toISOString(),timeMax:to.toISOString(),timeZone:this.timeZone,items:list.map(id=>({id:id===self?'primary':id}))}});
  return list.map(email=>{
   const row=data.calendars?.[email===self?'primary':email]||data.calendars?.[email];
   if(!row)return {email,busy:[],error:'нет данных'};
   if(row.errors?.length)return {email,busy:[],error:row.errors.some(x=>x.reason==='notFound')?'календарь не найден или закрыт':'нет доступа к календарю'};
   return {email,busy:(row.busy||[]).map(b=>({start:new Date(b.start).toISOString(),end:new Date(b.end).toISOString()}))};
  });
 }

 // One event with attendees (they get invitations). Returns {id,url,link}. `meeting` is the video call: {url, note}
 // for a link put into the event (another app's room, a known room, a typed link), {prepareEvent} for a call the
 // calendar service creates with the event (a video-meeting app adds its fields to the request, see
 // src/features/app-links.cjs), or null for none. The join link of a created call comes back with the event.
 async create({title,start,end,attendees=[],meeting=null}){
  const link=meeting?.url?safe(meeting.url):'';
  const text=link?(meeting.note?meeting.note+'\n':'')+'Ссылка на видеозвонок: '+link:'';
  let event;
  if(this.provider==='microsoft')event={calendar:'microsoft',query:{},body:{subject:title,start:{dateTime:new Date(start).toISOString().slice(0,19),timeZone:'UTC'},end:{dateTime:new Date(end).toISOString().slice(0,19),timeZone:'UTC'},
   attendees:attendees.map(a=>({emailAddress:{address:a.email,name:a.name||a.email},type:'required'})),
   ...link?{location:{displayName:link,locationUri:link},body:{contentType:'text',content:text}}:{}}};
  else event={calendar:'google',query:{sendUpdates:'all'},body:{summary:title,start:{dateTime:new Date(start).toISOString(),timeZone:this.timeZone},end:{dateTime:new Date(end).toISOString(),timeZone:this.timeZone},
   attendees:attendees.map(a=>({email:a.email,...a.name?{displayName:a.name}:{}})),...link?{location:link,description:text}:{}}};
  if(typeof meeting?.prepareEvent==='function'){
   const next=await meeting.prepareEvent(event);
   // The invitations are sent either way: an app may add its own query parameters, never remove these.
   event={...next,query:{...next.query,...event.calendar==='google'?{sendUpdates:'all'}:{}}};
  }
  if(this.provider==='microsoft'){
   const e=await this.call(GRAPH+'/me/events',{method:'POST',body:event.body});
   return {id:String(e.id||''),url:safe(e.webLink),link:link||safe(e.onlineMeeting?.joinUrl)};
  }
  const e=await this.call(GOOGLE+'/calendars/primary/events?'+new URLSearchParams(event.query),{method:'POST',body:event.body});
  return {id:String(e.id||''),url:safe(e.htmlLink),link:link||safe(conferenceLink(e))};
 }

 // Appends text to an existing event's description (attendees get the update). Called only from a card button
 // the user confirmed (e.g. «Подготовка к встрече» adding an agenda). The current description is read first and
 // kept; text already present is not added twice. Returns {id,url,already}.
 async appendDescription(id,text){
  const add=String(text||'').trim().slice(0,4000);
  if(!id||!add)throw new CalendarError('Нет события или текста для описания.');
  const ref=encodeURIComponent(String(id));
  if(this.provider==='microsoft'){
   const e=await this.call(GRAPH+'/me/events/'+ref+'?$select=body,webLink');
   const html=e.body?.contentType==='html',old=String(e.body?.content||'');
   const plain=html?old.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' '):old;
   if(plain.replace(/\s+/g,' ').includes(add.replace(/\s+/g,' ')))return {id:String(id),url:safe(e.webLink),already:true};
   const esc=v=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   const content=html?old+'<p>'+esc(add).replace(/\n/g,'<br>')+'</p>':(old?old+'\n\n':'')+add;
   const r=await this.call(GRAPH+'/me/events/'+ref,{method:'PATCH',body:{body:{contentType:html?'html':'text',content}}});
   return {id:String(r.id||id),url:safe(r.webLink||e.webLink),already:false};
  }
  const url=GOOGLE+'/calendars/primary/events/'+ref;
  const e=await this.call(url);
  const old=String(e.description||'');
  if(old.replace(/\s+/g,' ').includes(add.replace(/\s+/g,' ')))return {id:String(id),url:safe(e.htmlLink),already:true};
  const r=await this.call(url+'?sendUpdates=all',{method:'PATCH',body:{description:(old?old+'\n\n':'')+add}});
  return {id:String(r.id||id),url:safe(r.htmlLink||e.htmlLink),already:false};
 }
}
// The video entry point of a Google event's conference (whatever service created it).
const conferenceLink=e=>(e.conferenceData?.entryPoints||[]).find(p=>p.entryPointType==='video')?.uri;
const clip=(v,n=300)=>String(v||'').trim().slice(0,n);
const safe=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href:'';}catch{return '';}};
// Graph dateTimeTimeZone in UTC («2026-11-09T07:00:00.0000000») → ISO.
const utc=v=>{const s=String(v?.dateTime||'').slice(0,23);const d=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s+'Z');return Number.isNaN(+d)?'':d.toISOString();};
// All-day dates are local calendar days.
const localDate=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d).toISOString();};
const byStart=(a,b)=>a.start.localeCompare(b.start);
module.exports={CalendarClient,CalendarError,SCOPES,granted};
