const assert=require('node:assert/strict');const {Outlook,clientConfig}=require('../src/outlook.cjs');const {MailAccounts}=require('../src/mail-accounts.cjs');
const json=v=>new Response(JSON.stringify(v));
(async()=>{
 const client=clientConfig({client_id:'12345678-1234-1234-1234-123456789abc'});assert.throws(()=>clientConfig({client_id:'bad'}));let state={client},url,exchanges=0,enabled=true;
 const options={load:()=>structuredClone(state),save:v=>state=structuredClone(v),enabled:()=>enabled,open:u=>{url=new URL(u);},fetcher:async(u,o)=>{
  if(u.includes('/token')){exchanges++;const p=new URLSearchParams(o.body);assert(!p.has('client_secret'));if(p.get('grant_type')==='authorization_code'){assert(p.get('code_verifier'));assert.equal(require('node:crypto').createHash('sha256').update(p.get('code_verifier')).digest('base64url'),url.searchParams.get('code_challenge'));}return json({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:'User.Read Mail.Read'});}
  if(u.includes('/me?'))return json({mail:'work@outlook.com'});
  assert(u.includes('/mailFolders/inbox/messages?'));assert.equal(o.method,undefined);assert.equal(o.headers.Authorization,'Bearer access');const q=new URL(u).searchParams;assert(q.get('$filter').includes('isRead eq false'));return json({value:[{id:'one',subject:'Build',from:{emailAddress:{name:'QA',address:'qa@example.com'}},bodyPreview:'Failure',receivedDateTime:'2026-11-04'},{id:'promo',internetMessageHeaders:[{name:'List-Unsubscribe',value:'x'}]}],'@odata.nextLink':'ignored'});
 }};
 const account=new Outlook(options);await account.start();assert.equal(url.hostname,'login.microsoftonline.com');assert(url.pathname.startsWith('/common/'));assert.equal(url.searchParams.get('prompt'),'select_account');
 const redirect=url.searchParams.get('redirect_uri');assert.equal((await fetch(redirect+'?state=wrong&code=x')).status,400);assert.equal(exchanges,0);
 await fetch(redirect+'?'+new URLSearchParams({state:url.searchParams.get('state'),code:'code'}));assert.equal(state.email,'work@outlook.com');assert(!account.pending);
 const r=await account.read({days:7,unread:true,skipPromotions:true,priority:['QA']});assert.equal(r.messages.length,1);assert(r.messages[0].priority);assert(r.partial);
 state.tokens.expiresAt=0;await Promise.all([account.access(),account.access()]);assert.equal(exchanges,2);
 enabled=false;await assert.rejects(()=>account.read({days:7}),/модуль/);enabled=true;
 await account.start();const denied=url.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:url.searchParams.get('state'),error:'access_denied'});await fetch(denied);assert(account.lastError.includes('отменён'));account.stop();
 let google={accounts:[{id:'same',email:'same@example.com'}]},microsoft={accounts:[{id:'same',email:'same@example.com'}]};const opts=(load,save)=>({load,save,enabled:()=>true,open:()=>{}});
 const m=new MailAccounts({google:opts(()=>google,v=>google=v),microsoft:opts(()=>microsoft,v=>microsoft=v)});assert.deepEqual(m.accounts().map(a=>a.id),['same','microsoft:same']);
 m.rename('microsoft:same','Work');assert.equal(google.accounts[0].label,undefined);assert.equal(microsoft.accounts[0].label,'Work');
 let reads=[];m.google.read=async r=>{reads.push(['google',r.accounts]);return {results:[{account:'Google',messages:[]}]};};m.microsoft.read=async r=>{reads.push(['ms',r.accounts]);return {results:[{account:'Microsoft',error:'expired'}]};};
 await assert.rejects(()=>m.read({}),/Выберите/);assert.equal((await m.read({allAccounts:true})).results.length,2);assert.deepEqual(reads,[['google',['same']],['ms',['same']]]);m.disconnect('microsoft:same');assert.equal(google.accounts.length,1);m.stop();
 console.log('Outlook: PKCE, state, consent denial, refresh single flight, read-only Graph, account isolation and mixed-provider reads passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
