const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Companies}=require('../src/companies.cjs');const {ServiceOAuth}=require('../src/service-oauth.cjs');const {AtlassianOAuth}=require('../src/extensions/jira/atlassian-oauth.cjs');const {GmailAccounts}=require('../src/extensions/mail/gmail-accounts.cjs');const modules=require('../src/modules.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-integration-scope-'));
 try{
  const c=new Companies(root);const fields=['telegramCredential','telegramAutoSync','jiraToken','jiraUrl','jiraEmail','jiraProjects','jiraProject','jiraIssueType','jiraBoardId','jiraVersionId','atlassianCredential','confluenceSpace','slackToken','slackCredential','slackChannels','notionToken','notionCredential','asanaCredential','asanaWorkspace','googlePlayCredential','microsoftCredential','gmailCredential',...Object.keys(modules.defaults)];
  const first=Object.fromEntries(fields.map(k=>[k,k.startsWith('module_')?'true':'first-'+k]));
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify(first));const second=c.create('Second',first);const secondFile=path.join(c.directory(second.id),'settings.json');const blank=JSON.parse(fs.readFileSync(secondFile));for(const key of fields)assert.equal(blank[key],undefined,'New company copied '+key);
  const other=Object.fromEntries(fields.map(k=>[k,k.startsWith('module_')?'false':'second-'+k]));fs.writeFileSync(secondFile,JSON.stringify(other));
  c.select(second.id);const restarted=new Companies(root);const loaded=JSON.parse(fs.readFileSync(path.join(restarted.directory(restarted.state.activeId),'settings.json')));assert.deepEqual(loaded,other);assert.equal(modules.enabled(loaded,'slack'),false);assert.equal(modules.enabled(first,'slack'),true);
  loaded.slackCredential='';loaded.gmailCredential='';fs.writeFileSync(secondFile,JSON.stringify(loaded));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'settings.json'))),first,'Disconnect altered another profile');
  for(const service of ['slack','notion','asana','atlassian']){
   const calls=[];const request=async(url,options)=>{const credential=options.headers.Authorization;calls.push({url,method:options.method,credential});return {accessToken:credential,expiresAt:Date.now()+600000,site:{id:credential,provider:service}};};
   const client=service==='atlassian'?new AtlassianOAuth(request):new ServiceOAuth(service,request);
   assert.equal((await client.token('company-a')).accessToken,'Bearer company-a');assert.equal((await client.token('company-b')).accessToken,'Bearer company-b');await client.disconnect('company-b');assert.equal(calls.at(-1).credential,'Bearer company-b');assert.equal((await client.token('company-a')).accessToken,'Bearer company-a');
  }
  let a={accounts:[{id:'a',email:'a@example.com'}]},b={accounts:[{id:'b',email:'b@example.com'}]};
  const opts={enabled:()=>true,open:()=>{}};const ga=new GmailAccounts({...opts,load:()=>a,save:v=>a=v}),gb=new GmailAccounts({...opts,load:()=>b,save:v=>b=v});assert.deepEqual(ga.accounts().map(r=>r.id),['a']);assert.throws(()=>gb.disconnect('a'));gb.disconnect('b');assert.equal(ga.accounts().length,1);assert.equal(gb.accounts().length,0);ga.stop();gb.stop();
  console.log('Company integrations: all service settings, module flags, OAuth credential caches and disconnects, Gmail accounts isolated');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
