const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs');
let saved;
const dialogue=new Dialogue({save:state=>saved=structuredClone(state)});
for(let i=0;i<80;i++)dialogue.rememberAction('Запрос '+i,'Ответ '+i);
assert.equal(saved.topics[0].messages.length,160);
assert.equal(saved.topics[0].messages[0].text,'Запрос 0');
const restored=new Dialogue({state:saved});
assert.equal(restored.active().messages.length,160);
const {dailyBrief}=require('../src/daily-brief.cjs');
(async()=>{
 // Slack's section comes from the Slack app (summary-section); the brief shows counts, never raw Slack UI text.
 const now=Date.now(),sections=await require('../src/summary-sections.cjs').collect({settings:{module_slack:'true'},memory:{prune:()=>[{source:'slack',at:now,text:'More channel actions\nClose\nThread'}]}},{from:new Date(now).setHours(0,0,0,0),to:now,now});
 const text=dailyBrief({records:[],sections,now}).text;
 assert(text.includes('### Slack'));assert(!text.includes('More channel actions'));
 console.log('History survives 80 exchanges and restart; brief hides raw Slack UI text');
})().catch(e=>{console.error(e);process.exitCode=1;});
