'use strict';
// The shared Atlassian connection of Jira and Confluence: Petya's sign-in broker (src/oauth-broker.cjs) for an
// Atlassian site, and the rewrite of `<site>/rest/…` (Jira) and `<site>/wiki/rest/…` (Confluence) requests to the
// Atlassian cloud API with the access token. Confluence (src/extensions/confluence) uses it through this file;
// nothing in Petya's core knows Atlassian.
const {OAuthBroker,ORIGIN}=require('../../oauth-broker.cjs');
class AtlassianOAuth extends OAuthBroker {
 valid(r){return !!r?.credential&&/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(r.site?.url);}
 tokenError(){return 'Не удалось получить доступ Atlassian.';}
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
