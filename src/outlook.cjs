const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const SCOPE='Mail.Read';
const SCOPES='openid offline_access User.Read Mail.Read';
function clientConfig(raw){const c=typeof raw==='string'?JSON.parse(raw):raw;if(!/^[a-f0-9-]{36}$/i.test(c?.client_id||''))throw Error('Укажите Application (client) ID приложения Microsoft.');return {client_id:c.client_id};}
class Outlook{
 constructor({load,save,enabled,open,fetcher=fetch}){Object.assign(this,{load,save,enabled,open,fetcher});this.generation=0;}
 check(){if(!this.enabled())throw Error('Включите модуль «Почта» в «Подключениях».');}
 async json(url,options={}){this.check();const r=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error((r.status===401||data.error==='invalid_grant')?'Вход Outlook истёк. Подключите аккаунт заново.':r.status===403?'Microsoft не разрешил чтение Outlook. Организация может требовать согласие администратора.':'Outlook: запрос не выполнен (HTTP '+r.status+').');return data;}
 async token(params){return this.json('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...this.load().client,scope:SCOPES,...params}).toString()});}
 stop(){this.generation++;if(this.pending){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;}}
 disconnect(){this.stop();this.lastError='';const old=this.load();this.save({client:old.client});}
 async start(){this.check();this.stop();const generation=this.generation,client=this.load().client;if(!client)throw Error('Сначала импортируйте Application ID Microsoft в дополнительных настройках почты.');
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');let consumed=false;
  const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://127.0.0.1');
   if(req.method!=='GET'||u.pathname!=='/callback'||u.searchParams.get('state')!==state||consumed){res.writeHead(400);res.end('Недопустимый ответ авторизации.');return;}
   consumed=true;
   try{if(u.searchParams.has('error')||!u.searchParams.get('code'))throw Error('Вход отменён в Microsoft.');const tokens=await this.token({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect,code_verifier:verifier});
    if(generation!==this.generation)throw Error('Вход отменён.');this.check();if(!tokens.access_token||!tokens.refresh_token||!String(tokens.scope||'').split(' ').some(s=>s===SCOPE||s==='https://graph.microsoft.com/'+SCOPE))throw Error('Microsoft не предоставил постоянный доступ к чтению Outlook.');
    const profile=await this.json('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{Authorization:'Bearer '+tokens.access_token}});
    if(generation!==this.generation)throw Error('Вход отменён.');if(typeof (profile.mail||profile.userPrincipalName)!=='string'||!(profile.mail||profile.userPrincipalName).includes('@'))throw Error('Не удалось определить адрес Outlook.');
    this.save({client,email:(profile.mail||profile.userPrincipalName),tokens:{access_token:tokens.access_token,refresh_token:tokens.refresh_token,expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000}});this.lastError='';res.end('Outlook подключён. Вернитесь в Петю.');
   }catch(e){this.lastError=e.message;res.end(e.message);}finally{if(generation===this.generation)this.stop();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'localhost',resolve);});
  if(generation!==this.generation){server.close();throw Error('Вход отменён.');}
  const redirect='http://localhost:'+server.address().port+'/callback';
  this.pending={server,timer:setTimeout(()=>{this.lastError='Время входа истекло. Повторите подключение.';this.stop();},300000)};this.pending.timer.unref();this.lastError='';
  const url='https://login.microsoftonline.com/common/oauth2/v2.0/authorize?'+new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPES,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
  try{await this.open(url);}catch(e){this.stop();throw e;}return {pending:true};
 }
 async access(){this.check();const generation=this.generation,stored=this.load();if(!stored.tokens?.refresh_token)throw Error('Подключите Outlook через Microsoft в «Подключениях».');if(stored.tokens.expiresAt>Date.now()+60000)return stored.tokens.access_token;
  if(!this.refreshing)this.refreshing=(async()=>{const result=await this.token({grant_type:'refresh_token',refresh_token:stored.tokens.refresh_token});if(generation!==this.generation)throw Error('Подключение Outlook изменилось. Повторите запрос.');this.check();if(!result.access_token)throw Error('Microsoft не вернул токен доступа.');const tokens={access_token:result.access_token,refresh_token:result.refresh_token||stored.tokens.refresh_token,expiresAt:Date.now()+Number(result.expires_in||3600)*1000};this.save({...stored,tokens});return tokens.access_token;})().finally(()=>{this.refreshing=null;});return this.refreshing;
 }
 async read(recipe){const generation=this.generation,access=await this.access();
  const query=new URLSearchParams({'$top':'20','$select':'id,from,subject,receivedDateTime,bodyPreview,internetMessageHeaders','$orderby':'receivedDateTime desc','$filter':"receivedDateTime ge "+new Date(Date.now()-recipe.days*86400000).toISOString()+(recipe.unread?' and isRead eq false':'')});
  const data=await this.json('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?'+query,{headers:{Authorization:'Bearer '+access}});
  if(generation!==this.generation)throw Error('Подключение Outlook изменилось.');this.check();
  const messages=(data.value||[]).filter(m=>!recipe.skipPromotions||!(m.internetMessageHeaders||[]).some(h=>h.name.toLowerCase()==='list-unsubscribe')).map(m=>{const sender=m.from?.emailAddress||{},from=[sender.name,sender.address].filter(Boolean).join(' ');return {id:m.id,from:from.slice(0,500),subject:String(m.subject||'').slice(0,500),date:m.receivedDateTime,text:String(m.bodyPreview||'').slice(0,1500),priority:recipe.priority.some(s=>from.toLowerCase().includes(s.toLowerCase()))};});
  return {messages:messages.sort((a,b)=>Number(b.priority)-Number(a.priority)),partial:!!data['@odata.nextLink'],at:Date.now()};
 }
}
module.exports={Outlook,clientConfig};
