// Actual worker/HTTP smoke test; no reserved quality cases or reference history.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const {RuntimeSupervisor}=require(path.join(root,'src/model-runtime/supervisor.cjs'));
const {dialogueRequest}=require(path.join(root,'src/dialogue-request.cjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
async function main(){
 const [python,base,output]=process.argv.slice(2);assert.ok(python&&base&&output);assert.ok(!fs.existsSync(output));
 const manifest=path.join(__dirname,'replay-development-manifest.json'),bundle=JSON.parse(fs.readFileSync(manifest));
 const digest=hash(JSON.stringify(canonical(bundle))),model=bundle.name,owner=new RuntimeSupervisor({python});
 const evidence={scope:'Development transport/engine probe, not release quality evidence.',digest,model,states:[],requests:[],startedAt:new Date().toISOString()};
 owner.on('state',state=>{evidence.states.push(state);console.log(state.phase,state.stage||'');});
 try{
  await owner.start({manifest,base,adapter:path.join(root,'tests/fixtures/requirements-draft-v19/replay-adapter'),digest,model,allow_development:true});
  const connection=owner.connection();
  const call=async(route,body)=>{
   const response=await fetch(connection.endpoint+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(180000)});
   return {status:response.status,text:await response.text()};
  };
  const tags=await call('/api/tags');assert.equal(tags.status,200);assert.equal(JSON.parse(tags.text).models[0].digest,digest);evidence.tags=JSON.parse(tags.text);
  const production=dialogueRequest({model,command:'Назови результат: два плюс два.',topic:{messages:[]},company:'Проверка сервиса'});
  const body=(format,text,stream=false)=>({model,stream,format,messages:[{role:'user',content:text}],options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1,num_predict:128}});
  const requests=[
   {id:'application-schema',body:production},
   {id:'scalar-fraction',body:body({type:'number',const:-48.25},'Верни число -48.25 в JSON.')},
   {id:'generic-array',body:body('json','Верни JSON-массив [-63,-37,-14,-14] без изменений.')},
   {id:'streaming-schema',body:body({type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},'Верни JSON с полем answer и коротким русским приветствием.',true)}
  ];
  for(const request of requests){
   const result=await call('/api/chat',request.body);evidence.requests.push({...request,...result});assert.equal(result.status,200,request.id+': '+result.text);
   const replies=request.body.stream?result.text.trim().split('\n').map(JSON.parse):[JSON.parse(result.text)];
   assert.ok(!replies.some(row=>row.error));assert.equal(replies.filter(row=>row.done).length,1);
   const content=replies.map(row=>row.message?.content||'').join('');JSON.parse(content);
   if(request.id==='scalar-fraction')assert.equal(JSON.parse(content),-48.25);
   console.log(request.id,content.slice(0,200));
  }
  evidence.status='passed';
 }catch(error){evidence.status='failed';evidence.error=error.message;throw error;}
 finally{
  await owner.stop();evidence.finishedAt=new Date().toISOString();
  evidence.sourceHashes=Object.fromEntries(['src/model-runtime/bootstrap.py','src/model-runtime/supervisor.cjs','src/model-runtime/engine.py','src/model-runtime/grammar.py','src/model-runtime/transport.py','src/dialogue-request.cjs'].map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
  fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
