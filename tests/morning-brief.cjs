const assert=require('node:assert/strict');const feature=require('../src/features/morning-brief.cjs');
const at=(d,h,m)=>new Date(2026,10,d,h,m);// 5 Nov 2026 = Thursday
assert.equal(feature.due({time:'09:30',now:at(5,9,29)}),false);assert.equal(feature.due({time:'09:30',now:at(5,9,31)}),'2026-11-05');
assert.equal(feature.due({time:'09:30',last:'2026-11-05',now:at(5,10,0)}),false);assert.equal(feature.due({time:'09:30',now:at(7,9,40)}),false);// Saturday
assert.equal(feature.due({time:'09:30',now:at(5,13,0)}),false);assert.equal(feature.due({time:'',now:at(5,9,40)}),false);
const settings={morningBrief:'',morningBriefDays:'1-5',morningBriefLast:''};const state={projects:[{id:'general'}],topics:[]};const started=[];const topic={id:'t',messages:[]};
const s={smoke:true,get settings(){return settings;},saveSettings:v=>Object.assign(settings,v),chatJobs:{start:(id,p,text)=>{started.push(text);const t={id:'b1',projectId:p,messages:[]};state.topics.push(t);return {topicId:'b1'};}},dialogue:{state,persist(){},active:()=>topic,rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};
const {morningBrief}=feature.setup(s);
assert.match(morningBrief.turn('Присылай сводку по утрам в 9:30').text,/09:30/);assert.equal(settings.morningBrief,'09:30');
assert.match(morningBrief.turn('Выключи утреннюю сводку').text,/Выключил/);assert.equal(settings.morningBrief,'');
assert.equal(morningBrief.turn('Покажи мои задачи'),null);
morningBrief.run();assert.equal(started[0],feature.REQUEST);assert.match(state.topics[0].title,/^Утренняя сводка · /);
assert(require('../src/agent-team.cjs').agentRequest(feature.REQUEST));assert.equal(require('../src/agent-team.cjs').enumerated(feature.REQUEST).tasks.length,3);
const v={morningBrief:'25:00',morningBriefDays:'x'};feature.validate(v);assert.equal(v.morningBrief,'');assert.equal(v.morningBriefDays,'1-5');
console.log('Morning brief: weekday schedule, once a day, voice on/off and agents request passed');
