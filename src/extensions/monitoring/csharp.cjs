// «Мониторинг», endpoint discovery in C# (Unity scripts) — code only, no model.
// What is understood:
//  - string literals: regular "…", verbatim @"…", raw """…""", interpolated $"…{X}…", $@"…", $"""…""";
//  - `const string` / `static readonly` / plain fields, auto-properties with initializers and `=>` properties, int
//    constants (ports), locals inside methods; references resolved in the same class (and outer classes), as
//    `ClassName.Field` across the project's files, or by a project-unique field name;
//  - folding: `+` concatenation, interpolation holes, `string.Format`/`string.Concat`, `Path.Combine`-like joins,
//    `new Uri(x)`, `new Uri(new Uri(base), "rel")`, `new UriBuilder("https", Host, Port, "/v1")`, `.Uri`/`.ToString()`,
//    ternaries (both sides kept);
//  - `#if / #elif / #else / #endif` branches: the condition is kept with each address (environment tags from symbols
//    like PRODUCTION / STAGING / DEVELOPMENT_BUILD / UNITY_EDITOR, evaluated later against the project's
//    scriptingDefineSymbols per platform — see `active`);
//  - environment mappings: `case Env.Prod:` sections, switch expressions `Env.Stage => "…"`, dictionary entries
//    `{ Env.Dev, "…" }` / `[Env.Dev] = "…"` and string keys `{ "prod", "…" }`;
//  - `[SerializeField]` (and public instance) string fields of MonoBehaviour / ScriptableObject classes: their
//    defaults, matched later with the values serialized in scenes, prefabs and assets (unity-yaml in discover.cjs).
// Anything that does not resolve stays a visible placeholder `{Name}` with where it is declared — never guessed.
const MAX_VARIANTS=8,MAX_DEPTH=10;

// --- Lexer ----------------------------------------------------------------------------------------------------
// Tokens: {t:'str'|'interp'|'num'|'id'|'p'|'pp', v, line, parts?}. Comments are dropped; line numbers kept.
function lex(src){
 const out=[];let i=0,line=1;const n=src.length;
 const push=(t,v,extra)=>out.push({t,v,line:extra?.line??line,...extra});
 const count=(a,b)=>{for(let k=a;k<b;k++)if(src.charCodeAt(k)===10)line++;};
 while(i<n){
  const c=src[i];
  if(c==='\n'){line++;i++;continue;}
  if(c===' '||c==='\t'||c==='\r'){i++;continue;}
  // Preprocessor directive: only at the start of a line (after spaces).
  if(c==='#'){let k=i-1;while(k>=0&&(src[k]===' '||src[k]==='\t'))k--;if(k<0||src[k]==='\n'){const e=src.indexOf('\n',i);const textLine=src.slice(i,e<0?n:e).replace(/\/\/.*$/,'').trim();push('pp',textLine);i=e<0?n:e;continue;}}
  if(c==='/'&&src[i+1]==='/'){const e=src.indexOf('\n',i);i=e<0?n:e;continue;}
  if(c==='/'&&src[i+1]==='*'){const e=src.indexOf('*/',i+2);const end=e<0?n:e+2;count(i,end);i=end;continue;}
  // String forms; $ and @ prefixes in any order.
  let j=i,dollars=0,verbatim=false;
  while(src[j]==='$'||src[j]==='@'){if(src[j]==='$')dollars++;else verbatim=true;j++;}
  if(src[j]==='"'&&(j>i||true)){
   const start=line;
   // Raw string: three or more quotes.
   let q=0;while(src[j+q]==='"')q++;
   if(q>=3){
    const close='"'.repeat(q),e=src.indexOf(close,j+q);const end=e<0?n:e;
    let body=src.slice(j+q,end);
    // Multi-line raw strings drop the first/last line breaks and the common indentation.
    if(body.includes('\n')){const lines=body.split('\n');lines.shift();const last=lines.pop()||'';const indent=last.match(/^\s*/)[0].length;body=lines.map(l=>l.slice(indent)).join('\n');}
    count(i,end+q);i=end+q;
    if(dollars)push('interp',body,{line:start,parts:interpParts(body,dollars,true)});else push('str',body,{line:start});
    continue;
   }
   if(q===2&&!verbatim&&!dollars){push('str','',{line:start});i=j+2;continue;}
   // Regular or verbatim string, possibly interpolated.
   let k=j+1,body='';
   while(k<n){
    const ch=src[k];
    if(verbatim){if(ch==='"'){if(src[k+1]==='"'){body+='"';k+=2;continue;}break;}body+=ch;k++;continue;}
    if(ch==='\\'){const e=src[k+1];body+=({n:'\n',t:'\t',r:'\r','"':'"','\\':'\\','0':'\0'})[e]??('\\'+e);k+=2;continue;}
    if(ch==='"'||ch==='\n')break;
    // Inside an interpolation hole, quotes belong to the hole's expression.
    if(dollars&&ch==='{'&&src[k+1]!=='{'){let depth=1,m=k+1;while(m<n&&depth){if(src[m]==='{')depth++;else if(src[m]==='}')depth--;else if(src[m]==='"'){m++;while(m<n&&src[m]!=='"'){if(src[m]==='\\')m++;m++;}}m++;}body+=src.slice(k,m);k=m;continue;}
    body+=ch;k++;
   }
   count(i,k+1);i=k+1;
   if(dollars)push('interp',body,{line:start,parts:interpParts(body,1,verbatim)});else push('str',body,{line:start});
   continue;
  }
  if(c==="'"){let k=i+1;while(k<n&&src[k]!=="'"&&src[k]!=='\n'){if(src[k]==='\\')k++;k++;}i=k+1;push('p','char');continue;}
  if(/[0-9]/.test(c)){const m=/^(?:0x[0-9a-f_]+|[0-9][0-9_]*(?:\.[0-9_]+)?(?:e[+-]?\d+)?)[a-z]*/i.exec(src.slice(i,i+40));push('num',m[0].replace(/_/g,'').replace(/[a-z]+$/i,''));i+=m[0].length;continue;}
  if(/[A-Za-z_@]/.test(c)){const m=/^@?[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i,i+200));if(m){push('id',m[0].replace(/^@/,''));i+=m[0].length;continue;}}
  const two=src.slice(i,i+2);
  if(['=>','==','!=','&&','||','??','+=','<=','>=','::','?.'].includes(two)){push('p',two);i+=2;continue;}
  push('p',c);i++;
 }
 return out;
}
// The literal and expression parts of an interpolated string body.
function interpParts(body,dollars,raw){
 const parts=[];let lit='',i=0;
 const open='{'.repeat(Math.max(1,dollars)),close='}'.repeat(Math.max(1,dollars));
 while(i<body.length){
  if(!raw||dollars===1){if(body.startsWith('{{',i)){lit+='{';i+=2;continue;}if(body.startsWith('}}',i)){lit+='}';i+=2;continue;}}
  if(body.startsWith(open,i)&&(dollars>1||body[i+1]!=='{')){
   let depth=0,k=i+open.length;const s=k;
   for(;k<body.length;k++){const ch=body[k];if(ch==='"'){k++;while(k<body.length&&body[k]!=='"'){if(body[k]==='\\')k++;k++;}continue;}if(ch==='{'||ch==='('||ch==='[')depth++;else if((ch==='}'||ch===')'||ch===']')&&depth)depth--;else if(depth===0&&body.startsWith(close,k))break;}
   let expr=body.slice(s,k);
   // Alignment and format: «{Port,5:D}» → Port. A colon inside ?: or :: stays.
   let d=0,cut=expr.length;for(let m=0;m<expr.length;m++){const ch=expr[m];if('([{'.includes(ch))d++;else if(')]}'.includes(ch))d--;else if(d===0&&(ch===','||ch===':'&&expr[m+1]!==':'&&expr[m-1]!==':'&&!expr.slice(0,m).includes('?'))){cut=m;break;}}
   expr=expr.slice(0,cut);
   if(lit)parts.push({lit});lit='';parts.push({expr:expr.trim()});i=k+close.length;continue;
  }
  lit+=body[i];i++;
 }
 if(lit)parts.push({lit});
 return parts;
}

