// Claude Code statusLine adapter. Stores usage only, never prompts or credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const base=process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support'):process.env.APPDATA||path.join(os.homedir(),'.config');
const file=path.join(base,'petya-desktop','claude-usage.json');
let input='';process.stdin.on('data',chunk=>{input+=chunk;if(input.length>1048576)process.exit(1);});
process.stdin.on('end',()=>{try{
 const data=JSON.parse(input),rate_limits={};
 for(const key of ['five_hour','seven_day','spend_limit']){const w=data.rate_limits?.[key];if(w&&typeof w.used_percentage==='number'&&typeof w.resets_at==='number')rate_limits[key]={used_percentage:w.used_percentage,resets_at:w.resets_at};}
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify({observedAt:Date.now(),rate_limits}),{mode:0o600});fs.renameSync(temp,file);
 const used=Object.values(rate_limits).map(w=>w.used_percentage);process.stdout.write(used.length?'Claude · остаток '+Math.max(0,Math.round(100-Math.max(...used)))+'%':'Claude · лимиты неизвестны');
}catch{process.exitCode=1;}});
