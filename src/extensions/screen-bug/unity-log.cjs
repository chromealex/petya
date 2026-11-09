// «Запись экрана → баг», the game's log: Unity's Editor.log and the Player.log of a built game (Unity's documented
// locations), the newest first. The excerpt is the lines written while recording plus a little before it:
//  - lines with a time stamp («2026-11-09 12:00:01», «[12:00:01]», «12:00:01.123») are taken by time, from N seconds
//    before the recording started until it stopped;
//  - Unity's own lines have no time, so the file size at the start of the recording is the boundary: everything
//    appended during the recording, plus the last 30 lines before it as context.
// Values that look like passwords or tokens are masked before anything is shown or attached.
const fs=require('node:fs');
const path=require('node:path');
const {looksSecret}=require('../clipboard/secrets.cjs');
const MAX_READ=2*1024*1024,MAX_LINES=400,BEFORE=30;

function candidates({platform=process.platform,home,env={}}){
 const P=platform==='win32'?path.win32:path.posix;
 const local=env.LOCALAPPDATA||P.join(home,'AppData','Local'),low=P.join(env.USERPROFILE||home,'AppData','LocalLow');
 const editor=platform==='darwin'?P.join(home,'Library','Logs','Unity','Editor.log'):platform==='win32'?P.join(local,'Unity','Editor','Editor.log'):P.join(home,'.config','unity3d','Editor.log');
 const players=platform==='darwin'?P.join(home,'Library','Logs'):platform==='win32'?low:P.join(home,'.config','unity3d');
 const out=[];
 const add=(file,label,kind)=>{try{const st=fs.statSync(file);if(st.isFile())out.push({file,label,kind,mtime:st.mtimeMs,size:st.size});}catch{/* not there */}};
 add(editor,'Unity Editor','editor');
 // <company>/<product>/Player.log, two levels down (bounded).
 let companies=[];try{companies=fs.readdirSync(players,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('.')).slice(0,200);}catch{companies=[];}
 for(const c of companies){
  let products=[];try{products=fs.readdirSync(P.join(players,c.name),{withFileTypes:true}).filter(d=>d.isDirectory()).slice(0,50);}catch{continue;}
  for(const p of products)add(P.join(players,c.name,p.name,'Player.log'),c.name+' / '+p.name,'player');
 }
 return out.sort((a,b)=>b.mtime-a.mtime);
}

const STAMP=[
 [/^\[?(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/,m=>Date.parse(m[1]+'T'+m[2]+':'+m[3]+':'+m[4]+'.'+(m[5]||'0').padEnd(3,'0'))],
 [/^\[(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?\]/,null],
 [/^(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})\b/,null]
];
// A time of day is placed on the day of `ref` (the recording's start).
function timeOf(line,ref){
 for(const [r,full] of STAMP){const m=r.exec(line);if(!m)continue;if(full)return full(m);
  const d=new Date(ref);d.setHours(Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4]||0));let t=d.getTime();if(t-ref>12*3600000)t-=86400000;return t;}
 return null;
}
function level(line){
 if(/Exception\b|\b(?:Error|ERROR|Fatal|FATAL|Crash(?:ed)?|Assertion failed)\b|NullReference|IndexOutOfRange|StackOverflow/.test(line))return 'error';
 if(/\b(?:Warning|WARNING|WARN)\b/.test(line))return 'warning';
 if(/^\s+at\s|^\s*\(Filename:|^UnityEngine\.|^\s*\w[\w.]*:\w+ ?\(/.test(line))return 'trace';
 return 'info';
}
function mask(line){
 let hidden=0;
 const text=line.split(/(\s+)/).map(w=>{if(!w.trim())return w;if(looksSecret(w)){hidden++;return '•••';}return w;}).join('');
 if(looksSecret(text)){return {text:text.replace(/([:=]\s*)\S+/g,(m,a)=>{hidden++;return a+'•••';}),hidden};}
 return {text,hidden};
}
function unityVersion(file){
 try{const fd=fs.openSync(file,'r');const buf=Buffer.alloc(65536);const n=fs.readSync(fd,buf,0,buf.length,0);fs.closeSync(fd);
  const head=buf.subarray(0,n).toString('utf8');const m=/(?:Unity Editor version|Initialize engine version|Built from '[^']*' branch; Version is '):?\s*'?([0-9]+\.[0-9]+\.[0-9]+[a-z][0-9]+)/.exec(head);return m?m[1]:'';}catch{return '';}
}

// {file, label, mode:'time'|'offset', lines:[{n, text, level, t?, during}], errors, warnings, hidden, truncated, unity}
function excerpt(file,{offset=0,started,stopped=Date.now(),seconds=30}={}){
 const st=fs.statSync(file);
 const from=Math.max(0,Math.min(offset,st.size)-64*1024,st.size-MAX_READ);
 const fd=fs.openSync(file,'r');const buf=Buffer.alloc(st.size-from);fs.readSync(fd,buf,0,buf.length,from);fs.closeSync(fd);
 // Unity truncates Editor.log on a new session: a file smaller than at the start is read whole as «during».
 const restarted=st.size<offset;
 const text=buf.toString('utf8');
 let pos=from,raw=[];
 for(const line of text.split(/\r?\n/)){raw.push({line,at:pos});pos+=Buffer.byteLength(line)+1;}
 if(from>0)raw.shift();
 raw=raw.filter(r=>r.line.trim());
 const timed=raw.filter(r=>timeOf(r.line,started)!==null).length>=Math.max(3,raw.length/3);
 let picked;
 if(timed){
  let last=null;
  picked=raw.map(r=>{const t=timeOf(r.line,started);if(t!==null)last=t;return {...r,t:t??last};}).filter(r=>r.t!==null&&r.t>=started-seconds*1000&&r.t<=stopped+2000).map(r=>({...r,during:r.t>=started}));
 }else{
  const before=restarted?[]:raw.filter(r=>r.at<offset).slice(-BEFORE).map(r=>({...r,during:false}));
  picked=[...before,...raw.filter(r=>restarted||r.at>=offset).map(r=>({...r,during:true}))];
 }
 const truncated=picked.length>MAX_LINES;
 let hidden=0;
 const lines=picked.slice(-MAX_LINES).map((r,i)=>{const m=mask(r.line.slice(0,1000));hidden+=m.hidden;return {n:i+1,text:m.text,level:level(r.line),...(timed?{t:r.t}:{}),during:r.during};});
 return {file,label:path.basename(file),mode:timed?'time':'offset',lines,errors:lines.filter(l=>l.level==='error').length,warnings:lines.filter(l=>l.level==='warning').length,hidden,truncated,unity:unityVersion(file)};
}
const asText=x=>x.lines.map(l=>(l.during?'':'(до записи) ')+l.text).join('\n')+'\n';
module.exports={candidates,excerpt,timeOf,level,mask,unityVersion,asText};
