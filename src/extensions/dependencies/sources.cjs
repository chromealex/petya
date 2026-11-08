// «Зависимости», where fresh data comes from: `npm outdated --json` and `npm audit --json` (run without a shell,
// with a timeout), the PyPI JSON API for latest versions, and OSV (querybatch + vulns/{id}) for advisories.
// Network failures are reported as «нет сети», not as crashes; whatever was read locally is still shown.
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {compare,allows,parse}=require('./manifests.cjs');

const OFFLINE=/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|network|fetch failed|getaddrinfo|socket hang up|timed? ?out|TimeoutError|aborted due to timeout/i;
const offline=error=>OFFLINE.test(String(error?.code||'')+' '+String(error?.message||error||''));

// npm without a shell: on Windows npm.cmd cannot be spawned directly, so run node.exe with npm-cli.js beside it.
function npmCommand({platform=process.platform,env=process.env,home='',exists=fs.existsSync}={}){
 const P=platform==='win32'?path.win32:path.posix;
 const dirs=[...String(env.PATH||env.Path||'').split(platform==='win32'?';':':').filter(Boolean),
  ...(platform==='darwin'?['/opt/homebrew/bin','/usr/local/bin',P.join(home,'.volta','bin')]:[]),
  ...(platform==='win32'?[P.join(env.ProgramFiles||'C:\\Program Files','nodejs'),P.join(env.APPDATA||P.join(home,'AppData','Roaming'),'npm')]:[])];
 for(const dir of dirs){
  if(platform==='win32'){
   const cli=P.join(dir,'node_modules','npm','bin','npm-cli.js'),node=P.join(dir,'node.exe');
   if(exists(cli)&&exists(node))return {file:node,args:[cli],dir};
  }else if(exists(P.join(dir,'npm')))return {file:P.join(dir,'npm'),args:[],dir};
 }
 return null;
}
// Runs a command; npm exits 1 for «outdated found» / «vulnerabilities found», so stdout is kept on non-zero exit.
function exec(file,args,{cwd,timeout=60000,env,signal}={}){
 return new Promise((resolve,reject)=>{
  execFile(file,args,{cwd,timeout,env,signal,shell:false,windowsHide:true,maxBuffer:32*1024*1024},(error,stdout,stderr)=>{
   if(error&&!String(stdout||'').trim())return reject(Object.assign(error,{stderr:String(stderr||'')}));
   resolve({stdout:String(stdout||''),stderr:String(stderr||''),code:error?.code??0});
  });
 });
}
async function npmJSON(run,cmd,args,{cwd,timeout,signal}){
 const env={...process.env,PATH:cmd.dir+path.delimiter+(process.env.PATH||''),npm_config_fund:'false',npm_config_update_notifier:'false'};
 const {stdout}=await run(cmd.file,[...cmd.args,...args],{cwd,timeout,env,signal});
 let data;try{data=JSON.parse(stdout||'{}');}catch{throw Error('npm вернул не JSON.');}
 if(data?.error){const e=Error(String(data.error.summary||data.error.code||'ошибка npm'));e.code=data.error.code;throw e;}
 return data;
}
async function npmOutdated(run,cmd,dir,opts){return npmJSON(run,cmd,['outdated','--json','--long'],{cwd:dir,timeout:90000,...opts});}
async function npmAudit(run,cmd,dir,opts){return npmJSON(run,cmd,['audit','--json'],{cwd:dir,timeout:90000,...opts});}

// npm audit (v7+): vulnerabilities by package; advisories are the `via` objects.
function auditVulns(data){
 const out=new Map();
 for(const [name,v] of Object.entries(data?.vulnerabilities||{})){
  const advisories=(v.via||[]).filter(x=>x&&typeof x==='object').map(x=>({id:x.url?.split('/').pop()||String(x.source),severity:severity(x.severity),summary:String(x.title||''),url:x.url||'',range:x.range||''}));
  out.set(name,{severity:severity(v.severity),direct:!!v.isDirect,advisories,via:(v.via||[]).filter(x=>typeof x==='string'),fix:v.fixAvailable===true?'есть':v.fixAvailable?.name?v.fixAvailable.name+'@'+v.fixAvailable.version+(v.fixAvailable.isSemVerMajor?' (major)':''):''});
 }
 return out;
}
function severity(s){const v=String(s||'').toLowerCase();return v==='critical'?'critical':v==='high'?'high':v==='moderate'||v==='medium'?'moderate':v==='low'?'low':'unknown';}

