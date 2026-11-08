// Splitting content into pieces that are embedded one by one, by the kind of content:
//  code      — top-level declarations (functions, classes, methods) and the blocks between them;
//  markdown  — sections under headings, with the heading path kept as the location;
//  chat      — windows of consecutive messages with a small overlap;
//  text      — paragraphs packed up to the target size; PDF pages («[Страница N]») and slides («[Слайд N]») are kept
//              as locations and never mixed in one piece.
// Every piece is {text, loc}; loc holds what a card can show: {line} for code and text, {heading}, {page}, {slide},
// {from, to} message indexes for chats.
const TARGET=1200,MAX=2000,MIN=200,MAX_PIECES=400;

const CODE_EXT=/\.(?:c|cc|cpp|cxx|h|hh|hpp|m|mm|cs|java|kt|kts|scala|go|rs|swift|js|jsx|mjs|cjs|ts|tsx|vue|svelte|py|rb|php|lua|gd|gdscript|dart|sh|bash|zsh|ps1|psm1|sql|r|jl|ex|exs|erl|hs|clj|groovy|gradle|shader|hlsl|glsl|cginc|compute|usf|ush)$/i;
const MARKDOWN_EXT=/\.(?:md|markdown|mdx|rst|adoc)$/i;
// The kind of content a file name suggests; PDF, Word, slides and other prose count as text.
function typeOf(name){
 const n=String(name||'');
 if(CODE_EXT.test(n))return 'code';
 if(MARKDOWN_EXT.test(n))return 'markdown';
 return 'text';
}

// A line that starts a declaration in the common languages Petya meets in game and app projects.
const DECLARATION=new RegExp('^\\s{0,8}(?:'+[
 '(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\b',                       // JS/TS functions
 '(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\b',                       // JS/TS/Python/Kotlin classes
 '(?:export\\s+)?(?:const|let|var)\\s+[\\w$]+\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[\\w$]+)\\s*=>', // arrow functions
 '(?:export\\s+)?(?:interface|type|enum)\\s+\\w+',                                 // TS types
 '(?:async\\s+)?def\\s+\\w+',                                                      // Python
 '(?:public|private|protected|internal|static|override|virtual|abstract|sealed|partial|async|final|open|inline|unsafe|extern|readonly|\\s)*(?:class|struct|interface|enum|record|namespace|protocol|extension|object|trait|impl|mod)\\s+\\w+', // C#, Java, Swift, Kotlin, Rust
 '(?:public|private|protected|internal|static|override|virtual|abstract|async|final|open|inline|unsafe|extern|\\s)+[\\w<>\\[\\],.?]+\\s+\\w+\\s*\\([^;]*$', // methods with modifiers
 'func\\s+\\w+|fn\\s+\\w+|fun\\s+\\w+|sub\\s+\\w+',                               // Go, Swift, Rust, Kotlin, Perl
 '(?:local\\s+)?function\\s+[\\w.:]+',                                             // Lua
 '[\\w:<>*&~]+\\s+[\\w:~]+::[\\w~]+\\s*\\(',                                        // C++ out-of-class methods
 '(?:CREATE|ALTER)\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER|INDEX)\\b' // SQL
].join('|')+')','i');

// Long text in line windows with a few lines of overlap, so a function longer than MAX still reads in context.
function windows(lines,startLine,{size=TARGET,overlap=3}={}){
 const out=[];let i=0;
 while(i<lines.length){
  let len=0,j=i;
  while(j<lines.length&&(len+lines[j].length+1<=size||j===i)){len+=lines[j].length+1;j++;}
  const piece=lines.slice(i,j).join('\n');
  if(piece.length>MAX){for(let k=0;k<piece.length;k+=size)out.push({text:piece.slice(k,k+size),line:startLine+i});}
  else out.push({text:piece,line:startLine+i});
  if(j>=lines.length)break;
  i=Math.max(i+1,j-overlap);
 }
 return out;
}
// Neighbouring small parts are merged up to the target size; a part over MAX is split into windows.
function pack(parts,{size=TARGET}={}){
 const out=[];let current=null;
 for(const p of parts){
  if(!p.text.trim())continue;
  if(p.text.length>MAX){if(current){out.push(current);current=null;}for(const w of windows(p.text.split('\n'),p.line||1,{size}))out.push({...p,text:w.text,line:w.line});continue;}
  if(current&&current.text.length+p.text.length+1<=size&&current.group===p.group){current.text+='\n'+p.text;continue;}
  if(current)out.push(current);
  current={...p};
 }
 if(current)out.push(current);
 return out;
}

