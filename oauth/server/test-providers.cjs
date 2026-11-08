'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createGateway}=require('./gateway.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-providers-'));
 const env={PUBLIC_ORIGIN:'https://auth.petya-app.ru',TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),TOKEN_STORE:path.join(dir,'tokens.enc'),SLACK_CLIENT_ID:'slack-id',SLACK_CLIENT_SECRET:'slack-secret',ASANA_CLIENT_ID:'asana-id',ASANA_CLIENT_SECRET:'asana-secret',NOTION_CLIENT_ID:'notion-id',NOTION_CLIENT_SECRET:'notion-secret'};
 const refreshes={slack:0,notion:0,asana:0};
 const fetcher=async(url,o)=>{
   if(url.startsWith('https://app.asana.com/api/1.0/workspaces'))return {ok:true,json:async()=>({data:[{gid:'123',name:'Work'}]})};
  if(url==='https://app.asana.com/-/oauth_token'){const b=Object.fromEntries(new URLSearchParams(o.body));assert.equal(b.client_secret,'asana-secret');const refresh=b.grant_type==='refresh_token';if(refresh){assert.equal(b.refresh_token,'asana-refresh');refreshes.asana++;await new Promise(r=>setTimeout(r,20));}return {ok:true,json:async()=>({access_token:refresh?'asana-renewed':'asana-initial',expires_in:refresh?3600:1,...(!refresh?{refresh_token:'asana-refresh'}:{})})};}
  const name=url.startsWith('https://slack.com/')?'slack':'notion';
  assert.equal(o.headers.Authorization,'Basic '+Buffer.from(name+'-id:'+name+'-secret').toString('base64'));
  const b=name!=='notion'?Object.fromEntries(new URLSearchParams(o.body)):JSON.parse(o.body);
  let t={access_token:name+'-initial',refresh_token:name+'-refresh',expires_in:1,token_type:'user'};
  if(b.grant_type==='refresh_token'){assert.equal(b.refresh_token,name+'-refresh');refreshes[name]++;await new Promise(r=>setTimeout(r,20));t={...t,access_token:name+'-renewed',refresh_token:name+'-rotated',expires_in:3600};}
  const data=name==='slack'?(b.grant_type==='refresh_token'?{ok:true,...t}:{ok:true,authed_user:t,team:{id:'T1',name:'Team'}}):{...t,workspace_id:'N1',workspace_name:'Pages'};
  return {ok:true,json:async()=>data};
 };
 const server=createGateway(env,fetcher);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
 const base='http://127.0.0.1:'+server.address().port;
 const call=(route,o={})=>fetch(base+route,{...o,redirect:'manual'});
 const credentials={};
 for(const name of ['slack','notion','asana']) {
  const s=await (await call('/'+name+'/v1/sessions',{method:'POST'})).json();assert.equal(s.url,env.PUBLIC_ORIGIN+'/'+name+'/authorize?id='+s.id);
  const browser=await call('/'+name+'/authorize?id='+s.id);const cookie=browser.headers.get('set-cookie').split(';')[0];const html=await browser.text();assert.ok(html.includes('action="/'+name+'/authorize"'));
  const form=html.match(/name="form" value="([^"]+)"/)[1];
  const redirect=await call('/'+name+'/authorize',{method:'POST',headers:{Cookie:cookie},body:new URLSearchParams({id:s.id,form})});
  const location=new URL((await redirect.text()).match(/href="([^"]+)"/)[1].replaceAll('&amp;','&'));assert.equal(location.searchParams.get('redirect_uri'),env.PUBLIC_ORIGIN+'/oauth/'+name+'/callback');
  if(name==='slack')assert.ok(location.searchParams.get('user_scope').includes('channels:read'));
  const callback='/oauth/'+name+'/callback?state='+location.searchParams.get('state')+'&code=test';
  assert.equal((await call(callback)).status,403);assert.equal((await call(callback,{headers:{Cookie:cookie}})).status,200);
  assert.equal((await call(callback,{headers:{Cookie:cookie}})).status,403);
  const auth={Authorization:'Bearer '+s.secret};const poll=await(await call('/'+name+'/v1/sessions/'+s.id,{headers:auth})).json();assert.equal(poll.status,'ready');assert.equal(poll.tokens,undefined);
  const claimed=await(await call('/'+name+'/v1/sessions/'+s.id+'/claim',{method:'POST',headers:auth,body:JSON.stringify({siteId:poll.sites[0].id})})).json();credentials[name]=claimed.credential;
  const tokenAuth={Authorization:'Bearer '+claimed.credential};const tokens=await Promise.all([1,2,3].map(()=>call('/'+name+'/v1/token',{method:'POST',headers:tokenAuth}).then(r=>r.json())));assert.equal(refreshes[name],1);assert.ok(tokens.every(t=>t.accessToken===name+'-renewed'));
  assert.ok(!fs.readFileSync(path.join(dir,name+'.enc')).includes(Buffer.from(name+'-rotated')));
 }
 assert.equal((await call('/slack/v1/token',{method:'POST',headers:{Authorization:'Bearer '+credentials.notion}})).status,401);
 assert.equal((await call('/notion/v1/token',{method:'POST',headers:{Authorization:'Bearer '+credentials.slack}})).status,401);
 assert.equal((await call('/v1/token',{method:'POST',headers:{Authorization:'Bearer '+credentials.slack}})).status,401);
 for(const name of ['slack','notion','asana']){const headers={Authorization:'Bearer '+credentials[name]};assert.equal((await call('/'+name+'/v1/connection',{method:'DELETE',headers})).status,200);assert.equal((await call('/'+name+'/v1/token',{method:'POST',headers})).status,401);}
 console.log('Slack/Notion/Asana broker flows, refresh and isolation tests passed');
 } finally {await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true});}
})().catch(e=>{console.error(e);process.exit(1)});
