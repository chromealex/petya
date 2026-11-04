const assert=require('node:assert/strict');
const {ReportShare,sourceFooter}=require('../src/report-share.cjs');
function fixture(state={}){
 const report={id:'r1',project:'BW',site:'https://jira.fixture.invalid',at:1700000000000,text:'BW: 2 задачи. <@U123>',sources:[{title:'Jira',url:'https://jira.fixture.invalid/issues/?jql=BW'}]};
 let topic={id:'t1',workReport:report},settings={slackToken:'token',jiraUrl:report.site},enabled=true,clock=0,mode='ok',hook=null,saveFailure=false,saved,team='T1',binding='C1';
 const channels=[{id:'C1',name:'jw-bw-dev'},{id:'C2',name:'jw-mw-dev'},{id:'C3',name:'other-bw-dev'},{id:'C4',name:'archived',is_archived:true}],posts=[];
 const args={state,save:()=>{if(saveFailure)throw Error('disk');saved=structuredClone(state);},settings:()=>settings,enabled:()=>enabled,dialogue:{state:{topics:[topic]},active:()=>topic,prune(){},persist(){}},context:()=>({projectChannels:[{id:binding}]}),now:()=>clock,request:async(url,options)=>{
  if(hook)await hook(url);
  if(url.endsWith('/auth.test'))return {ok:true,team_id:team,team:'Fixture'};
  if(url.includes('conversations.list'))return {ok:true,channels};
  assert(url.endsWith('/chat.postMessage'));const data=JSON.parse(options.body);posts.push(data);if(mode==='timeout')throw Error('network');if(mode==='malformed')return {};if(mode==='wrong-channel')return {ok:true,channel:'C999',ts:'1234567890.123456'};if(mode==='rejected')return {ok:false,error:'not_in_channel'};if(mode==='disk-after')saveFailure=true;return {ok:true,channel:data.channel,ts:'1234567890.123456'};
 }};
 return {s:new ReportShare(args),args,report,channels,posts,state,setTopic:v=>topic=v,setSettings:v=>settings={...settings,...v},setClock:v=>clock=v,setMode:v=>mode=v,setHook:v=>hook=v,setSaveFailure:v=>saveFailure=v,setEnabled:v=>enabled=v,setTeam:v=>team=v,setBinding:v=>binding=v,saved:()=>saved};
}
async function draft(f){return f.s.open('r1');}
const payload=(d,channel='C1',text='Проверенный отчёт')=>({id:d.id,channel,text});
(async()=>{
 let f=fixture(),d=await draft(f);assert.equal(f.posts.length,0);assert.equal(d.channels.length,3);assert.equal(d.channels[0].id,'C1');assert.equal(d.channels[0].linked,true);assert.equal(d.channels.find(c=>c.id==='C2').linked,false);assert(d.footer.includes('https://jira.fixture.invalid'));
 await assert.rejects(()=>f.s.send(payload(d,'')),/канал/);await assert.rejects(()=>f.s.send(payload(d,'C4')),/канал/);await assert.rejects(()=>f.s.send(payload(d,'C1',' ')),/символов/);
 let r=await f.s.send(payload(d,'C2','Точный текст: <@U123> & <https://evil.invalid|вред>'));assert.equal(r.status,'sent');assert.equal(f.posts[0].channel,'C2');assert.equal(f.posts[0].mrkdwn,false);assert.equal(f.posts[0].parse,'none');assert(!f.posts[0].thread_ts);assert(f.posts[0].text.includes('&lt;@U123&gt;'));assert(f.posts[0].text.includes(d.footer.replace(/&/g,'&amp;')));assert(!f.state.reportShares[0].text);
 r=await f.s.send(payload(d,'C2','Изменённый текст'));assert.equal(r.status,'sent');assert.equal(f.posts.length,1);assert.match(r.text,/уже/);
 const restart=new ReportShare({...f.args,state:f.saved()});d=await restart.open('r1');await restart.send(payload(d,'C2'));assert.equal(f.posts.length,1);
 f.setSettings({slackToken:'rotated'});d=await restart.open('r1');await restart.send(payload(d,'C2'));assert.equal(f.posts.length,1);
 for(const mode of ['timeout','malformed','wrong-channel']){f=fixture();d=await draft(f);f.setMode(mode);r=await f.s.send(payload(d));assert.equal(r.status,'unknown');f.setClock(999999999);const resumed=new ReportShare({...f.args,state:f.saved()});d=await resumed.open('r1');await resumed.send(payload(d));assert.equal(f.posts.length,1);}
 f=fixture();d=await draft(f);f.setMode('rejected');assert.equal((await f.s.send(payload(d))).status,'rejected');f.setMode('ok');assert.equal((await f.s.send(payload(d))).status,'sent');assert.equal(f.posts.length,2);
 for(const mutate of [f=>f.setTopic({id:'other'}),f=>f.args.dialogue.active().jiraProject='MW',f=>f.setSettings({slackToken:'changed'}),f=>f.setSettings({jiraUrl:'https://other.invalid'}),f=>f.setBinding('C2'),f=>f.setEnabled(false),f=>f.setClock(600001),f=>f.setTeam('T2'),f=>f.s.clear()]){f=fixture();d=await draft(f);mutate(f);await assert.rejects(()=>f.s.send(payload(d)));assert.equal(f.posts.length,0);}
 f=fixture();d=await draft(f);f.channels[0].is_archived=true;await assert.rejects(()=>f.s.send(payload(d)),/архивирован/);assert.equal(f.posts.length,0);
 f=fixture();d=await draft(f);f.channels[0].name='renamed';await assert.rejects(()=>f.s.send(payload(d)),/переименован/);
 f=fixture();d=await draft(f);f.setSaveFailure(true);await assert.rejects(()=>f.s.send(payload(d)),/disk/);assert.equal(f.posts.length,0);assert.equal(f.state.reportShares.length,0);
 f=fixture();d=await draft(f);f.setMode('disk-after');r=await f.s.send(payload(d));assert.equal(r.status,'sent');assert(r.warning);assert.equal(f.saved().reportShares[0].status,'sending');const recovered=new ReportShare({...f.args,state:f.saved()});assert.equal(recovered.state.reportShares[0].status,'unknown');
 f=fixture();d=await draft(f);let release;f.setHook(url=>url.endsWith('auth.test')?new Promise(resolve=>release=resolve):undefined);const first=f.s.send(payload(d));await Promise.resolve();await assert.rejects(()=>f.s.send(payload(d)),/Дождитесь/);release();await first;assert.equal(f.posts.length,1);
 f=fixture();d=await draft(f);f.setHook(()=>f.setSettings({slackToken:'changed'}));await assert.rejects(()=>f.s.send(payload(d)));assert.equal(f.posts.length,0);
 f=fixture();d=await draft(f);f.s.cancel(d.id);await assert.rejects(()=>f.s.send(payload(d)),/устарел/);
 assert(!sourceFooter({...f.report,sources:[{url:'javascript:alert(1)',title:'bad'}]}).includes('javascript'));
 // Clearing contexts must also cancel an open() awaiting a read response.
 for(const phase of ['auth.test','conversations.list']){f=fixture();f.setHook(url=>{if(url.includes(phase))f.s.clear();});await assert.rejects(()=>draft(f),/изменились/);assert.equal(f.s.drafts.size,0);assert.equal(f.posts.length,0);}
 f=fixture();d=await draft(f);await f.s.send(payload(d));assert.match(require('../src/action-evidence.cjs').actionConfirmation('Ты уже отправил сообщение в #jw-bw-dev?',f.args.dialogue.active()),/сообщение отправлено/);
 f=fixture();d=await draft(f);f.setMode('timeout');await f.s.send(payload(d));assert.match(require('../src/action-evidence.cjs').actionConfirmation('Ты уже отправил сообщение в #jw-bw-dev?',f.args.dialogue.active()),/не подтвердил/);
 console.log('Report sharing: explicit destinations, exact text, provenance, no mass mentions, durable deduplication, token rotation, uncertain/rejected outcomes, stale context, archive/rename, disk failures and concurrency passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
