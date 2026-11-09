const assert=require('node:assert/strict');
const {AtlassianOAuth,ORIGIN}=require('../src/extensions/jira/atlassian-oauth.cjs');
(async()=>{
 let calls=0;const oauth=new AtlassianOAuth(async(url,options)=>{if(url==='https://api.atlassian.com/oauth/token/accessible-resources'){assert.equal(options.headers.Authorization,'Bearer access-secret');return [{id:'cloud-id',url:'https://test.atlassian.net',scopes:['search:confluence']}];} assert.equal(url,ORIGIN+'/v1/token');assert.equal(options.headers.Authorization,'Bearer private-device-key');calls++;return {accessToken:'access-secret',expiresAt:Date.now()+300000,site:{id:'cloud-id',url:'https://test.atlassian.net'}};});
 const settings={jiraUrl:'https://test.atlassian.net',atlassianCredential:'private-device-key'};
 const other=await oauth.rewrite('https://example.com/rest/api/3/myself',{},settings);assert.equal(other.url,'https://example.com/rest/api/3/myself');assert.equal(calls,0);
 const [jira,docs]=await Promise.all([oauth.rewrite(settings.jiraUrl+'/rest/api/3/myself',{headers:{Authorization:'Basic old'}},settings),oauth.rewrite(settings.jiraUrl+'/wiki/rest/api/content/search?limit=1',{},settings)]);
 assert.equal(calls,1);assert.equal(jira.url,'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/myself');assert.equal(docs.url,'https://api.atlassian.com/ex/confluence/cloud-id/wiki/rest/api/content/search?limit=1');assert.equal(jira.options.headers.Authorization,'Bearer access-secret');
 await assert.rejects(oauth.rewrite(settings.jiraUrl+'/plugins/unknown',{},settings));
 oauth.cached.site.url='https://other.atlassian.net';await assert.rejects(oauth.rewrite(settings.jiraUrl+'/rest/api/3/myself',{},settings));
 const bad=new AtlassianOAuth(async()=>({id:'a'.repeat(43),url:'https://evil.test'}));await assert.rejects(bad.start());
 let resourceCalls=0;
 const noDocs=new AtlassianOAuth(async(url)=>{
  if(url===ORIGIN+'/v1/token')return {accessToken:'test',expiresAt:Date.now()+300000,site:{id:'cloud-id',url:settings.jiraUrl,scopes:['search:confluence']}};
  resourceCalls++;return [{id:'cloud-id',url:settings.jiraUrl,scopes:['read:jira-work']},{id:'other',url:'https://other.atlassian.net',scopes:['search:confluence']}];
 });
 await noDocs.rewrite(settings.jiraUrl+'/rest/api/3/myself',{},settings);
 assert.equal(resourceCalls,0);
 await assert.rejects(noDocs.rewrite(settings.jiraUrl+'/wiki/rest/api/content/search',{},settings),e=>e.code==='CONFLUENCE_NOT_GRANTED');
 await assert.rejects(noDocs.rewrite(settings.jiraUrl+'/wiki/rest/api/content/search',{},settings),e=>e.code==='CONFLUENCE_NOT_GRANTED');
 assert.equal(resourceCalls,1);
 noDocs.cached.resourcesPromise=Promise.resolve([{id:'cloud-id',url:settings.jiraUrl,scopes:['read:jira-work']},{id:'cloud-id',url:settings.jiraUrl,scopes:['search:confluence']}]);
 assert((await noDocs.rewrite(settings.jiraUrl+'/wiki/rest/api/content/search',{},settings)).url.includes('/ex/confluence/'));
 console.log('OAuth client routing and isolation tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
