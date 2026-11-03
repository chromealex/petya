const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
function clientConfig(raw){const c=JSON.parse(raw)?.installed;if(!c||!/^[-\w.]+\.apps\.googleusercontent\.com$/.test(c.client_id)||typeof c.client_secret!=='string'||c.client_secret.length>1000)throw Error('Нужен JSON OAuth-клиента Google типа Desktop app.');return {client_id:c.client_id,client_secret:c.client_secret};}
class Gmail{
 constructor({load,save,enabled,open,fetcher=fetch}){Object.assign(this,{load,save,enabled,open,fetcher});this.generation=0;}
 check(){if(!this.enabled())throw Error('Включите модуль Gmail в «Подключениях».');}
 async json(url,options={}){this.check();const r=await this.fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error((r.status===401||data.error==='invalid_grant')?'Вход Gmail истёк. Подключите аккаунт заново.':r.status===403?'Google не разрешил чтение Gmail. Проверьте Gmail API и доступ приложения.':'Gmail: запрос не выполнен (HTTP '+r.status+').');return data;}
 async token(params){return this.json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...this.load().client,...params}).toString()});}
 stop(){this.generation++;if(this.pending){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;}}
 disconnect(){this.stop();this.lastError='';const old=this.load();this.save({client:old.client});}
 async start(){this.check();this.stop();const generation=this.generation,client=this.load().client;if(!client)throw Error('Сначала импортируйте OAuth JSON Google Desktop app в карточке Gmail.');
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');let consumed=false;
  const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');const u=new URL(req.url,'http://127.0.0.1');
   if(req.method!=='GET'||u.pathname!=='/callback'||u.searchParams.get('state')!==state||consumed){res.writeHead(400);res.end('Недопустимый ответ авторизации.');return;}
   consumed=true;
   try{if(u.searchParams.has('error')||!u.searchParams.get('code'))throw Error('Вход отменён в Google.');const tokens=await this.token({grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect,code_verifier:verifier});
    if(generation!==this.generation)throw Error('Вход отменён.');this.check();if(!tokens.access_token||!tokens.refresh_token||!String(tokens.scope||'').split(' ').includes(SCOPE))throw Error('Google не предоставил постоянный доступ к чтению Gmail.');
    const profile=await this.json('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+tokens.access_token}});
    if(generation!==this.generation)throw Error('Вход отменён.');if(typeof profile.emailAddress!=='string'||!profile.emailAddress.includes('@'))throw Error('Не удалось определить адрес Gmail.');
    this.save({client,email:profile.emailAddress,tokens:{access_token:tokens.access_token,refresh_token:tokens.refresh_token,expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000}});this.lastError='';res.end('Gmail подключён. Вернитесь в Петю.');
   }catch(e){this.lastError=e.message;res.end(e.message);}finally{if(generation===this.generation)this.stop();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect='http://127.0.0.1:'+server.address().port+'/callback';
  this.pending={server,timer:setTimeout(()=>{this.lastError='Время входа истекло. Повторите подключение.';this.stop();},300000)};this.pending.timer.unref();this.lastError='';
  const url='https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:SCOPE,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'});
  try{await this.open(url);}catch(e){this.stop();throw e;}return {pending:true};
 }
 async access(){this.check();const generation=this.generation,stored=this.load();if(!stored.tokens?.refresh_token)throw Error('Подключите Gmail через Google в «Подключениях».');if(stored.tokens.expiresAt>Date.now()+60000)return stored.tokens.access_token;
  if(!this.refreshing)this.refreshing=(async()=>{const result=await this.token({grant_type:'refresh_token',refresh_token:stored.tokens.refresh_token});if(generation!==this.generation)throw Error('Подключение Gmail изменилось. Повторите запрос.');this.check();if(!result.access_token)throw Error('Google не вернул токен доступа.');const tokens={access_token:result.access_token,refresh_token:result.refresh_token||stored.tokens.refresh_token,expiresAt:Date.now()+Number(result.expires_in||3600)*1000};this.save({...stored,tokens});return tokens.access_token;})().finally(()=>{this.refreshing=null;});return this.refreshing;
 }
 async read(recipe){const generation=this.generation,access=await this.access();const headers={Authorization:'Bearer '+access};const q=['in:inbox','newer_than:'+recipe.days+'d',recipe.unread?'is:unread':'',recipe.skipPromotions?'-category:promotions -category:social':''].filter(Boolean).join(' ');
  const list=await this.json('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q,maxResults:'20'}),{headers});const messages=[];
  for(const item of list.messages||[]){if(generation!==this.generation)throw Error('Подключение Gmail изменилось. Повторите запрос.');if(!/^[a-f0-9]+$/i.test(item.id))throw Error('Gmail вернул неверный ID письма.');const m=await this.json('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+item.id+'?format=full',{headers});const get=name=>(m.payload?.headers||[]).find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||'';
   if(recipe.skipPromotions&&get('List-Unsubscribe'))continue;
   const parts=[];const walk=(p,depth=0)=>{if(!p||depth>10)return;if(p.mimeType==='text/plain'&&p.body?.data&&!p.filename)parts.push(Buffer.from(p.body.data,'base64url').toString('utf8').slice(0,6000));for(const child of p.parts||[])walk(child,depth+1);};walk(m.payload);
   messages.push({id:m.id,from:get('From').slice(0,500),subject:get('Subject').slice(0,500),date:get('Date').slice(0,100),text:(parts.join('\n')||m.snippet||'').slice(0,1500),priority:recipe.priority.some(s=>get('From').toLocaleLowerCase().includes(s.toLocaleLowerCase()))});
  }
  if(generation!==this.generation)throw Error('Подключение Gmail изменилось.');this.check();return {messages:messages.sort((a,b)=>Number(b.priority)-Number(a.priority)),partial:!!list.nextPageToken,query:q,at:Date.now()};
 }
}
module.exports={Gmail,clientConfig};
