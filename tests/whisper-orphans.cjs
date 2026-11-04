const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {cleanupOrphans,Speech}=require('../src/speech.cjs');
if(process.platform==='win32'){console.log('Whisper orphans: skipped on Windows');process.exit(0);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-whisper-')),file=path.join(dir,'pids.json'),bin='/Apps/Petya.app/Contents/Resources/runtime/whisper-build/bin/whisper-server';
fs.writeFileSync(file,JSON.stringify([501]));
const killed=[];
const rows=[{pid:500,ppid:1,command:bin+' -m model.bin --port 8081'},{pid:501,ppid:77,command:bin+' -m x'},{pid:502,ppid:77,command:bin+' -m y'},{pid:503,ppid:1,command:'/opt/other/whisper-server -m z'},{pid:504,ppid:1,command:'/bin/zsh'}];
const stopped=cleanupOrphans(file,[bin],{list:()=>rows,kill:pid=>killed.push(pid)});
assert.deepEqual(stopped.sort(),[500,501]);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),[]);
// spawned children are recorded and forgotten on exit
const {EventEmitter}=require('node:events');const child=new EventEmitter();child.pid=900;child.kill=()=>{};
const s=new Speech({spawnProcess:()=>child,exists:()=>true,fetcher:(()=>{let n=0;return async()=>{if(n++===0)throw new TypeError('fetch failed');return {ok:true,status:200,json:async()=>({status:'ok'})};};})(),pause:async()=>{}});
s.start?.({whisperBinary:'/a/whisper-server',whisperModel:'/a/m.bin',whisperUrl:'http://127.0.0.1:8090/inference'}).catch(()=>{});
setTimeout(()=>{const saved=JSON.parse(fs.readFileSync(file,'utf8'));child.emit('exit',0);const after=JSON.parse(fs.readFileSync(file,'utf8'));
 assert(saved.includes(900),'child pid not recorded');assert(!after.includes(900),'child pid kept after exit');console.log('Whisper orphans: stale servers of a killed Petya stopped, foreign processes kept, PID registry and child tracking passed');},50);
