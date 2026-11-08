const {createHash}=require('node:crypto');
const VERSION=1,RECENT=20,BLOCK=12,LONG=3000;
const stop=new Set('какой какая какое какие когда почему сколько который этого этой этому теперь сейчас только ответь назови расскажи покажи пожалуйста проект проекта вопрос диалог беседа подробнее подробно'.split(' ').map(w=>w.slice(0,5)));
function tokens(text){return [...new Set((String(text||'').toLowerCase().replace(/ё/gu,'е').match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>=3||/^\d+$/u.test(w)).map(w=>w.slice(0,5)).filter(w=>!stop.has(w)))];}
function scope(topic){return JSON.stringify([topic.id||'',topic.projectId||'',topic.projectMemoryId||'',topic.companyId||'']);}
function excerpt(text,limit){return text.length<=limit?{text,shortened:false}:{text:text.slice(0,limit),shortened:true};}
function buildArchive(topic){
 const messages=topic.messages||[],until=Math.max(0,messages.length-RECENT),binding=scope(topic);
 const old=topic.conversationArchive?.version===VERSION&&topic.conversationArchive.scope===binding?topic.conversationArchive:null;
 const chunks=[];
 for(let from=0;from<until;from+=BLOCK){
  const to=Math.min(until,from+BLOCK),rows=messages.slice(from,to);
  const sourceHash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const cached=old?.chunks?.find(c=>c.from===from&&c.to===to&&c.sourceHash===sourceHash);
  if(cached){chunks.push(cached);continue;}
  const facts=[];
  rows.forEach((m,j)=>{
   if(m.role!=='user'||typeof m.text!=='string')return;
   // Extractive memory: never promote model answers or quoted commands to facts.
   const parts=m.text.split(/(?<=[.!?])\s+|\n+/u).map(s=>s.trim()).filter(Boolean);
   for(const part of parts){
    if(/[«»"“”]|цитат|чуж(?:ой|ую|ая)|например|допустим|представь|гипотет/iu.test(part))continue;
    if(/\?$|^(?:а\s+)?(?:кто|что|как|како[йеяи]|сколько|где|когда|почему|зачем|назови|ответь|скажи|покажи|объясни|расскажи|создай|отправь|удали|проверь|найди|выполни|проанализируй)(?=\s|$)/iu.test(part))continue;
    facts.push({source:from+j,at:m.at||null,kind:'user-statement',...excerpt(part,500)});
   }
  });
  chunks.push({from,to,sourceHash,keywords:tokens(rows.map(m=>m.text||'').join(' ')),facts:facts.slice(-12)});
 }
 // Model summaries of long recent messages (src/features/context-compaction.cjs), kept while the message is.
 const live=new Set(messages.map(m=>typeof m?.text==='string'&&m.text.length>LONG?messageHash(m):'').filter(Boolean));
 const compacts=Object.fromEntries(Object.entries(old?.compacts||{}).filter(([k])=>live.has(k)));
 return {version:VERSION,scope:binding,until,chunks,compacts};
}
// Chat lines of a block of messages, as compaction reads them.
function transcript(rows){return rows.filter(m=>typeof m?.text==='string'&&m.text.trim()).map(m=>(m.role==='user'?'Пользователь: ':'Петя: ')+m.text).join('\n');}
const messageHash=m=>createHash('sha256').update(String(m.role)+'\n'+m.text).digest('hex');
// A long message in a compact form: its model summary when ready, otherwise its head and tail.
function shortened(m,archive,limit){
 const summary=archive.compacts?.[messageHash(m)];
 if(summary&&summary.length<=limit)return {text:'[Сжатое длинное сообщение; оригинал сохранён в истории чата] '+summary,compacted:true};
 return {text:require('./context-compactor.cjs').excerpt(m.text,limit,{note:'оригинал сохранён в истории чата'}),compacted:true};
}
function refreshArchive(topic){topic.conversationArchive=buildArchive(topic);return topic.conversationArchive;}
function conversationContext(topic,command=''){
 const archive=buildArchive(topic),messages=topic.messages||[],query=tokens(command);
 const score=text=>tokens(text).reduce((n,w)=>n+(query.includes(w)?1:0),0);
 const all=archive.chunks.flatMap(c=>c.facts.map(f=>({...f,chunk:c.from,score:score(f.text)})));
 // A small relevant selection, ordered chronologically so later corrections win.
 let room=4000;const selected=[];
 for(const f of all.sort((a,b)=>b.score-a.score||b.source-a.source)){
  if(selected.length>=12)break;if(f.text.length>room)continue;selected.push(f);room-=f.text.length;
 }
 const summary=selected.sort((a,b)=>a.source-b.source).map(({score,chunk,...f})=>f);
 const ranked=archive.chunks.map(c=>({c,score:c.keywords.reduce((n,w)=>n+(query.includes(w)?1:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||b.c.from-a.c.from);
 const detailed=/подроб|дослов|почему|разархив|восстанов|вспомни|аргумент|обоснован|как (?:мы )?(?:решили|договорились)/iu.test(command);
 const needsSource=detailed||selected.some(f=>f.score>0&&f.shortened)||(!selected.some(f=>f.score>0)&&ranked.length>0);
 const restored=[];let remaining=7000;
 if(needsSource)for(const {c} of ranked.slice(0,2)){
  const rows=[];for(let i=c.from;i<c.to;i++){
   const m=messages[i];if(!m||typeof m.text!=='string')continue;
   if(remaining<=0)break;const item=excerpt(m.text,remaining);rows.push({source:i,role:m.role,at:m.at||null,...item});remaining-=item.text.length;
  }
  if(rows.length)restored.push({from:c.from,to:c.to,messages:rows,complete:rows.length===c.to-c.from&&rows.every(m=>!m.shortened)});
 }
 // Recent messages go in full while they fit; a long one is compacted instead of pushing everything
 // before it out, and older recent ones that no longer fit in full keep a short form. Nothing is dropped.
 let recentRoom=8000,shortRoom=3000;const history=[];let compactedRecent=0;
 for(let i=messages.length-1;i>=archive.until;i--){const m=messages[i];if(typeof m?.text!=='string')continue;
  if(m.text.length<=LONG&&m.text.length<=recentRoom){history.unshift({role:m.role,text:m.text,source:i});recentRoom-=m.text.length;continue;}
  // Older ones share the short-form room, so each of them keeps at least a line.
  const left=i-archive.until+1,limit=m.text.length>LONG&&recentRoom>=1200?Math.min(1500,recentRoom):Math.max(160,Math.min(400,Math.floor(shortRoom/left)));
  const short=shortened(m,archive,limit);history.unshift({role:m.role,text:short.text,source:i,compacted:true});compactedRecent++;
  if(m.text.length>LONG&&recentRoom>=1200)recentRoom-=short.text.length;else shortRoom-=short.text.length;
 }
 // Model summaries of archived blocks (both sides of the conversation): relevant ones first, then the latest.
 const archiveCompact=[];let compactRoom=3500;
 const withSummary=archive.chunks.filter(c=>c.compact);
 const order=[...ranked.map(r=>r.c).filter(c=>c.compact),...withSummary.slice().reverse()];
 for(const c of order){if(archiveCompact.some(x=>x.from===c.from))continue;if(c.compact.length>compactRoom)continue;archiveCompact.push({from:c.from,to:c.to,summary:c.compact});compactRoom-=c.compact.length;}
 archiveCompact.sort((a,b)=>a.from-b.from);
 // Keep recent user assertions separate from assistant replies and questions.
 // This prevents a frequently repeated old answer outweighing a later correction.
 const recentUserFacts=[];let factRoom=2000;
 for(let i=messages.length-1;i>=archive.until;i--){const m=messages[i];if(m?.role!=='user'||typeof m.text!=='string')continue;
  for(const part of m.text.split(/(?<=[.!?])\s+|\n+/u).reverse()){
   const text=part.trim();if(!text||/[«»"“”]|цитат|например|допустим|представь|гипотет/iu.test(text)||/\?$|^(?:а\s+)?(?:кто|что|как|како[йеяи]|сколько|где|когда|почему|зачем|назови|ответь|скажи|покажи|объясни|расскажи|создай|отправь|удали|проверь|найди|выполни|проанализируй)(?=\s|$)/iu.test(text))continue;
   if(text.length>factRoom)continue;recentUserFacts.unshift({source:i,kind:'user-statement',text});factRoom-=text.length;
  }
 }
 return {roleFacts:require('./role-facts.cjs').roleFacts(topic),archiveSummary:summary,...(archiveCompact.length?{archiveCompact}:{}),recentUserFacts,restoredHistory:restored.sort((a,b)=>a.from-b.from),history,archiveInfo:{version:VERSION,archivedMessages:archive.until,summaryIsExtractive:!archiveCompact.length,compactedBlocks:archiveCompact.length,olderContextOmitted:archive.until>0,originalsRetained:true,compactedRecentMessages:compactedRecent,recentContextOmitted:history.length<messages.slice(archive.until).filter(m=>typeof m?.text==='string').length}};
}
module.exports={buildArchive,refreshArchive,conversationContext,tokens,transcript,messageHash,LONG,BLOCK};
