// «Мониторинг», endpoint discovery: which servers a project (a Unity game, a service) talks to, found in its files
// by code — no model, no network. Bounded walk of the project folders (ignore rules, .gitignore, size caps,
// binaries skipped), then:
//  - C# scripts: csharp.cjs (constants, concatenation, interpolation, #if branches, env mappings, SerializeField);
//  - Unity YAML (.unity/.prefab/.asset): values serialized for a script's fields (matched by the script GUID from its
//    .meta and the field name), Addressables profile values, any URL; ProjectSettings.asset scriptingDefineSymbols
//    per platform (which #if branch is compiled where);
//  - config and build files (JSON/YAML/TOML/INI/.env(.example)/properties/Gradle/AndroidManifest/Info.plist/
//    xcconfig/Dockerfile/compose/k8s/CI): URLs, host:port pairs, base-URL keys.
// Each address: category (own / cdn / third-party with vendor and type), environments (prod/staging/dev from file
// names, variable names, #if symbols, env keys and host names), provenance file:line per resolved piece, and
// placeholders for parts known only at run time. Credentials in URLs (user:password@, token-like query values,
// secret-looking path pieces) are redacted before anything leaves this module.
const fs=require('node:fs'),path=require('node:path');
const CS=require('./csharp.cjs');

const LIMITS={files:20000,fileBytes:1024*1024,totalBytes:150*1024*1024,depth:14,results:400,sources:12};
const SKIP_DIRS=new Set(['node_modules','.git','.svn','.hg','Library','Temp','temp','Obj','obj','Logs','UserSettings','MemoryCaptures','Build','Builds','build','dist','out','bin',
 '.gradle','.idea','.vs','.vscode','Pods','DerivedData','.next','.nuxt','.cache','coverage','__pycache__','venv','.venv','target','vendor','PackageCache','StreamingAssets~','.terraform','.pytest_cache']);
const TEXT_EXT=new Set(['.cs','.unity','.prefab','.asset','.json','.yaml','.yml','.toml','.ini','.cfg','.conf','.properties','.gradle','.kts','.xml','.plist','.xcconfig','.env',
 '.js','.mjs','.cjs','.ts','.py','.go','.sh','.tf','.tfvars','.hcl','.config','.txt']);
const NAMED=/^(?:dockerfile(?:\..+)?|docker-compose.*|compose.*|jenkinsfile|\.env(?:\..+)?|makefile|procfile|\.gitlab-ci\.yml|androidmanifest\.xml|info\.plist|gradle\.properties)$/i;
const ENV_FILE=/(?:^|[._-])(prod|production|live|release|stage|staging|stg|preprod|uat|qa|dev|develop|development|debug|local|test|sandbox)(?=[._-]|$)/i;

