// Conversation evidence for «Кто знает» from what Petya already keeps (read-only, no new Slack scopes): Slack threads
// synced into the context memory (src/extensions/slack/sync.cjs) and recorded meetings with speakers (src/meeting-talk.cjs).
const {isSound}=require('../../meeting-talk.cjs');
const one=v=>String(v||'').replace(/\s+/g,' ').trim();
// A short quote around the first match, so the card shows what was said.
function snippet(text,re,size=160){
 const t=one(text),m=re.exec(t);if(!m)return t.slice(0,size);
 const start=Math.max(0,m.index-60),end=Math.min(t.length,start+size);
 return (start?'…':'')+t.slice(start,end)+(end<t.length?'…':'');
}
// The message's own link: «…/archives/C1/p<ts>», with thread_ts for a reply inside a thread.
function link(threadUrl,ts){
 try{
  const u=new URL(threadUrl);if(u.protocol!=='https:'||!/(?:^|\.)slack\.com$/.test(u.hostname))return '';
  const root=/\/p(\d{16})$/.exec(u.pathname)?.[1],digits=String(ts||'').replace('.','');
  if(!root||!/^\d{16}$/.test(digits))return u.href;
  return u.origin+u.pathname.replace(/p\d{16}$/,'p'+digits)+(digits!==root?'?thread_ts='+root.slice(0,10)+'.'+root.slice(10):'');
 }catch{return '';}
}
function slack(items,re){
 const out=[];
 for(const item of items){
  if(item.source!=='Slack'||!Array.isArray(item.messages))continue;
  for(const m of item.messages){
   if(!m.user||m.bot_id||!/^[UW][A-Z0-9]+$/.test(m.user)||!re.test(m.text||''))continue;
   out.push({thread:item.id,title:one(item.title).slice(0,100),user:m.user,at:m.at||0,text:snippet(m.text,re),url:link(item.url,m.ts),channel:item.channel||''});
  }
 }
 return out;
}
function meetings(items,re){
 const out=[];
 for(const r of items){
  if(!isSound(r)||!r.sessionId||r.kind||!r.speaker||!re.test(r.text||''))continue;
  out.push({session:r.sessionId,title:one(r.title).replace(/\s+·\s+.*$/,'').slice(0,100)||'Встреча',speaker:String(r.speaker).slice(0,80),at:r.at||0,text:snippet(r.text,re)});
 }
 return out;
}
module.exports={slack,meetings,snippet,link};