function code(text){
 const lines=text.split('\n'),starts=[0];
 for(let i=1;i<lines.length;i++)if(DECLARATION.test(lines[i])){
  // Comments and attributes right above a declaration belong to it.
  let s=i;while(s>starts.at(-1)+1&&/^\s*(?:\/\/|\/\*|\*|#(?!include)|@|\[|--|""")/.test(lines[s-1]))s--;
  if(s>starts.at(-1))starts.push(s);
 }
 const parts=starts.map((s,k)=>({text:lines.slice(s,starts[k+1]??lines.length).join('\n'),line:s+1}));
 return pack(parts).map(p=>({text:p.text,loc:{line:p.line}}));
}

function markdown(text){
 const lines=text.split('\n'),sections=[];let trail=[],current={heading:'',line:1,lines:[]},fence=false;
 for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(/^\s*(?:```|~~~)/.test(l))fence=!fence;
  const h=!fence&&/^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
  if(h){
   if(current.lines.some(x=>x.trim()))sections.push(current);
   const level=h[1].length;trail=trail.filter(t=>t.level<level);trail.push({level,title:h[2]});
   current={heading:trail.map(t=>t.title).join(' › '),line:i+1,lines:[l]};
  }else current.lines.push(l);
 }
 if(current.lines.some(x=>x.trim()))sections.push(current);
 const out=[];
 for(const s of sections){
  const body=s.lines.join('\n');
  if(body.length<=MAX){out.push({text:body,loc:{line:s.line,...s.heading?{heading:s.heading}:{}}});continue;}
  for(const p of paragraphs(body,s.line))out.push({text:(s.heading&&!p.text.startsWith('#')?s.heading+'\n':'')+p.text,loc:{line:p.line,...s.heading?{heading:s.heading}:{}}});
 }
 // A tiny subsection joins the section above it (its parent), so a piece has some meaning; its heading stays in the text.
 const merged=[];
 for(const p of out){
  const last=merged.at(-1);
  if(last&&p.text.length<MIN&&last.text.length+p.text.length<TARGET&&String(p.loc.heading||'').startsWith(String(last.loc.heading||'')+' › ')){last.text+='\n\n'+p.text;continue;}
  merged.push({...p});
 }
 return merged;
}

// Paragraph packing for prose with line numbers.
function paragraphs(text,firstLine=1){
 const lines=text.split('\n'),parts=[];let start=0;
 for(let i=0;i<=lines.length;i++){
  if(i===lines.length||!lines[i].trim()){if(i>start)parts.push({text:lines.slice(start,i).join('\n'),line:firstLine+start});start=i+1;}
 }
 return pack(parts);
}

// Prose with page or slide markers keeps each page/slide apart.
function prose(text){
 const marker=/^\s*\[(Страница|Слайд|Лист) (\d+)\]\s*$/gmu;
 const marks=[...text.matchAll(marker)];
 if(!marks.length)return paragraphs(text).map(p=>({text:p.text,loc:{line:p.line}}));
 const out=[];
 marks.forEach((m,k)=>{
  const body=text.slice(m.index+m[0].length,marks[k+1]?.index??text.length);
  const key={'Страница':'page','Слайд':'slide','Лист':'sheet'}[m[1]];
  for(const p of paragraphs(body.replace(/^\n+/,'')))out.push({text:p.text,loc:{[key]:Number(m[2])}});
 });
 return out;
}

// Chat messages {who, text, at}: windows of `size` messages that overlap by `overlap`, also split by length.
function chat(messages,{size=6,overlap=2}={}){
 const list=(messages||[]).filter(m=>m&&String(m.text||'').trim()).map((m,i)=>({...m,i}));
 const out=[];
 for(let i=0;i<list.length;i+=Math.max(1,size-overlap)){
  let part=list.slice(i,i+size);
  // A window over the size budget is shortened from the end (each message is still cut to MAX).
  while(part.length>1&&part.reduce((n,m)=>n+String(m.text).length,0)>MAX)part=part.slice(0,-1);
  const text=part.map(m=>(m.who?m.who+': ':'')+String(m.text).slice(0,MAX)).join('\n');
  out.push({text,loc:{from:part[0].i,to:part.at(-1).i,...part[0].at?{at:part[0].at}:{}}});
  if(i+size>=list.length)break;
 }
 return out;
}

// The pieces of one item: {type?, text?, messages?, chunks?}. Ready-made `chunks` are taken as they are.
function chunk(item){
 const type=item.type||'text';
 let out;
 if(Array.isArray(item.chunks))out=item.chunks.map(c=>typeof c==='string'?{text:c,loc:{}}:{text:String(c.text||''),loc:c.loc&&typeof c.loc==='object'?c.loc:{}});
 else if(type==='chat')out=chat(item.messages||[]);
 else{
  const text=String(item.text||'').replace(/\r\n?/g,'\n');
  out=type==='code'?code(text):type==='markdown'?markdown(text):prose(text);
 }
 return out.map(p=>({text:p.text.trim(),loc:p.loc||{}})).filter(p=>p.text).slice(0,MAX_PIECES);
}

module.exports={chunk,code,markdown,prose,chat,paragraphs,typeOf,TARGET,MAX,MAX_PIECES,DECLARATION};
