const assert=require('node:assert/strict'),feature=require('../src/features/slack-screen.cjs');
(async()=>{
 let topic={id:'one',projectId:'general',messages:[]},settings={module_slack:'false'},reads=0,answers=0,permission=false,title='Slack · #team',channels=[],viewText='Сборка готова',pending;
 const events=[],s={settings,companyId:'company',modules:require('../src/modules.cjs'),dialogue:{active:()=>topic,state:{topics:[topic]},persist(){},rememberAction(command,text){topic.messages.push({role:'user',text:command},{role:'assistant',text});}},projectMemory:{context:()=>({projectChannels:channels})},requestProgress:{report(){}},computerLock:fn=>fn(),win:{webContents:{send:(name,item)=>events.push(item)}},computerApproval:{request:(command,action)=>{pending={command,action};return {computerApproval:'permission',text:'Разрешить?'};}},slackDigest:{screen:async()=>{reads++;if(!permission)throw Object.assign(Error('access'),{code:'COMPUTER_PERMISSION_REQUIRED'});return {title,text:viewText};},summarize:async(command,rows)=>{answers++;assert(rows[0].text===viewText);return 'Сборка готова.';}}};
 const api=feature.setup(s).slackScreen;
 for(const text of ['Отправь в Slack сообщение','Не читай Slack','Как подключить Slack?'])assert.equal(await api.turn(text),null);
 let result=await api.turn('Что нового в Slack?');assert(result.computerApproval);assert.equal(answers,0);permission=true;result=await api.run(pending.command,pending.action);assert.match(result.text,/открытое окно Slack/);assert.equal(answers,1);assert.equal(topic.messages.filter(m=>m.role==='user').length,1);
 channels=[{name:'project-bw'}];result=await api.run('Найди контекст проблемы');assert(result.question);assert.equal(answers,1);
 title='Slack · project-bw';result=await api.run('Найди контекст проблемы');assert.equal(answers,2);
 result=await api.run('Прочитай #other в Slack');assert(result.question);assert.equal(answers,2);
 permission=false;await api.run('Прочитай Slack');const old=pending;topic={id:'other',projectId:'general',messages:[]};permission=true;await assert.rejects(api.run(old.command,old.action),/изменился/);
 channels=[];viewText='';result=await api.run('Прочитай Slack');assert(result.error);assert.equal(answers,2);
 assert(events.some(e=>e.busy));assert(events.some(e=>e.kind==='error'&&!e.busy));
 s.settings={module_slack:'true',slackToken:'fixture'};assert.equal(await api.turn('Что нового в Slack?'),null);s.slackSync={status:{message:'Slack ограничил запросы'}};viewText='Сборка готова';assert(await api.turn('Что нового в Slack?'));
 const blocked=await s.modules.withProject({disabledServices:['slack']},()=>api.run('Прочитай Slack'));assert(blocked.error);
 console.log('Slack screen: missing service, permission continuation, read-only routing, scoped channels, empty view, stale chat, rate limits and progress passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
