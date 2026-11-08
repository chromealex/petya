// «API-клиент», requests: what the user asked for in the chat («дерни GET https://…», «отправь POST на /login с
// телом {…}», a pasted curl command), which header values are secrets (masked in every card and never shown back),
// and the request as a curl command with secrets replaced by shell variables.
const METHODS=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
const SECRET_NAME=/^(?:authorization|proxy-authorization|cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token|x-csrf-token|private-token|x-.*-(?:key|token|secret))$|token|secret|passw|api[-_]?key/i;
const SECRET_QUERY=/^(?:api[-_]?key|apikey|access[-_]?token|token|key|secret|password|sig|signature|auth|client_secret)$/i;
const isSecretHeader=name=>SECRET_NAME.test(String(name||''));

// «Bearer abc» → «Bearer ••••••»; anything else → «••••••».
function mask(value){
 const v=String(value||'');
 const m=/^(Bearer|Basic|Token|Digest|Bot|ApiKey)\s+\S/i.exec(v);
 return m?m[1]+' ••••••':'••••••';
}
// A URL for display: secret-looking query parameters and user:password are masked.
function maskUrl(url){
 try{
  const u=new URL(url);
  if(u.username||u.password){u.username='';u.password='';}
  for(const key of [...u.searchParams.keys()])if(SECRET_QUERY.test(key))u.searchParams.set(key,'SECRET');
  return u.toString().replace(/=SECRET(?=&|$|#)/g,'=••••••');
 }catch{return String(url||'');}
}

// Splits a shell-like command line: quotes, escapes, line continuations. No expansion of anything.
function words(text){
 const out=[];let cur='',quote=null,has=false;
 const s=String(text||'').replace(/\\\r?\n/g,' ');
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quote==="'"){if(c==="'")quote=null;else cur+=c;continue;}
  if(quote==='"'){if(c==='"')quote=null;else if(c==='\\'&&/["\\$`]/.test(s[i+1]||'')){cur+=s[++i];}else cur+=c;continue;}
  if(c==="'"||c==='"'){quote=c;has=true;continue;}
  if(c==='\\'&&i+1<s.length){cur+=s[++i];has=true;continue;}
  if(/\s/.test(c)){if(cur||has)out.push(cur);cur='';has=false;continue;}
  cur+=c;
 }
 if(cur||has)out.push(cur);
 return out;
}

// A pasted curl command → {method, url, headers, body}. Unknown options are ignored and reported.
function parseCurl(text){
 const start=String(text||'').search(/(?:^|\s)curl\s/);
 if(start<0)return null;
 const w=words(String(text).slice(start).trim());
 if(w[0]!=='curl')return null;
 const req={method:'',url:'',headers:[],body:'',ignored:[],insecure:false};
 let get=false;
 const header=h=>{const i=h.indexOf(':');if(i>0)req.headers.push({name:h.slice(0,i).trim(),value:h.slice(i+1).trim()});};
 for(let i=1;i<w.length;i++){
  const a=w[i],next=()=>w[++i]??'';
  if(a==='-X'||a==='--request')req.method=next().toUpperCase();
  else if(/^-X[A-Z]+$/.test(a))req.method=a.slice(2);
  else if(a==='-H'||a==='--header')header(next());
  else if(['-d','--data','--data-raw','--data-binary','--data-ascii'].includes(a)){const v=next();if(v.startsWith('@'))req.ignored.push(a+' '+v);else req.body=req.body?req.body+'&'+v:v;}
  else if(a==='--data-urlencode'){const v=next();req.body=(req.body?req.body+'&':'')+v.replace(/=(.*)$/,(m,x)=>'='+encodeURIComponent(x));}
  else if(a==='--json'){req.body=next();req.headers.push({name:'Content-Type',value:'application/json'},{name:'Accept',value:'application/json'});}
  else if(a==='-u'||a==='--user'){req.headers.push({name:'Authorization',value:'Basic '+Buffer.from(next()).toString('base64')});}
  else if(a==='-b'||a==='--cookie'){const v=next();if(v.includes('='))req.headers.push({name:'Cookie',value:v});else req.ignored.push(a+' '+v);}
  else if(a==='-A'||a==='--user-agent')req.headers.push({name:'User-Agent',value:next()});
  else if(a==='-e'||a==='--referer')req.headers.push({name:'Referer',value:next()});
  else if(a==='-I'||a==='--head')req.method='HEAD';
  else if(a==='-G'||a==='--get')get=true;
  else if(a==='--url')req.url=next();
  else if(a==='-k'||a==='--insecure')req.insecure=true;
  else if(['-L','--location','-s','--silent','-S','--show-error','-v','--verbose','-i','--include','--compressed','-f','--fail','-sS','-sL','-Ls','-sSL'].includes(a)){/* behaviour Petya has anyway */}
  else if(['-o','--output','-w','--write-out','-m','--max-time','--connect-timeout','-x','--proxy','--cacert','--cert','--key','-F','--form'].includes(a))req.ignored.push(a+' '+next());
  else if(a.startsWith('-'))req.ignored.push(a);
  else if(!req.url)req.url=a;
 }
 if(get&&req.body){try{const u=new URL(req.url);u.search=(u.search?u.search.slice(1)+'&':'')+req.body;req.url=u.toString();}catch{/* invalid url reported later */}req.body='';}
 if(!req.method)req.method=req.body?'POST':'GET';
 if(req.body&&!req.headers.some(h=>/^content-type$/i.test(h.name)))req.headers.push({name:'Content-Type',value:'application/x-www-form-urlencoded'});
 return req;
}

// The JSON value that starts at `from` (balanced braces, strings respected).
function balanced(s,from){
 const open=s[from],close=open==='{'?'}':']';let depth=0,inStr=false;
 for(let i=from;i<s.length;i++){
  const c=s[i];
  if(inStr){if(c==='\\')i++;else if(c==='"')inStr=false;continue;}
  if(c==='"')inStr=true;else if(c===open)depth++;else if(c===close&&--depth===0)return s.slice(from,i+1);
 }
 return null;
}
const URL_RE=/https?:\/\/[^\s«»"'<>`]+/i;
const HOSTLIKE=/(?:^|\s)((?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|ru|me|cloud|local|internal|test|example)(?::\d+)?(?:\/[^\s«»"'<>`]*)?)(?=$|[\s,.;!?])/i;
const PATH_RE=/(?:^|[\s«"'(])(\/[A-Za-z0-9_\-./{}%?=&:~+,@!$*]*)(?=$|[\s»"'),;!?])/;

// A request phrased in the chat. Returns what was said; resolving the environment is done by the caller.
function parseChat(text){
 const s=String(text||'');
 const curl=parseCurl(s);
 if(curl)return {...curl,from:'curl'};
 const methodWord=new RegExp('(?:^|[^A-Za-z])('+METHODS.join('|')+')(?=$|[^A-Za-z])').exec(s);
 let method=methodWord?methodWord[1]:'';
 if(!method){
  if(/(?:^|[^\p{L}])(?:запости|post-?запрос\p{L}*|пост-?запрос\p{L}*)/iu.test(s))method='POST';
  else if(/(?:^|[^\p{L}])(?:delete-?запрос\p{L}*)/iu.test(s))method='DELETE';
 }
 const url=URL_RE.exec(s)?.[0]?.replace(/[.,;:!?)»]+$/,'')||'';
 const host=!url?HOSTLIKE.exec(s)?.[1]?.replace(/[.,;:!?)»]+$/,''):'';
 const pathMatch=!url&&!host?PATH_RE.exec(s):null;
 const path=pathMatch?pathMatch[1].replace(/[.,;:!?)]+$/,''):'';
 // Body: the JSON after «с телом» / «тело:» / «body», or the first JSON object in the message.
 let body='';
 const bodyAt=/(?:с телом|тело(?:м)?\s*:|body\s*:?|с данными|payload\s*:?)\s*/iu.exec(s);
 const searchFrom=bodyAt?bodyAt.index+bodyAt[0].length:0;
 const brace=s.slice(searchFrom).search(/[{[]/);
 if(brace>=0&&(bodyAt||s[searchFrom+brace]==='{')){body=balanced(s,searchFrom+brace)||'';}
 if(!body&&bodyAt){const rest=s.slice(searchFrom).trim();if(rest&&!/^(?:https?:|\/)/.test(rest))body=rest.split(/\n(?=[A-Za-z-]+:)/)[0].trim();}
 // Headers: «с заголовком X-Trace: 1», «заголовки: A: 1, B: 2», or «Name: value» lines.
 const headers=[];
 const hBlock=/заголовк\p{L}*\s*:?\s*([\s\S]+?)(?=$|\s+(?:с телом|тело|body)\b)/iu.exec(s);
 const source=(hBlock?hBlock[1]:'')+'\n'+s.split('\n').slice(1).join('\n');
 for(const m of source.matchAll(/(?:^|[\n,;]\s*)([A-Za-z][A-Za-z0-9-]{1,60})\s*:\s*([^\n,;]+)/g)){
  if(/^(?:https?|body|payload|url|method|get|post|put|patch|delete|head|options)$/i.test(m[1]))continue;
  if(!headers.some(h=>h.name.toLowerCase()===m[1].toLowerCase()))headers.push({name:m[1],value:m[2].trim()});
 }
 if(body&&!headers.some(h=>/^content-type$/i.test(h.name))&&/^[{[]/.test(body))headers.push({name:'Content-Type',value:'application/json'});
 return {method:method||(body?'POST':'GET'),url:url||(host?'https://'+host:''),path,headers,body,from:'chat'};
}

// curl for «Скопировать как curl»: secrets become shell variables ($AUTHORIZATION) instead of values.
const shellQuote=v=>"'"+String(v).replace(/'/g,"'\\''")+"'";
const varName=name=>String(name).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'SECRET';
function toCurl({method,url,headers=[],body=''}){
 const parts=['curl'];
 if(method&&method!=='GET'&&!(method==='HEAD'))parts.push('-X',method);
 if(method==='HEAD')parts.push('-I');
 let shownUrl=url;
 try{const u=new URL(url);const secret=[...u.searchParams.keys()].filter(k=>SECRET_QUERY.test(k));
  for(const k of secret)u.searchParams.set(k,'__'+varName(k)+'__');
  shownUrl=u.toString().replace(/__([A-Z0-9_]+)__/g,(m,v)=>'$'+v);
  parts.push(secret.length?'"'+shownUrl.replace(/"/g,'\\"')+'"':shellQuote(shownUrl));}
 catch{parts.push(shellQuote(url));}
 for(const h of headers){
  if(h.secret||isSecretHeader(h.name)){const scheme=/^(Bearer|Basic|Token|Digest|Bot|ApiKey)\s/i.exec(h.real??h.value)?.[1];parts.push('-H','"'+h.name+': '+(scheme?scheme+' ':'')+'$'+varName(h.name)+'"');}
  else parts.push('-H',shellQuote(h.name+': '+h.value));
 }
 if(body)parts.push('--data-raw',shellQuote(body));
 return parts.join(' ');
}
module.exports={METHODS,parseChat,parseCurl,words,mask,maskUrl,isSecretHeader,toCurl,balanced,SECRET_QUERY};
