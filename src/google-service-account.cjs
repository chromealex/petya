// Google service-account access tokens (OAuth 2.0 JWT bearer grant), shared by the Google Play reports client
// (src/extensions/google-play/client.cjs) and the Firebase Crashlytics BigQuery reader (src/extensions/crashlytics). The private key
// never leaves the main process; tokens are cached per key and scope until a minute before they expire.
const {createSign,createPrivateKey}=require('node:crypto');
const TOKEN_URL='https://oauth2.googleapis.com/token';

// A Google Cloud service-account JSON key (as saved from the console) → {type, client_email, private_key, project_id}.
function parse(value){
 let c;try{c=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('Выберите JSON ключ сервисного аккаунта Google.');}
 if(c?.type!=='service_account'||typeof c.client_email!=='string'||!c.client_email.endsWith('.gserviceaccount.com')||typeof c.private_key!=='string')throw new Error('Выберите JSON ключ сервисного аккаунта Google.');
 createPrivateKey(c.private_key);
 return {type:c.type,client_email:c.client_email,private_key:c.private_key,...(typeof c.project_id==='string'?{project_id:c.project_id}:{})};
}
const cache=new Map();
async function token(credential,scope,request,{now=Date.now}={}){
 const c=parse(credential),key=c.client_email+' '+scope+' '+c.private_key.length;
 const hit=cache.get(key);if(hit&&hit.until>now()+60000)return hit.token;
 const at=Math.floor(now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:c.client_email,scope,aud:TOKEN_URL,iat:at,exp:at+3600});
 const sign=createSign('RSA-SHA256');sign.update(unsigned);
 const result=await request(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+sign.sign(c.private_key,'base64url')}).toString()});
 if(!result?.access_token)throw new Error('Google не выдал доступ сервисному аккаунту.');
 cache.set(key,{token:result.access_token,until:now()+Number(result.expires_in||3600)*1000});
 return result.access_token;
}
module.exports={parse,token,TOKEN_URL,clear:()=>cache.clear()};
