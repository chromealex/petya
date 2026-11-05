const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {CompanyLifecycle}=require('../src/company-lifecycle.cjs');
(async()=>{
 const app=new EventEmitter(),powerMonitor=new EventEmitter(),removed=[];let stopped=0,global=0;
 app.on('before-quit',()=>global++);
 const life=new CompanyLifecycle({app,powerMonitor,ipcMain:{removeHandler:name=>removed.push(name)}});
 app.once('before-quit',async()=>{await Promise.resolve();stopped++;});app.on('will-quit',()=>stopped++);powerMonitor.on('resume',()=>{});life.names.add('settings');life.capture();
 const signal=life.options().signal;await life.close();await life.close();assert(signal.aborted);assert.equal(stopped,2);assert.equal(global,0);assert.equal(powerMonitor.listenerCount('resume'),0);assert.deepEqual(removed,['petya:settings']);assert.throws(()=>life.check());app.emit('before-quit');assert.equal(global,1);
 const root='/tmp/company-one';const {companySession}=require('../src/company-browser-session.cjs');const ses={fromPath:p=>p,fromPartition:p=>p};assert.equal(companySession(ses,root,'petya-web-search'),root+'/Partitions/petya-web-search');assert.notEqual(companySession(ses,root,'read',false),companySession(ses,'/tmp/company-two','read',false));
 console.log('Company lifecycle: cleanup, no application quit, idempotency, stale access and isolated browser paths passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
