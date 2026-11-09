// «Мониторинг», local store: one JSON file per company data folder (<dataRoot>/monitoring/monitoring.json):
//  - checks: the user's uptime checks (address, method GET/HEAD, expected status, keyword, interval, service);
//  - services: per-service PromQL overrides (selector, templates, thresholds, window);
//  - probes: uptime results of the last 30 days per check, compact [ms, ok, latencyMs, status, tlsDays, error];
//  - alertLog: alerts seen (first/last seen, resolved) for «инциденты недели», 30 days;
//  - tracker: the state-change tracker (dedupe / flapping) so a restart does not notify again;
//  - notices: the last state-change notifications for the notification center after a reload.
// Nothing here leaves the computer. Writes are atomic (tmp + rename) and mode 0600.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DAY=86400000,KEEP=30*DAY,MAX_CHECKS=50;
const stores=new Map();

const blank=()=>({version:1,checks:[],services:{},probes:{},alertLog:{},tracker:{},notices:[]});
class MonitorStore{
 constructor({file='',now=()=>Date.now()}={}){this.file=file;this.now=now;this.data=blank();this.timer=null;this.load();}
 load(){
  if(!this.file)return;
  try{
   const d=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(d?.version!==1)return;
   this.data={...blank(),...d,checks:Array.isArray(d.checks)?d.checks.slice(0,MAX_CHECKS):[],notices:Array.isArray(d.notices)?d.notices.slice(-20):[]};
  }catch{/* no file yet */}
 }
 save(){
  this.prune();
  if(!this.file)return;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data),{mode:0o600});
  fs.renameSync(this.file+'.tmp',this.file);
 }
 // Results and alerts older than 30 days are dropped; probes of deleted checks too.
 prune(){
  const cut=this.now()-KEEP,ids=new Set(this.data.checks.map(c=>c.id));
  for(const [id,list] of Object.entries(this.data.probes)){if(!ids.has(id)){delete this.data.probes[id];continue;}this.data.probes[id]=list.filter(p=>p[0]>=cut);}
  for(const [id,a] of Object.entries(this.data.alertLog))if((a.resolved||a.last)<cut)delete this.data.alertLog[id];
 }
 checks(){return this.data.checks.map(c=>({...c}));}
 check(id){return this.data.checks.find(c=>c.id===id)||null;}
 putCheck(check){
  const list=this.data.checks,i=list.findIndex(c=>c.id===check.id);
  if(i<0&&list.length>=MAX_CHECKS)throw Error('Не больше '+MAX_CHECKS+' проверок.');
  const row={...check,id:check.id||crypto.randomUUID()};
  if(i<0)list.push(row);else list[i]=row;
  this.save();return row;
 }
 removeCheck(id){const n=this.data.checks.length;this.data.checks=this.data.checks.filter(c=>c.id!==id);delete this.data.probes[id];if(n!==this.data.checks.length)this.save();return n!==this.data.checks.length;}
 probes(id,from=0){return (this.data.probes[id]||[]).filter(p=>p[0]>=from);}
 lastProbe(id){return (this.data.probes[id]||[]).at(-1)||null;}
 addProbe(id,r){(this.data.probes[id]||(this.data.probes[id]=[])).push([r.at,r.ok?1:0,r.ms??null,r.status??0,r.tlsDays??null,r.error?String(r.error).slice(0,160):'']);}
 services(){return {...this.data.services};}
 putService(name,config){if(config)this.data.services[name]=config;else delete this.data.services[name];this.save();}
 // Alerts as they come and go: first seen, last seen, resolved when no longer firing.
 logAlerts(alerts){
  const t=this.now(),seen=new Set();
  for(const a of alerts){
   if(a.state!=='firing')continue;
   seen.add(a.id);
   const cur=this.data.alertLog[a.id];
   if(!cur||cur.resolved)this.data.alertLog[a.id]={id:a.id,name:a.name,service:a.service,severity:a.severity,from:Date.parse(a.startsAt)||t,last:t,resolved:0,source:a.source};
   else cur.last=t;
  }
  for(const a of Object.values(this.data.alertLog))if(!a.resolved&&!seen.has(a.id))a.resolved=t;
 }
 alertLog(from=0){return Object.values(this.data.alertLog).filter(a=>(a.resolved||a.last)>=from);}
 tracker(){return this.data.tracker;}
 setTracker(v){this.data.tracker=v;}
 notices(){return this.data.notices.slice();}
 addNotice(n){this.data.notices=this.data.notices.filter(x=>x.id!==n.id).concat(n).slice(-20);}
 wipe(){this.data={...blank(),checks:this.data.checks,services:this.data.services};this.save();}
}
// One store per company data folder; tests pass their own folder.
function open(s,{now}={}){
 const root=s?.dataRoot||'';
 const key=root||s;
 if(!stores.has(key))stores.set(key,new MonitorStore({file:root?path.join(root,'monitoring','monitoring.json'):'',now}));
 return stores.get(key);
}
module.exports={MonitorStore,open,KEEP,DAY,MAX_CHECKS};