// --- Structure: classes, fields, statements, #if conditions ----------------------------------------------------------
const MODIFIERS=new Set(['public','private','protected','internal','static','readonly','const','volatile','new','override','virtual','sealed','abstract','extern','unsafe','required','partial']);
const TYPEWORDS=new Set(['class','struct','interface','record','enum']);
// Removes auto-property accessor blocks `{ get; private set; }` so `string Host { get; } = "x";` reads as a field.
function dropAccessors(tokens){
 const out=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t.t==='p'&&t.v==='{'){
   let k=i+1,ok=false;
   while(k<tokens.length&&(tokens[k].t==='id'&&/^(?:get|set|init|private|protected|internal|public)$/.test(tokens[k].v)||tokens[k].t==='p'&&tokens[k].v===';'))k++;
   if(k>i+1&&tokens[k]?.t==='p'&&tokens[k].v==='}'&&tokens.slice(i+1,k).some(x=>x.v==='get'||x.v==='set'||x.v==='init'))ok=true;
   if(ok){i=k;if(tokens[k+1]?.v!=='='&&tokens[k+1]?.v!==';')out.push({t:'p',v:';',line:tokens[k].line});continue;}
  }
  out.push(t);
 }
 return out;
}
// The condition of the current #if branches as a boolean expression string ('' = always).
function topLevel(st,v){let d=0;for(const t of st){if(t.v==='('||t.v==='['||t.v==='<')d++;else if(t.v===')'||t.v===']'||t.v==='>')d--;else if(!d&&t.v===v)return true;}return false;}
const wrap=c=>/^[!A-Za-z_]\w*$|^!?[A-Za-z_]\w*$/.test(c)||/^\(.*\)$/.test(c)&&!/\).*\(/.test(c.slice(1,-1))?c:'('+c+')';
const neg=c=>/^[A-Za-z_]\w*$/.test(c)?'!'+c:'!('+c+')';
function ppCondition(stack){const list=stack.map(f=>f.cond).filter(Boolean);return list.length===1?list[0]:list.map(wrap).join(' && ');}
function ppStep(stack,line){
 const m=/^#\s*(if|elif|else|endif)\b\s*(.*)$/.exec(line);if(!m)return;
 const [,kind,expr]=m;
 if(kind==='if')stack.push({taken:[expr.trim()],cond:expr.trim()});
 else if(kind==='elif'&&stack.length){const f=stack.at(-1);f.cond=f.taken.map(neg).concat(expr.trim()).join(' && ');f.taken.push(expr.trim());}
 else if(kind==='else'&&stack.length){const f=stack.at(-1);f.cond=f.taken.map(neg).join(' && ');}
 else if(kind==='endif')stack.pop();
}

// Parses one file into {classes:[{name, outer, bases, fields:{name:{expr, line, cond, type, serialized, isConst}}}],
// statements:[{tokens, line, cond, cls, scope, caseKey}]}.
function parseFile(src,file){
 const tokens=dropAccessors(lex(src));
 const classes=[],statements=[];
 const frames=[];const pp=[];
 let buf=[],pendingType=null;
 const currentClass=()=>{for(let i=frames.length-1;i>=0;i--)if(frames[i].kind==='class')return frames[i].cls;return null;};
 const inMethod=()=>frames.some(f=>f.kind==='method');
 const method=()=>{for(let i=frames.length-1;i>=0;i--)if(frames[i].kind==='method')return frames[i];return null;};
 const block=()=>frames.at(-1)||null;
 function flush(end){
  const st=buf;buf=[];
  if(!st.length)return;
  const cls=currentClass();
  if(end==='{'){
   // A type declaration, a method/accessor/lambda body or a control block.
   const ti=st.findIndex(t=>t.t==='id'&&TYPEWORDS.has(t.v));
   if(ti>=0&&st[ti+1]?.t==='id'){
    const name=st[ti+1].v,colon=st.findIndex((t,i)=>i>ti&&t.v===':');
    const bases=colon>0?st.slice(colon+1).filter(t=>t.t==='id').map(t=>t.v):[];
    const c={name,outer:cls?.name||'',bases,fields:{},decls:[],file,isEnum:st[ti].v==='enum'};classes.push(c);
    frames.push({kind:st[ti].v==='enum'?'enum':'class',cls:c});return;
   }
   if(st[0]?.t==='id'&&st[0].v==='namespace'){frames.push({kind:'namespace'});return;}
   // Field/collection initializers `= new Dictionary<…> {` and object initializers keep the statement going.
   if(topLevel(st,'=')&&!inMethod()&&cls){frames.push({kind:'init',cls,carry:st});return;}
   if(inMethod()||st.some(t=>t.v==='='||t.v==='return'||t.v==='=>')){
    if(st.some(t=>t.v==='='||t.v==='return'||t.v==='=>'||t.v==='new')&&!/^(?:if|for|foreach|while|switch|using|lock|else|try|catch|finally|do)$/.test(st[0]?.v||'')){frames.push({kind:'init',cls,carry:st});return;}
    if(st[0]?.v==='switch'){statements.push(stmt(st,cls));frames.push({kind:'block',cls,isSwitch:true});return;}
    statements.push(stmt(st,cls));frames.push({kind:'block',cls});return;
   }
   if(cls&&st.some(t=>t.v==='(')){frames.push({kind:'method',cls,locals:{}});return;}
   frames.push({kind:'block',cls});return;
  }
  if(cls&&!inMethod()&&frames.at(-1)?.kind==='class'){if(field(st,cls))return;}
  statements.push(stmt(st,cls));
 }
 function stmt(st,cls){
  const b=block();let tokens=st,caseKey=null;
  // `case Env.Prod:` / `default:` labels: remembered for the following statements of the same switch block.
  for(;;){
   if(tokens[0]?.v==='case'){const colon=tokens.findIndex(t=>t.v===':');if(colon<0)break;caseKey=tokens.slice(1,colon).map(t=>t.t==='str'?'"'+t.v+'"':t.v).join('');if(b)b.caseKey=caseKey;tokens=tokens.slice(colon+1);continue;}
   if(tokens[0]?.v==='default'&&tokens[1]?.v===':'){if(b)b.caseKey=null;tokens=tokens.slice(2);continue;}
   break;
  }
  if(!caseKey&&b?.caseKey)caseKey=b.caseKey;
  // The section ends with `break` / `return`: later statements are not under this label.
  if(b&&tokens.some(t=>t.v==='break'||t.v==='return'))b.caseKey=null;
  const m=method();
  const s={tokens,line:tokens[0]?.line||st[0]?.line||0,cond:ppCondition(pp),cls:cls?.name||'',caseKey,file,locals:m?m.locals:null};
  // A local `var url = …;` / `string url = …;` is remembered for later statements of the same method.
  if(m){const eq=tokens.findIndex(t=>t.v==='=');if(eq>=1&&tokens[eq-1].t==='id'&&eq<=4&&tokens[eq+1]?.v!=='='&&!tokens.slice(0,eq-1).some(t=>t.v==='.'||t.v==='('))m.locals[tokens[eq-1].v]={expr:tokens.slice(eq+1),line:tokens[eq-1].line,cond:s.cond,file};}
  return s;
 }
 // `[SerializeField] private static readonly string Name = expr;` → a field. Returns false if not a field.
 function field(st,cls){
  let i=0,serialized=false,isPublic=false,isStatic=false,isConst=false;
  while(st[i]?.v==='['){let d=0;const s=i;for(;i<st.length;i++){if(st[i].v==='[')d++;else if(st[i].v===']'){d--;if(!d){i++;break;}}}if(st.slice(s,i).some(t=>t.v==='SerializeField'||t.v==='SerializeReference'))serialized=true;}
  while(st[i]?.t==='id'&&MODIFIERS.has(st[i].v)){if(st[i].v==='public')isPublic=true;if(st[i].v==='static')isStatic=true;if(st[i].v==='const')isConst=true;i++;}
  // Type: name(.name)*(<…>)?([])*(?)?
  if(st[i]?.t!=='id')return false;
  const typeStart=i;i++;
  while(st[i]?.v==='.'&&st[i+1]?.t==='id')i+=2;
  if(st[i]?.v==='<'){let d=0;for(;i<st.length;i++){if(st[i].v==='<')d++;else if(st[i].v==='>'){d--;if(!d){i++;break;}}}}
  while(st[i]?.v==='['&&st[i+1]?.v===']')i+=2;
  if(st[i]?.v==='?')i++;
  const type=st.slice(typeStart,i).map(t=>t.v).join('');
  if(st[i]?.t!=='id')return false;
  const name=st[i].v;i++;
  if(st[i]?.v==='('||(st[i]&&st[i].v!=='='&&st[i].v!=='=>'))return false;
  const expr=st[i]?st.slice(i+1):null;
  const decl={expr,line:st[i-1].line,cond:ppCondition(pp),type,file,isConst,serialized:!isStatic&&!isConst&&(serialized||isPublic)&&/^(?:string|String|System\.String)$/.test(type)};
  // The same name declared in several #if branches: every branch is a variant of the field.
  cls.decls.push({name,...decl});
  if(cls.fields[name])(cls.fields[name].alts||(cls.fields[name].alts=[])).push(decl);else cls.fields[name]=decl;
  return true;
 }
 for(let k=0;k<tokens.length;k++){
  const t=tokens[k];
  if(t.t==='pp'){ppStep(pp,t.v);continue;}
  if(t.t==='p'&&t.v===';'){
   // Inside an initializer frame `;` cannot occur; outside it ends the statement.
   flush(';');continue;
  }
  if(t.t==='p'&&t.v==='{'){
   const top=frames.at(-1);
   // Nested braces inside an initializer (collection entries) are part of it.
   if(top?.kind==='init'){top.depth=(top.depth||0)+1;top.carry.push(t);continue;}
   flush('{');
   if(frames.at(-1)?.kind==='init')frames.at(-1).carry.push(t);
   continue;
  }
  if(t.t==='p'&&t.v==='}'){
   const top=frames.at(-1);
   if(top?.kind==='init'){
    if(top.depth){top.depth--;top.carry.push(t);continue;}
    frames.pop();
    // The initializer ends here: the whole thing is one statement (or a field) with the braces inside.
    buf=[...top.carry,...buf,t];
    // A following `;` (or `,`) closes it; when the next token is not `;`, close now.
    const next=tokens[k+1];
    if(!(next&&next.t==='p'&&(next.v===';'||next.v===')'||next.v===','||next.v==='.')))flush(';');
    continue;
   }
   flush('}');frames.pop();continue;
  }
  const top=frames.at(-1);
  if(top?.kind==='init'){top.carry.push(t);continue;}
  if(top?.kind==='enum')continue;
  buf.push(t);
 }
 flush(';');
 void pendingType;
 return {classes,statements};
}

// --- Evaluation ----------------------------------------------------------------------------------------------------
// A value is a list of variants; a variant is {text, parts:[{file,line,via}], holes:[{name,file,line,why}]}.
const lit=(text,src)=>({text:String(text),parts:src?[src]:[],holes:[]});
const join=(a,b)=>({text:a.text+b.text,parts:[...a.parts,...b.parts],holes:[...a.holes,...b.holes],conds:[...(a.conds||[]),...(b.conds||[])]});
function cross(lists,fn){let acc=[lit('')];for(const list of lists){const next=[];for(const a of acc)for(const b of list){next.push(fn(a,b));if(next.length>=MAX_VARIANTS)break;}acc=next;}return acc;}
const hole=(name,where,why)=>({text:'{'+name+'}',parts:[],holes:[{name,file:where?.file||'',line:where?.line||0,why}]});

function project(files){
 const classes=[],statements=[];
 for(const {file,text} of files){
  let r;try{r=parseFile(text,file);}catch{continue;}
  classes.push(...r.classes);statements.push(...r.statements);
 }
 const byName=new Map();for(const c of classes){if(!byName.has(c.name))byName.set(c.name,[]);byName.get(c.name).push(c);}
 // Partial classes: fields of every part.
 const fieldsOf=name=>{const out={};for(const c of byName.get(name)||[])Object.assign(out,c.fields);return out;};
 const global=new Map();for(const c of classes)for(const f of Object.keys(c.fields)){if(!global.has(f))global.set(f,[]);global.get(f).push(c.name);}
 return {classes,statements,byName,fieldsOf,global};
}

function evaluator(proj){
 function resolveName(name,ctx,depth,seen){
  // Locals of the method, then the class and its outer classes, then a project-unique field.
  if(ctx.locals&&ctx.locals[name]&&!seen.has('local:'+name)){const l=ctx.locals[name];return evalTokens(l.expr,{...ctx},depth+1,new Set([...seen,'local:'+name]),{file:l.file,line:l.line,via:name});}
  let cls=ctx.cls;
  while(cls){
   const f=proj.fieldsOf(cls)[name];
   if(f)return fieldValue(cls,name,f,depth,seen);
   cls=(proj.byName.get(cls)||[])[0]?.outer||'';
  }
  const owners=[...new Set(proj.global.get(name)||[])];
  if(owners.length===1)return fieldValue(owners[0],name,proj.fieldsOf(owners[0])[name],depth,seen);
  return null;
 }
 function fieldValue(cls,name,f,depth,seen){
  const key=cls+'.'+name;
  if(seen.has(key))return [hole(name,f,'цикл')];
  // A serialized field's value is set in the editor: its code default is shown, the scene value elsewhere.
  // Declarations in several #if branches are all variants, each with its branch condition.
  const out=[];
  for(const d of [f,...(f.alts||[])]){
   const v=!d.expr||!d.expr.length?[hole(name,d,'runtime')]:evalTokens(d.expr,{cls,locals:null,file:d.file},depth+1,new Set([...seen,key]),{file:d.file,line:d.line,via:key});
   out.push(...v.map(x=>d.cond&&f.alts?{...x,conds:[...(x.conds||[]),d.cond]}:x));
  }
  return out.slice(0,MAX_VARIANTS);
 }
 function evalTokens(tokens,ctx,depth=0,seen=new Set(),origin=null){
  if(depth>MAX_DEPTH)return [hole('…',origin,'глубина')];
  const p={i:0,tokens};
  let r;try{r=expr(p,ctx,depth,seen);}catch{r=null;}
  if(!r)return [hole(origin?.via||'?',origin,'runtime')];
  return r.map(v=>origin?{...v,parts:v.parts.length?[...v.parts]:[origin]}:v).map(v=>origin&&!v.parts.some(x=>x.via===origin.via)?{...v,parts:[origin,...v.parts]}:v);
 }
 const peek=p=>p.tokens[p.i];
 const take=(p,v)=>{if(peek(p)?.v===v){p.i++;return true;}return false;};
 function expr(p,ctx,depth,seen){
  // Ternary: both branches are kept as variants.
  const start=p.i;
  let left=concat(p,ctx,depth,seen);
  // `env == Env.Prod ? "a" : "b"`: the condition is not a value — skip to its `?` and keep both branches.
  if(['==','!=','<','>','<=','>=','&&','||'].includes(peek(p)?.v)){
   let k=p.i,d=0;
   for(;k<p.tokens.length;k++){const v=p.tokens[k].v;if(v==='('||v==='[')d++;else if(v===')'||v===']'){if(!d)break;d--;}else if(!d&&(v===','||v===';'||v===':'))break;else if(!d&&v==='?'&&p.tokens[k].t==='p')break;}
   if(p.tokens[k]?.v==='?'){p.i=k;left=[];}
  }
  if(peek(p)?.v==='?'){
   p.i++;const a=concat(p,ctx,depth,seen);if(!take(p,':'))return left;const b=expr(p,ctx,depth,seen);
   if(a&&b)return [...a,...b].slice(0,MAX_VARIANTS);
  }
  if(peek(p)?.v==='??'){p.i++;const b=expr(p,ctx,depth,seen);if(left&&b)return [...left.filter(v=>!v.holes.length),...b].slice(0,MAX_VARIANTS)||left;}
  void start;
  return left;
 }
 function concat(p,ctx,depth,seen){
  let acc=term(p,ctx,depth,seen);if(!acc)return null;
  while(peek(p)?.v==='+'){p.i++;const next=term(p,ctx,depth,seen);if(!next)return acc;acc=cross([acc,next],join);}
  return acc;
 }
 function args(p,ctx,depth,seen){
  if(!take(p,'('))return null;
  const list=[];
  if(take(p,')'))return list;
  for(;;){
   // Named arguments `name: value`.
   if(peek(p)?.t==='id'&&p.tokens[p.i+1]?.v===':')p.i+=2;
   const v=expr(p,ctx,depth,seen);list.push(v||[hole('?',null,'runtime')]);
   if(!v)skipArg(p);
   if(take(p,','))continue;
   if(take(p,')'))return list;
   return list;
  }
 }
 function skipArg(p){let d=0;while(p.i<p.tokens.length){const v=p.tokens[p.i].v;if(d===0&&(v===','||v===')'))return;if(v==='('||v==='['||v==='{')d++;if(v===')'||v===']'||v==='}')d--;p.i++;}}
 const urlJoin=(a,b)=>a.replace(/\/+$/,'')+'/'+b.replace(/^\/+/,'');
 // `new Uri(baseUri, relative)` follows RFC 3986 like .NET: «https://h/v2» + «status» → «https://h/status».
 function resolveUri(base,rel){try{return new URL(rel,base).href;}catch{return urlJoin(base,rel);}}
 function suffixes(p,v){
  // `.Uri`, `.ToString()`, `.AbsoluteUri`, `.OriginalString`, `.Trim()`, `.TrimEnd('/')` keep the value.
  while(peek(p)?.v==='.'&&/^(?:Uri|ToString|AbsoluteUri|OriginalString|Trim|TrimEnd|TrimStart|ToLower|ToLowerInvariant)$/.test(p.tokens[p.i+1]?.v||'')){p.i+=2;if(peek(p)?.v==='('){let d=0;do{if(peek(p).v==='(')d++;else if(peek(p).v===')')d--;p.i++;}while(d&&p.i<p.tokens.length);}}
  return v;
 }
 function term(p,ctx,depth,seen){
  const t=peek(p);if(!t)return null;
  const here={file:ctx.file||'',line:t.line};
  if(t.t==='str'){p.i++;return suffixes(p,[lit(t.v,{...here,via:''})]);}
  if(t.t==='num'){p.i++;return [lit(t.v)];}
  if(t.t==='interp'){
   p.i++;
   const lists=t.parts.map(part=>part.lit!==undefined?[lit(part.lit,{...here,via:''})]:(()=>{const sub=lex(part.expr);const v=evalTokens(sub,ctx,depth+1,seen);return v.map(x=>({...x,holes:x.holes.map(h=>h.line?h:{...h,...here})}));})());
   return suffixes(p,cross(lists,join));
  }
  if(t.v==='('){p.i++;const v=expr(p,ctx,depth,seen);take(p,')');return v?suffixes(p,v):null;}
  if(t.v==='new'){
   p.i++;
   const type=[];while(peek(p)?.t==='id'||peek(p)?.v==='.')type.push(p.tokens[p.i++].v);
   const name=type.filter(x=>x!=='.').at(-1)||'';
   const a=peek(p)?.v==='('?args(p,ctx,depth,seen):[];
   if(name==='Uri'&&a?.length===1)return suffixes(p,a[0]);
   if(name==='Uri'&&a?.length>=2)return suffixes(p,cross([a[0],a[1]],(x,y)=>({text:x.text+'\u0000'+y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]})).map(v=>{const [,b,r]=v.text.split('\u0000');return {...v,text:resolveUri(b,r)};}));
   if(name==='UriBuilder'){
    if(a?.length===1)return suffixes(p,a[0]);
    if(a?.length>=2){
     const [scheme,host,port,path]=[a[0],a[1],a[2]||[lit('')],a[3]||[lit('')]];
     return suffixes(p,cross([scheme,host,port,path],(x,y)=>({text:x.text+'\u0000'+y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]}))
      .map(v=>{const [,s,h,po,pa]=v.text.split('\u0000');return {...v,text:s+'://'+h+(po&&po!=='-1'&&!(s==='https'&&po==='443')&&!(s==='http'&&po==='80')?':'+po:'')+(pa?(pa.startsWith('/')?'':'/')+pa:'')};}));
    }
   }
   // Object initializer `new UriBuilder { Scheme = …, Host = …, Port = …, Path = … }`.
   if(name==='UriBuilder'&&peek(p)?.v==='{'){
    p.i++;const props={};
    while(p.i<p.tokens.length&&peek(p).v!=='}'){
     if(peek(p).t==='id'&&p.tokens[p.i+1]?.v==='='){const k=p.tokens[p.i].v;p.i+=2;props[k]=expr(p,ctx,depth,seen)||[hole(k,here,'runtime')];}
     else p.i++;
     take(p,',');
    }
    take(p,'}');
    const g=k=>props[k]||[lit('')];
    return suffixes(p,cross([g('Scheme'),g('Host'),g('Port'),g('Path')],(x,y)=>({text:x.text+'\u0000'+y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]})).map(v=>{const [,s,h,po,pa]=v.text.split('\u0000');return {...v,text:(s||'https')+'://'+h+(po&&po!=='-1'?':'+po:'')+(pa?(pa.startsWith('/')?'':'/')+pa:'')};}));
   }
   return null;
  }
  if(t.t==='id'){
   // Qualified name: A.B.C, possibly a call.
   const names=[t.v];let k=p.i+1;
   while(p.tokens[k]?.v==='.'&&p.tokens[k+1]?.t==='id'){names.push(p.tokens[k+1].v);k+=2;}
   const isCall=p.tokens[k]?.v==='(';
   const full=names.join('.');
   if(isCall){
    const fn=names.at(-1),owner=names.slice(0,-1).join('.');
    if(/^(?:string|String|System\.String)$/.test(owner)&&fn==='Format'){p.i=k;const a=args(p,ctx,depth,seen);if(!a?.length)return null;
     return suffixes(p,cross(a,(x,y)=>({text:x.text+'\u0001'+y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]})).map(v=>{const [fmt,...rest]=v.text.split('\u0001').slice(1);return {...v,text:String(fmt||'').replace(/\{(\d+)(?:[,:][^}]*)?\}/g,(m,n)=>rest[Number(n)]??m)};}));}
    if(/^(?:string|String)$/.test(owner)&&(fn==='Concat'||fn==='Join')){p.i=k;const a=args(p,ctx,depth,seen);if(!a)return null;if(fn==='Join'){const [sep,...rest]=a;return suffixes(p,cross([sep,...rest],(x,y)=>({text:x.text+'\u0001'+y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]})).map(v=>{const [s,...r]=v.text.split('\u0001').slice(1);return {...v,text:r.join(s)};}));}return suffixes(p,cross(a,join));}
    if(/(?:^|\.)(?:Path|Url|URL|Uri|UriHelper|PathUtil\p{L}*)$/u.test(owner)&&/^(?:Combine|Join)$/.test(fn)){p.i=k;const a=args(p,ctx,depth,seen);if(!a?.length)return null;return suffixes(p,cross(a,(x,y)=>({text:x.text?urlJoin(x.text,y.text):y.text,parts:[...x.parts,...y.parts],holes:[...x.holes,...y.holes]})));}
    if(fn==='nameof'){p.i=k;args(p,ctx,depth,seen);return [lit(names.at(-1))];}
    // Any other call: its result is known only at run time.
    p.i=k;skipCall(p);return suffixes(p,[hole(full+'()',here,'runtime')]);
   }
   p.i=k;
   if(names.length>=2){
    // Class.Field (possibly Namespace.Class.Field): the last two names.
    const cls=names.at(-2),fieldName=names.at(-1);
    const f=proj.fieldsOf(cls)[fieldName];
    if(f)return suffixes(p,fieldValue(cls,fieldName,f,depth,seen));
    // `this.Host` / `Config.Instance.Host`: a field name known in the current class or uniquely.
    const r=resolveName(fieldName,{...ctx,locals:null},depth,seen);
    if(r)return suffixes(p,r);
    return suffixes(p,[hole(full,here,'runtime')]);
   }
   if(/^(?:true|false|null)$/.test(t.v))return [lit('')];
   const r=resolveName(t.v,ctx,depth,seen);
   if(r)return suffixes(p,r);
   // Declared nowhere in the project (a parameter, a property set elsewhere): a placeholder.
   return suffixes(p,[hole(t.v,here,'runtime')]);
  }
  return null;
 }
 function skipCall(p){let d=0;do{const v=peek(p)?.v;if(v==='(')d++;else if(v===')')d--;p.i++;}while(d&&p.i<p.tokens.length);}
 return {evalTokens,fieldValue,resolveName};
}

