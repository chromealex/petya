// Materials page: saved notes, messages and meeting transcripts grouped by the app they came from, with their
// size, the state of meetings being recorded or transcribed, transcripts Whisper probably made up, and deletion.
const {hallucination}=require('../speech-transcript.cjs');
const bytes=item=>Buffer.byteLength(String(item.text||''));
const {isMeeting:meetingSource,isSound,MIC}=require('../meeting-talk.cjs');
// Which app a material belongs to on the page.
function app(item){if(meetingSource(item))return 'meetings';const s=String(item.source||'');if(/^slack/i.test(s))return 'slack';if(/^telegram/i.test(s))return 'telegram';if(/gmail|почт|outlook|mail/i.test(s))return 'mail';if(/jira/i.test(s))return 'jira';if(/confluence/i.test(s))return 'confluence';if(/notion/i.test(s))return 'notion';return 'notes';}
// The microphone also hears the meeting from the speakers: a microphone fragment that repeats what the meeting
// sound said within 20 seconds is that echo, not the user speaking (meeting apps do not play the user's own voice back).
const stems=t=>(String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е').match(/[\p{L}\p{N}]{3,}/gu)||[]).map(w=>w.slice(0,5));
function echoes(items){
 const meeting=items.filter(i=>isSound(i)&&i.sessionId),out=new Set();
 for(const mic of items){if(mic.source!==MIC||!mic.sessionId)continue;const own=stems(mic.text);if(own.length<2)continue;
  const near=meeting.filter(z=>Math.abs((z.at||0)-(mic.at||0))<=20000);if(!near.length)continue;
  const heard=new Set(near.flatMap(z=>stems(z.text)));const same=own.filter(w=>heard.has(w)).length;
  if(same/own.length>=0.5)out.add(mic.id);}
 return out;
}
function list(items,sessions=[],team=[]){
 // Names shown in meetings become the team's names and roles (src/team-match.cjs).
 const who=name=>{if(!name)return '';const l=require('../team-match.cjs').label(name,team);return l.name+(l.role?' · '+l.role:'');};
 const echo=echoes(items);
 const out=items.map(item=>({id:item.id,source:item.source,title:item.title,at:item.at,url:item.url||'',text:String(item.text||''),sessionId:item.sessionId||'',speaker:who(item.speaker),kind:item.kind||'',channel:item.channel||'',app:app(item),bytes:bytes(item),
  messages:Array.isArray(item.messages)?item.messages.length:undefined,suspect:meetingSource(item)?(echo.has(item.id)?'эхо из динамиков':hallucination(item.text)):''}));
 return {items:out,meetings:sessions.filter(s=>s.phase!=='removed')};
}
module.exports={name:'materials',defaults:{},validate(){},list,app,echoes,
 setup(s){
  const sessions=()=>{try{return s.meetingSessions?.status()||[];}catch{return [];}};
  return {ipc:{
   list:()=>({...list(s.memory.prune(),sessions(),(()=>{try{return s.team.members(s.settings);}catch{return [];}})()),recording:s.meetingSessions?.settings?.()||null}),
   // Names seen in meetings (speakers of transcripts and the participants meeting sources saw) with whom each
   // is matched to, for «Имя на встречах» on the team page.
   meetingNames(){
    const team=(()=>{try{return s.team.members(s.settings);}catch{return [];}})(),seen=new Map();
    for(const item of s.memory.prune())if(item.speaker)seen.set(item.speaker,Math.max(seen.get(item.speaker)||0,item.at||0));
    for(const n of (()=>{try{return s.meetingSources?.participants()||[];}catch{return [];}})())if(!seen.has(n))seen.set(n,0);
    const match=require('../team-match.cjs').match;
    return [...seen].sort((a,b)=>b[1]-a[1]).slice(0,200).map(([name,at])=>({name,at,member:match(name,team)?.name||''}));
   },
   // Removes materials by id; a meeting goes with all its transcript parts and the recorded audio.
   remove({ids=[],sessionId='',sessionIds=[]}={}){
    const all=[...sessionIds,...sessionId?[sessionId]:[]];
    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||!Array.isArray(sessionIds)||all.some(id=>typeof id!=='string'))throw Error('Некорректный запрос удаления.');
    const drop=new Set(ids);for(const item of s.memory.items)if(item.sessionId&&all.includes(item.sessionId))drop.add(item.id);
    const removed=s.memory.remove([...drop]);
    for(const id of all)if(sessions().some(x=>x.id===id))s.meetingSessions.remove(id);
    return {removed};
   }
  }};
 }
};
