const assert=require('node:assert/strict');
const {ComputerIntent}=require('../src/computer-intent.cjs');
const {ComputerApproval}=require('../src/computer-approval.cjs');
const {remember,offer}=require('../src/extensions/telegram/contact-result.cjs');
(async()=>{
 let enabled=false,searches=0,observation={results:[{text:'Любимая Машка · была недавно'},{text:'Анна'}]};
 const computer={generation:0,status:()=>({mode:enabled?'desktop':'off',accessGranted:true}),start:async()=>{enabled=true;},stop:()=>{enabled=false;},execute:async action=>{if(!enabled)throw Object.assign(Error('permission'),{code:'COMPUTER_PERMISSION_REQUIRED',action});searches++;return {text:'Выполнено: поиск в Telegram',observation};}};
 const intent=new ComputerIntent({computer}),topic={id:'one',messages:[]};
 const dialogue={active:()=>topic,persist(){},rememberAction(command,text){topic.messages.push({role:'user',text:command},{role:'assistant',text});}};
 const command='Найди в тг любимую';let pending;
 try{await intent.turn(command);}catch(e){pending=e.action;}
 const approvals=new ComputerApproval({computer,scope:()=>topic.id,execute:async()=>remember(dialogue,command,await intent.search('любимую'),true,{module_telegram:'false'})});
 const request=offer(approvals.request(command,pending),{module_telegram:'false'},false);assert(request.telegramConnect);assert(!request.text.includes('Поиск выполнялся'));
 const result=await approvals.decide(request.computerApproval,true);assert.equal(searches,1);assert.equal(enabled,false);assert.equal(result.telegramContacts.length,1);assert.equal(result.telegramContacts[0].name,'Любимая Машка');assert(!result.text.includes('Выполнено:'));assert(result.telegramConnect);assert.deepEqual(topic.messages.at(-1).telegramContacts,result.telegramContacts);
 await assert.rejects(approvals.decide(request.computerApproval,true));
 enabled=true;observation={results:[],empty:false};const unread=await intent.search('любимую');assert(!unread.telegramContacts);assert.match(unread.text,/не смог надёжно прочитать/);
 observation={results:[],empty:true};assert.match((await intent.search('любимую')).text,/ничего не найдено/);
 assert(!offer({text:'OK'},{module_telegram:'true',telegramCredential:JSON.stringify({session:'fixture'})}).telegramConnect);
 console.log('Telegram cards: permission continuation, observed contacts, persistence, missing-service offer, no fabricated success passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
