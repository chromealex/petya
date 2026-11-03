const assert=require('node:assert/strict');const {GmailAccounts}=require('../src/gmail-accounts.cjs');const {MailSkill,defaults}=require('../src/mail-skill.cjs');
(async()=>{
 const client={client_id:'test',client_secret:'x'},tokens={access_token:'a',refresh_token:'r',expiresAt:Date.now()+999999};let state={client,tokens};
 const manager=new GmailAccounts({load:()=>structuredClone(state),save:s=>state=structuredClone(s),enabled:()=>true,open:async()=>{}});
 assert.equal(state.accounts.length,1);assert.equal(state.tokens,undefined);const old=state.accounts[0].id;
 manager.accept({client,email:'work@gmail.com',tokens});manager.accept({client,email:'private@gmail.com',tokens});const work=state.accounts.find(a=>a.email==='work@gmail.com').id;const personal=state.accounts.find(a=>a.email==='private@gmail.com').id;
 manager.rename(work,'Рабочая');manager.accept({client,email:'work@gmail.com',tokens:{...tokens,access_token:'new'}});assert.equal(state.accounts.length,3);assert.equal(state.accounts.find(a=>a.id===work).label,'Рабочая');
 manager.importClient({...client,client_id:'other'});assert.equal(state.accounts.find(a=>a.id===work).client.client_id,'test');assert(!JSON.stringify(manager.status()).includes('refresh_token'));
 manager.disconnect(old);await assert.rejects(()=>manager.read(defaults),/Укажите аккаунты/);
 let calls=[];manager.client=id=>({read:async()=>{calls.push(id);if(id===personal)throw Error('Вход истёк');return {messages:[],at:Date.now()};}});
 const one=await manager.read({...defaults,accounts:[work]});assert.equal(one.results.length,1);assert.deepEqual(calls,[work]);
 const all=await manager.read({...defaults,allAccounts:true});assert.equal(all.results.length,2);assert.match(all.results[1].error,/истёк/);
 const skill=new MailSkill({gmail:manager,learning:new (require('../src/learning.cjs').Learning)({}),model:async()=>''});const report=await skill.run({...defaults,allAccounts:true});assert.match(report.text,/Рабочая · work@gmail.com/);assert.match(report.text,/private@gmail.com\nНе проверен/);assert.equal(report.error,false);
 await skill.turn('научись проверять почту');await skill.turn('аккаунт Рабочая');assert.deepEqual(skill.draft().recipe.accounts,[work]);await skill.turn('все аккаунты');assert.equal(skill.draft().recipe.allAccounts,true);
 manager.disconnect(work);const missing=await manager.read({...defaults,accounts:[work]});assert.match(missing.results[0].error,/отключён/);assert.equal(state.accounts.length,1);
 console.log('Gmail accounts: migration, isolated credentials, deduplication, selection, partial failures and training passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
