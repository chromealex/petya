const assert=require('node:assert/strict');
const {ReviewAssistant,signatures,evidence}=require('../src/review-assistant.cjs');
const {BuildWatch,terminal,buildIds}=require('../src/extensions/ci-builds/build-watch.cjs');
(async()=>{
 let now=1700000000000;const current={id:'new',title:'Android release',at:now,kind:'chat',messages:[],attachments:[{name:'new.log',text:'Android build 123\nError: Cannot find module ./modules.cjs'}],slackSource:{url:'https://app.slack.com/archives/C123/p1700000000000000'}};
 const previous={id:'old',title:'Android old',at:now-1000,kind:'chat',messages:[],attachments:[{name:'old.log',text:'Android build 122\nError: Cannot find module ./modules.cjs'}]};
 const ios={id:'ios',title:'iOS release',at:now-500,kind:'chat',messages:[],attachments:[{name:'ios.log',text:'iOS build 23\nError: code signing failed'}]};
 const state={lessons:[],watches:[]},dialogue={state:{topics:[previous,ios,current],activeId:'new'},active(){return this.state.topics.find(t=>t.id===this.state.activeId)},persist(){},select(id){this.state.activeId=id;}};
 let calls=[],opened=[];const review=new ReviewAssistant({dialogue,store:{prune:()=>[]},slack:()=>({collect:async()=>{throw Error('No live view')}}),analyze:async(t,q)=>{calls.push({t,q});return 'analysis'},state,save:()=>{},enabled:()=>true,open:async u=>opened.push(u),now:()=>now,watch:{buildIds,start:async(t,id)=>({build:id,expires:now+86400000}),stop:()=>1}});
 assert.equal((await review.turn('Покажи, откуда ты это взял')).evidence[0].text,'Error: Cannot find module ./modules.cjs');assert.equal(opened.length,1);
 await review.turn('Сравни с прошлым падением');assert.match(calls.at(-1).t.attachments[1].text,/122/);
 await review.turn('Запомни: у нас это чинится вот так — добавить modules.cjs в сборку');assert.equal(state.lessons.length,0);await review.turn('для проекта Peter');assert.equal(state.lessons.length,1);assert.equal(review.matchingLessons(current).length,1);assert.equal(review.matchingLessons({...current,reviewScope:'Other'}).length,0);
 assert.match((await review.turn('следи за этим билдом')).text,/123/);
 await review.turn('Я про iOS, не про Android');assert.equal(dialogue.state.activeId,'ios');
 await review.turn('Нет, причина другая — вот здесь смотри');assert.equal(ios.corrections.length,1);
 assert.equal(await review.turn('обычный вопрос'),null);
 assert.equal(signatures(current).length,1);assert.equal(evidence(current).length,1);
 await review.turn('забудь решение 1');assert.equal(state.lessons.length,0);
 assert.deepEqual(buildIds('следи за билдом 123'),['123']);
 assert.equal(terminal({text:'Build 123 succeeded',bot_id:'B'},'123'),'completed');assert.equal(terminal({text:'Build 123 succeeded'},'123'),'');assert.equal(terminal({text:'Build 124 failed',bot_id:'B'},'123'),'');
 const notifications=[],data={ok:true,messages:[{ts:'1699999999.000000',text:'Build 123 failed',bot_id:'B'}]};let requests=0;
 const settings=()=>({slackToken:'x'});const createWatch=()=>new BuildWatch({state,save:()=>{},settings,enabled:()=>true,request:async()=>{requests++;return structuredClone(data)},notify:t=>notifications.push(t),now:()=>now});let watch=createWatch();
 await watch.start(current,'123');await watch.tick();assert.equal(notifications.length,0);assert.equal(state.watches[0].status,'watching');
 now+=61000;watch=createWatch();await watch.tick();assert.equal(notifications.length,0); // restart does not repeat an old failure
 now+=61000;data.messages[0].text='Build 123 succeeded';await watch.tick();assert.equal(state.watches[0].status,'completed');assert.equal(notifications.length,1);
 now+=61000;watch=createWatch();await watch.tick();assert.equal(notifications.length,1);
 await watch.start(current,'124');now+=61000;data.messages.push({ts:String(now/1000)+'.000000',text:'Build 125 failed',bot_id:'B'});await watch.tick();assert.equal(notifications.length,1);
 watch.stop(current.id);assert.equal(state.watches.at(-1).status,'cancelled');
 // Cancellation while the network request is pending cannot resurrect or notify a watch.
 let resolve;const pending=new Promise(r=>resolve=r);watch=new BuildWatch({state,save:()=>{},settings,enabled:()=>true,request:()=>pending,notify:t=>notifications.push(t),now:()=>now});await watch.start(current,'126');const tick=watch.tick();watch.stop(current.id);resolve({ok:true,messages:[{ts:String(now/1000)+'.000000',text:'Build 126 failed',bot_id:'B'}]});await tick;assert.equal(notifications.length,1);
 // Pagination is resumed on later ticks and errors do not become fake completion.
 data.response_metadata={next_cursor:'page2'};data.messages=[];watch=createWatch();await watch.start(current,'127');now+=61000;await watch.tick();assert.equal(state.watches.at(-1).cursor,'page2');data.response_metadata={next_cursor:''};now+=61000;data.messages=[{ts:String(now/1000)+'.000000',text:'Build 127 failed',bot_id:'B'}];await watch.tick();assert.equal(state.watches.at(-1).status,'failed');
 console.log('Review assistant: context correction, evidence, comparison, scoped lessons and restart-safe build watches passed');
})().catch(e=>{console.error(e);process.exitCode=1});
