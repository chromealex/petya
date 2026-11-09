// What the hints compare the talk against, read once per meeting and kept in memory only for it:
// decisions and promises from Petya's meeting summaries (company memory), terms of the project's glossary (when
// «Глоссарий» is added), and the meeting in the calendar right now (when «Календарь» is added and connected).
const kit=require('../app-kit.cjs');
const DAY=86400000;

// Summaries of earlier meetings (src/features/meeting-summary.cjs: kind 'summary', summary {decisions, tasks}).
function fromMemory(rows,{now=Date.now(),days=180,exclude=''}={}){
 const decisions=[],promises=[];
 const list=(rows||[]).filter(r=>r?.kind==='summary'&&r.summary&&typeof r.summary==='object'&&now-Number(r.at)<=days*DAY&&r.sessionId!==exclude).sort((a,b)=>b.at-a.at).slice(0,200);
 for(const r of list){
  for(const d of Array.isArray(r.summary.decisions)?r.summary.decisions:[])if(typeof d==='string'&&d.trim())decisions.push({text:d.trim().slice(0,300),at:r.at,title:String(r.title||''),sessionId:r.sessionId});
  // Promises of the last 45 days: older tasks are likely done or forgotten for good.
  if(now-Number(r.at)<=45*DAY)for(const t of Array.isArray(r.summary.tasks)?r.summary.tasks:[])if(t&&typeof t.what==='string'&&t.what.trim())promises.push({who:String(t.who||'').trim().slice(0,60),what:t.what.trim().slice(0,300),due:String(t.due||'').slice(0,40),at:r.at,title:String(r.title||''),sessionId:r.sessionId});
 }
 return {decisions:decisions.slice(0,400),promises:promises.slice(0,200)};
}

// Saved glossary terms with a definition, of the active project and the common one. Read-only, through the glossary's
// own store, only while «Глоссарий» is added.
function fromGlossary(s){
 if(!kit.installed(s,'glossary')||!s.dataRoot)return [];
 try{
  const {Store}=require('../glossary/store.cjs'),store=new Store(s.dataRoot);
  const state=s.dialogue?.state||{},active=s.dialogue?.active?.()?.projectId||state.activeProjectId||'general';
  const name=id=>id==='general'?'Общий':(state.projects||[]).find(p=>p.id===id)?.name||'';
  const out=[];
  for(const id of [...new Set([active,'general'])])for(const t of store.terms(id))if(t?.term&&t.definition)out.push({term:t.term,synonyms:t.synonyms||[],definition:t.definition,project:name(id)});
  return out.slice(0,500);
 }catch{return [];}
}

function load(s,meeting,{now=Date.now()}={}){
 let rows=[];try{rows=s.memory?.prune?.()||[];}catch{rows=[];}
 return {...fromMemory(rows,{now,exclude:meeting?.id||''}),terms:fromGlossary(s)};
}

// The hook to the semantic index foundation (built separately): when the services offer
// `semanticIndex.search(query, {kinds, limit})` → [{text, score (0..1), at, title, sessionId}], decision matches come
// from it; otherwise (or on any failure) keyword matching alone is used.
function semantic(s){
 const index=s.semanticIndex;
 if(!index||typeof index.search!=='function')return null;
 return async(text,meeting)=>{
  const rows=await index.search(String(text||''),{kinds:['meeting-decision'],limit:3});
  return (Array.isArray(rows)?rows:[]).filter(r=>r&&typeof r.text==='string'&&r.sessionId!==meeting?.id).map(r=>({text:r.text,score:Number(r.score)||0,at:Number(r.at)||0,title:String(r.title||''),sessionId:String(r.sessionId||'')}));
 };
}

// The meeting in the calendar at this moment: its title and attendees, read-only through «Календарь»'s own accounts
// and client. Null when the calendar is not added, not connected, or does not answer within 8 seconds.
async function calendar(s,{fetcher=globalThis.fetch,now=new Date(),timeout=8000}={}){
 if(s.settings?.extension_calendar!=='true')return null;
 const {accounts}=require('../calendar/accounts.cjs'),{CalendarClient}=require('../calendar/client.cjs');
 const ready=accounts(s.settings).filter(a=>a.calendar);
 const a=ready.find(x=>x.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
 const manager=a&&s.mailAccounts?.[a.provider];if(!manager)return null;
 const client=new CalendarClient({provider:a.provider,email:a.email,fetcher,token:()=>manager.client(a.id).access()});
 let timer;
 try{
  const events=await Promise.race([client.events(new Date(+now-3*3600000),new Date(+now+3600000)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeout);timer.unref?.();})]);
  const at=+now,going=events.filter(e=>!e.allDay&&!e.declined&&Date.parse(e.start)-10*60000<=at&&Date.parse(e.end)>=at).sort((x,y)=>Math.abs(Date.parse(x.start)-at)-Math.abs(Date.parse(y.start)-at))[0];
  if(!going)return null;
  return {title:String(going.title||'').slice(0,120),attendees:(going.meta?.attendees||[]).filter(e=>e&&e!==String(a.email||'').toLowerCase()).slice(0,50)};
 }catch{return null;}
 finally{clearTimeout(timer);}
}
module.exports={fromMemory,fromGlossary,load,semantic,calendar};
