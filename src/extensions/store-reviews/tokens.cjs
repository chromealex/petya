// Access tokens for the two stores.
// Google Play: the same service-account key Petya already keeps for Android vitals (settings.googlePlayCredential,
// parsed by the shared adapter in src/extensions/google-play/client.cjs), signed here for the androidpublisher scope that reviews need.
// App Store Connect: an ES256 JWT made from the team API key (.p8), issuer id and key id.
const {createSign,createPrivateKey}=require('node:crypto');
const {credential}=require('../google-play/client.cjs');
const PLAY_SCOPE='https://www.googleapis.com/auth/androidpublisher';
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');

// The service account behind googlePlayCredential, or a reason why reviews cannot use it.
function playAccount(settings){
 if(settings.module_googleplay==='false')return {problem:'Google Play выключен в подключениях.'};
 if(!settings.googlePlayCredential)return {problem:'Google Play не подключён.'};
 let c;try{c=credential(settings.googlePlayCredential);}catch(e){return {problem:e.message};}
 // A browser sign-in only grants the Android vitals reports scope; reviews need the androidpublisher scope.
 if(c.type!=='service_account')return {problem:'Вход Google через браузер даёт только отчёты Android vitals. Для отзывов импортируйте ключ сервисного аккаунта с правом «Отвечать на отзывы».'};
 return {account:c};
}
const playCache=new Map();
async function playToken(settings,request,now=()=>Date.now()){
 const {account,problem}=playAccount(settings);if(!account)throw Error(problem);
 const cached=playCache.get(account.client_email);
 if(cached&&cached.until>now()+60000)return cached.token;
 const iat=Math.floor(now()/1000);
 const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:account.client_email,scope:PLAY_SCOPE,aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});
 const sign=createSign('RSA-SHA256');sign.update(unsigned);
 const result=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+sign.sign(account.private_key,'base64url')}).toString()});
 if(!result?.access_token)throw Error('Google не выдал доступ к отзывам Google Play.');
 playCache.set(account.client_email,{token:result.access_token,until:now()+Number(result.expires_in||3600)*1000});
 return result.access_token;
}

// App Store Connect key: issuer id (UUID), key id (10 characters) and the .p8 EC private key.
function ascKey(settings){
 const issuer=String(settings.storeReviewsAscIssuer||'').trim(),keyId=String(settings.storeReviewsAscKeyId||'').trim(),pem=String(settings.storeReviewsAscKey||'').trim();
 if(!issuer||!keyId||!pem)return {problem:'App Store Connect не подключён.'};
 return {issuer,keyId,pem};
}
function checkAscKey(pem){
 let key;try{key=createPrivateKey(pem);}catch{throw Error('Ключ App Store Connect должен быть файлом .p8 (PEM, BEGIN PRIVATE KEY).');}
 if(key.asymmetricKeyType!=='ec')throw Error('Ключ App Store Connect должен быть ключом ES256 (.p8).');
 return key;
}
const ascCache=new Map();
// Apple accepts tokens that live at most 20 minutes; one is reused for 15.
function ascToken(settings,now=()=>Date.now()){
 const {issuer,keyId,pem,problem}=ascKey(settings);if(problem)throw Error(problem);
 const id=issuer+'/'+keyId,cached=ascCache.get(id);
 if(cached&&cached.pem===pem&&cached.until>now()+60000)return cached.token;
 const iat=Math.floor(now()/1000);
 const unsigned=b64({alg:'ES256',kid:keyId,typ:'JWT'})+'.'+b64({iss:issuer,iat,exp:iat+1200,aud:'appstoreconnect-v1'});
 const sign=createSign('SHA256');sign.update(unsigned);
 // JWS needs the raw r||s signature, not DER.
 const token=unsigned+'.'+sign.sign({key:checkAscKey(pem),dsaEncoding:'ieee-p1363'},'base64url');
 ascCache.set(id,{pem,token,until:now()+15*60000});
 return token;
}
function clear(){playCache.clear();ascCache.clear();}
module.exports={PLAY_SCOPE,playAccount,playToken,ascKey,checkAscKey,ascToken,clear};
