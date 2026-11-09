'use strict';
const {OAuthBroker}=require('./oauth-broker.cjs');
class ServiceOAuth extends OAuthBroker {
 constructor(name,request){super(request);if(!['slack','notion','asana'].includes(name))throw new Error('Unknown provider');this.name=name;}
 prefix(){return '/'+this.name;}
 valid(r){return /^[A-Za-z0-9_-]{43}$/.test(r?.credential)&&r.site?.provider===this.name&&!!r.site.id;}
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
