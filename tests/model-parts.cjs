// Model parts: catalog from the models branch, hash-checked downloads into the app folder, optional A, cancel,
// a corrupted file never kept, duplicate start ignored.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {create}=require('../src/features/model-parts.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
(async()=>{
 const adapter=Buffer.alloc(300000,7),config=Buffer.from('{"rank":8}'),weights=Buffer.alloc(200000,3);let corrupt=false,slow=false;
 const files={'/raw/andromeda/group.json':JSON.stringify({group:'Andromeda',version:'R1-A1-D2',components:{R:'R1',A:'A1',D:'D2'},optional:['A'],versions:{D:['D2','D1','bad']},base:{repository:'org/base',revision:'a'.repeat(40),files:{'model.safetensors':{bytes:weights.length,sha256:sha(weights)}}}}),
  '/raw/andromeda/R1/model.json':JSON.stringify({status:'experimental',adapter:null}),
  '/raw/andromeda/A1/model.json':JSON.stringify({status:'experimental',adapter:{files:{'adapters.safetensors':sha(adapter)}},bytes:adapter.length}),
  '/raw/andromeda/D2/model.json':JSON.stringify({status:'stable',adapter:{files:{'adapters.safetensors':sha(adapter)}},bytes:adapter.length}),
  '/raw/andromeda/D1/model.json':JSON.stringify({status:'experimental',adapter:{files:{'adapters.safetensors':sha(adapter),'adapter_config.json':sha(config)}},bytes:adapter.length+config.length})};
 const server=http.createServer(async(req,res)=>{
  if(files[req.url])return res.end(files[req.url]);
  if(/\/rel\/andromeda-(a1|d1)\/adapters\.safetensors$/.test(req.url)){if(slow){res.write(adapter.subarray(0,1000));return;}return res.end(corrupt?Buffer.alloc(adapter.length,1):adapter);}
  if(req.url==='/rel/andromeda-d1/adapter_config.json')return res.end(config);
  if(req.url==='/hub/org/base/resolve/'+'a'.repeat(40)+'/model.safetensors')return res.end(weights);
  res.statusCode=404;res.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-parts-'));const events=[];
 const parts=create({win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(_,e)=>events.push(e)}}},{root,source:{raw:url+'/raw/',releases:url+'/rel/',hub:url+'/hub/'}});
 const wait=async(id,test)=>{for(let i=0;i<300;i++){const s=await parts.status();const item=id==='base'?s.base:s.parts.find(p=>p.id===id);if(test(item))return item;await new Promise(r=>setTimeout(r,10));}throw Error('timeout '+id);};
 let s=await parts.status();assert.equal(s.version,'Petya Andromeda R1-A1-D2');assert.equal(s.pinned,false);assert.deepEqual(s.parts[2].versions,['D2','D1']);
 await assert.rejects(parts.choose('D','D7'),/нет среди/);
 s=await parts.choose('D','D1');assert.equal(s.version,'Petya Andromeda R1-A1-D1');assert.equal(s.groupVersion,'Petya Andromeda R1-A1-D2');assert(s.pinned);
 assert.equal((await create({},{root,source:{raw:url+'/raw/',releases:url+'/rel/',hub:url+'/hub/'}}).status()).version,'Petya Andromeda R1-A1-D1','pin not kept');assert.deepEqual(s.parts.map(p=>[p.id,p.optional,p.installed]),[['R1',false,false],['A1',true,false],['D1',false,false]]);
 assert.match(s.parts[0].needed,/без своих весов/);await assert.rejects(parts.install('R1'),/нечего/);
 await parts.install('D1');await parts.install('D1');const d=await wait('D1',p=>!p.busy);assert(d.installed,'D1 not installed: '+d.error);
 assert(events.some(e=>e.id==='model-part:andromeda:D1'&&e.kind==='success'));assert.equal((await parts.status()).parts[1].installed,false,'A downloaded with D');
 assert.equal(fs.readFileSync(path.join(await parts.path('D1'),'adapters.safetensors')).length,adapter.length);
 await parts.install('base');assert((await wait('base',p=>!p.busy)).installed);
 corrupt=true;await parts.install('A1');const a=await wait('A1',p=>!p.busy);assert(!a.installed);assert.match(a.error,/хэш/);assert(!fs.existsSync(path.join(root,'groups/andromeda/A1')),'corrupt file kept');
 assert(events.some(e=>e.part==='A1'&&e.retry));
 corrupt=false;slow=true;await parts.install('A1');await wait('A1',p=>p.busy);parts.cancel('A1');const c=await wait('A1',p=>!p.busy);assert(!c.installed&&!c.error,'cancel reported as error');
 assert(events.some(e=>e.part==='A1'&&e.version==='cancelled'));slow=false;
 await parts.remove('D1');assert.equal((await parts.status()).parts[2].installed,false);
 await parts.choose('D','D2');assert.equal((await parts.status()).pinned,false);
 server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true});
 console.log('Model parts: group catalog, version pin and rollback, hash-checked parts, optional A, corrupt and cancelled downloads, removal passed');
})().catch(e=>{console.error(e);process.exit(1);});
