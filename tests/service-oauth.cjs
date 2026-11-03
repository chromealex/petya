'use strict';
const assert=require('node:assert/strict');
const {ServiceOAuth}=require('../src/service-oauth.cjs');
(async()=>{
 for(const name of ['slack','notion','asana']) {
  let calls=0;const credential='x'.repeat(43);
  const client=new ServiceOAuth(name,async(url,o)=>{calls++;assert.equal(url,'https://auth.petya-app.ru/'+name+'/v1/token');assert.equal(o.headers.Authorization,'Bearer '+credential);return {accessToken:'access',expiresAt:Date.now()+300000,site:{id:'workspace',provider:name}};});
  const s={[name+'Credential']:credential};const url=({slack:'https://slack.com/api/auth.test',notion:'https://api.notion.com/v1/search',asana:'https://app.asana.com/api/1.0/workspaces'})[name];
  const results=await Promise.all([1,2,3].map(()=>client.rewrite(url,{headers:{authorization:'Bearer old'}},s)));
  assert.equal(calls,1);assert.ok(results.every(r=>r.options.headers.Authorization==='Bearer access'&&!r.options.headers.authorization));
  await client.rewrite('https://evil.test/v1/search',{},s);assert.equal(calls,1);
  await assert.rejects(client.rewrite(new URL(url).origin+'/other',{},s));
  const bad=new ServiceOAuth(name,async()=>({id:'a'.repeat(43),url:'https://evil.test/'}));await assert.rejects(bad.start());
 }
 console.log('Slack/Notion client isolation tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
