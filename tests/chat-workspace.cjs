const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs');
const {Attachments}=require('../src/attachments.cjs');
const {ContextStore}=require('../src/context-store.cjs');
const {classify}=require('../src/connection-failure.cjs');
const {register}=require('../src/chat-workspace.cjs');
(async()=>{
  let stored;
  function setup(state){
    const calls={};
    const dialogue=new Dialogue({state,save:s=>stored=JSON.parse(JSON.stringify(s)),answer:async()=> 'Новый ответ'});
    register({dialogue,chatJobs:{busy:()=>false},handle:(name,fn)=>calls[name]=fn});
    return {calls,dialogue};
  }
  const {calls,dialogue}=setup();
  const topic={id:'one',title:'Версии',projectId:'general',at:Date.now(),messages:[
    {role:'user',text:'Вопрос',at:11},{role:'assistant',text:'Первый ответ',at:12}
  ],attachments:[{id:'f',name:'a.txt',text:'Пример'}]};
  dialogue.state.topics.push(topic);dialogue.select(topic.id);
  calls.chatVersionEdit('one',0,'Уточнение');await dialogue.turn('Уточнение',undefined,'chat');
  assert.equal(dialogue.state.topics.length,1);
  calls.chatVersionSelect('one',0);assert.equal(topic.messages.at(-1).text,'Первый ответ');
  calls.chatQuote('one',{index:1,text:'Первый ответ',at:12});
  await dialogue.turn('Объясни это',undefined,'chat');assert.equal(topic.messages.at(-2).replyTo.text,'Первый ответ');
  calls.chatVersionSelect('one',1);assert.equal(topic.messages[0].text,'Уточнение');
  calls.chatVersionSelect('one',0);assert.equal(topic.messages.at(-2).replyTo.at,12);
  calls.chatContextToggle('one','file','f',false);assert.equal(topic.attachments.length,0);
  calls.chatContextToggle('one','file','f',true);assert.equal(topic.attachments[0].text,'Пример');
  const memory=new ContextStore({items:[{id:'a',at:Date.now(),text:'А'},{id:'b',at:Date.now(),text:'Б'}],save:()=>{}});
  calls.chatContextToggle('one','material','a',false);
  assert.deepEqual(dialogue.within('one','general',()=>memory.prune().map(m=>m.id)),['b']);
  assert.equal(memory.prune().length,2);
  calls.chatDraftSet('one','Черновик');
  const files=new Attachments({scope:()=>'one',savePending:list=>{dialogue.state.composerFiles=list;dialogue.persist();}});
  const file=await files.add('sample.txt',Buffer.from('Текст вложения'));
  const restored=setup(stored);
  const reopened=new Attachments({scope:()=>'one',saved:restored.dialogue.state.composerFiles,savePending:()=>{},now:()=>Date.now()+86400000});
  assert.equal(restored.calls.chatDrafts().one,'Черновик');
  assert.equal(reopened.take([file.id])[0].text,'Текст вложения');
  assert.equal(restored.calls.chatWorkspaceInfo('one').count,2);
  assert.equal(classify({status:429}).reason,'limited');assert.equal(classify({status:401}).action,'login');assert.equal(classify({cause:{code:'ENETUNREACH'}}).reason,'offline');
  console.log('Workspace: restored drafts and files, version isolation, quotes, material filters and connection recovery passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
