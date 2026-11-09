'use strict';
// Petya's sign-in broker (auth.petya-app.ru): a browser sign-in session, its poll and claim, and short-lived access
// tokens for the device credential it hands out. Service-neutral: each service adapter (Atlassian in
// src/extensions/jira/atlassian-oauth.cjs, the cloud services in src/service-oauth.cjs) adds its own routes, the claim
// check and how its requests are rewritten.
const ORIGIN='https://auth.petya-app.ru';
class OAuthBroker {
 constructor(request){this.request=request;this.pending=null;this.cached=null;this.inFlight=null;}
 // The route prefix of the service on the broker ('' for the default service).
 prefix(){return '';}
 call(route,method='GET',credential,body){return this.request(ORIGIN+this.prefix()+route,{method,headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 async start(){const s=await this.call('/v1/sessions','POST');if(!/^[A-Za-z0-9_-]{43}$/.test(s.id)||s.url!==ORIGIN+this.prefix()+'/authorize?id='+s.id)throw new Error('Сервер вернул неверный адрес входа.');this.pending=s;return {code:s.code,url:s.url};}
 async poll(){if(!this.pending)throw new Error('Начните вход заново.');return this.call('/v1/sessions/'+this.pending.id,'GET',this.pending.secret);}
 // The adapter checks the claimed connection (`valid`); a wrong one is refused before anything is saved.
 async claim(siteId){if(!this.pending)throw new Error('Начните вход заново.');const s=this.pending;const r=await this.call('/v1/sessions/'+s.id+'/claim','POST',s.secret,{siteId});if(!this.valid(r))throw new Error('Некорректное подключение.');this.pending=null;this.cached=null;return r;}
 valid(){return false;}
 async disconnect(credential){await this.call('/v1/connection','DELETE',credential);this.cached=null;}
 async token(credential){
  if(this.cached?.credential===credential && this.cached.expiresAt>Date.now()+30000)return this.cached;
  if(this.inFlight?.credential===credential)return this.inFlight.promise;
  const promise=this.call('/v1/token','POST',credential).then(t=>{if(typeof t.accessToken!=='string'||!t.site?.id)throw new Error(this.tokenError());this.cached={...t,credential};return this.cached;}).finally(()=>{if(this.inFlight?.promise===promise)this.inFlight=null;});this.inFlight={credential,promise};return promise;
 }
 tokenError(){return 'Не удалось получить доступ к сервису.';}
 // No rewrite by default: the adapter knows its service's addresses.
 async rewrite(url,options){return {url,options};}
}
module.exports={OAuthBroker,ORIGIN};