// --- Finding addresses ----------------------------------------------------------------------------------------------
const URLISH=/^(?:https?|wss?|tcp|udp|grpc):\/\/\S/i;
const HOSTISH=/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{2,5})?(?:\/\S*)?$|^\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?$|^\{[A-Za-z_][\w.()]*\}(?::\d{2,5}|:\{[A-Za-z_][\w.]*\})(?:\/\S*)?$/i;
const HOSTY_NAME=/host|server|domain|endpoint|address|addr|url|uri|api|cdn|backend/i;
// The env key a value is mapped from: `case Env.Prod:`, `Env.Stage => …`, `{ Env.Dev, … }`, `[Env.Dev] = …`, `{ "prod", … }`.
function envKeyBefore(tokens,i){
 const t=tokens;
 if(t[i-1]?.v==='=>'&&t[i-2]?.t==='id'&&t[i-3]?.v==='.')return t[i-4]?.v+'.'+t[i-2].v;
 if(t[i-1]?.v==='=>'&&t[i-2]?.t==='str')return '"'+t[i-2].v+'"';
 if(t[i-1]?.v===','&&t[i-2]?.t==='id'&&t[i-3]?.v==='.'&&t[i-5]?.v==='{')return t[i-4].v+'.'+t[i-2].v;
 if(t[i-1]?.v===','&&t[i-2]?.t==='str'&&t[i-3]?.v==='{')return '"'+t[i-2].v+'"';
 if(t[i-1]?.v==='='&&t[i-2]?.v===']'){let k=i-3;const key=[];while(k>=0&&t[k].v!=='['){key.unshift(t[k].t==='str'?'"'+t[k].v+'"':t[k].v);k--;}return key.join('');}
 return null;
}
// Every address-like value in the project: [{text, file, line, cond, envKey, via, parts, holes, kind:'url'|'host', field?, serialized?}].
function scan(files){
 const proj=project(files),ev=evaluator(proj);
 const out=[];
 const keep=(variants,base)=>{for(const v of variants){const text=v.text.trim();if(!text)continue;
  const url=URLISH.test(text),host=!url&&HOSTISH.test(text)&&(base.hosty||/^\{/.test(text)===false&&/[a-z]/i.test(text));
  if(!url&&!host)continue;
  const conds=[...new Set([base.cond,...(v.conds||[])].filter(Boolean))];
  const cond=conds.length===1?conds[0]:conds.map(wrap).join(' && ');
  out.push({...base,text,cond,kind:url?'url':'host',parts:v.parts.filter(x=>x.file&&x.via),holes:dedupeHoles(v.holes)});}};
 // Fields with values: every declaration (one per #if branch) on its own.
 for(const c of proj.classes)for(const f of c.decls){
  const name=f.name;
  if(!f.expr)continue;
  const variants=ev.fieldValue(c.name,name,{...f,alts:undefined},0,new Set());
  keep(variants,{file:f.file,line:f.line,cond:f.cond,envKey:null,via:c.name+'.'+name,field:c.name+'.'+name,serialized:f.serialized,hosty:HOSTY_NAME.test(name),name});
  // Collection initializers in field values: each element with its key.
  if(f.expr.some(t=>t.v==='{'))scanInside(f.expr,{cls:c.name,file:f.file,locals:null},{file:f.file,cond:f.cond,via:c.name+'.'+name,name},ev,out,keep);
 }
 // Statements in methods and elsewhere: every maximal expression that starts with a string, an interpolation,
 // `new Uri…`, `string.Format`, `Path.Combine` or `X + …`.
 for(const st of proj.statements)scanInside(st.tokens,{cls:st.cls,file:st.file,locals:st.locals},{file:st.file,cond:st.cond,caseKey:st.caseKey},ev,out,keep);
 // Host fields + port fields in the same class: `Host = "a.b.c"`, `Port = 7777` → «a.b.c:7777».
 for(const c of proj.classes){
  const entries=Object.entries(c.fields);
  const port=entries.find(([n,f])=>/port/i.test(n)&&f.expr?.length===1&&f.expr[0].t==='num');
  if(!port)continue;
  for(const [n,f] of entries){
   if(!/host|server|address|domain|ip/i.test(n)||!f.expr)continue;
   const v=ev.fieldValue(c.name,n,f,0,new Set()).filter(x=>!x.holes.length&&HOSTISH.test(x.text)&&!/:\d+$/.test(x.text));
   for(const x of v)out.push({file:f.file,line:f.line,cond:f.cond,via:c.name+'.'+n+' + '+c.name+'.'+port[0],field:c.name+'.'+n,text:x.text+':'+port[1].expr[0].v,kind:'host',name:n,
    parts:[{file:f.file,line:f.line,via:c.name+'.'+n},{file:port[1].file,line:port[1].line,via:c.name+'.'+port[0]}],holes:[]});
  }
 }
 // Serialized fields: class → field names (for the scene/prefab/asset values).
 const serialized=proj.classes.flatMap(c=>Object.entries(c.fields).filter(([,f])=>f.serialized).map(([n,f])=>({cls:c.name,field:n,file:f.file,line:f.line,bases:c.bases})));
 return {found:dedupe(out),serialized,classes:proj.classes.map(c=>({name:c.name,file:c.file,bases:c.bases}))};
}
function scanInside(tokens,ctx,base,ev,out,keep){
 let i=0;
 while(i<tokens.length){
  const t=tokens[i],nx=tokens[i+1];
  const starts=t.t==='str'||t.t==='interp'||t.v==='new'&&/^(?:Uri|UriBuilder|System)$/.test(nx?.v||'')||(t.v==='string'||t.v==='String')&&nx?.v==='.'||t.t==='id'&&/^(?:Path|Url|URL)$/.test(t.v)&&nx?.v==='.'||t.t==='id'&&nx?.v==='+';
  if(!starts){i++;continue;}
  const envKey=envKeyBefore(tokens,i);
  // Evaluate from here to the end of the expression (stops at , ; ) } : and so on).
  const sub=tokens.slice(i);
  const p={i:0,tokens:sub};
  let variants=null;
  try{variants=ev.evalTokens(sub.slice(0,exprEnd(sub)),ctx,0,new Set());}catch{variants=null;}
  void p;
  if(variants)keep(variants,{...base,line:t.line,envKey:envKey||base.caseKey||null,via:base.via||'',hosty:false});
  i+=Math.max(1,exprEnd(sub));
 }
}
// Where an expression starting at 0 ends: the first top-level , ; ) ] } (or : of a case / ternary end).
function exprEnd(tokens){
 let d=0,q=0;
 for(let k=0;k<tokens.length;k++){
  const v=tokens[k].t==='p'?tokens[k].v:null;if(!v)continue;
  if(v==='('||v==='['||v==='{'){d++;continue;}
  if(v===')'||v===']'||v==='}'){if(!d)return k;d--;continue;}
  if(d)continue;
  if(v==='?')q++;
  if(v===':'){if(q)q--;else return k;}
  if(v===','||v===';'||v==='=>'||v==='=='||v==='!='||v==='&&'||v==='||')return k;
 }
 return tokens.length;
}
function dedupeHoles(list){const seen=new Set();return list.filter(h=>{const k=h.name+'@'+h.file+':'+h.line;if(seen.has(k))return false;seen.add(k);return true;});}
// The same text from the same line found twice (field + statement scans) is one.
function dedupe(list){const seen=new Map();for(const x of list){const k=x.text+'\n'+x.file+':'+x.line;const cur=seen.get(k);if(!cur)seen.set(k,x);else{cur.envKey=cur.envKey||x.envKey;cur.field=cur.field||x.field;cur.serialized=cur.serialized||x.serialized;}}return [...seen.values()];}

// --- #if conditions against the project's define symbols ---------------------------------------------------------
// Evaluates `!PRODUCTION && (UNITY_ANDROID || FOO)` with a set of defined symbols; unknown symbols are false.
function evalCondition(cond,defined){
 if(!cond)return true;
 const src=cond.replace(/\btrue\b/g,'1').replace(/\bfalse\b/g,'0');
 const tokens=src.match(/[A-Za-z_][A-Za-z0-9_]*|&&|\|\||!|\(|\)|==|!=|[01]/g)||[];
 let i=0;
 const or=()=>{let v=and();while(tokens[i]==='||'){i++;const r=and();v=v||r;}return v;};
 const and=()=>{let v=not();while(tokens[i]==='&&'){i++;const r=not();v=v&&r;}return v;};
 const not=()=>{if(tokens[i]==='!'){i++;return !not();}return atom();};
 const atom=()=>{const t=tokens[i++];if(t==='('){const v=or();i++;return v;}if(t==='1')return true;if(t==='0')return false;return defined.has(t);};
 try{return or();}catch{return true;}
}
const symbolsIn=cond=>[...new Set(String(cond||'').match(/[A-Za-z_][A-Za-z0-9_]*/g)||[])].filter(x=>!/^(?:true|false)$/.test(x));
const PLATFORM_SYMBOLS={Android:['UNITY_ANDROID'],iOS:['UNITY_IOS','UNITY_IPHONE'],Standalone:['UNITY_STANDALONE'],WebGL:['UNITY_WEBGL'],tvOS:['UNITY_TVOS'],PS4:['UNITY_PS4'],PS5:['UNITY_PS5'],XboxOne:['UNITY_XBOXONE'],Switch:['UNITY_SWITCH']};
// In which builds a branch is compiled: {editor:bool, platforms:{Android:'release'|'development'|false}}.
// DEVELOPMENT_BUILD depends on the build option, so a branch that needs it is «only in development builds».
function active(cond,defines){
 if(!cond)return null;
 const out={editor:false,platforms:{}};
 const plats=Object.keys(defines||{}).length?Object.keys(defines):[];
 for(const plat of plats){
  const base=new Set([...(defines[plat]||[]),...(PLATFORM_SYMBOLS[plat]||[])]);
  const release=evalCondition(cond,base),dev=evalCondition(cond,new Set([...base,'DEVELOPMENT_BUILD','DEBUG']));
  out.platforms[plat]=release&&dev?'all':release?'release':dev?'development':false;
  if(evalCondition(cond,new Set([...base,'UNITY_EDITOR','DEBUG','DEVELOPMENT_BUILD'])))out.editor=true;
 }
 if(!plats.length)out.editor=evalCondition(cond,new Set(['UNITY_EDITOR','DEBUG','DEVELOPMENT_BUILD']));
 return out;
}
// Environment from #if symbols: positive PRODUCTION-like → prod; STAGING-like → staging; DEV/EDITOR-like → dev;
// the #else of a dev-only branch (`!DEVELOPMENT_BUILD`, `!UNITY_EDITOR`) → prod.
const ENV_SYMBOL=[[/^(?:PROD|PRODUCTION|RELEASE|LIVE)(?:_|$)/i,'prod'],[/^(?:STAGE|STAGING|STG|PREPROD|UAT|QA)(?:_|$)/i,'staging'],[/^(?:DEV|DEVELOP|DEVELOPMENT|DEVELOPMENT_BUILD|DEBUG|UNITY_EDITOR|TEST|LOCAL|SANDBOX)(?:_|$)/i,'dev']];
function envOfCondition(cond){
 if(!cond)return null;
 const parts=cond.split(/\s*&&\s*/).map(x=>x.replace(/^\(+|\)+$/g,'').trim());
 for(const part of parts.slice().reverse()){
  const neg=/^!\s*\(?\s*([A-Za-z_]\w*)\s*\)?$/.exec(part),pos=/^([A-Za-z_]\w*)$/.exec(part);
  const sym=(pos||neg)?.[1];if(!sym)continue;
  const env=ENV_SYMBOL.find(([r])=>r.test(sym))?.[1];if(!env)continue;
  if(pos)return env;
  if(neg&&env==='dev')return 'prod';
 }
 return null;
}

module.exports={lex,interpParts,parseFile,project,evaluator,scan,evalCondition,active,envOfCondition,symbolsIn,exprEnd,envKeyBefore,PLATFORM_SYMBOLS};
