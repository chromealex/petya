// Shared Google Workspace connection: per-product scopes (a write scope covers reading; drive.file does not), the
// accounts of mail with what each may do per product, incremental consent with its outcome, and both token paths.
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const ws=require('../src/google-workspace.cjs');
(async()=>{
 const scope=list=>JSON.stringify({accounts:[{id:'g1',email:'me@studio.dev',tokens:{scope:['https://www.googleapis.com/auth/gmail.readonly',...list].join(' ')}},{id:'g2',email:'two@studio.dev',tokens:{scope:'https://www.googleapis.com/auth/gmail.readonly'}}]});
 const S=ws.SCOPES;
 let settings={gmailCredential:scope([S.sheets.write,S.drive.write])};
 assert.deepEqual(ws.accounts(settings,'sheets').map(a=>[a.key,a.read,a.write]),[['google:g1',true,true],['google:g2',false,false]]);
 assert.deepEqual(ws.accounts(settings,'docs').map(a=>a.read),[false,false],'scopes are per product');
 assert.deepEqual(ws.accounts(settings,'drive').map(a=>[a.read,a.write]),[[false,true],[false,false]],'drive.file writes but does not read');
 assert.equal(ws.chosen(settings,'sheets','google:g2').key,'google:g1','a chosen account without access falls back');
 // Consent: the mail sign-in is asked for the product's scope; the outcome is reported once.
 const started=[],login={pending:true};let outcome=null;
 const s={settings,request:null,mailAccounts:{google:{start:async o=>{started.push(o);},login,client:id=>({access:async()=>'acct-'+id}),status:()=>({configured:true})}}};
 await ws.consent(s,'docs',{account:'google:g2',poll:5,onDone:r=>{outcome=r;}});
 assert.deepEqual(started[0],{scopes:[S.docs.read],email:'two@studio.dev'});
 s.settings.gmailCredential=settings.gmailCredential=scope([S.sheets.write]).replace('"https://www.googleapis.com/auth/gmail.readonly"','"https://www.googleapis.com/auth/gmail.readonly"').replace(/("id":"g2"[^}]*"scope":")/,'$1'+S.docs.read+' ');
 login.pending=false;
 for(let i=0;i<100&&!outcome;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(outcome.ok,true);assert.equal(outcome.account.key,'google:g2');
 login.lastError='Вход отменён в Google.';outcome=null;
 await ws.consent(s,'docs',{write:true,poll:5,onDone:r=>{outcome=r;}});
 for(let i=0;i<100&&!outcome;i++)await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(outcome,{ok:false,error:'Вход отменён в Google.'});
 // Tokens: the account's refreshed token from mail; the service account's own JWT grant with the product scope.
 assert.equal(await ws.token(s,'sheets',{account:'google:g1'}),'acct-g1');
 await assert.rejects(ws.token(s,'docs',{account:'google:g2',write:true}),/запись/);
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const key=JSON.stringify({type:'service_account',client_email:'reader@game-1.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 const asked=[];s.request=async(url,o)=>{asked.push([url,o.body]);return {access_token:'sa',expires_in:3600};};
 assert.equal(await ws.token(s,'drive',{mode:'service',credential:key}),'sa');
 const jwt=new URLSearchParams(asked[0][1]).get('assertion').split('.')[1];
 assert.equal(JSON.parse(Buffer.from(jwt,'base64url')).scope,S.drive.read);
 assert.equal(ws.serviceEmail(key),'reader@game-1.iam.gserviceaccount.com');assert.equal(ws.serviceEmail('{}'),'');
 assert.throws(()=>ws.accounts(settings,'gmail'),/Неизвестный продукт/);
 console.log('Google Workspace connection: per-product scopes, accounts, incremental consent, account and service-account tokens passed');
})().catch(e=>{console.error(e);process.exit(1);});
