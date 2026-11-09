// Capability «meeting-source» of «Zoom» (src/features/meeting-sources.cjs): a Zoom meeting on this computer is
// seen by Zoom's own meeting window (window.cjs); while Petya records it, the names Zoom shows talking are sampled
// from the window (speakers.cjs) and each fragment of the meeting sound gets one. The participants seen last are
// kept in the company folder (zoom-speakers-sample.json, mode 600) for «Имя на встречах» in «Команда».
// After the meeting, Zoom's own letter with the transcript or summary is found in Gmail, if it was mailed.
const fs=require('node:fs');
const path=require('node:path');
const zoomWindow=require('./window.cjs');
const {SpeakerTimeline,read:readWindow,parse}=require('./speakers.cjs');
const SAMPLE='zoom-speakers-sample.json';
const HOUR=3600000;
let timeline=null;
let seen=null; // participants read from the window while a meeting is detected

// A Zoom join link → {kind:'zoom', key, url, name}: one meeting id on any Zoom host is one room; the passcode is kept.
function recognizeLink(raw){
 let u;try{u=new URL(String(raw||'').trim().replace(/[.,;:!?)»]+$/,''));}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!/(?:^|\.)zoom\.(?:us|com)$/.test(host))return null;
 const m=/^\/(?:j|wc\/join|w|s)\/(\d{9,12})\/?$/.exec(u.pathname),my=/^\/my\/([\w.-]{2,60})\/?$/.exec(u.pathname);
 if(!m&&!my)return null;
 const id=m?m[1]:my[1].toLowerCase(),pwd=u.searchParams.get('pwd');
 return {kind:'zoom',key:'zoom:'+id,url:'https://'+host+(m?'/j/'+id:'/my/'+id)+(pwd?'?pwd='+encodeURIComponent(pwd):''),name:'Zoom'};
}

module.exports={
 id:'zoom',name:'Zoom',
 joinLinks:[/https:\/\/(?:[\w-]+\.)*zoom\.(?:us|com)\/(?:j|wc\/join|w|s|my)\//i],
 recognizeLink,
 async detect(){
  if(!['darwin','win32'].includes(process.platform))return null;
  const state=await zoomWindow.inspect(false);
  if(!zoomWindow.hasMeeting(state)){seen=null;return {active:false};}
  // Who is in the meeting, from Zoom's window (tile labels, the participant list), so Petya can tell which
  // company it belongs to before recording (src/meeting-company.cjs). Read at most every 20 seconds.
  const now=Date.now();
  if(!seen||now-seen.at>20000){let names=[],blind=false;try{const raw=await readWindow();blind=raw.trusted===false&&process.platform==='darwin';const r=parse(raw.texts||[]);names=[...new Set([...r.people,...r.talking])];}catch{}seen={at:now,names,blind};}
  // Without macOS «Универсальный доступ» Petya cannot read Zoom's window, so speakers stay «Собеседники».
  const speakerNote=seen.blind?'Петя не видит, кто говорит в Zoom: разрешите ему «Универсальный доступ» в настройках macOS.':'';
  return {active:true,app:'Zoom',windowTitle:state.windows.find(w=>zoomWindow.isMeeting(w.title))?.title||'',participants:seen.names,...(speakerNote?{speakerNote,speakerAccess:'accessibility'}:{})};
 },
 begin(context={}){
  timeline?.stop();
  timeline=new SpeakerTimeline({keep:sample=>{if(!context.dataRoot)return;try{fs.writeFileSync(path.join(context.dataRoot,SAMPLE),JSON.stringify(sample),{mode:0o600});}catch{}}});
  timeline.start();
 },
 end(){timeline?.stop();},
 speakers({from,to,settings={}}={}){return timeline?timeline.intervals(from,to,{me:[settings.userName,...String(settings.userNameVariants||'').split(',')]}):[];},
 participants(context={}){
  const names=new Set(timeline?[...timeline.people]:[]);
  try{const sample=JSON.parse(fs.readFileSync(path.join(context.dataRoot,SAMPLE),'utf8'));for(const n of sample.people||[])names.add(n);}catch{}
  return [...names];
 },
 async summaryMail(meeting,services){
  const rows=await services.mailAccounts.search('from:(zoom.us) newer_than:3d',8);
  const fit=rows.filter(r=>r.at>=meeting.start-2*HOUR&&r.at<=meeting.end+48*HOUR&&/transcript|расшифров|summary|сводк|запис|recording|meeting assets|итог/iu.test(r.subject+' '+r.text.slice(0,2000))).sort((a,b)=>Math.abs(a.at-meeting.end)-Math.abs(b.at-meeting.end))[0];
  if(!fit)return null;
  const vtt=fit.attachments.find(a=>/\.(?:vtt|srt|txt)$/i.test(a.name));
  return {from:'Zoom',subject:fit.subject,text:(vtt?require('../../features/meeting-summary.cjs').plainVtt(vtt.text):fit.text).slice(0,120000)};
 },
 _reset(){timeline?.stop();timeline=null;seen=null;}
};
