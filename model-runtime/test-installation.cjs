// Filesystem checks only: no model is admitted, executed, downloaded or evaluated here.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {createInstallationResolver}=require('../src/model-runtime/installation.cjs');
const sha=value=>createHash('sha256').update(value).digest('hex');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'petya-installation-'));
 const root=path.join(temp,'models'),folder=path.join(root,'test-release'),python=path.join(temp,'python');
 const evidence=JSON.stringify({testOnly:true,scope:'Not actual release evidence'});
 const manifest=JSON.stringify({name:'petya-v1',qualification:'release'});
 await fs.mkdir(path.join(folder,'base'),{recursive:true});await fs.mkdir(path.join(folder,'adapter'));
 await fs.writeFile(python,'#!/bin/sh\nexit 0\n',{mode:0o700});
 await fs.writeFile(path.join(folder,'manifest.json'),manifest);await fs.writeFile(path.join(folder,'release-evidence.json'),evidence);
 const entry={model:'petya-v1',platform:'darwin',arch:'arm64',directory:'test-release',digest:'a'.repeat(64),manifestSha256:sha(manifest),evidenceSha256:sha(evidence)};
 const options={installRoot:root,runtimePython:python,releases:[entry],platform:'darwin',arch:'arm64'};
 try{
  const resolve=createInstallationResolver(options),result=await resolve();
  assert.equal(result.python,python);assert.equal(result.config.allow_development,false);
  assert.equal(result.config.model,'petya-v1');assert.equal(result.config.digest,entry.digest);
  assert.equal(result.config.base,await fs.realpath(path.join(folder,'base')));
  const {RuntimeController}=require('../src/model-runtime/controller.cjs'),{EventEmitter}=require('node:events');
  let started=0,selected;
  class Owner extends EventEmitter{async start(config){started++;selected=config;}async stop(){}connection(){return {};}}
  const controller=new RuntimeController({resolveInstallation:resolve,createOwner:()=>new Owner(),createClient:()=>({close(){},stats(){return {};}})});
  controller.start();await controller.job.pending;assert.equal(controller.snapshot().phase,'ready');
  assert.deepEqual(selected,result.config);await controller.dispose();assert.equal(started,1);
  const unavailable=new RuntimeController({resolveInstallation:createInstallationResolver({...options,releases:[]}),createOwner:()=>{throw Error('must not spawn');}});
  unavailable.start();await unavailable.job.pending;assert.equal(unavailable.snapshot().phase,'error');assert.equal(unavailable.job,null);
  await unavailable.dispose();
  const aborted=new AbortController();aborted.abort();await assert.rejects(resolve({signal:aborted.signal}),{name:'AbortError'});
  for(const changes of [{releases:[]},{platform:'win32'},{arch:'x64'},{model:'unknown'}])
   await assert.rejects(createInstallationResolver({...options,...changes})(),/недоступен/);
  assert.throws(()=>createInstallationResolver({...options,releases:[entry,entry]}),/Неоднозначный/);
  for(const changes of [{directory:'../outside'},{directory:'/outside'},{directory:42},{digest:'wrong'},{unexpected:true}])
   assert.throws(()=>createInstallationResolver({...options,releases:[{...entry,...changes}]}),/каталог/);
  const mutable={...entry},snapshotted=createInstallationResolver({...options,releases:[mutable]});
  mutable.directory='other';mutable.digest='b'.repeat(64);assert.equal((await snapshotted()).config.digest,entry.digest);
  await fs.writeFile(path.join(folder,'manifest.json'),manifest+' ');await assert.rejects(resolve(),/не соответствует/);
  await fs.writeFile(path.join(folder,'manifest.json'),manifest);
  await fs.writeFile(path.join(folder,'release-evidence.json'),'tampered');await assert.rejects(resolve(),/не соответствует/);
  await fs.writeFile(path.join(folder,'release-evidence.json'),evidence);
  const development=JSON.stringify({name:'petya-v1',qualification:'development'});
  await fs.writeFile(path.join(folder,'manifest.json'),development);
  await assert.rejects(createInstallationResolver({...options,releases:[{...entry,manifestSha256:sha(development)}]})(),/Экспериментальная/);
  const wrongName=JSON.stringify({name:'other',qualification:'release'});
  await fs.writeFile(path.join(folder,'manifest.json'),wrongName);
  await assert.rejects(createInstallationResolver({...options,releases:[{...entry,manifestSha256:sha(wrongName)}]})(),/Экспериментальная/);
  await fs.writeFile(path.join(folder,'manifest.json'),manifest);
  const outside=path.join(temp,'outside');await fs.mkdir(outside);
  await fs.rmdir(path.join(folder,'adapter'));await fs.symlink(outside,path.join(folder,'adapter'));
  await assert.rejects(resolve(),/вне папки/);await fs.unlink(path.join(folder,'adapter'));
  const other=path.join(root,'other');await fs.mkdir(other);await fs.symlink(other,path.join(folder,'adapter'));
  await assert.rejects(resolve(),/другой установке/);await fs.unlink(path.join(folder,'adapter'));await fs.mkdir(path.join(folder,'adapter'));
  await fs.unlink(path.join(folder,'release-evidence.json'));await assert.rejects(resolve(),{code:'ENOENT'});
  await fs.writeFile(path.join(folder,'release-evidence.json'),Buffer.alloc(1024*1024+1));await assert.rejects(resolve(),/метаданные/);
  await fs.writeFile(path.join(folder,'release-evidence.json'),evidence);
  await assert.rejects(createInstallationResolver({...options,runtimePython:folder})(),/Среда модели/);
  await fs.unlink(python);await assert.rejects(resolve(),{code:'ENOENT'});
  console.log('Installation checks passed: trusted selection, platform, immutable catalog, pinned metadata, development rejection, cancellation, missing files and directory confinement.');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
