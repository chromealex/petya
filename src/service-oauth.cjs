'use strict';
const {AtlassianOAuth,ORIGIN}=require('./atlassian-oauth.cjs');
class ServiceOAuth extends AtlassianOAuth {
 constructor(name,request){super(request);if(!['slack','notion','asana'].includes(name))throw new Error('Unknown provider');this.name=name;}
 call(route,...args){return super.call('/'+this.name+route,...args);}
 async start(){const s=await this.call('/v1/sessions','POST');if(!/^[A-Za-z0-9_-]{43}$/.test(s.id)||s.url!==ORIGIN+'/'+this.name+'/authorize?id='+s.id)throw new Error('Сервер вернул неверный адрес входа.');this.pending=s;return {code:s.code,url:s.url};}
 async claim(siteId){if(!this.pending)throw new Error('Начните вход заново.');const s=this.pending;const r=await this.call('/v1/sessions/'+s.id+'/claim','POST',s.secret,{siteId});if(!/^[A-Za-z0-9_-]{43}$/.test(r.credential)||r.site?.provider!==this.name||!r.site.id)throw new Error('Некорректное подключение.');this.pending=null;this.cached=null;return r;}
 async rewrite(url,options,s){
  const credential=s[this.name+'Credential'];if(!credential)return {url,options};const u=new URL(url);
  const origin=({slack:'https://slack.com',notion:'https://api.notion.com',asana:'https://app.asana.com'})[this.name];
  if(u.origin!==origin)return {url,options};
  if(u.username||u.password||!u.pathname.startsWith(({slack:'/api/',notion:'/v1/',asana:'/api/1.0/'})[this.name]))throw new Error('Недопустимый маршрут сервиса.');
  const t=await this.token(credential);if(t.site.provider!==this.name)throw new Error('Неверный сервис подключения.');
  const headers={...options.headers};for(const k of Object.keys(headers))if(k.toLowerCase()==='authorization')delete headers[k];
  headers.Authorization='Bearer '+t.accessToken;return {url,options:{...options,headers}};
 }
}
module.exports={ServiceOAuth};
