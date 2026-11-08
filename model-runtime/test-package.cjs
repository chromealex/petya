// Verify ASAR layout and actual Python bootstrap imports without loading a model.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto'),asar=require('@electron/asar');
(async()=>{
 const python=process.argv[2];assert.ok(python&&path.isAbsolute(python),'Pass an absolute Python path');
 const root=path.resolve(__dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'petya-runtime-package-')));
 let owner;
 try{
  const source=path.join(temp,'source'),runtime=path.join(source,'src/model-runtime');fs.mkdirSync(runtime,{recursive:true});
  const production=path.join(root,'src/model-runtime');
  for(const name of fs.readdirSync(production))if(fs.statSync(path.join(production,name)).isFile())fs.copyFileSync(path.join(production,name),path.join(runtime,name));
  for(const name of ['answer-stream.cjs','request-progress.cjs','answer-cancel.cjs','core.cjs'])fs.copyFileSync(path.join(root,'src',name),path.join(source,'src',name));
  const config=require('../package.json').build,patterns=config.asarUnpack.filter(pattern=>pattern.startsWith('src/model-runtime/'));
  assert.ok(config.files.includes('src/**/*'));assert.deepEqual(patterns,['src/model-runtime/*.py','src/model-runtime/requirements.txt']);
  const archive=path.join(temp,'app.asar');
  await asar.createPackageWithOptions(source,archive,{unpack:'{'+patterns.map(pattern=>'**/'+pattern).join(',')+'}'});
  for(const name of fs.readdirSync(runtime)){
   const entry=asar.statFile(archive,'src/model-runtime/'+name);
   assert.equal(!!entry.unpacked,name.endsWith('.py')||name==='requirements.txt',name);
   assert.deepEqual(asar.extractFile(archive,'src/model-runtime/'+name),fs.readFileSync(path.join(runtime,name)));
  }
  const {RuntimeSupervisor}=require(path.join(archive,'src/model-runtime/supervisor.cjs'));
  require(path.join(archive,'src/model-runtime/controller.cjs'));
  const {createRouter}=require(path.join(archive,'src/model-runtime/router.cjs'));
  const route=createRouter({getEndpoint:()=> 'http://127.0.0.1:11434/api/chat',chat:async body=>({routed:body.model})});
  assert.deepEqual(await route('http://127.0.0.1:11434/api/chat',{method:'POST',body:JSON.stringify({model:'petya-v1'})},()=>{throw Error('Unexpected packaged fallback');}),{routed:'petya-v1'});

  let invoked,child;
  owner=new RuntimeSupervisor({python,startTimeout:5000,stopTimeout:200,killTimeout:200,spawnProcess:(exe,args,options)=>{
   invoked=args[0];assert.equal(invoked,path.join(temp,'app.asar.unpacked/src/model-runtime/bootstrap.py'));
   assert.ok(fs.existsSync(invoked));child=spawn(exe,args,options);return child;
  }});
  const manifest=path.join(temp,'manifest.json'),bytes='{"qualification":"development"}';fs.writeFileSync(manifest,bytes);
  await assert.rejects(owner.start({manifest,base:temp,adapter:temp,digest:createHash('sha256').update(bytes).digest('hex'),model:'package-probe'}),/подготовить/);
  await owner.stop();assert.equal(child.exitCode,1);assert.ok(invoked);assert.equal(owner.active,null);
  console.log('Package checks passed: source inclusion, unpacked Python bytes, archived JavaScript imports and real bootstrap rejection before model loading.');
 }finally{await owner?.stop();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
