// One-click connections: Telegram by a QR code (with a two-step password after the scan) and Google Play by
// signing in with Google; the Telegram app credentials survive a disconnect so reconnecting is one click again.
const assert=require('node:assert/strict');
const {TelegramSource,qrSvg}=require('../src/telegram.cjs');
const play=require('../src/google-play.cjs');
const {Api}=require('../src/vendor/telegram/client.cjs');
(async()=>{
 assert.match(qrSvg('tg://login?token=abc'),/^<svg[\s\S]*<path/);
 // Telegram: the first token is shown as a QR code, the scan update wakes the loop, 2FA asks for the password.
 let saved={},exports=0,handler,password;
 const client={session:{save:()=>'qr-session'},connect:async()=>{},disconnect:async()=>{},getMe:async()=>({id:7n,firstName:'Bob'}),
  addEventHandler:fn=>handler=fn,removeEventHandler:()=>{handler=null;},
  invoke:async request=>{if(request.className!=='auth.ExportLoginToken')throw Error('unexpected '+request.className);exports++;
   if(exports===1)return new Api.auth.LoginToken({expires:Math.floor(Date.now()/1000)+30,token:Buffer.from('login-token')});
   throw Object.assign(Error('SESSION_PASSWORD_NEEDED'),{errorMessage:'SESSION_PASSWORD_NEEDED'});},
  signInWithPassword:async(_config,params)=>{password=await params.password();return {id:7n};}};
 const tg=new TelegramSource({load:()=>saved,save:v=>saved=v,store:{},enabled:()=>true,create:config=>{assert.equal(config.apiId,123);return {client,Api,peer:p=>p};}});
 await assert.rejects(()=>tg.qr({}),/api_id/);
 tg.qr({apiId:'123',apiHash:'b'.repeat(32)});
 for(let i=0;i<50&&tg.status().phase!=='qr';i++)await new Promise(r=>setImmediate(r));
 const shown=tg.status();assert.equal(shown.phase,'qr');assert.match(shown.qr,/^<svg/);assert.match(shown.message,/Отсканируйте/);
 handler(new Api.UpdateLoginToken());
 for(let i=0;i<50&&tg.status().phase!=='password';i++)await new Promise(r=>setImmediate(r));
 assert.equal(tg.status().phase,'password');tg.respond('password','secret-2fa');await tg.authTask;
 assert.equal(password,'secret-2fa');assert.equal(saved.session,'qr-session');assert.equal(saved.account,'Bob');assert.equal(tg.status().connected,true);
 assert.ok(!JSON.stringify(saved).includes('secret-2fa'));
 await tg.disconnect();assert.equal(saved.session,undefined);assert.equal(saved.apiId,123,'the app stays for the next one-click connect');assert.equal(tg.status().app,true);

 // Google Play: the browser sign-in returns to the loopback callback, the code is exchanged for a refresh token.
 const calls=[];const request=async(url,options)=>{calls.push({url,body:String(options.body)});return url.includes('token')&&String(options.body).includes('authorization_code')?{access_token:'a',refresh_token:'r1',scope:play.SCOPE}:{access_token:'fresh',expires_in:3600};};
 const credential=await play.login({client:{client_id:'id.apps.googleusercontent.com',client_secret:'s'},request,open:async url=>{
  const u=new URL(url);assert.equal(u.searchParams.get('scope'),play.SCOPE);assert.equal(u.searchParams.get('access_type'),'offline');
  const back=new URL(u.searchParams.get('redirect_uri'));back.searchParams.set('state',u.searchParams.get('state'));back.searchParams.set('code','c1');
  setImmediate(()=>fetch(back).catch(()=>{}));}});
 assert.deepEqual(credential,{type:'oauth',client:{client_id:'id.apps.googleusercontent.com',client_secret:'s'},refresh_token:'r1'});
 assert.match(calls[0].body,/code_verifier=/);
 // The saved OAuth credential gives report access through a refresh token.
 const api=new play.GooglePlay({settings:()=>({googlePlayCredential:JSON.stringify(credential)}),request});
 assert.equal(await api.token(),'fresh');assert.match(calls.at(-1).body,/refresh_token=r1/);
 await assert.rejects(()=>play.login({client:null,request,open:async()=>{}}),/OAuth-клиента/);
 console.log('one-click connect: Telegram QR with 2FA, kept app credentials, Google Play sign-in and refresh passed');
})().catch(e=>{console.error(e);process.exit(1);});
