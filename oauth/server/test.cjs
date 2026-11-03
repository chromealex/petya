const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createBroker}=require('./server.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-broker-')); const config={origin:'https://auth.petya-app.ru',key:'ab'.repeat(32),file:path.join(dir,'tokens.enc'),clientId:'test-client',clientSecret:'test-secret',scopes:'offline_access read:jira-work'};
 let refreshes=0;
 const provider=async(url,opts)=>({ok:true,json:async()=>{
 if(url.endsWith('accessible-resources'))return [{id:'cloud1',name:'Test',url:'https://test.atlassian.net',scopes:['read:jira-work']}];
 const b=JSON.parse(opts.body);if(b.grant_type==='refresh_token'){refreshes++;await new Promise(r=>setTimeout(r,30));return {access_token:'refreshed',refresh_token:'rotated',expires_in:3600};}
 return {access_token:'initial',refresh_token:'refresh-secret',expires_in:1};
 }});
 let server=createBroker(config,provider); await new Promise(r=>server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+server.address().port;
 const call=(route,options={})=>fetch(base+route,{...options,redirect:'manual'});
 assert.equal((await call('/v1/sessions',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
 const s=await (await call('/v1/sessions',{method:'POST'})).json();
 const auth={Authorization:'Bearer '+s.secret};
 assert.equal((await call('/v1/sessions/'+s.id)).status,401);
 const browser=await call('/authorize?id='+s.id),cookie=browser.headers.get('set-cookie').split(';')[0],html=await browser.text(),form=html.match(/name="form" value="([^"]+)"/)[1];
 const authorize=await call('/authorize',{method:'POST',headers:{Cookie:cookie},body:new URLSearchParams({id:s.id,form})});assert.equal(authorize.status,200);
 const state=new URL((await authorize.text()).match(/href="([^"]+)"/)[1].replaceAll('&amp;','&')).searchParams.get('state');
 assert.equal((await call('/oauth/atlassian/callback?state='+state+'&code=test')).status,403);
 assert.equal((await call('/oauth/atlassian/callback?state='+state+'&code=test',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await call('/oauth/atlassian/callback?state='+state+'&code=test',{headers:{Cookie:cookie}})).status,403);
 const status=await (await call('/v1/sessions/'+s.id,{headers:auth})).json();assert.equal(status.status,'ready');assert.equal(status.tokens,undefined);
 assert.equal((await call('/v1/sessions/'+s.id+'/claim',{method:'POST',headers:auth,body:JSON.stringify({siteId:'other'})})).status,400);
 const claimed=await (await call('/v1/sessions/'+s.id+'/claim',{method:'POST',headers:auth,body:JSON.stringify({siteId:'cloud1'})})).json();
 assert.equal((await call('/v1/sessions/'+s.id,{headers:auth})).status,401);
 assert.ok(!fs.readFileSync(config.file).includes(Buffer.from('refresh-secret')));
 const connectionAuth={Authorization:'Bearer '+claimed.credential};
 const tokens=await Promise.all(Array.from({length:4},()=>call('/v1/token',{method:'POST',headers:connectionAuth}).then(r=>r.json())));assert.equal(refreshes,1);assert.ok(tokens.every(t=>t.accessToken==='refreshed'));
 await new Promise(r=>server.close(r));server=createBroker(config,provider);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 assert.equal((await call('/v1/token',{method:'POST',headers:connectionAuth})).status,200);
 assert.equal((await call('/v1/token',{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
 await call('/v1/connection',{method:'DELETE',headers:connectionAuth});assert.equal((await call('/v1/token',{method:'POST',headers:connectionAuth})).status,401);
 await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true});console.log('OAuth broker security tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
