const assert=require('node:assert/strict');
const feature=require('../src/features/chat-results.cjs');
const report=(source='QA')=>({role:'assistant',at:1,by:'Confluence',extensionResult:{provider:'confluence',query:'Страницы',source,base:'site',project:'general'}});
async function run(){
  let topic={id:'one',projectId:'general',messages:[report()]};
  const s={companyId:'company',dialogue:{active:()=>topic,state:{projects:[{id:'general'}]},persist(){}},chatJobs:{busy:()=>false}};
  let {chatResults,ipc}=feature.setup(s);
  let state=ipc.snapshot();
  assert.equal(state.items.length,1);assert.equal(state.selected,state.items[0].id);
  const original=state;
  ipc.choose(state.scope,null);assert.equal(chatResults.current(topic,'extensionResult'),undefined);
  topic=JSON.parse(JSON.stringify(topic));
  ({chatResults,ipc}=feature.setup(s));
  assert.equal(ipc.snapshot().selected,null,'Explicit clear survives restart');
  ipc.choose(state.scope,state.items[0].id);
  topic.messages.push({role:'assistant',text:'Обычный ответ'});
  assert.equal(chatResults.current(topic,'extensionResult').source,'QA');
  topic.messages.push(report('DEV'));chatResults.adopt(topic,topic.messages.at(-1));
  state=ipc.snapshot();assert.equal(state.items.find(r=>r.id===state.selected).subtitle,'DEV');
  ipc.choose(state.scope,original.items[0].id);
  assert.deepEqual(await ipc.action(state.scope,original.items[0].id,'refresh'),{command:'Обнови отчёт'});
  assert.equal((await ipc.action(state.scope,original.items[0].id,'details')).resultJump,0);
  topic.versionIndex=1;
  assert.throws(()=>ipc.choose(state.scope,state.selected),/Чат изменился/);
  s.companyId='another';assert.throws(()=>ipc.choose(state.scope,state.selected),/Чат изменился/);
  topic={id:'two',projectId:'general',messages:[{role:'assistant',jiraItems:[
    {site:'https://example.atlassian.net',key:'QA-1',summary:'First'},
    {site:'https://example.atlassian.net',key:'QA-2',summary:'Second'}]}]};
  state=ipc.snapshot();assert.equal(state.selected,null);
  assert.equal((await chatResults.turn('Открой')).resultChoices.length,2);
  ipc.choose(state.scope,state.items[0].id);
  assert.equal(chatResults.current(topic,'jiraItems')[0].key,'QA-1');
  s.chatJobs.busy=()=>true;assert.throws(()=>ipc.choose(state.scope,null),/Дождитесь/);
  const files=require('../src/extensions/files/result.cjs');
  await assert.rejects(files.perform('reveal',{file:{localSourcePath:'/tmp/petya-nonexistent-source-'+Date.now()}},s,()=>{}),/перемещён или удалён/);
  const attachment={id:'file',name:'note.txt',text:'Note'};
  assert.equal((await files.perform('open',{file:attachment},s,()=>{})).attachment,attachment);
  console.log('Result cards: restart, reset, selected history, versions, company scope and ambiguous tasks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
