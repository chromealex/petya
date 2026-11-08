// «Записать время в Jira»: time per Jira task per day from the activity spans, shown as a preview first; only the
// rows the user ticks and confirms in the card are written, as worklogs through Petya's Jira connection
// (POST /rest/api/3/issue/{key}/worklog, REST v3). A preview lives 15 minutes and is written at most once; a row
// already written (same task, day and duration) is marked and not offered again.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const modules=require('../../modules.cjs');
const MIN=60000,TTL=15*MIN;
const pad=v=>String(v).padStart(2,'0');
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
// Jira's `started`: local time with the offset, e.g. 2026-11-09T10:00:00.000+0300.
function started(t){
 const d=new Date(t),off=-d.getTimezoneOffset(),sign=off>=0?'+':'-',a=Math.abs(off);
 return ymd(t)+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'.000'+sign+pad(Math.floor(a/60))+pad(a%60);
}
const ready=settings=>modules.enabled(settings,'jira')&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
// Rounded to 5 minutes; less than 5 minutes is not offered.
const rounded=ms=>Math.round(ms/(5*MIN))*5*60;

function create(s,{now=()=>Date.now()}={}){
 const previews=new Map();
 const file=()=>s.dataRoot?path.join(s.dataRoot,'extensions','time-tracking','worklogs.json'):'';
 const written=()=>{try{const d=JSON.parse(fs.readFileSync(file(),'utf8'));return Array.isArray(d.rows)?d.rows:[];}catch{return [];}};
 function remember(rows){
  const f=file();if(!f)return;
  fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
  const all=[...written(),...rows].slice(-500);
  fs.writeFileSync(f+'.tmp',JSON.stringify({version:1,rows:all}),{mode:0o600});fs.renameSync(f+'.tmp',f);
 }
 // Rows {id, key, day, seconds, started, title} for tasks seen in [from, to).
 function preview({from,to}){
  if(!ready(s.settings||{}))throw Error('Подключите Jira в настройках, чтобы записывать время в задачи.');
  if(!s.activity)throw Error('Учёт активности ещё загружается.');
  const groups=new Map();
  for(const span of s.activity.spans({from,to})){
   if(!span.task)continue;
   const k=span.task+'|'+ymd(span.start);
   const g=groups.get(k)||{key:span.task,day:ymd(span.start),ms:0,first:span.start,titles:new Map(),url:span.url||''};
   g.ms+=span.end-span.start;g.first=Math.min(g.first,span.start);if(span.title)g.titles.set(span.title,(g.titles.get(span.title)||0)+span.end-span.start);
   groups.set(k,g);
  }
  const done=written();
  const rows=[...groups.values()].map(g=>({id:g.key+'|'+g.day,key:g.key,day:g.day,seconds:rounded(g.ms),started:started(g.first),url:g.url,
   title:[...g.titles].sort((a,b)=>b[1]-a[1])[0]?.[0]||'',done:done.some(w=>w.key===g.key&&w.day===g.day)}))
   .filter(r=>r.seconds>=300).sort((a,b)=>a.day.localeCompare(b.day)||b.seconds-a.seconds);
  const id=randomUUID();
  for(const [k,v] of previews)if(v.at<now()-TTL)previews.delete(k);
  previews.set(id,{at:now(),rows,site:s.settings.jiraUrl});
  return {id,rows,site:String(s.settings.jiraUrl||'')};
 }
 // Writes the chosen rows of a preview, once. Returns [{id, key, ok, error?}].
 async function write(id,chosen){
  const p=previews.get(String(id||''));
  if(!p||p.at<now()-TTL)throw Error('Предпросмотр устарел. Откройте «Записать время в Jira» ещё раз.');
  if(!ready(s.settings||{})||s.settings.jiraUrl!==p.site)throw Error('Подключение Jira изменилось. Подготовьте запись заново.');
  previews.delete(String(id));
  const pick=new Set((Array.isArray(chosen)?chosen:[]).map(String));
  const rows=p.rows.filter(r=>pick.has(r.id)&&!r.done);
  if(!rows.length)throw Error('Не выбрано ни одной строки для записи.');
  const results=[],ok=[];
  for(const r of rows){
   try{
    await s.workspace.api('/rest/api/3/issue/'+encodeURIComponent(r.key)+'/worklog?adjustEstimate=auto',{method:'POST',body:JSON.stringify({timeSpentSeconds:r.seconds,started:r.started,
     comment:{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:'Учёт времени Пети: '+(r.title||r.key).slice(0,200)}]}]}})},s.workspace.settings?.()||s.settings);
    results.push({id:r.id,key:r.key,ok:true});ok.push({key:r.key,day:r.day,seconds:r.seconds,at:now()});
   }catch(e){results.push({id:r.id,key:r.key,ok:false,error:String(e.message||e).slice(0,200)});}
  }
  if(ok.length)remember(ok);
  return results;
 }
 return {preview,write,ready:()=>ready(s.settings||{})};
}
module.exports={create,started,ready,rounded};
