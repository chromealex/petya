// «Конвертер»: which converters this computer has. Looks on PATH and in the usual install folders (Homebrew,
// LibreOffice.app, Program Files) and in Petya's own downloaded ffmpeg. Nothing is installed here.
const fs=require('node:fs');
const path=require('node:path');

const NAMES=['ffmpeg','ffprobe','sips','afconvert','qlmanage','cwebp','soffice','libreoffice','magick','exiftool','rsvg-convert'];
function extraDirs(platform,env){
 if(platform==='darwin')return ['/opt/homebrew/bin','/usr/local/bin','/usr/bin','/Applications/LibreOffice.app/Contents/MacOS'];
 if(platform==='win32'){const pf=[env.ProgramFiles,env['ProgramFiles(x86)']].filter(Boolean);return pf.flatMap(p=>[path.join(p,'LibreOffice','program'),path.join(p,'ImageMagick'),path.join(p,'ffmpeg','bin')]);}
 return ['/usr/bin','/usr/local/bin','/snap/bin'];
}
function executable(file,platform){
 try{const st=fs.statSync(file);if(!st.isFile())return false;if(platform==='win32')return true;fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}
}
// {name: absolute path} for every tool found. `own` is Petya's downloaded ffmpeg folder (ffmpeg, ffprobe inside).
function detect({platform=process.platform,env=process.env,own=''}={}){
 const sep=platform==='win32'?';':':';
 const dirs=[...(own?[own]:[]),...String(env.PATH||env.Path||'').split(sep).filter(Boolean),...extraDirs(platform,env)];
 const exts=platform==='win32'?['.exe','.cmd','.bat','']:[''];
 const found={};
 for(const name of NAMES){
  for(const dir of dirs){
   const hit=exts.map(e=>path.join(dir,name+e)).find(f=>executable(f,platform));
   if(hit){found[name]=hit;break;}
  }
 }
 if(!found.soffice&&found.libreoffice)found.soffice=found.libreoffice;
 delete found.libreoffice;
 // sips, afconvert and qlmanage are macOS tools: a file of that name elsewhere is not them.
 if(platform!=='darwin'){delete found.sips;delete found.afconvert;delete found.qlmanage;}
 return found;
}
module.exports={detect,NAMES};