// --- .gitignore (a practical subset: globs, **, leading /, trailing /, negation) ------------------------------------
function gitignore(text,base){
 const rules=[];
 for(let line of String(text||'').split(/\r?\n/)){
  line=line.replace(/\s+$/,'');if(!line||line.startsWith('#'))continue;
  let neg=false;if(line.startsWith('!')){neg=true;line=line.slice(1);}
  const dir=line.endsWith('/');if(dir)line=line.slice(0,-1);
  const anchored=line.startsWith('/')||line.slice(0,-1).includes('/');line=line.replace(/^\//,'');
  let re='';for(let i=0;i<line.length;i++){const c=line[i];if(c==='*'&&line[i+1]==='*'){re+=line[i+2]==='/'?'(?:.*/)?':'.*';i+=line[i+2]==='/'?2:1;}else if(c==='*')re+='[^/]*';else if(c==='?')re+='[^/]';else re+=c.replace(/[.+^${}()|[\]\\]/g,'\\$&');}
  rules.push({neg,dir,re:new RegExp((anchored?'^':'(?:^|/)')+re+'(?:/.*)?$')});
 }
 return {base,rules};
}
function ignored(lists,full,isDir){
 let out=false;
 for(const {base,rules} of lists){
  const rel=path.relative(base,full).split(path.sep).join('/');if(!rel||rel.startsWith('..'))continue;
  for(const r of rules){if(r.dir&&!isDir&&!r.re.source.includes('(?:/.*)?'))continue;if(r.re.test(rel)&&(!r.dir||isDir||rel.includes('/')))out=!r.neg;}
 }
 return out;
}

// --- Walk ---------------------------------------------------------------------------------------------------------
// → [{root, file (absolute), rel}] of text candidates, with counters; `progress({files, bytes, stage})` is called.
function walk(roots,{limits=LIMITS,progress=()=>{}}={}){
 const out=[],stats={files:0,bytes:0,skipped:0,ignored:0,binary:0,cut:false};
 for(const root of roots){
  let st;try{st=fs.statSync(root);}catch{continue;}if(!st.isDirectory())continue;
  const lists=[];
  const visit=(dir,depth)=>{
   if(depth>limits.depth||stats.cut)return;
   const gi=path.join(dir,'.gitignore');try{if(fs.existsSync(gi))lists.push(gitignore(fs.readFileSync(gi,'utf8'),dir));}catch{}
   let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
   entries.sort((a,b)=>a.name.localeCompare(b.name));
   for(const e of entries){
    if(stats.cut)return;
    const full=path.join(dir,e.name);
    if(e.isSymbolicLink())continue;
    if(e.isDirectory()){
     if(SKIP_DIRS.has(e.name)||e.name.startsWith('.')&&!['.github','.gitlab','.circleci','.buildkite','.teamcity'].includes(e.name)){stats.ignored++;continue;}
     if(ignored(lists,full,true)){stats.ignored++;continue;}
     visit(full,depth+1);continue;
    }
    if(!e.isFile())continue;
    const ext=path.extname(e.name).toLowerCase();
    if(!TEXT_EXT.has(ext)&&!NAMED.test(e.name)&&!(e.name.endsWith('.meta')&&/\.cs\.meta$/.test(e.name))){stats.skipped++;continue;}
    if(ignored(lists,full,false)){stats.ignored++;continue;}
    let size=0;try{size=fs.statSync(full).size;}catch{continue;}
    if(size>limits.fileBytes){stats.skipped++;continue;}
    if(stats.bytes+size>limits.totalBytes||out.length>=limits.files){stats.cut=true;return;}
    stats.bytes+=size;stats.files++;
    out.push({root,file:full,rel:path.relative(root,full).split(path.sep).join('/'),size});
    if(stats.files%500===0)progress({files:stats.files,bytes:stats.bytes,stage:'walk'});
   }
  };
  visit(root,0);
 }
 return {files:out,stats};
}
function read(file){
 try{const buf=fs.readFileSync(file);if(buf.subarray(0,8192).includes(0))return null;return buf.toString('utf8');}catch{return null;}
}

// --- Redaction ----------------------------------------------------------------------------------------------------
const SECRET_PARAM=/^(?:.*token.*|.*secret.*|.*passw.*|pwd|pass|key|apikey|api[-_]?key|access[-_]?key|auth|authorization|sig|signature|session|sessionid|sid|code|client[-_]?secret|private[-_]?key|x-amz-signature|x-amz-credential|x-goog-signature|credential)$/i;
const SECRETISH=s=>s.length>=24&&/[a-z]/i.test(s)&&/\d/.test(s)&&/^[A-Za-z0-9_\-+=/.]+$/.test(s)&&!/^v\d+$/.test(s);
function redact(text){
 let t=String(text);
 // user:password@ and user@ in any scheme://
 t=t.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:"'{}]+)(?::[^\s/@"']*)?@/gi,'$1***@');
 // token-like query values
 t=t.replace(/([?&;])([^=&#\s"']+)=([^&#\s"']*)/g,(m,sep,k,v)=>SECRET_PARAM.test(k)&&v&&v!=='***'&&!/^\{[^}]*\}$/.test(v)?sep+k+'=***':m);
 // secret-looking path pieces (long mixed tokens), but not hosts
 t=t.replace(/(\/)([A-Za-z0-9_\-+=.]{24,})(?=[/?#\s"']|$)/g,(m,s,v)=>SECRETISH(v)&&!/\.[a-z]{2,4}$/i.test(v)?s+'***':m);
 return t;
}
// A line snippet for provenance: trimmed, with secrets from KEY=value / "key": "value" assignments masked.
function snippet(line){
 return redact(String(line||'').trim().slice(0,200)).replace(/((?:token|secret|password|passwd|api[-_]?key|private[-_]?key|client[-_]?secret)[\w-]*["']?\s*[:=]\s*["']?)([^"'\s,;]+)/gi,'$1***');
}

// --- Classification -------------------------------------------------------------------------------------------------
// Known third-party endpoints by domain suffix: [suffix, vendor, type].
const THIRD=[
 ['google-analytics.com','Google Analytics','analytics'],['analytics.google.com','Google Analytics','analytics'],['app-measurement.com','Firebase Analytics','analytics'],
 ['firebaseio.com','Firebase','backend'],['firebaseapp.com','Firebase','backend'],['firebaselogging.googleapis.com','Firebase','analytics'],['crashlytics.com','Crashlytics','crash'],['firebasecrashlytics.googleapis.com','Crashlytics','crash'],
 ['appsflyer.com','AppsFlyer','attribution'],['appsflyersdk.com','AppsFlyer','attribution'],['adjust.com','Adjust','attribution'],['adjust.io','Adjust','attribution'],['branch.io','Branch','attribution'],['kochava.com','Kochava','attribution'],['singular.net','Singular','attribution'],
 ['amplitude.com','Amplitude','analytics'],['mixpanel.com','Mixpanel','analytics'],['gameanalytics.com','GameAnalytics','analytics'],['devtodev.com','devtodev','analytics'],['segment.io','Segment','analytics'],['segment.com','Segment','analytics'],
 ['appmetrica.yandex.net','AppMetrica','analytics'],['appmetrica.yandex.com','AppMetrica','analytics'],['mc.yandex.ru','Яндекс Метрика','analytics'],['ads.mobile.yandex.net','Yandex Ads','ads'],
 ['applovin.com','AppLovin','ads'],['applvn.com','AppLovin','ads'],['unityads.unity3d.com','Unity Ads','ads'],['unityads.unity.com','Unity Ads','ads'],['ironsrc.com','ironSource','ads'],['ironsrc.mobi','ironSource','ads'],['supersonicads.com','ironSource','ads'],
 ['admob.com','AdMob','ads'],['googleads.g.doubleclick.net','Google Ads','ads'],['doubleclick.net','Google Ads','ads'],['googlesyndication.com','Google Ads','ads'],['googleadservices.com','Google Ads','ads'],
 ['facebook.com','Meta','ads'],['facebook.net','Meta','ads'],['fbcdn.net','Meta','cdn'],['vungle.com','Vungle','ads'],['chartboost.com','Chartboost','ads'],['inmobi.com','InMobi','ads'],['mintegral.com','Mintegral','ads'],['pangle.io','Pangle','ads'],['bytedance.com','Pangle','ads'],
 ['stripe.com','Stripe','payments'],['paypal.com','PayPal','payments'],['xsolla.com','Xsolla','payments'],['revenuecat.com','RevenueCat','payments'],['play.googleapis.com','Google Play','payments'],['androidpublisher.googleapis.com','Google Play','payments'],
 ['buy.itunes.apple.com','App Store','payments'],['sandbox.itunes.apple.com','App Store','payments'],['apps.apple.com','App Store','store'],['play.google.com','Google Play','store'],
 ['sentry.io','Sentry','crash'],['bugsnag.com','Bugsnag','crash'],['backtrace.io','Backtrace','crash'],['onesignal.com','OneSignal','push'],['pushwoosh.com','Pushwoosh','push'],['fcm.googleapis.com','Firebase Cloud Messaging','push'],
 ['playfabapi.com','PlayFab','backend'],['playfab.com','PlayFab','backend'],['photonengine.io','Photon','multiplayer'],['exitgames.com','Photon','multiplayer'],['nakama.io','Nakama Cloud','backend'],['gamesparks.net','GameSparks','backend'],
 ['services.api.unity.com','Unity Gaming Services','backend'],['cloud.unity3d.com','Unity Cloud','backend'],['unity3d.com','Unity','platform'],['googleapis.com','Google','platform'],['apple.com','Apple','platform'],
 ['steampowered.com','Steam','platform'],['steamcommunity.com','Steam','platform'],['epicgames.com','Epic','platform'],['discord.com','Discord','platform'],['twitter.com','X','platform'],['x.com','X','platform']
];
const CDN=[/(?:^|\.)cloudfront\.net$/,/(?:^|\.)akamai(?:hd|zed|edge)?\.net$/,/(?:^|\.)fastly\.net$/,/(?:^|\.)azureedge\.net$/,/(?:^|\.)b-cdn\.net$/,/(?:^|\.)r2\.dev$/,/(?:^|\.)cdn\.cloudflare\.net$/,
 /(?:^|\.)digitaloceanspaces\.com$/,/(?:^|\.)blob\.core\.windows\.net$/,/^storage\.googleapis\.com$/,/(?:^|\.)firebasestorage\.(?:app|googleapis\.com)$/,/(?:^|\.)s3[.-][a-z0-9.-]*amazonaws\.com$/,/(?:^|\.)s3\.amazonaws\.com$/,
 /(?:^|[.-])cdn\d*[.-]/,/^cdn\d*\./,/(?:^|[.-])(?:assets|static|bundles|content|media|storage)\d*[.-]/];
// Links that are documentation or XML namespaces, not servers the game talks to.
const NOISE=/^(?:schemas\.android\.com|schemas\.microsoft\.com|www\.w3\.org|w3\.org|xmlns\.com|json-schema\.org|schema\.org|www\.apple\.com\/DTDs|apple\.com\/DTDs|developer\.apple\.com|developer\.android\.com|docs\.unity3d\.com|docs\.unity\.com|learn\.microsoft\.com|docs\.microsoft\.com|msdn\.microsoft\.com|github\.com|gist\.github\.com|raw\.githubusercontent\.com|stackoverflow\.com|en\.wikipedia\.org|www\.apache\.org|apache\.org|opensource\.org|creativecommons\.org|example\.com|example\.org|www\.example\.com|unity3d\.com\/legal|forum\.unity\.com|assetstore\.unity\.com|semver\.org|yaml\.org|go\.microsoft\.com|aka\.ms|nuget\.org|www\.nuget\.org|npmjs\.com|www\.npmjs\.com|registry\.npmjs\.org|packages\.unity\.com|download\.unity3d\.com|maven\.google\.com|dl\.google\.com|repo\.maven\.apache\.org|jcenter\.bintray\.com|plugins\.gradle\.org|services\.gradle\.org|gradle\.org|maven\.pkg\.github\.com|jitpack\.io|cocoapods\.org|cdn\.cocoapods\.org|ns\.adobe\.com|purl\.org|www\.gnu\.org|tools\.ietf\.org|datatracker\.ietf\.org)$/i;
function hostOf(text){
 const m=/^(?:([a-z][a-z0-9+.-]*):\/\/)?(?:[^@/\s]*@)?(\[[^\]]+\]|[^/:?#\s]+)(?::(\d+|\{[^}]+\}))?/i.exec(text);
 return m?{scheme:(m[1]||'').toLowerCase(),host:m[2].toLowerCase(),port:m[3]||''}:{scheme:'',host:'',port:''};
}
function classify(host){
 if(!host||host.startsWith('{'))return {category:'own'};
 for(const [suffix,vendor,type] of THIRD)if(host===suffix||host.endsWith('.'+suffix))return {category:type==='cdn'?'cdn':'third',vendor,type};
 if(CDN.some(r=>r.test(host)))return {category:'cdn'};
 return {category:'own'};
}
const ENV_WORDS=[['prod',/(?:^|[^a-z])(?:prod|production|live|prd)(?:[^a-z]|$)/i],['staging',/(?:^|[^a-z])(?:stage|staging|stg|preprod|pre-prod|uat|qa|beta)(?:[^a-z]|$)/i],
 ['dev',/(?:^|[^a-z])(?:dev|develop|development|test|testing|sandbox|local|debug)(?:[^a-z]|$)/i]];
// Splits camelCase / snake for names: «ProdApiUrl» → «prod api url».
const words=s=>String(s||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_.\-:"]/g,' ').toLowerCase();
function envOfWords(s){const w=' '+words(s)+' ';for(const [env,r] of ENV_WORDS)if(r.test(w))return env;return null;}
function envOfHost(host){
 if(!host)return null;
 if(/^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/.test(host)||/\.local$|\.lan$|\.internal$/.test(host))return 'dev';
 const labels=host.split('.').slice(0,-1).join(' ');
 return envOfWords(labels.replace(/-/g,' '));
}

// --- Generic extractors (configs, manifests, build files, YAML) --------------------------------------------------
const URL_RE=/\b(?:https?|wss?|grpcs?|tcp|udp):\/\/[^\s"'<>`)\]};,|\\]+/gi;
const HOSTPORT_RE=/(?:^|[\s"'=:(,[])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}|\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})(?=[\s"',;)\]}/]|$)/gi;
const KEY_RE=/(?:^|[\s"'{,])([A-Za-z_][\w.-]*?(?:url|uri|host|hostname|endpoint|server|domain|address|base|api|cdn|backend|gateway)[\w-]*)["']?\s*[:=]\s*["']?([a-z0-9][a-z0-9.-]*\.[a-z]{2,24}(?::\d{2,5})?)(?=["'\s,;}]|$)/gi;
function generic(text,rel,{yaml=false}={}){
 const out=[];
 const lines=text.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(line.length>4000)continue;
  // A YAML/INI/env key on this line names the variable for env detection.
  const key=(/^\s*-?\s*["']?([A-Za-z_][\w.-]*)["']?\s*[:=]/.exec(line)||[])[1]||'';
  for(const m of line.matchAll(URL_RE)){let u=m[0].replace(/[.,;:]+$/,'');
   // Unity profile tokens: «…/[BuildTarget]» keeps its closing bracket.
   if(/\[[^\]]*$/.test(u)&&line[m.index+m[0].length]===']')u+=']';
   out.push({text:u,file:rel,line:i+1,name:key,kind:'url',snippet:snippet(line)});}
  for(const m of line.matchAll(HOSTPORT_RE)){
   if(/:\/\//.test(line.slice(Math.max(0,m.index-12),m.index+m[0].length)))continue;
   if(/^\d+\.\d+\.\d+\.\d+$/.test(m[1])===false&&!/[a-z]/i.test(m[1]))continue;
   out.push({text:m[1]+':'+m[2],file:rel,line:i+1,name:key,kind:'host',snippet:snippet(line)});
  }
  if(!yaml||/(?:url|host|server|endpoint|domain|address)/i.test(key))for(const m of line.matchAll(KEY_RE)){if(/:\/\//.test(line))continue;out.push({text:m[2],file:rel,line:i+1,name:m[1],kind:'host',snippet:snippet(line)});}
 }
 return out;
}

// --- Unity YAML ---------------------------------------------------------------------------------------------------
// Script GUIDs: `<Script>.cs.meta` → guid.
function metaGuid(text){return (/^guid:\s*([0-9a-f]{32})/m.exec(text)||[])[1]||'';}
// Values serialized for script fields: [{guid, field, value, line}] from MonoBehaviour / ScriptableObject blocks.
function serializedValues(text){
 const out=[];const lines=text.split(/\r?\n/);let guid='',inBlock=false;
 for(let i=0;i<lines.length;i++){
  const l=lines[i];
  // A prefab instance's override in a scene: `propertyPath: baseUrl` + `value: https://…` (target is the prefab,
  // so the field is matched by name only — guid '*').
  const mod=/^\s*propertyPath:\s*([A-Za-z_]\w*)\s*$/.exec(l);
  if(mod&&/^\s*value:\s*(.+?)\s*$/.test(lines[i+1]||'')){out.push({guid:'*',field:mod[1],value:/^\s*value:\s*(.+?)\s*$/.exec(lines[i+1])[1].replace(/^['"]|['"]$/g,''),line:i+2});continue;}
  if(l.startsWith('--- ')){guid='';inBlock=false;continue;}
  if(/^MonoBehaviour:/.test(l)){inBlock=true;continue;}
  if(!inBlock)continue;
  const s=/^\s+m_Script:\s*\{[^}]*guid:\s*([0-9a-f]{32})/.exec(l);if(s){guid=s[1];continue;}
  const f=/^  ([A-Za-z_]\w*):\s*(.+?)\s*$/.exec(l);
  if(f&&guid&&!f[1].startsWith('m_'))out.push({guid,field:f[1],value:f[2].replace(/^['"]|['"]$/g,''),line:i+1});
 }
 return out;
}
// ProjectSettings.asset → {platform: [symbols]} (new map format and the old numeric BuildTargetGroup format).
const GROUPS={1:'Standalone',4:'iOS',7:'Android',13:'WebGL',14:'WSA',19:'PS4',21:'XboxOne',25:'tvOS',27:'Switch',28:'Lumin',29:'Stadia',30:'CloudRendering',31:'GameCoreXboxSeries',33:'PS5',34:'EmbeddedLinux',35:'QNX'};
const PLATFORM_NAMES={iPhone:'iOS',iOS:'iOS',Android:'Android',Standalone:'Standalone',WebGL:'WebGL',tvOS:'tvOS',PS4:'PS4',PS5:'PS5',XboxOne:'XboxOne',Switch:'Switch',Server:'Server'};
function defineSymbols(text){
 const out={};const lines=String(text||'').split(/\r?\n/);
 const i=lines.findIndex(l=>/^\s*scriptingDefineSymbols:\s*$/.test(l));
 if(i<0)return out;
 const indent=lines[i].match(/^\s*/)[0].length;
 for(let k=i+1;k<lines.length;k++){
  const l=lines[k];if(!l.trim())continue;
  if(l.match(/^\s*/)[0].length<=indent)break;
  const m=/^\s*([A-Za-z0-9]+):\s*(.*)$/.exec(l);if(!m)continue;
  const plat=/^\d+$/.test(m[1])?GROUPS[m[1]]:PLATFORM_NAMES[m[1]]||m[1];if(!plat)continue;
  out[plat]=m[2].split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean);
 }
 return out;
}

// --- Merge and describe ------------------------------------------------------------------------------------------------
const HEALTH=/^\/(?:api\/)?(?:v\d+\/)?(?:health(?:z|check)?|healthcheck|status|ping|ready|readyz|live|livez|alive|heartbeat)\/?$/i;
function normalize(text){
 let t=String(text).trim().replace(/[.,;]+$/,'');
 // Unity-style tokens in Addressables paths stay as written («[BuildTarget]»).
 // Scheme and host are case-insensitive; placeholders «{Host}» keep their case.
 if(/^[a-z]+:\/\//i.test(t)){const m=/^([a-z]+:\/\/[^/?#]+)(.*)$/i.exec(t);if(m)t=m[1].replace(/\{[^}]*\}|[^{]+/g,x=>x.startsWith('{')?x:x.toLowerCase())+m[2];}
 return t.replace(/\/+$/,'')||t;
}
// Entries → merged addresses [{key, url, display, host, port, scheme, kind, category, vendor, type, envs, sources, holes, conditions, active, overrides, health}].
function build(raw,{defines={},limits=LIMITS}={}){
 const by=new Map();
 for(const r of raw){
  const red=redact(normalize(r.text));
  const h=hostOf(red);
  if(!h.host||NOISE.test(h.host)||NOISE.test(h.host+(/^[a-z]+:\/\/[^/]+(\/[^/]*)/i.exec(red)?.[1]||'')))continue;
  if(/^(?:\d+\.){3}\d+$/.test(h.host)&&h.host.split('.').some(n=>Number(n)>255))continue;
  // A version-looking «1.2.3:4» is not a host.
  if(/^\d+\.\d+$/.test(h.host))continue;
  const key=red.toLowerCase();
  let cur=by.get(key);
  if(!cur){cur={key,display:red,host:h.host,port:h.port,scheme:h.scheme,kind:r.kind,envs:new Set(),envWhy:[],sources:[],holes:[],conditions:new Set(),overrides:[],...classify(h.host)};by.set(key,cur);}
  // Environment: explicit (#if branch, env key, variable/field name, file name) before the host name.
  const fromCond=CS.envOfCondition(r.cond),fromKey=envOfWords(String(r.envKey||'').replace(/^.*\./,'')),fromName=envOfWords(r.name||r.field||''),fromFile=(ENV_FILE.exec(path.basename(r.file||''))||[])[1];
  const env=fromCond||fromKey||fromName||(fromFile?envOfWords(fromFile):null)||envOfHost(h.host);
  if(env){cur.envs.add(env);cur.envWhy.push(fromCond?'#if '+r.cond:fromKey?r.envKey:fromName?(r.field||r.name):fromFile?path.basename(r.file):'хост');}
  if(r.cond)cur.conditions.add(r.cond);
  // One provenance per file:line; a scene/prefab value names its field.
  const same=cur.sources.find(s=>s.file===r.file&&s.line===r.line);
  if(same){if(r.via&&!same.via)same.via=r.via;if(r.override)same.override=true;if(r.parts?.length&&!same.pieces.length)same.pieces=r.parts.filter(p=>p.file&&p.via).slice(0,6).map(p=>({file:p.file,line:p.line,via:p.via}));}
  else if(cur.sources.length<limits.sources)cur.sources.push({file:r.file,root:r.root||'',line:r.line,via:r.via||r.field||'',snippet:r.snippet||'',override:!!r.override,
   pieces:(r.parts||[]).filter(p=>p.file&&p.via).slice(0,6).map(p=>({file:p.file,line:p.line,via:p.via}))});
  for(const x of r.holes||[])if(!cur.holes.some(y=>y.name===x.name))cur.holes.push({name:x.name,file:x.file,line:x.line,why:x.why});
  if(r.override)cur.overrides.push({file:r.file,line:r.line,field:r.field});
 }
 const list=[...by.values()].map(x=>{
  const conditions=[...x.conditions];
  const active=conditions.length&&Object.keys(defines).length?Object.fromEntries(conditions.map(c=>[c,CS.active(c,defines)])):null;
  const path0=/^[a-z]+:\/\/[^/]+(\/[^?#]*)?/i.exec(x.display)?.[1]||'';
  return {...x,envs:[...x.envs].sort((a,b)=>['prod','staging','dev'].indexOf(a)-['prod','staging','dev'].indexOf(b)),envWhy:[...new Set(x.envWhy)].slice(0,4),conditions,active,
   health:HEALTH.test(path0),partial:x.holes.length>0||/\{[^}]+\}/.test(x.display)};
 });
 const CAT={own:0,cdn:1,third:2};
 return list.sort((a,b)=>CAT[a.category]-CAT[b.category]||a.host.localeCompare(b.host)||a.display.localeCompare(b.display)).slice(0,limits.results);
}

// Health paths seen anywhere in the project (string literals «/healthz», URL paths), most specific first.
function healthPaths(raw,texts){
 const found=new Map();
 for(const r of raw){const p=/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i.exec(r.text)?.[1];if(p&&HEALTH.test(p))found.set(p.replace(/\/$/,''),(found.get(p)||0)+2);}
 for(const t of texts)for(const m of t.matchAll(/["'](\/(?:api\/)?(?:v\d+\/)?(?:health(?:z|check)?|healthcheck|status|ping|ready|readyz|live|livez|heartbeat))["']/gi))found.set(m[1],(found.get(m[1])||0)+1);
 return [...found.entries()].sort((a,b)=>b[1]-a[1]).map(([p])=>p);
}
// Uptime checks proposed for chosen addresses: an own https base with a health path from the code
// (the address's own, one seen on the same host, else the most common one), else the base itself (guessed:false).
function propose(addresses,paths,all=addresses){
 const out=[];const seen=new Set();
 for(const a of addresses){
  // Placeholders, credentials (even redacted) and non-HTTP schemes are never probed.
  if(a.partial||!/^https?$/.test(a.scheme)||a.display.includes('@'))continue;
  const origin=/^[a-z]+:\/\/[^/?#]+/i.exec(a.display)?.[0];if(!origin)continue;
  let url,from;
  if(a.health){url=a.display.replace(/\?.*$/,'');from='code';}
  else{
   const same=all.find(b=>b.health&&/^[a-z]+:\/\/[^/?#]+/i.exec(b.display)?.[0]===origin);
   if(same){url=same.display.replace(/\?.*$/,'');from='code';}else if(paths.length){url=origin+paths[0];from='guess';}else{url=origin+'/';from='root';}
  }
  if(seen.has(url))continue;seen.add(url);
  out.push({url,service:a.host,name:a.host+(new URL(url).pathname!=='/'?new URL(url).pathname:''),from,envs:a.envs,address:a.key});
 }
 return out;
}

// --- Scan ------------------------------------------------------------------------------------------------------------
async function scan(roots,{limits=LIMITS,progress=()=>{},yieldEvery=200}={}){
 const t0=Date.now();
 const {files,stats}=walk(roots,{limits,progress});
 progress({files:files.length,stage:'read',total:files.length,done:0});
 const raw=[],cs=[],texts=[];const metas=new Map();const yamls=[];let defines={};
 for(let i=0;i<files.length;i++){
  const f=files[i];
  if(i%yieldEvery===0){progress({stage:'read',total:files.length,done:i});await new Promise(r=>setImmediate(r));}
  const text=read(f.file);if(text===null){stats.binary++;continue;}
  const ext=path.extname(f.file).toLowerCase(),base=path.basename(f.file);
  if(base.endsWith('.cs.meta')){const g=metaGuid(text);if(g)metas.set(g,f.rel.replace(/\.meta$/,''));continue;}
  if(ext==='.cs'){cs.push({file:f.rel,text,root:f.root});texts.push(text);continue;}
  if(/^ProjectSettings\.asset$/.test(base))defines=defineSymbols(text);
  const unityYaml=['.unity','.prefab','.asset'].includes(ext);
  if(unityYaml)yamls.push({f,text});
  for(const r of generic(text,f.rel,{yaml:unityYaml}))raw.push({...r,root:f.root});
  if(!unityYaml)texts.push(text);
 }
 progress({stage:'csharp',total:files.length,done:files.length});
 const csr=CS.scan(cs);
 const rootOf=rel=>cs.find(x=>x.file===rel)?.root||'';
 for(const r of csr.found)raw.push({...r,root:rootOf(r.file),snippet:snippet(cs.find(x=>x.file===r.file)?.text.split(/\r?\n/)[r.line-1]||'')});
 // Serialized values in scenes/prefabs/assets for [SerializeField] string fields of the project's scripts.
 const byScript=new Map();for(const x of csr.serialized){if(!byScript.has(x.file))byScript.set(x.file,[]);byScript.get(x.file).push(x);}
 for(const {f,text} of yamls){
  for(const v of serializedValues(text)){
   let field=null;
   if(v.guid==='*'){const same=csr.serialized.filter(x=>x.field===v.field);if(same.length!==1)continue;field=same[0];}
   else{const script=metas.get(v.guid);if(!script)continue;field=(byScript.get(script)||[]).find(x=>x.field===v.field);}
   if(!field)continue;
   if(!/^(?:[a-z]+:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?$)/i.test(v.value))continue;
   raw.push({text:v.value,file:f.rel,root:f.root,line:v.line,field:field.cls+'.'+field.field,name:field.field,via:field.cls+'.'+field.field+' в '+path.basename(f.rel),override:true,
    kind:/:\/\//.test(v.value)?'url':'host',snippet:snippet(text.split(/\r?\n/)[v.line-1]),parts:[{file:field.file,line:field.line,via:field.cls+'.'+field.field}]});
  }
 }
 const addresses=build(raw,{defines,limits});
 // The code default of a serialized field that a scene/prefab overrides says so.
 const overridden=new Map();for(const r of raw.filter(r=>r.override))overridden.set(r.field,(overridden.get(r.field)||[]).concat({file:r.file,line:r.line,value:redact(normalize(r.text))}));
 for(const a of addresses)for(const s of a.sources)if(!s.override&&overridden.has(s.via)){a.overriddenBy=overridden.get(s.via).filter(o=>o.value.toLowerCase()!==a.key).slice(0,4);}
 const paths=healthPaths(raw,texts);
 return {roots,addresses,healthPaths:paths,defines,stats:{...stats,csharp:cs.length,ms:Date.now()-t0},
  counts:{own:addresses.filter(a=>a.category==='own').length,cdn:addresses.filter(a=>a.category==='cdn').length,third:addresses.filter(a=>a.category==='third').length}};
}

module.exports={scan,walk,gitignore,ignored,redact,snippet,classify,envOfHost,envOfWords,generic,serializedValues,defineSymbols,metaGuid,build,healthPaths,propose,hostOf,LIMITS};
