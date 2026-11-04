const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');const {ImageInstaller}=require('../src/image-installer.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-install-test-'));let child,installed=false,spawns=0;
const make=(overrides={})=>new ImageInstaller({root,ready:()=>installed,run:async()=>({stdout:''}),statfs:async()=>({bavail:10*1024**3,bsize:1}),platform:'win32',spawnProcess:()=>{spawns++;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.pid=123;child.kill=()=>{};return child;},...overrides});
const tick=()=>new Promise(r=>setTimeout(r,30));
(async()=>{try{
 let installer=make({statfs:async()=>({bavail:100,bsize:1})});installer.start();await installer.job;assert.match(installer.status().message,/6 ГБ/);assert.equal(spawns,0);
 installer=make({run:async()=>{throw Error('ENOENT');}});installer.start();await installer.job;assert.match(installer.status().message,/Python/);assert.equal(spawns,0);
 installer=make();assert.equal(installer.start().busy,true);const first=installer.job;installer.start();assert.equal(installer.job,first);await tick();assert.equal(spawns,1);child.stdout.write('PETYA_PHASE:mo');child.stdout.write('del\n');assert.equal(installer.status().phase,'model');installed=true;child.emit('close',0);await first;assert.equal(installer.status().ready,true);installer.start();assert.equal(spawns,1);
 installed=false;installer=make();installer.start();await tick();child.emit('close',0);await installer.job;assert.match(installer.status().message,/Проверка модели/);
 installer=make();installer.start();await tick();const pending=installer.job;installer.cancel();assert.equal(installer.status().phase,'stopping');child.emit('close',1);await pending;assert.equal(installer.status().phase,'cancelled');installer.start();await tick();child.stderr.write('OSError: No space left on device');child.emit('close',1);await installer.job;assert.match(installer.status().message,/закончилось место/);
 installer=make();installer.start();await tick();child.emit('error',Error('spawn'));await installer.job;assert.equal(installer.status().phase,'error');
 console.log('Image installer: disk preflight, Python availability, deduplication, phases, ready validation, cancellation, retry and failures passed.');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
