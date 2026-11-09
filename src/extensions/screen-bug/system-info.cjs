// «Запись экрана → баг», the environment section: OS and version, CPU, memory, the GPU (Chromium's GPU info),
// displays with their scale and refresh rate, the system language and the Unity version from the log. Read only
// when the user left «Системная информация» on; nothing identifying (user name, host name, serial numbers).
const os=require('node:os');

function osName(platform=process.platform,{release=os.release(),version=typeof process.getSystemVersion==='function'?process.getSystemVersion():''}={}){
 if(platform==='darwin')return 'macOS '+(version||release);
 if(platform==='win32'){const build=Number(String(version||release).split('.')[2])||0;return (build>=22000?'Windows 11':'Windows 10')+' ('+(version||release)+')';}
 return 'Linux '+release;
}
async function gpuName(electron){
 try{
  const info=await Promise.race([electron.app.getGPUInfo('complete'),new Promise((_,r)=>setTimeout(()=>r(Error('timeout')),3000))]);
  const renderer=info?.auxAttributes?.glRenderer||'';
  if(renderer)return renderer.replace(/^ANGLE \((.+)\)$/,'$1').replace(/\s*,\s*(?:OpenGL|Direct3D|D3D|Metal|Vulkan).*$/i,'').slice(0,120);
  const d=(info?.gpuDevice||[]).find(g=>g.active)||info?.gpuDevice?.[0];
  return d?'vendor 0x'+Number(d.vendorId).toString(16)+', device 0x'+Number(d.deviceId).toString(16):'';
 }catch{return '';}
}
// [{label, value}] in the order the bug report shows them.
async function gather({electron=require('electron'),platform=process.platform,arch=process.arch,unity=''}={}){
 const rows=[];
 rows.push({label:'Система',value:osName(platform)+' · '+arch});
 const cpus=os.cpus();if(cpus.length)rows.push({label:'Процессор',value:String(cpus[0].model||'').replace(/\s+/g,' ').trim()+' · '+cpus.length+' потоков'});
 rows.push({label:'Память',value:Math.round(os.totalmem()/1073741824)+' ГБ'});
 const gpu=await gpuName(electron);if(gpu)rows.push({label:'Видеокарта',value:gpu});
 try{const list=electron.screen.getAllDisplays();rows.push({label:'Экраны',value:list.map(d=>Math.round(d.size.width*d.scaleFactor)+'×'+Math.round(d.size.height*d.scaleFactor)+(d.scaleFactor!==1?' @'+d.scaleFactor+'x':'')+(d.displayFrequency?' '+Math.round(d.displayFrequency)+' Гц':'')).join(', ')});}catch{/* no screen module */}
 try{rows.push({label:'Язык системы',value:electron.app.getLocale()});}catch{/* outside Electron */}
 if(unity)rows.push({label:'Unity',value:unity});
 return rows;
}
module.exports={gather,osName,gpuName};
