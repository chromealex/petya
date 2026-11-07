// Inference-only release evidence through the application's actual dialogue path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const {Dialogue}=require(path.join(root,'src/dialogue.cjs'));
const {runtimeFetch}=require(path.join(root,'src/model-runtime/http.cjs'));
const {dialogueRequest}=require(path.join(root,'src/dialogue-request.cjs'));
const {localAnswer}=require(path.join(root,'src/dialogue-answer.cjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function scenarios(){
 const bytes=fs.readFileSync(path.join(__dirname,'scenarios.json'));
 const protocol=JSON.parse(fs.readFileSync(path.join(__dirname,'protocol.json')));
 if(hash(bytes)!==protocol.scenarios_sha256)throw Error('Reserved scenarios changed');
 return JSON.parse(bytes);
}
async function runScenario(scenario,{model,request,record}){
 let turn=-1;
 const d=new Dialogue({routeTopic:async()=>null,answer:async(command,topic)=>localAnswer({model,command,topic,
  request:async(overrides={})=>{
   const body={...dialogueRequest({model,command,topic,company:'Проверка petya-v1'}),...overrides};
   record({kind:'request',scenario:scenario.id,turn,body});
   try{const response=await request(body);record({kind:'response',scenario:scenario.id,turn,response});return response;}
   catch(e){record({kind:'request-error',scenario:scenario.id,turn,error:e.message});throw e;}
  },uncertain:()=>false,clarify:()=>({text:'Уточни вопрос.',question:true})})});
 for(const input of scenario.turns){
  turn++;const started=Date.now();
  try{
   const result=await d.turn(input);
   record({kind:'turn',scenario:scenario.id,turn,input,answer:String(result?.text||''),...(result?.error?{error:String(result.text||'Dialogue returned an error')}:{}),question:result?.question===true,source:d.active()?.answeredBy||null,ms:Date.now()-started});
  }catch(e){record({kind:'turn',scenario:scenario.id,turn,input,error:e.message,ms:Date.now()-started});}
 }
}
function loopback(endpoint){
 const u=new URL(endpoint);
 if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Use an explicit HTTP loopback origin');
 return u;
}
async function readToken(input){
 let bytes=0;const chunks=[];
 for await(const chunk of input){
  const b=Buffer.from(chunk);bytes+=b.length;
  if(bytes>258)throw Error('Invalid private token input');
  chunks.push(b);
 }
 const token=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw Error('Invalid private token input');
 return token;
}
function authenticatedJSON(origin,token,fetchImpl=runtimeFetch){
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw Error('Invalid private token input');
 const base=loopback(String(origin));
 return async(route,options={})=>{
  if(!['/api/tags','/api/chat'].includes(route))throw Error('Unsupported inference route');
  const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+token);
  let response;
  try{response=await fetchImpl(new URL(route,base),{...options,headers,redirect:'error',signal:AbortSignal.timeout(180000)});}
  catch{throw Error('Local inference connection failed');}
  if(!response.ok)throw Error('Inference HTTP '+response.status);
  try{return await response.json();}catch{throw Error('Invalid inference JSON response');}
 };
}
async function main(){
 const [endpoint,model,digest,out]=process.argv.slice(2);
 if(!endpoint||!model||!digest||!out)throw Error('Usage: node run.cjs http://127.0.0.1:PORT MODEL EXPECTED_DIGEST NEW_OUTPUT.jsonl');
 const origin=loopback(endpoint),cases=scenarios();
 if(!/^(sha256:)?[a-f0-9]{64}$/.test(digest))throw Error('Expected a full model SHA256 digest');
 if(fs.existsSync(out)||fs.existsSync(out+'.manifest.json'))throw Error('Output already exists');
 const token=await readToken(process.stdin);
 const fetchJSON=authenticatedJSON(origin,token);
 const tags=await fetchJSON('/api/tags');
 const selected=tags.models?.find(x=>x.name===model||x.model===model);
 if(!selected||String(selected.digest).replace(/^sha256:/,'')!==digest.replace(/^sha256:/,''))throw Error('Endpoint model identity does not match expected digest');
 const sourceHashes={};
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);
  else if(entry.isFile()&&file.endsWith('.cjs'))sourceHashes[path.relative(root,file)]=hash(fs.readFileSync(file));
 }}walk(path.join(root,'src'));
 const manifest={model,endpoint:origin.origin,advertisedModel:selected,expectedDigest:digest,startedAt:new Date().toISOString(),
  scenariosSHA256:hash(fs.readFileSync(path.join(__dirname,'scenarios.json'))),runnerSHA256:hash(fs.readFileSync(__filename)),sourceHashes,
  runtimeIdentity:'Advertised digest checked; server artifact provenance must also be independently verified.',
  authentication:'private-stdin bearer; token excluded from evidence',generatedHistory:true,referenceAnswersInserted:false,productionRequestOptions:true,status:'running'};
 const fd=fs.openSync(out,'wx');
 const save=()=>fs.writeFileSync(out+'.manifest.json',JSON.stringify(manifest,null,2)+'\n');save();
 const record=row=>{fs.writeSync(fd,JSON.stringify(row)+'\n');if(row.kind==='turn')console.log(row.scenario,row.turn,row.error||row.answer.slice(0,140));};
 try{
  for(const c of cases)await runScenario(c,{model,record,request:body=>fetchJSON('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  manifest.status='captured-awaiting-semantic-review';
 }catch(e){manifest.status='failed';manifest.error=e.message;throw e;}
 finally{fs.closeSync(fd);manifest.finishedAt=new Date().toISOString();manifest.outputSHA256=hash(fs.readFileSync(out));save();}
}
module.exports={runScenario,loopback,scenarios,readToken,authenticatedJSON};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
