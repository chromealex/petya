const assert=require('node:assert/strict');
const enable=require('../src/extensions/unity/enable.cjs');
const {Clarifications}=require('../src/features/clarifications.cjs');
(async()=>{
 let calls=0,saves=0;const topic={id:'chat',projectId:'p',versionIndex:0},project={id:'p',disabledServices:['unity','slack']};
 const s={companyId:'c',settings:{module_unity:'false',unityUrl:'local'},dialogue:{active:()=>topic,state:{projects:[project]},persist(){}},saveSettings:async value=>{saves++;Object.assign(s.settings,value);}};
 const c=new Clarifications({scope:()=>String(topic.versionIndex)});
 const work=()=>{enable(s,work);calls++;assert(!require('../src/modules.cjs').projectDisabled('unity'));return {handled:true,text:'continued'};};
 let r=await c.run('original',work);assert(r.clarificationId);assert.equal(calls,0);assert.equal(saves,0);
 let invalid=await c.answer(r.clarificationId,'something');assert(invalid.question);assert.equal(saves,0);
 assert.equal((await c.answer(r.clarificationId,'Включить и продолжить')).text,'continued');assert.equal(calls,1);assert.deepEqual(project.disabledServices,['slack']);
 assert((await c.answer(r.clarificationId,'Включить и продолжить')).error);assert.equal(calls,1);
 s.settings.module_unity='false';r=await c.run('original',work);await c.answer(r.clarificationId,'Отмена');assert.equal(saves,1);
 r=await c.run('original',work);topic.versionIndex++;assert((await c.answer(r.clarificationId,'Включить и продолжить')).error);assert.equal(saves,1);
 r=await c.run('original',work);s.companyId='other';await assert.rejects(c.answer(r.clarificationId,'Включить и продолжить'),/изменились/);assert.equal(saves,1);
 console.log('Unity activation: consent, resume once, invalid answer, cancel, stale version/company and project scope passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
