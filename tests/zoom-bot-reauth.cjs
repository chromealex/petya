const assert=require('node:assert/strict');
const {createRemote}=require('../src/extensions/zoom-bot/remote.cjs');
const {ZoomBot}=require('../src/extensions/zoom-bot/controller.cjs');
(async()=>{
 let settings={zoomCredential:'old',zoomBotUrl:'https://one.test'};const requests=[];
 const owner={state:{},publish(p){Object.assign(this.state,p);}};
 const remote=createRemote({settings:()=>settings,bot:()=>owner,fetcher:async(url,options)=>{requests.push({url,options});return {ok:true,text:async()=>'{"id":"job"}'};}});
 await remote('POST','/v1/bots',{});settings={zoomCredential:'new',zoomBotUrl:'https://two.test'};
 await remote('GET','/v1/bots/job');assert.equal(requests[1].url,'https://one.test/v1/bots/job');assert.equal(requests[1].options.headers.Authorization,'Bearer old');assert.equal(JSON.parse(requests[0].options.body).oauthCredential,'old');
 owner.state={};await remote('POST','/v1/bots',{});assert.equal(requests[2].options.headers.Authorization,'Bearer new');
 const observation={meetingActive:true,windows:[],meetingInfo:'Meeting ID: 123456789'};
 let joins=0;const bot=new ZoomBot({settings:()=>({zoomBotMode:'auto'}),inspect:async()=>observation,load:()=>({id:'old-attempt',jobId:'old-job',phase:'error'}),remote:async(method)=>{if(method==='GET')throw Object.assign(Error('missing'),{code:'ZOOM_JOB_UNAVAILABLE'});joins++;return {id:'new-job'};}});
 await bot.tick();await bot.tick();assert.equal(joins,0);await bot.action('retry','old-attempt');assert.equal(joins,1);assert.notEqual(bot.state.id,'old-attempt');assert.equal(bot.state.jobId,'new-job');assert.equal(bot.snapshot().connection,undefined);
 console.log('Zoom reauthorization: pinned credentials/URL, new attempt identity, no automatic orphan replacement and secret-free snapshots passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
