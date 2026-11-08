// Top-level windows on this computer by title, for meeting sources that recognise a call by a window: a browser tab
// of a web meeting (the active tab's title is the window's title) or a meeting app's own window. Neutral: it knows
// no meeting service, only windows, their owning process and browser title suffixes.
// It never asks for a permission. macOS: titles are read only when screen recording access is already granted
// (Electron's window list; the owning app is not known there). Windows: a short PowerShell script enumerates the
// visible top-level windows with their process names. Other platforms: null.
// One listing is shared for a couple of seconds, so several sources polled together cost one look.
const {execFile}=require('node:child_process');

const SCRIPT=String.raw`[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public class PetyaTopWindows {
  delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<string[]> Rows() {
    var rows = new List<string[]>(); var names = new Dictionary<uint, string>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(1024); GetWindowText(h, s, s.Capacity); if (s.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); string name;
      if (!names.TryGetValue(pid, out name)) { try { name = Process.GetProcessById((int)pid).ProcessName; } catch { name = ""; } names[pid] = name; }
      rows.Add(new [] { s.ToString(), name }); return rows.Count < 400;
    }, IntPtr.Zero);
    return rows;
  }
}
'@
$rows = @([PetyaTopWindows]::Rows() | ForEach-Object { @{ title = $_[0]; app = $_[1] } })
@{ windows = $rows } | ConvertTo-Json -Compress -Depth 3`;

function runWindows(){
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],
  {timeout:15000,windowsHide:true,maxBuffer:1024*1024},(error,stdout)=>{if(error)return reject(error);try{resolve(JSON.parse(String(stdout).replace(/^﻿/,'').trim()));}catch(e){reject(e);}}));
}
// Electron's window list (macOS, Windows): [{id, name}]. Callers check the screen permission first on macOS.
function sources({electron=()=>require('electron')}={}){
 return electron().desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
}
const rows=list=>(Array.isArray(list)?list:[]).filter(w=>w&&typeof w.title==='string'&&w.title.trim()).slice(0,400).map(w=>({title:w.title.trim(),app:String(w.app||'')}));
async function read({platform,electron,run}){
 if(platform==='win32')return {permission:true,windows:rows((await run()).windows)};
 if(platform==='darwin'){
  const {systemPreferences}=electron();
  if(systemPreferences.getMediaAccessStatus('screen')!=='granted')return {permission:false,windows:[]};
  return {permission:true,windows:rows((await sources({electron})).map(s=>({title:s.name,app:''})))};
 }
 return null;
}
let cache=null;
// {permission, windows:[{title, app}]} (app: the process name, '' when unknown), or null where windows cannot be read.
function list({platform=process.platform,electron=()=>require('electron'),run=runWindows,now=Date.now,maxAge=2000}={}){
 if(cache&&cache.platform===platform&&now()-cache.at<maxAge)return cache.value;
 const value=read({platform,electron,run});
 cache={platform,at:now(),value};
 value.catch(()=>{if(cache?.value===value)cache=null;});
 return value;
}

// Browsers by process name (Windows; on macOS the owner is unknown and every window counts).
const BROWSERS=/^(?:chrome|chromium|msedge|firefox|opera|opera_gx|brave|vivaldi|browser|yandex|arc|safari|thorium|librewolf|waterfox|zen)$/i;
const isBrowser=app=>BROWSERS.test(String(app||'').replace(/\.exe$/i,''));
// A browser window's title without the browser's name and Edge's «and N more pages»: what the active tab says.
const SUFFIX=/\s+[-–—]\s+(?:Google Chrome|Chromium|Microsoft[\s​]*Edge(?:\s+Beta|\s+Dev|\s+Canary)?|Mozilla Firefox.*|Firefox(?:\s+Developer Edition|\s+Nightly)?|Yandex(?:\s+Browser)?|Яндекс[\s.]*Браузер|Opera(?:\s+GX)?|Brave|Vivaldi|Arc|Safari|Thorium|LibreWolf|Waterfox|Zen Browser)\s*$/iu;
const MORE=/\s+(?:and\s+\d+\s+more\s+pages?|и\s+ещ[её]\s+\d+\s+\p{L}+)(?:\s+[-–—]\s+.*)?$/iu;
function pageTitle(title){return String(title||'').replace(/[​‎‏]/g,'').replace(SUFFIX,'').replace(MORE,'').trim();}

module.exports={list,sources,pageTitle,isBrowser,SCRIPT,_reset(){cache=null;}};
