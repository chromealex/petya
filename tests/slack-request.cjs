const assert=require('node:assert/strict');
const {SlackRequest,parse,thread}=require('../src/slack-request.cjs');
function fixture(){
 const state={};let topic={id:'topic',projectMemoryId:'alpha',reviewScope:'alpha',projectChannels:[{id:'C1',role:'dev'}]},token='secret',clock=0,mode='ok',posts=[],saved,hook;
 const channels=[{id:'C1',name:'unrelated-name'},{id:'C2',name:'beta-dev'}];
 const args={state,save:()=>{saved=structuredClone(state);},settings:()=>({slackToken:token}),enabled:()=>true,context:()=>topic,now:()=>clock,reply:(text,extra)=>({handled:true,text,...extra}),request:async(url,opts)=>{
  if(url.includes('conversations.list')){if(hook)await hook();return {ok:true,channels};}
  assert.ok(url.endsWith('chat.postMessage'));posts.push(JSON.parse(opts.body));
  if(mode==='timeout')throw Error('timeout');if(mode==='malformed')return {};if(mode==='rejected')return {ok:false,error:'missing_scope'};
  return {ok:true,channel:posts.at(-1).channel,ts:'1234567890.123456'};
 }};
 return {p:new SlackRequest(args),args,state,channels,posts,setTopic:v=>topic=v,setToken:v=>token=v,setMode:v=>mode=v,setHook:v=>hook=v,setClock:v=>clock=v,saved:()=>saved};
}
(async()=>{
 assert.equal(parse('Как попросить разработку заполнить команду?'),null);
 assert.equal(parse('заполни команду'),null);
 let f=fixture();let r=await f.p.turn('Петя, попроси разработку заполнить команду');assert.match(r.text,/Отправил/);assert.equal(f.posts[0].channel,'C1');assert.ok(r.sources[0].url.endsWith('p1234567890123456'));assert.match(f.posts[0].text,/роли/);
 await f.p.turn('попроси разработку заполнить команду');assert.equal(f.posts.length,1);
 let restarted=new SlackRequest({...f.args,state:f.saved()});await restarted.turn('попроси разработку заполнить команду');assert.equal(f.posts.length,1);
 f=fixture();f.setTopic({id:'none'});r=await f.p.turn('попроси разработку заполнить команду');assert.ok(r.slackRequestChoices);assert.equal(f.posts.length,0);await f.p.turn('первый',true);assert.equal(f.posts.length,1);
 f=fixture();f.setTopic({id:'a'});r=await f.p.turn('попроси команду проверить отчёт');assert.equal(r.slackRequestChoices.length,2);await f.p.turn('второй',true);assert.equal(f.posts[0].channel,'C2');
 f=fixture();await f.p.turn('попроси #beta-dev проверить отчёт');assert.equal(f.posts[0].channel,'C2');
 f=fixture();f.setTopic({id:'a',slackSource:{url:'https://acme.slack.com/archives/C2/p1234567890123456'}});await f.p.turn('попроси #beta-dev проверить отчёт');assert.equal(f.posts[0].thread_ts,'1234567890.123456');
 assert.equal(thread({slackSource:{url:'https://evil.test/archives/C2/p1234567890123456'}},'C2'),'');
 f=fixture();f.setTopic({id:'a'});await f.p.turn('попроси команду проверить отчёт');f.setTopic({id:'b'});r=await f.p.turn('1',true);assert.match(r.text,/устарел/);assert.equal(f.posts.length,0);
 f=fixture();f.setTopic({id:'a'});await f.p.turn('попроси команду проверить отчёт');f.setToken('different');await f.p.turn('1',true);assert.equal(f.posts.length,0);
 f=fixture();f.setHook(()=>f.setTopic({id:'different'}));r=await f.p.turn('попроси разработку заполнить команду');assert.equal(f.posts.length,0);assert.ok(r.error);
 for(const mode of ['timeout','malformed']){f=fixture();f.setMode(mode);r=await f.p.turn('попроси разработку заполнить команду');assert.ok(r.error);f.setClock(99999999);restarted=new SlackRequest({...f.args,state:f.saved()});await restarted.turn('попроси разработку заполнить команду');assert.equal(f.posts.length,1);}
 f=fixture();f.setMode('rejected');await f.p.turn('попроси разработку заполнить команду');f.setMode('ok');await f.p.turn('попроси разработку заполнить команду');assert.equal(f.posts.length,2);
 f=fixture();f.channels[0].is_archived=true;r=await f.p.turn('попроси разработку заполнить команду');assert.ok(r.slackRequestChoices);assert.equal(f.posts.length,0);
 f=fixture();await f.p.turn('попроси разработку проверить <@U123>, но не отправляй');assert.equal(f.posts.length,0);
 f=fixture();await f.p.turn('попроси разработку проверить <@U123>');assert.ok(f.posts[0].text.includes('&lt;@U123&gt;'));
 f=fixture();let release;f.setHook(()=>new Promise(r=>release=r));const first=f.p.turn('попроси разработку заполнить команду');await Promise.resolve();await f.p.turn('попроси разработку заполнить команду');release();await first;assert.equal(f.posts.length,1);
 // No channel enumeration is complete: retain the task and accept a direct address.
 const partial=new (require('../src/slack-request.cjs').SlackRequest)({state:{},save(){},settings:()=>({slackToken:'test'}),enabled:()=>true,context:()=>({id:'current'}),reply:(text,extra={})=>({handled:true,text,...extra}),request:async url=>{const u=new URL(url);if(u.pathname.endsWith('conversations.list'))throw Object.assign(Error('Partial directory'),{code:'SLACK_CHANNEL_LOOKUP_REQUIRED',channels:[]});if(u.pathname.endsWith('conversations.info'))return {ok:true,channel:{id:'CEXACT',name:'exact'}};if(u.pathname.endsWith('chat.postMessage'))return {ok:true,channel:'CEXACT',ts:'1234567890.123456'};throw Error('Unexpected request');}});
 const question=await partial.turn('попроси команду проверить билд');assert(question.question&&question.clarificationInput&&!question.error);const continued=await partial.turn('https://example.slack.com/archives/CEXACT',true);assert(!continued.error);assert.match(continued.text,/Отправил поручение/);
 console.log('Slack requests: project routing, explicit channels, voice choices, stale context/account, threads, receipts, rejection, uncertainty, restart and duplicate protection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