// PyPI: latest stable release and the highest release the specifier allows.
async function pypi(request,name,spec,{signal}={}){
 const data=await request('https://pypi.org/pypi/'+encodeURIComponent(name)+'/json',{headers:{Accept:'application/json'},timeoutMs:20000,signal});
 const releases=Object.entries(data?.releases||{}).filter(([v,files])=>parse(v)&&!parse(v).pre&&!(Array.isArray(files)&&files.length&&files.every(f=>f.yanked))).map(([v])=>v).sort(compare);
 const latest=data?.info?.version&&!parse(data.info.version)?.pre?data.info.version:releases.at(-1)||data?.info?.version||null;
 const wanted=[...releases].reverse().find(v=>allows(spec,v))||null;
 return {latest,wanted};
}

// CVSS v3.x base score from the vector (OSV gives vectors, not numbers).
function cvss3(vector){
 const m=Object.fromEntries(String(vector).split('/').slice(1).map(p=>p.split(':')));
 if(!/^CVSS:3/.test(vector)||!m.AV)return null;
 const changed=m.S==='C';
 const AV={N:0.85,A:0.62,L:0.55,P:0.2}[m.AV],AC={L:0.77,H:0.44}[m.AC],UI={N:0.85,R:0.62}[m.UI];
 const PR={N:0.85,L:changed?0.68:0.62,H:changed?0.5:0.27}[m.PR];
 const cia=x=>({H:0.56,L:0.22,N:0}[x]);
 if([AV,AC,UI,PR,cia(m.C),cia(m.I),cia(m.A)].some(x=>x===undefined))return null;
 const iss=1-(1-cia(m.C))*(1-cia(m.I))*(1-cia(m.A));
 const impact=changed?7.52*(iss-0.029)-3.25*Math.pow(iss-0.02,15):6.42*iss;
 const exploit=8.22*AV*AC*PR*UI;
 if(impact<=0)return 0;
 const up=x=>{const i=Math.round(x*100000);return i%10000===0?i/100000:(Math.floor(i/10000)+1)/10;};
 return up(Math.min((changed?1.08:1)*(impact+exploit),10));
}
const fromScore=s=>s===null||s===undefined?'unknown':s>=9?'critical':s>=7?'high':s>=4?'moderate':s>0?'low':'unknown';
// OSV record → {id, severity, summary, url, fixed}.
function advisory(v,pkgName){
 let sev=severity(v.database_specific?.severity);
 if(sev==='unknown'){const vec=(v.severity||[]).find(x=>/^CVSS_V3/.test(x.type))?.score;if(vec)sev=fromScore(cvss3(vec));}
 if(sev==='unknown')for(const a of v.affected||[]){const s=severity(a.ecosystem_specific?.severity||a.database_specific?.severity);if(s!=='unknown'){sev=s;break;}}
 const fixed=(v.affected||[]).filter(a=>!pkgName||a.package?.name?.toLowerCase()===pkgName.toLowerCase()).flatMap(a=>(a.ranges||[]).flatMap(r=>(r.events||[]).map(e=>e.fixed).filter(Boolean)));
 const ghsa=[v.id,...(v.aliases||[])].find(x=>/^GHSA-/.test(x));
 const url=ghsa?'https://github.com/advisories/'+ghsa:'https://osv.dev/vulnerability/'+encodeURIComponent(v.id);
 return {id:v.id,severity:sev,summary:String(v.summary||v.details||'').split('\n')[0].slice(0,200),url,fixed:fixed.sort(compare).at(-1)||''};
}
// OSV: one batch query for all (name, version) pairs, then details for each distinct advisory (bounded).
async function osv(request,queries,{signal,limit=60}={}){
 if(!queries.length)return [];
 const batch=await request('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:30000,signal,
  body:JSON.stringify({queries:queries.map(q=>({package:{name:q.name,ecosystem:q.ecosystem},version:q.version}))})});
 const ids=[...new Set((batch?.results||[]).flatMap(r=>(r?.vulns||[]).map(v=>v.id)))].slice(0,limit);
 const details=new Map();
 for(let i=0;i<ids.length;i+=8){
  const part=await Promise.all(ids.slice(i,i+8).map(id=>request('https://api.osv.dev/v1/vulns/'+encodeURIComponent(id),{timeoutMs:20000,signal}).catch(()=>({id}))));
  for(const v of part)details.set(v.id,v);
 }
 return queries.map((q,i)=>((batch?.results||[])[i]?.vulns||[]).map(v=>advisory(details.get(v.id)||v,q.name)));
}
module.exports={npmCommand,exec,npmOutdated,npmAudit,auditVulns,pypi,osv,advisory,cvss3,severity,offline};
