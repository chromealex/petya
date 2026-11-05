const assert=require('node:assert/strict');
const {run,select}=require('../src/extensions/agent.cjs');
module.exports=async function(){
 const calls=[],catalog={tools:[{name:'inspect_item',description:'Read item',inputSchema:{type:'object',properties:{id:{type:'integer'}},required:['id'],additionalProperties:false}},
   {name:'update_item',description:'Change item',inputSchema:{type:'object',properties:{id:{type:'integer'},enabled:{type:'boolean'}},required:['id','enabled'],additionalProperties:false}}],resources:[],templates:[]};
 const decisions=[
  {action:'call',name:'inspect_item',arguments:'{"id":7}',text:'Проверяю объект',evidence:[]},
  {action:'call',name:'update_item',arguments:'{"id":7,"enabled":true}',text:'Предлагаю включить объект.',evidence:[1]}
 ];
 const s={settings:{model:'test',ollamaUrl:'http://127.0.0.1:11434/api/chat'},request:async(url,options)=>{
   const item=decisions.shift();
   if(JSON.parse(options.body).format)return {message:{content:JSON.stringify(item)}};
   return {message:item.action==='call'?{content:item.text,tool_calls:[{id:'test',function:{name:item.name,arguments:JSON.parse(item.arguments)}}]}:{content:item.text}};
 }};
 const options={s,command:'Проверь объект',catalog,readOnly:call=>call.name==='inspect_item',check(){},report(){},
   invoke:async call=>{calls.push(call);return {content:[{type:'text',text:'{"enabled":false}'}]};}};
 const result=await run(options);
 assert.equal(calls.length,1);assert.equal(result.proposal.name,'update_item');
 decisions.push({action:'call',name:'update_item',arguments:'{"id":7,"enabled":true}',text:'Измени',evidence:[]});
 await assert.rejects(run(options),/сначала нужны данные/);
 decisions.push({action:'call',name:'inspect_item',arguments:'{"id":"bad"}',text:'Проверка',evidence:[]});
 await assert.rejects(run(options),/параметры/);
 decisions.push({action:'answer',name:'',arguments:'{}',text:'Готово',evidence:[1]});
 assert.match((await run(options)).answer,/Недостаточно данных/);
 decisions.push(
  {action:'call',name:'inspect_item',arguments:'{"id":7}',text:'Проверяю'},
  {action:'answer',text:'Нужно включить объект.'},
  {complete:true,missing:'',proposalNeeded:true},
  {action:'call',name:'update_item',arguments:'{"id":7,"enabled":true}',text:'Предлагаю включить объект.'});
 const reads=calls.length,reviewed=await run(options);
 assert.equal(reviewed.proposal.name,'update_item');assert.equal(calls.length,reads+1);
 let revoked=false;
 decisions.push({action:'call',name:'inspect_item',arguments:'{"id":7}',text:'Проверка',evidence:[]});
 await assert.rejects(run({...options,check(){if(revoked)throw Error('revoked');},
  invoke:async()=>{revoked=true;return {content:[]};}}),/revoked/);
 s.dialogue={active:()=>null};decisions.push({id:'sample',confidence:.95});
 assert.equal((await select(s,'Проверь объект',[{type:'sample',agent:'Read and edit objects'}])).type,'sample');
 console.log('Generic extension agent: schema checks, evidence, scoped reads and unexecuted proposals verified');
};
