// «Скриншот → задача»: the app and window title in front when the screen was taken — the bug's context
// («Safari — Оформление заказа»). Best effort and short: macOS asks System Events (the window title needs the
// accessibility permission Petya's computer control already uses; without it only the app name comes back),
// Windows reads the foreground window. Never throws.
const {execFile}=require('node:child_process');
const run=(bin,args,timeout)=>new Promise(resolve=>{execFile(bin,args,{timeout,windowsHide:true,maxBuffer:65536},(error,stdout)=>resolve(error?'':String(stdout||'').trim()));});

const MAC=`tell application "System Events"
 set p to first application process whose frontmost is true
 set n to name of p
 set t to ""
 try
  set t to name of front window of p
 end try
end tell
return n & "\n" & t`;
const WIN=`Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class W{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}
"@
$h=[W]::GetForegroundWindow();$b=New-Object System.Text.StringBuilder 512;[void][W]::GetWindowText($h,$b,512);$id=0;[void][W]::GetWindowThreadProcessId($h,[ref]$id)
$p=(Get-Process -Id $id -ErrorAction SilentlyContinue).ProductName;if(-not $p){$p=(Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName}
[Console]::OutputEncoding=[Text.Encoding]::UTF8;Write-Output $p;Write-Output $b.ToString()`;

const clean=v=>String(v||'').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,200);
async function activeWindow({platform=process.platform,exec=run,timeout=2500}={}){
 let out='';
 if(platform==='darwin')out=await exec('/usr/bin/osascript',['-e',MAC],timeout);
 else if(platform==='win32')out=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',WIN],timeout);
 else return {app:'',title:''};
 const [app='',title='']=out.split(/\r?\n/);
 // Petya itself in front means the user asked from the chat: that window is not the bug's context.
 if(/^(?:petya|петя|electron)$/i.test(clean(app)))return {app:'',title:''};
 return {app:clean(app),title:clean(title)};
}
const label=w=>w?.app&&w?.title&&!w.title.includes(w.app)?w.app+' — '+w.title:w?.title||w?.app||'';
module.exports={activeWindow,label};
