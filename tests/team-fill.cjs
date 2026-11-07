const assert=require('node:assert/strict');
const {TeamFill,isTeamFill,grounded}=require('../src/team-fill.cjs');
(async()=>{
 for(const s of ['Петя, заполни команду','дополни состав команды','обнови справочник команды'])assert(isTeamFill(s),s);
 for(const s of ['не заполняй команду','как заполнить команду?','заполни командуешь','выполни команду'])assert(!isTeamFill(s),s);
 let settings={teamMembers:'[]'},company='A',now=1,writes=0;
 const service=new TeamFill({settings:()=>settings,save:members=>{writes++;settings.teamMembers=JSON.stringify(members);},sources:command=>[{title:'Команда',text:command,direct:true}],scope:()=>company,now:()=>now});
 let result=await service.turn('Заполни команду\nПолина — тестирование; Иван — серверная часть');assert.equal(JSON.parse(settings.teamMembers).length,2);assert(result.teamUpdated);
 await service.turn('Заполни команду\nПолина — тестирование');assert.equal(writes,1);
 result=await service.turn('Заполни команду\nПолина — релизы');assert(result.teamFillReply);assert.equal(JSON.parse(settings.teamMembers)[0].responsibilities,'Тестирование');
 await service.turn('замени',true);assert.equal(JSON.parse(settings.teamMembers)[0].responsibilities,'Релизы');
 await service.turn('Заполни команду\nПолина — QA');await service.turn('оставь прежнее',true);assert.equal(JSON.parse(settings.teamMembers)[0].responsibilities,'Релизы');
 result=await service.turn('Заполни команду');assert(result.question);await service.turn('Анна — дизайн',true);assert.equal(JSON.parse(settings.teamMembers).length,3);
 await service.turn('Заполни команду\nПолина — QA');company='B';await service.turn('замени',true);assert.equal(JSON.parse(settings.teamMembers)[0].responsibilities,'Релизы');company='A';
 await service.turn('Заполни команду\nПолина — QA');settings.teamMembers=JSON.stringify(JSON.parse(settings.teamMembers).map(m=>({...m,projects:'NEW'})));await service.turn('замени',true);assert.equal(JSON.parse(settings.teamMembers)[0].responsibilities,'Релизы');
 const source=[{id:'0',text:'Анна — QA',title:'Заметка'}];assert.equal(grounded({members:[{name:'Анна',role:'Директор',email:'fake@example.org',source:'0',evidence:'Анна — QA'}]},source)[0].member.role,'');assert.equal(grounded({members:[{name:'Иван',role:'QA',source:'0',evidence:'Анна — QA'}]},source).length,0);
 let resolve;const deferred=new Promise(r=>resolve=r);const delayed=new TeamFill({settings:()=>settings,scope:()=>company,save(){throw Error('Stale save');},sources:()=>source,extract:()=>deferred});const pending=delayed.turn('заполни команду');delayed.reset();resolve({members:[{name:'Анна',role:'QA',source:'0',evidence:'Анна — QA'}]});assert.match((await pending).text,/изменились/);
 console.log('Team fill: voice intent, auto-save, dedupe, conflict replies, evidence, company isolation and stale writes passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
