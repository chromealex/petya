'use strict';
const http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {createBroker}=require('./server.cjs'),{adapter}=require('./providers.cjs');
function createGateway(env=process.env,fetcher=fetch) {
 const pages=Object.fromEntries(['index','privacy','terms','contact'].map(name=>[name==='index'?'/':'/'+name,fs.readFileSync(path.join(__dirname,'public',name+'.html'))]));
 const common={origin:env.PUBLIC_ORIGIN,key:env.TOKEN_ENCRYPTION_KEY};
 const configs={atlassian:{...common,file:env.TOKEN_STORE||'/var/lib/petya-auth/tokens.enc',clientId:env.ATLASSIAN_CLIENT_ID,clientSecret:env.ATLASSIAN_CLIENT_SECRET,scopes:env.ATLASSIAN_SCOPES||'read:jira-work write:jira-work read:jira-user search:confluence offline_access'}};
 for(const name of ['slack','notion','asana']) {
  const c={...common,name,label:({slack:'Slack',notion:'Notion',asana:'Asana'})[name],prefix:'/'+name,file:path.join(path.dirname(configs.atlassian.file),name+'.enc'),clientId:env[name.toUpperCase()+'_CLIENT_ID'],clientSecret:env[name.toUpperCase()+'_CLIENT_SECRET']};
  c.adapter=adapter(name,c);configs[name]=c;
 }
 const brokers=Object.fromEntries(Object.entries(configs).map(([name,c])=>[name,createBroker(c,fetcher)]));
 return http.createServer((req,res)=>{
  const route=new URL(req.url,common.origin).pathname;
  if(Object.hasOwn(pages,route)) {
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
   return res.end(req.method==='HEAD'?undefined:pages[route]);
  }
  if(route==='/health') {res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,providers:Object.fromEntries(Object.entries(configs).map(([n,c])=>[n,!!c.clientId&&!!c.clientSecret]))}));}
  const name=['slack','notion','asana'].find(n=>route.startsWith('/'+n+'/')||route==='/oauth/'+n+'/callback')||'atlassian';
  brokers[name].emit('request',req,res);
 });
}
if(require.main===module)createGateway().listen(Number(process.env.PORT)||8787,'127.0.0.1');
module.exports={createGateway};
