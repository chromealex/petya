// A fake `docker` command for tests: written into a temp folder that is put first on PATH. It answers the read
// subcommands the «Docker» app uses with realistic JSON, records every call (argv) into FAKE_DOCKER_LOG, and can
// pretend the engine is down (FAKE_DOCKER_MODE=stopped), denied, or hanging (slow).
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const NOW=Date.parse('2026-11-09T10:00:00Z');
const ts=(sec)=>new Date(NOW-sec*1000).toISOString().replace('Z','000000Z');
function fixture(composeFile){
 const label=(p,s)=>'com.docker.compose.project='+p+',com.docker.compose.service='+s+',com.docker.compose.config-files='+composeFile;
 return {
  ps:[
   {ID:'a1b2c3d4e5f6',Names:'shop-api-1',Image:'shop-api:latest',State:'running',Status:'Up 2 hours',Ports:'0.0.0.0:8080->8080/tcp, :::8080->8080/tcp',Labels:label('shop','api'),RunningFor:'2 hours ago',CreatedAt:'2026-11-09 08:00:00 +0000 UTC'},
   {ID:'b2c3d4e5f6a1',Names:'shop-postgres-1',Image:'postgres:16',State:'restarting',Status:'Restarting (137) 5 seconds ago',Ports:'',Labels:label('shop','postgres'),RunningFor:'2 hours ago',CreatedAt:'2026-11-09 08:00:00 +0000 UTC'},
   {ID:'c3d4e5f6a1b2',Names:'redis',Image:'redis:7-alpine',State:'running',Status:'Up 3 days (healthy)',Ports:'0.0.0.0:6379->6379/tcp',Labels:'',RunningFor:'3 days ago',CreatedAt:'2026-11-06 08:00:00 +0000 UTC'},
   {ID:'d4e5f6a1b2c3',Names:'worker',Image:'shop-worker:dev',State:'exited',Status:'Exited (1) 3 minutes ago',Ports:'',Labels:'',RunningFor:'1 day ago',CreatedAt:'2026-11-08 08:00:00 +0000 UTC'},
   {ID:'e5f6a1b2c3d4',Names:'old-nginx',Image:'nginx:1.25',State:'exited',Status:'Exited (0) 2 weeks ago',Ports:'80/tcp',Labels:'',RunningFor:'3 weeks ago',CreatedAt:'2026-10-19 08:00:00 +0000 UTC'}
  ],
  stats:[
   {ID:'a1b2c3d4e5f6',Name:'shop-api-1',CPUPerc:'12.40%',MemPerc:'4.10%',MemUsage:'321.5MiB / 7.66GiB',NetIO:'1.2MB / 800kB',BlockIO:'0B / 0B',PIDs:'23'},
   {ID:'c3d4e5f6a1b2',Name:'redis',CPUPerc:'0.35%',MemPerc:'0.12%',MemUsage:'9.4MiB / 7.66GiB',NetIO:'5kB / 1kB',BlockIO:'0B / 0B',PIDs:'6'}
  ],
  compose:[{Name:'shop',Status:'running(1), restarting(1)',ConfigFiles:composeFile}],
  images:[
   {ID:'1111aaaa2222',Repository:'shop-api',Tag:'latest',Size:'245MB',CreatedSince:'2 hours ago',Containers:'1'},
   {ID:'2222bbbb3333',Repository:'postgres',Tag:'16',Size:'438MB',CreatedSince:'3 weeks ago',Containers:'1'},
   {ID:'3333cccc4444',Repository:'redis',Tag:'7-alpine',Size:'41.3MB',CreatedSince:'1 month ago',Containers:'1'},
   {ID:'4444dddd5555',Repository:'<none>',Tag:'<none>',Size:'1.21GB',CreatedSince:'5 days ago',Containers:'0'},
   {ID:'5555eeee6666',Repository:'<none>',Tag:'<none>',Size:'85.3MB',CreatedSince:'6 days ago',Containers:'0'}
  ],
  volumes:[{Name:'shop_pgdata',Driver:'local'},{Name:'3f9c2d7e8a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5',Driver:'local'}],
  df:[{Type:'Images',TotalCount:'5',Active:'3',Size:'2.02GB',Reclaimable:'1.3GB (64%)'},{Type:'Containers',TotalCount:'5',Active:'2',Size:'12.5MB',Reclaimable:'1.1MB (8%)'},{Type:'Local Volumes',TotalCount:'2',Active:'1',Size:'812MB',Reclaimable:'4.2MB (0%)'},{Type:'Build Cache',TotalCount:'31',Active:'0',Size:'640MB',Reclaimable:'640MB'}],
  inspect:{'b2c3d4e5f6a1':{Id:'b2c3d4e5f6a1'+'0'.repeat(52),Name:'/shop-postgres-1',RestartCount:7,Config:{Image:'postgres:16',Labels:{'com.docker.compose.project':'shop'}},
   HostConfig:{RestartPolicy:{Name:'always'},Memory:268435456},State:{Status:'restarting',Running:true,Restarting:true,OOMKilled:true,ExitCode:137,Error:'',StartedAt:'2026-11-09T09:59:50Z',FinishedAt:'2026-11-09T09:59:55Z'}}},
  logs:{'b2c3d4e5f6a1':{out:[[50,'PostgreSQL init process complete; ready for start up.'],[40,'LOG:  database system is ready to accept connections'],[20,'LOG:  checkpoint starting: time']],
   err:[[30,'WARNING:  could not open statistics file "pg_stat_tmp/global.stat": Operation not permitted'],[10,'FATAL:  terminating connection due to administrator command'],[5,'LOG:  server process (PID 87) was terminated by signal 9: Killed']]},
   'a1b2c3d4e5f6':{out:[[300,'INFO  listening on :8080'],[200,'GET /health 200 2ms'],[150,'GET /v1/users/42 200 14ms'],[100,'WARN  slow query 812ms'],[60,'POST /login 500 31ms'],[59,'ERROR timeout connecting to postgres:5432'],[30,'GET /health 200 1ms']],err:[]}}
 };
}
// Writes the fake binary and returns {dir, log, env(mode)} for PATH tricks.
function install(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-fake-docker-'));
 const composeDir=path.join(dir,'shop');fs.mkdirSync(composeDir);
 const composeFile=path.join(composeDir,'docker-compose.yml');fs.writeFileSync(composeFile,'services:\n  api:\n    image: shop-api\n');
 const data=path.join(dir,'fixture.json');fs.writeFileSync(data,JSON.stringify(fixture(composeFile)));
 const log=path.join(dir,'calls.log');
 const script=`#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);const d=JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'));
fs.appendFileSync(process.env.FAKE_DOCKER_LOG||${JSON.stringify(log)},JSON.stringify(a)+'\\n');
const mode=process.env.FAKE_DOCKER_MODE||'ok';const out=s=>process.stdout.write(s);const lines=l=>out(l.map(x=>JSON.stringify(x)).join('\\n')+'\\n');
const ts=${ts.toString()};const NOW=${NOW};
if(a[0]==='--version'){out('Docker version 29.9.2, build a82e528\\n');process.exit(0);}
if(a[0]==='context'){out('desktop-linux\\n');process.exit(0);}
if(mode==='slow'){setTimeout(()=>{},60000);return;}
if(mode==='stopped'){process.stderr.write('failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory\\n');process.exit(1);}
if(mode==='denied'){process.stderr.write('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock\\n');process.exit(1);}
const j=a.join(' ');
if(j==='version --format json'){out(JSON.stringify({Client:{Version:'29.9.2'},Server:{Version:'29.9.2'}}));process.exit(0);}
if(j==='ps --all --format json')return lines(d.ps);
if(j==='stats --no-stream --format json')return lines(d.stats);
if(j==='compose ls --all --format json')return out(JSON.stringify(d.compose));
if(j==='images --format json')return lines(d.images);
if(j==='images --filter dangling=true --format json')return lines(d.images.filter(i=>i.Repository==='<none>'));
if(j==='volume ls --format json')return lines(d.volumes);
if(j==='system df --format json')return lines(d.df);
if(a[0]==='container'&&a[1]==='inspect'){const i=d.inspect[a[2]];if(!i){process.stderr.write('Error: No such container: '+a[2]+'\\n');process.exit(1);}return out(JSON.stringify([i]));}
if(a[0]==='logs'){const id=a.at(-1);const l=d.logs[id]||{out:[],err:[]};const fmt=x=>x.map(([s,t])=>ts(s)+' '+t).join('\\n')+'\\n';out(fmt(l.out));process.stderr.write(l.err.length?fmt(l.err):'');return;}
if(['start','stop','restart'].includes(a[0])&&a.length===2){out(a[1]+'\\n');return;}
if(a[0]==='compose'&&(a.includes('up')||a.includes('down')))return;
if(a[0]==='image'&&a[1]==='rm'){if(a[2]==='5555eeee6666'){process.stderr.write('Error response from daemon: conflict: unable to delete 5555eeee6666 (must be forced) - image is being used by stopped container d4e5f6a1b2c3\\n');process.exit(1);}out('Deleted: sha256:'+a[2]+'\\n');return;}
process.stderr.write('fake docker: unexpected '+j+'\\n');process.exit(2);
`;
 const file=path.join(dir,process.platform==='win32'?'docker.cmd':'docker');
 fs.writeFileSync(file,script,{mode:0o755});
 return {dir,log,composeFile,calls:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[],reset:()=>{try{fs.unlinkSync(log);}catch{}}};
}
module.exports={install,fixture,NOW};
