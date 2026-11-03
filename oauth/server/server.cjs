'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createBroker(config, fetcher = fetch) {
  const origin = new URL(config.origin).origin;
  const prefix = config.prefix || '', base = origin + prefix, name = config.name || 'atlassian', label = config.label || 'Atlassian';
  const callback = origin + '/oauth/' + name + '/callback';
  const cookieName = name === 'atlassian' ? 'petya_oauth' : 'petya_oauth_' + name;
  if (!origin.startsWith('https://')) throw new Error('HTTPS origin required');
  const key = Buffer.from(config.key, 'hex');
  if (key.length !== 32) throw new Error('32-byte encryption key required');
  const sessions = new Map(), refreshing = new Map();
  let records = {};
  const seal = value => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); };
  const open = bytes => { const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(12,28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()])); };
  if (fs.existsSync(config.file)) records = open(fs.readFileSync(config.file));
  const persist = () => { fs.mkdirSync(path.dirname(config.file), {recursive:true, mode:0o700}); const temp = config.file + '.tmp'; const fd = fs.openSync(temp,'w',0o600); try { fs.writeFileSync(fd,seal(records)); fs.fsyncSync(fd); } finally {fs.closeSync(fd);} fs.renameSync(temp,config.file); };
  const clean = () => { for(const [id,s] of sessions) if(s.expires < Date.now()) sessions.delete(id); };
  const provider = async (url, options) => { const r = await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)}); if(!r.ok) { const e = new Error('Atlassian request failed'); e.status = r.status === 400 || r.status === 401 ? 401 : 502; throw e; } return r.json(); };
  const token = async data => { if(config.adapter) return config.adapter.token(data, provider); const t = await provider('https://auth.atlassian.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:config.clientId,client_secret:config.clientSecret,...data})}); if(typeof t.access_token !== 'string' || !Number.isFinite(t.expires_in)) throw new Error('Invalid token response'); return {...t, expiresAt:Date.now()+t.expires_in*1000}; };
  async function access(id) {
    const r=records[id]; if(!r) throw Object.assign(new Error('Reconnect required'),{status:401});
    if(r.tokens.expiresAt > Date.now()+60000) return r.tokens.access_token;
    if(!refreshing.has(id)) refreshing.set(id,(async()=>{ const t=await token({grant_type:'refresh_token',refresh_token:r.tokens.refresh_token}); if(!t.refresh_token) throw new Error('Missing rotating refresh token'); if(records[id] !== r) throw Object.assign(new Error('Disconnected'),{status:401}); r.tokens=t; persist(); return t.access_token; })().finally(()=>refreshing.delete(id)));
    return refreshing.get(id);
  }
  const body = async req => { let data=''; for await(const chunk of req) {data+=chunk; if(data.length>8192) throw Object.assign(new Error('Too large'),{status:413});} return data ? JSON.parse(data) : {}; };
  const send = (res,status,value) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value));};
  const page = (res,status,title,content,headers={}) => {res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",...headers});res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:18px system-ui;max-width:640px;margin:10vh auto;padding:24px;background:#18211f;color:#eef4ef}button{padding:14px;background:#d3f496;border:0;border-radius:8px}code{font-size:28px}</style><h1>${escape(title)}</h1>${content}</html>`);};
  const session = (req,id) => { const s=sessions.get(id); if(!s || s.expires<Date.now() || hash((req.headers.authorization||'').replace(/^Bearer /,''))!==s.secretHash) throw Object.assign(new Error('Invalid session'),{status:401}); return s; };
  const connection = req => { const id=hash((req.headers.authorization||'').replace(/^Bearer /,'')); if(!records[id]) throw Object.assign(new Error('Reconnect required'),{status:401}); return id; };
  const server = http.createServer(async(req,res)=>{
    try {
      clean(); const url = new URL(req.url,origin), route=prefix && url.pathname.startsWith(prefix+'/') ? url.pathname.slice(prefix.length) : url.pathname;
      if(req.headers.origin && req.headers.origin!==origin) return send(res,403,{error:'Origin rejected'});
      if(route==='/health' && req.method==='GET') return send(res,200,{ok:true,oauthConfigured:!!config.clientId&&!!config.clientSecret});
      if(route==='/' && req.method==='GET') return page(res,200,'Петя — подключение Atlassian','<p>Начните подключение Jira и Confluence из приложения Петя.</p>');
      if(route==='/v1/sessions' && req.method==='POST') {
        if(!config.clientId || !config.clientSecret) return send(res,503,{error:'OAuth is not configured'});
        if(sessions.size>=1000 || Object.keys(records).length>=10000) return send(res,503,{error:'Capacity reached'});
        const id=random(),secret=random(),code=crypto.randomBytes(3).toString('hex').toUpperCase();
        sessions.set(id,{secretHash:hash(secret),code,expires:Date.now()+600000,status:'pending'});
        return send(res,201,{id,secret,code,url:base+'/authorize?id='+id});
      }
      if(route==='/authorize' && req.method==='GET') {
        const id=url.searchParams.get('id'),s=sessions.get(id); if(!s || s.status!=='pending') return page(res,400,'Ссылка устарела','<p>Начните вход заново в Пете.</p>');
        const cookie=random(); s.cookieHash=hash(cookie); s.form=random();
        return page(res,200,'Подключение Пети',`<p>Продолжайте только если вы начали вход в приложении Петя. Сверьте код в приложении:</p><p><code>${s.code}</code></p><form method="post" action="${prefix}/authorize"><input type="hidden" name="id" value="${id}"><input type="hidden" name="form" value="${s.form}"><button>Код совпадает — перейти в ${escape(label)}</button></form>`,{'Set-Cookie':`${cookieName}=${cookie}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`});
      }
      const browserSession = s => s && hash((req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'')===s.cookieHash;
      if(route==='/authorize' && req.method==='POST') {
        let raw=''; for await(const c of req) {raw+=c;if(raw.length>4096) throw new Error('Too large');} const form=new URLSearchParams(raw),id=form.get('id'),s=sessions.get(id);
        if(!browserSession(s) || s.form!==form.get('form') || s.status!=='pending') return page(res,403,'Вход отклонён','<p>Начните вход заново в Пете.</p>');
        s.state=random();s.status='authorizing';delete s.form;
        const q=new URLSearchParams({audience:'api.atlassian.com',client_id:config.clientId,scope:config.scopes,redirect_uri:callback,state:s.state,response_type:'code',prompt:'consent'});
        const destination=config.adapter ? config.adapter.authorize(s.state,callback) : 'https://auth.atlassian.com/authorize?'+q;
        return page(res,200,'Разрешение доступа',`<p>Код подтверждён. Продолжите вход на сайте ${escape(label)}.</p><p><a style="color:#d3f496" rel="noreferrer" href="${escape(destination)}">Продолжить в ${escape(label)}</a></p>`);
      }
      if(route==='/oauth/'+name+'/callback' && req.method==='GET') {
        const state=url.searchParams.get('state'),s=[...sessions.values()].find(s=>s.state===state&&s.status==='authorizing');
        if(!state || !browserSession(s)) return page(res,403,'Вход отклонён','<p>Недействительная сессия. Начните вход заново в Пете.</p>');
        delete s.state;s.status='exchanging';
        try {
          if(url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('Denied');
          s.tokens=await token({grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:callback});
          if(!s.tokens.refresh_token) throw new Error('Missing offline access');
          const sites=config.adapter ? await config.adapter.sites(s.tokens,provider) : await provider('https://api.atlassian.com/oauth/token/accessible-resources',{headers:{Authorization:'Bearer '+s.tokens.access_token}});
          s.sites=config.adapter ? sites : sites.filter(site=>typeof site.id==='string'&&/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(site.url)).map(({id,name,url,scopes})=>({id,name,url,scopes}));
          if(!s.sites.length) throw new Error('No sites');s.status='ready';
          return page(res,200,'Вход выполнен','<p>Вернитесь в приложение Петя для завершения подключения.</p>',{'Set-Cookie':`${cookieName}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`});
        } catch {s.status='failed';delete s.tokens;return page(res,400,'Подключение не завершено','<p>Вернитесь в Петю и повторите вход.</p>');}
      }
      const match=route.match(/^\/v1\/sessions\/([A-Za-z0-9_-]{43})(\/claim)?$/);
      if(match) {
        const s=session(req,match[1]);
        if(req.method==='GET'&&!match[2]) return send(res,200,{status:s.status,sites:s.status==='ready'?s.sites:undefined});
        if(req.method==='POST'&&match[2]) {
          const b=await body(req); if(s.status!=='ready') return send(res,409,{error:'Session is not ready'}); const site=s.sites.find(v=>v.id===b.siteId); if(!site) return send(res,400,{error:'Invalid site'});
          s.status='claimed'; const credential=random(),id=hash(credential);records[id]={site,tokens:s.tokens,created:Date.now()};persist();sessions.delete(match[1]);return send(res,200,{credential,site});
        }
      }
      if(route==='/v1/token' && req.method==='POST') {const id=connection(req),accessToken=await access(id);return send(res,200,{accessToken,expiresAt:records[id].tokens.expiresAt,site:records[id].site});}
      if(route==='/v1/connection' && req.method==='DELETE') {const id=connection(req);delete records[id];persist();return send(res,200,{ok:true});}
      return send(res,404,{error:'Not found'});
    } catch(e) { if(!res.headersSent) send(res,e.status||500,{error:e.status===401?'Reconnect required':'Request failed'});else res.end(); }
  });
  return server;
}
if(require.main===module) createBroker({origin:process.env.PUBLIC_ORIGIN,key:process.env.TOKEN_ENCRYPTION_KEY,file:process.env.TOKEN_STORE||'/var/lib/petya-auth/tokens.enc',clientId:process.env.ATLASSIAN_CLIENT_ID,clientSecret:process.env.ATLASSIAN_CLIENT_SECRET,scopes:process.env.ATLASSIAN_SCOPES||'read:jira-work write:jira-work read:jira-user search:confluence offline_access'}).listen(Number(process.env.PORT)||8787,'127.0.0.1');
module.exports={createBroker};
