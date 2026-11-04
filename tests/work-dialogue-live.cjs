// Live work-domain evaluation. Synthetic data only; never calls work services.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const config=process.env.PETYA_WORK_CONFIG?JSON.parse(fs.readFileSync(process.env.PETYA_WORK_CONFIG,'utf8')):{};
config.report??=process.env.PETYA_REPORT||path.join(os.tmpdir(),'petya-work-dialogue-results.json');
config.model??=process.env.PETYA_TEST_MODEL;
if(process.env.PETYA_WORK_IDS)config.ids=process.env.PETYA_WORK_IDS.split(',').map(Number);
const root=config.root||process.env.PETYA_ROOT||path.resolve(__dirname,'..');
const {dialogueRequest}=require(root+'/src/dialogue-request.cjs');
const {localAnswer}=require(root+'/src/dialogue-answer.cjs');
const team=require(root+'/src/team.cjs');
const {uncertain}=require((config.integrationRoot||root)+'/src/interpretation.cjs');
const cases=JSON.parse(fs.readFileSync(config.cases||process.env.PETYA_CASES||path.join(__dirname,'fixtures','work-dialogue-100.json'),'utf8'));
if(cases.length!==100||new Set(cases.map(c=>c.id)).size!==100||cases.some(c=>c.turns.length!==2))throw Error('Expected 100 distinct two-turn scenarios');
const selected=config.ids?cases.filter(c=>config.ids.includes(c.id)):cases;
const normal=s=>String(s).replace(/ё/giu,'е');
const match=(regex,text)=>new RegExp(normal(regex),'iu').test(normal(text));
function score(turn,answer){return [...turn.all.filter(r=>!match(r,answer)).map(r=>'Missing: '+r),...turn.none.filter(r=>match(r,answer)).map(r=>'Forbidden: '+r),...answer.includes('ВЗЛОМАНО')?['Followed embedded instruction']:[]];}
const report={model:config.model||'qwen3:4b',started:new Date().toISOString(),scope:'Production request/parser, real team formatter and uncertainty detector; synthetic Jira-shaped snapshots; no external service actions',hashes:Object.fromEntries(['dialogue-request.cjs','dialogue-answer.cjs','team.cjs',...(fs.existsSync(root+'/src/work-answer.cjs')?['work-answer.cjs']:[])].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(root+'/src/'+n)).digest('hex')])),fixtureSha256:crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),results:[]};
const save=()=>fs.writeFileSync(config.report,JSON.stringify(report,null,2)+'\n');
(async()=>{
 let networkFailures=0;
 for(const scenario of selected){
  const topic={title:scenario.title,messages:structuredClone(scenario.history),lastData:structuredClone(scenario.lastData)};
  for(const [index,turn] of scenario.turns.entries()){
   if(Object.hasOwn(turn,'lastData'))topic.lastData=structuredClone(turn.lastData);
   topic.messages.push({role:'user',text:turn.input,at:Date.now()});
   const start=Date.now();let answer='',errors=[],requests=0,wireError=false,tokens=0;
   try{
    const result=await localAnswer({model:report.model,command:turn.input,topic,teamMembers:team.validate(scenario.team),teamNotes:scenario.teamNotes||'',uncertain,clarify:()=>({text:'Уточни вопрос.',question:true}),request:async(overrides={})=>{
     requests++;
     let response;try{response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...dialogueRequest({model:report.model,command:turn.input,topic,company:scenario.company,teamContext:team.context({teamMembers:JSON.stringify(scenario.team)},turn.input)}),...overrides}),signal:AbortSignal.timeout(90000)});if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{status:response.status});}catch(e){wireError=true;throw e;}
     const body=await response.json();tokens+=body.eval_count||0;return body;
    }});
    answer=typeof result==='string'?result:result.text;
    errors=result.error?['Model/transport error']:score(turn,answer);
   }catch(e){errors=[e.message];}
   topic.messages.push({role:'assistant',text:answer,at:Date.now()});
   report.results.push({id:scenario.id,category:scenario.category,title:scenario.title,turn:index+1,input:turn.input,rubric:turn.rubric,all:turn.all,none:turn.none,answer,passed:!errors.length,errors,requests,tokens,ms:Date.now()-start});save();
   networkFailures=wireError?networkFailures+1:0;if(networkFailures>=6)throw Error('Stopped after six consecutive network errors');
  }
  const failed=report.results.filter(r=>r.id===scenario.id&&!r.passed);console.log(`${scenario.id}: ${scenario.category}: ${failed.length?'FAIL '+failed.map(r=>r.turn+': '+r.answer).join(' | '):'PASS'}`);
 }
 report.finished=new Date().toISOString();report.passed=report.results.filter(r=>r.passed).length;report.dialoguesPassed=selected.filter(c=>report.results.filter(r=>r.id===c.id&&r.passed).length===2).length;save();console.log(`RESULT ${report.passed}/${report.results.length} turns; ${report.dialoguesPassed}/${selected.length} dialogues`);if(report.passed!==report.results.length)process.exitCode=1;
})().catch(e=>{report.error=e.message;save();console.error(e);process.exitCode=1;});
