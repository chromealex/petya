const assert=require('node:assert/strict');
const extensions=require('../src/features/extension-replies.cjs');
const unity=require('../src/extensions/unity/instances.cjs');
async function run(){
  const topic={id:'topic',projectId:'general',messages:[]};
  const settings={...extensions.defaults,module_confluence:'true',jiraUrl:'https://example.atlassian.net',confluenceSpace:''};
  const dialogue={active:()=>topic,state:{activeProjectId:'general'},persist(){},rememberAction(command,text){topic.messages.push({role:'user',text:command},{role:'assistant',text});}};
  let fail=false;const queries=[];
  const context={companyId:'a',dialogue,settings,attachments:{list:()=>[]},modules:{assertEnabled(){}},saveSettings:patch=>Object.assign(settings,patch),
    serviceAccess:{offer:async()=>null},requestProgress:{report(){}},workspace:{settings:()=>({...settings}),api:async path=>{
      queries.push(decodeURIComponent(path.replace(/\+/g,' ')));if(fail)throw Object.assign(Error('Forbidden'),{status:403});
      return {results:['QA','DEV'].map(key=>({id:key,space:{key}}))};
    }}};
  const {turn}=extensions.setup(context).extensionReplies;
  await turn('Сколько страниц Confluence по пространствам?');
  assert.deepEqual(topic.messages.at(-1).extensionResult.choices,['DEV','QA']);
  topic.messages.push({role:'user',text:'Только QA',pending:true});
  await turn('Только QA');assert.match(queries.at(-1),/space = "QA"/);
  fail=true;await turn('Обнови результат');assert.equal(topic.messages.at(-1).serviceProblem.id,'confluence');
  fail=false;await turn('Обнови результат');assert.match(queries.at(-1),/space = "QA"/);
  settings.jiraUrl='https://other.atlassian.net';const before=queries.length;
  assert.match((await turn('Обнови результат')).text,/Источник.*изменился/);assert.equal(queries.length,before);
  dialogue.state.activeProjectId='other';assert.equal(await turn('Только QA'),null);
  const instances=[{id:'A@1',name:'A'},{id:'A@2',name:'A'}];
  const client={listTools:async()=>({tools:[{name:'execute_code'}]}),getServerCapabilities:()=>({resources:{}}),
    listResources:async()=>({resources:[{uri:'mcpforunity://instances'}]}),
    readResource:async()=>({contents:[{text:JSON.stringify({success:true,instances})}]}),
    callTool:async request=>({structuredContent:{success:true,data:{instance:request.arguments.instance}}})};
  assert.deepEqual(await unity.inspect(client),instances);await unity.target(client,'A@2');
  instances.length=0;await assert.rejects(unity.inspect(client),/Connect/);
  client.listTools=async()=>({tools:[]});await assert.rejects(unity.inspect(client),/execute_code/);
  console.log('Scoped report selection, recovery, source changes and Unity instance diagnostics passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
