// App cards are plugins: data extraction, Asana and docs chat turns, git/mail/Asana adapters.
const assert=require('node:assert/strict');
const results=require('../src/features/chat-results.cjs');
(async()=>{
 // Google Play: the generic extract hook turns ANR rows into card data.
 const row=(day,a,p)=>({startTime:{year:2026,month:11,day},metrics:[{metric:'anrRate',decimalValue:{value:String(a)}},{metric:'userPerceivedAnrRate',decimalValue:{value:String(p)}}]});
 const play=results.extract({title:'ANR · Bunker Wars',data:{app:'apps/com.acme.bw',date:'2026-11-06',versionCode:null,rate:0.004,perceived:0.005,week:0.0042,rows:[row(6,0.004,0.005),row(5,0.003,0.004)]}});
 assert.equal(play.playVitals.app,'Bunker Wars');assert.deepEqual(play.playVitals.days.map(d=>d.date),['2026-11-05','2026-11-06']);
 assert.equal(results.extract({text:'просто ответ'}),undefined);
 // Git: status result becomes a card; writes carry the token the user saw.
 const state={root:'/r',projectId:'p',name:'app',branch:'main',head:'abc',token:'t1',remotes:['origin'],upstream:null,files:[{path:'a.txt',status:' M',staged:false,unstaged:true,conflict:false}]};
 const git=results.extract({git:{action:'status',state,text:'app · main'}});
 assert.equal(git.gitState.token,'t1');assert.equal(git.gitState.files[0].path,'a.txt');
 const gitAdapter=require('../src/extensions/git/result.cjs');const calls=[];
 const message={extensionData:git};const [gitRow]=gitAdapter.describe(message);
 const gs={dialogue:{persist(){}},gitWorkspace:{async execute(input){calls.push(input);return {state:{...state,token:'t2',files:[{...state.files[0],staged:true,unstaged:false,status:'M '}]},text:'Готово: файлы подготовлены к коммиту'};}}};
 const staged=await gitAdapter.perform('stage',{...gitRow,message},gs,()=>{},{paths:['a.txt']});
 assert.deepEqual(calls[0],{action:'stage',expected:{root:'/r',projectId:'p',token:'t1'},paths:['a.txt']});
 assert.equal(staged.state.token,'t2');assert.equal(message.extensionData.gitState.token,'t2');
 await gitAdapter.perform('commit',{...gitRow,message},gs,()=>{},{message:'Fix'});assert.equal(calls[1].expected.token,'t2','next write uses the fresh token');
 // Asana: «мои задачи в асане» answers with cards; done toggles with undo; «Выполнить» goes to the task runner.
 const topic={id:'t',title:'Чат',messages:[]};const started=[];
 const asanaApi=[];
 const s={settings:{asanaCredential:'x',asanaWorkspace:'111'},modules:{enabled:()=>true,assertEnabled(){}},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  taskRunner:{async start(task){started.push(task);return {handled:true,topicId:'run'};}},
  async request(url,options={}){asanaApi.push([options.method||'GET',url]);
   if(url.includes('/tasks?'))return {data:[{gid:'22',name:'Починить вылет при входе',completed:false,due_on:'2026-11-01',permalink_url:'https://app.asana.com/0/1/22',projects:[{name:'Mobile'}]},{gid:'23',name:'Экран профиля',completed:false,due_on:null,permalink_url:'https://app.asana.com/0/1/23',projects:[]}]};
   if(options.method==='PUT'){const body=JSON.parse(options.body).data;return {data:{gid:'22',name:'Починить вылет при входе',completed:body.completed??false,due_on:'due_on' in body?body.due_on:'2026-11-01',permalink_url:'https://app.asana.com/0/1/22',projects:[{name:'Mobile'}]}};}
   return {data:{gid:'22',name:'Починить вылет при входе',notes:'Падает на Android 14',completed:false,workspace:{gid:'111'},permalink_url:'https://app.asana.com/0/1/22',projects:[{gid:'1',name:'Mobile'}]}};}};
 const asana=require('../src/extensions/asana/feature.cjs');
 assert.equal(await asana.turn(s,'создай задачу в асане'),null,'creation stays with the existing flow');
 const reply=await asana.turn(s,'покажи мои задачи в асане');
 assert.match(reply.text,/2 задачи, просрочено: 1/);assert.equal(topic.messages.at(-1).extensionData.asanaItems.length,2);
 const adapter=require('../src/extensions/asana/result.cjs');const rows=adapter.describe(topic.messages.at(-1));
 const done=await adapter.perform('complete',{...rows[0],message:topic.messages.at(-1)},s,()=>{},{});
 assert.equal(done.undo.action,'reopen');assert.equal(topic.messages.at(-1).extensionData.asanaItems[0].completed,true);
 assert.deepEqual(asanaApi.filter(c=>c[0]==='PUT').map(c=>c[1].split('?')[0]),['https://app.asana.com/api/1.0/tasks/22']);
 await adapter.perform('execute',{...rows[0],message:topic.messages.at(-1)},s,()=>{},{});
 assert.equal(started[0].app,'asana');assert.equal(started[0].type,'bug');assert.equal(started[0].description,'Падает на Android 14');
 // Docs: Confluence / Notion search answers with page cards.
 const docs=require('../src/extensions/docs/feature.cjs');let query;
 s.workspace={async searchDocs(context,q){query=q;return {terms:['онбординг'],docs:[{source:'Confluence',title:'Онбординг',url:'https://acme.atlassian.net/wiki/x',updated:'2026-10-01',text:'Цели\nОнбординг показывает выбор языка.\nЭкраны\nДальше текст.'}]};}};
 assert.equal(await docs.turn(s,'найди онбординг'),null,'needs Confluence / Notion named');
 const found=await docs.turn(s,'найди в конфлюенсе онбординг');
 assert.equal(query,'онбординг');assert.match(found.text,/1 страницу/);
 const card=topic.messages.at(-1).extensionData.docItems[0];assert.deepEqual(card.sections,['Цели','Экраны']);assert.match(card.excerpt,/Онбординг показывает/);
 // Mail: the mail skill passes letters to the mail plugin's cards.
 const {MailSkill}=require('../src/mail-skill.cjs');
 const skill=Object.create(MailSkill.prototype);skill.gmail={async read(){return {results:[{account:'me@acme.com',provider:'google',messages:[{id:'m1',from:'Полина <polina@acme.com>',subject:'Релиз',date:'Fri, 6 Nov 2026',text:'Можно в четверг?',priority:true}]}]};}};
 skill.summarize=async()=>({handled:true,text:'Полина спрашивает про релиз.'});
 const mail=await skill.run({enabled:true,days:3,unread:true,skipPromotions:true,priority:[],instructions:'',allAccounts:true,accounts:[],name:'Почта'});
 assert.equal(mail.extensionData.mailItems[0].provider,'google');assert.equal(mail.extensionData.mailItems[0].excerpt,'Можно в четверг?');
 console.log('App cards: Google Play extract, git stage/commit tokens, Asana cards/undo/execute, docs search, mail items passed');
})().catch(e=>{console.error(e);process.exit(1);});
