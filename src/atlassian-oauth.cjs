'use strict';
const ORIGIN='https://auth.petya-app.ru';
class AtlassianOAuth {
 constructor(request){this.request=request;this.pending=null;this.cached=null;this.inFlight=null;}
 call(route,method='GET',credential,body){return this.request(ORIGIN+route,{method,headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 async start(){const s=await this.call('/v1/sessions','POST');if(!/^[A-Za-z0-9_-]{43}$/.test(s.id)||s.url!==ORIGIN+'/authorize?id='+s.id)throw new Error('Сервер вернул неверный адрес входа.');this.pending=s;return {code:s.code,url:s.url};}
 async poll(){if(!this.pending)throw new Error('Начните вход заново.');return this.call('/v1/sessions/'+this.pending.id,'GET',this.pending.secret);}
 async claim(siteId){if(!this.pending)throw new Error('Начните вход заново.');const s=this.pending;const r=await this.call('/v1/sessions/'+s.id+'/claim','POST',s.secret,{siteId});if(!r.credential||!/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(r.site?.url))throw new Error('Некорректное подключение.');this.pending=null;this.cached=null;return r;}
 async disconnect(credential){await this.call('/v1/connection','DELETE',credential);this.cached=null;}
 async token(credential){
  if(this.cached?.credential===credential && this.cached.expiresAt>Date.now()+30000)return this.cached;
  if(this.inFlight?.credential===credential)return this.inFlight.promise;
  const promise=this.call('/v1/token','POST',credential).then(t=>{if(typeof t.accessToken!=='string'||!t.site?.id)throw new Error('Не удалось получить доступ Atlassian.');this.cached={...t,credential};return this.cached;}).finally(()=>{if(this.inFlight?.promise===promise)this.inFlight=null;});this.inFlight={credential,promise};return promise;
 }
 async requireConfluence(token) {
  // The same cloud ID can have separate Jira and Confluence resource entries.
  // Check current grants, not the single resource saved at initial sign-in.
  if (!token.resourcesPromise) token.resourcesPromise=this.request('https://api.atlassian.com/oauth/token/accessible-resources',{headers:{Authorization:'Bearer '+token.accessToken}}).catch(e=>{delete token.resourcesPromise;throw e;});
  const resources=await token.resourcesPromise;
  if (!Array.isArray(resources)) throw new Error('Atlassian не вернул список доступных сервисов. Повторите проверку.');
  const allowed=resources.some(r=>r.id===token.site.id && r.url===token.site.url && (r.scopes||[]).some(scope=>['search:confluence','read:content-details:confluence'].includes(scope)));
  if (!allowed) {
   const error=new Error('Доступ к Confluence не выдан. Повторите вход Atlassian и разрешите доступ к Confluence на нужном сайте. Подключение Jira сохранено.');
   error.code='CONFLUENCE_NOT_GRANTED';throw error;
  }
 }
 async rewrite(url,options,s){
  if(!s.atlassianCredential)return {url,options};const u=new URL(url);
  if(u.origin!==s.jiraUrl)return {url,options};
  if(!u.pathname.startsWith('/rest/')&&!u.pathname.startsWith('/wiki/rest/'))throw new Error('Недопустимый маршрут Atlassian.');
  const t=await this.token(s.atlassianCredential);if(t.site.url!==s.jiraUrl)throw new Error('Сайт Atlassian изменился. Подключитесь заново.');
  const product=u.pathname.startsWith('/wiki/')?'confluence':'jira';
  if(product==='confluence')await this.requireConfluence(t);
  const headers={...options.headers};for(const key of Object.keys(headers))if(key.toLowerCase()==='authorization')delete headers[key];headers.Authorization='Bearer '+t.accessToken;
  return {url:'https://api.atlassian.com/ex/'+product+'/'+encodeURIComponent(t.site.id)+u.pathname+u.search,options:{...options,headers}};
 }
}
module.exports={AtlassianOAuth,ORIGIN};
