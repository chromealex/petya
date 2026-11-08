// The user's Zoom Personal Meeting Room, without any Zoom app or API: whether the Zoom desktop app is installed,
// a link the user saved, or a personal-room link written in plain-text Zoom data on this computer. Protected or
// encrypted stores (zoomus.db and the like) are never opened or decrypted.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseJoinURL}=require('./meeting-link.cjs');

// A personal room link: https://<sub>.zoom.us/j/<digits>[?pwd=…] → the normalized link, or '' when invalid.
function valid(value){
 const s=String(value||'').trim();if(!s||s.length>500)return '';
 const parsed=parseJoinURL(s);if(!parsed)return '';
 let host;try{host=new URL(s).hostname.toLowerCase();}catch{return '';}
 if(!/(?:^|\.)zoom\.us$/.test(host))return '';
 return parsed.url;
}
function installPaths(platform=process.platform,env=process.env,home=os.homedir()){
 if(platform==='darwin')return ['/Applications/zoom.us.app',path.join(home,'Applications','zoom.us.app')];
 if(platform==='win32')return [path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'Zoom','bin','Zoom.exe')];
 return ['/usr/bin/zoom','/opt/zoom/zoom'];
}
function dataDirs(platform=process.platform,env=process.env,home=os.homedir()){
 if(platform==='darwin')return [path.join(home,'Library','Application Support','zoom.us','data')];
 if(platform==='win32')return [path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'Zoom','data')];
 return [path.join(home,'.zoom','data')];
}
let installedCache=null;
function installed({exists=fs.existsSync,platform,env,home}={}){
 if(installedCache&&Date.now()-installedCache.at<60000&&!platform)return installedCache.value;
 const value=installPaths(platform,env,home).some(p=>{try{return exists(p);}catch{return false;}});
 if(!platform)installedCache={at:Date.now(),value};
 return value;
}
// Plain-text files only (ini/conf/json/xml/txt, under 512 KB, two levels deep); a link counts only on a line that
// names the personal room or PMI, so the last joined meeting is never mistaken for it.
const TEXT=/\.(?:ini|conf|cfg|json|xml|txt|plist)$/i;
const LINK=/https:\/\/[\w.-]*zoom\.us\/j\/\d{9,11}(?:\?pwd=[\w.-]+)?/i;
function discover({dirs=dataDirs(),fsys=fs}={}){
 const files=[];
 const walk=(dir,depth)=>{let list;try{list=fsys.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const e of list){const p=path.join(dir,e.name);if(e.isDirectory()&&depth<2)walk(p,depth+1);else if(e.isFile()&&TEXT.test(e.name))files.push(p);}};
 for(const d of dirs)walk(d,0);
 for(const file of files.slice(0,200)){
  let text;try{if(fsys.statSync(file).size>512*1024)continue;text=fsys.readFileSync(file,'utf8');}catch{continue;}
  if(text.includes('\u0000'))continue;
  for(const line of text.split(/\r?\n/)){
   if(!/pmi|personal/i.test(line))continue;
   const link=valid(LINK.exec(line)?.[0]);if(link)return link;
  }
 }
 return '';
}
module.exports={valid,installed,installPaths,dataDirs,discover};
