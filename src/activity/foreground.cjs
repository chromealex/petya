// The frontmost app and its window title, for the activity tracker (src/activity/tracker.cjs). Neutral: it knows no
// app, only the foreground window, its owning process and browser title suffixes (src/desktop-windows.cjs).
// It never asks for a permission:
// - Windows: one long-lived PowerShell process answers each request with the foreground window's title and process
//   name (GetForegroundWindow), so a sample every 15 s does not start a new process each time.
// - macOS: a short JXA script reads the frontmost application (NSWorkspace, no permission needed) and, only when the
//   screen recording access is already granted, the title of its front window (CGWindowListCopyWindowInfo).
// - Linux: `xdotool` when it is installed (X11); otherwise nothing.
// read() → {app, title, permission} | null (null: cannot be read on this computer).
const {execFile,spawn}=require('node:child_process');
const windows=require('../desktop-windows.cjs');

const POWERSHELL=String.raw`[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public class PetyaForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string[] Now() {
    IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return new [] { "", "" };
    var s = new StringBuilder(1024); GetWindowText(h, s, s.Capacity);
    uint pid; GetWindowThreadProcessId(h, out pid); string name = "";
    try { var p = Process.GetProcessById((int)pid); name = p.ProcessName; try { var d = p.MainModule.FileVersionInfo.FileDescription; if (!String.IsNullOrWhiteSpace(d)) name = name + "|" + d; } catch {} } catch {}
    return new [] { s.ToString(), name };
  }
}
'@
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $r = [PetyaForeground]::Now()
  @{ title = $r[0]; app = $r[1] } | ConvertTo-Json -Compress
  [Console]::Out.Flush()
}`;

// JXA: the frontmost app's name and, with `titles`, its frontmost normal window's title (layer 0, on screen).
const JXA=titles=>`ObjC.import('AppKit');ObjC.import('CoreGraphics');
const a=$.NSWorkspace.sharedWorkspace.frontmostApplication;let title='';
if(${titles?'true':'false'}&&a){const pid=a.processIdentifier;const list=ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1|16,0));
for(let i=0;i<list.count;i++){const w=list.objectAtIndex(i);if(w.objectForKey('kCGWindowOwnerPID').js===pid&&w.objectForKey('kCGWindowLayer').js===0){const n=w.objectForKey('kCGWindowName');title=n&&!n.isNil()?n.js:'';break;}}}
JSON.stringify({app:a?a.localizedName.js:'',title:title})`;

function winReader(){
 let child=null,queue=[],buffer='';
 const fail=error=>{for(const q of queue.splice(0))q.reject(error);child=null;buffer='';};
 function start(){
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(POWERSHELL,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/^\uFEFF/,'').trim();buffer=buffer.slice(i+1);if(!line)continue;const q=queue.shift();if(!q)continue;try{q.resolve(JSON.parse(line));}catch(e){q.reject(e);}}});
  child.on('exit',()=>fail(Error('foreground reader stopped')));child.on('error',fail);
  child.unref?.();child.stdin.unref?.();child.stdout.unref?.();
 }
 return {
  read(){
   if(!child)start();
   return new Promise((resolve,reject)=>{
    const q={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
    const timer=setTimeout(()=>{const k=queue.indexOf(q);if(k>=0)queue.splice(k,1);reject(Error('foreground reader timeout'));try{child?.kill();}catch{}child=null;},10000);timer.unref?.();
    queue.push(q);try{child.stdin.write('?\n');}catch(e){q.reject(e);}
   });
  },
  stop(){try{child?.kill();}catch{}child=null;}
 };
}
const run=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{timeout:8000,windowsHide:true,maxBuffer:256*1024},(error,stdout)=>error?reject(error):resolve(String(stdout).trim())));

// Friendly names for common process names (Windows) — the window title stays as it is.
const NAMES={chrome:'Google Chrome',msedge:'Microsoft Edge',firefox:'Firefox',code:'Visual Studio Code',devenv:'Visual Studio',rider64:'Rider',idea64:'IntelliJ IDEA',
 pycharm64:'PyCharm',studio64:'Android Studio',winword:'Word',excel:'Excel',powerpnt:'PowerPoint',outlook:'Outlook',olk:'Outlook',explorer:'Проводник',
 windowsterminal:'Terminal',ms_teams:'Microsoft Teams',teams:'Microsoft Teams',zoom:'Zoom',slack:'Slack',telegram:'Telegram',discord:'Discord',
 unity:'Unity','unity hub':'Unity Hub',blender:'Blender',photoshop:'Photoshop',figma:'Figma',notion:'Notion',obsidian:'Obsidian',petya:'Петя',electron:'Electron'};
function appName(raw){
 const [process,description]=String(raw||'').split('|');
 const key=process.replace(/\.exe$/i,'').trim().toLowerCase();
 return NAMES[key]||(description&&description.length<=40?description.trim():'')||process.replace(/\.exe$/i,'').trim();
}

function create({platform=process.platform,electron=()=>require('electron'),exec=run,reader}={}){
 let win=null;
 async function read(){
  if(platform==='win32'){
   win=win||reader||winReader();
   const r=await win.read();
   return {app:appName(r?.app),title:String(r?.title||'').trim(),permission:true};
  }
  if(platform==='darwin'){
   let titles=false;try{titles=electron().systemPreferences.getMediaAccessStatus('screen')==='granted';}catch{titles=false;}
   const r=JSON.parse(await exec('osascript',['-l','JavaScript','-e',JXA(titles)])||'{}');
   return {app:String(r.app||'').trim(),title:String(r.title||'').trim(),permission:titles};
  }
  if(platform==='linux'){
   let title='',pid='';
   try{[title,pid]=(await exec('xdotool',['getactivewindow','getwindowname','getwindowpid'])).split('\n');}catch{return null;}
   let app='';try{app=require('node:fs').readFileSync('/proc/'+Number(pid)+'/comm','utf8').trim();}catch{app='';}
   return {app:appName(app),title:String(title||'').trim(),permission:true};
  }
  return null;
 }
 return {read,stop(){win?.stop();win=null;},supported:['win32','darwin','linux'].includes(platform)};
}
// A browser window's title without the browser's name: what the active tab says.
const pageTitle=windows.pageTitle;
module.exports={create,appName,pageTitle,isBrowser:windows.isBrowser,POWERSHELL,JXA};
