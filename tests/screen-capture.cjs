// «Возьми управление компом, сделай скрин из слака» takes a screenshot of the Slack window without asking the model,
// and how-to questions or refusals are not screenshot requests.
const assert=require('node:assert/strict');const {ComputerIntent,direct}=require('../src/computer-intent.cjs');
assert.deepEqual(direct('возьми управление компом, сделай скрин из слака'),{intent:'screenshot',app:'Slack'});
assert.deepEqual(direct('Сделай скриншот экрана'),{intent:'screenshot',app:''});
assert.deepEqual(direct('сфоткай телеграм'),{intent:'screenshot',app:'Telegram'});
for(const text of ['как сделать скриншот на маке?','не делай скрин'])assert.equal(direct(text),null,text);
(async()=>{
 let asked=0,captured;
 const intent=new ComputerIntent({computer:{generation:0},model:async()=>{asked++;return null;},capture:async args=>{captured=args;return {handled:true,text:'Сделал скриншот Slack.'};}});
 const result=await intent.turn('возьми управление компом, сделай скрин из слака');
 assert.equal(result.text,'Сделал скриншот Slack.');assert.equal(captured.app,'Slack');assert.equal(asked,0,'no model call for a screenshot');
 console.log('screen capture: screenshot requests routed to capture, how-to questions not passed');
})().catch(e=>{console.error(e);process.exit(1);});
