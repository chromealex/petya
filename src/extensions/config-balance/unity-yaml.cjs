// A safe reader for Unity's serialized YAML (ScriptableObject `.asset` files). Unity writes a small YAML subset:
// documents `--- !u!<classId> &<fileId>` (optionally `stripped`), block mappings and sequences with two-space
// indentation, flow mappings for references `{fileID: 11400000, guid: …, type: 2}`, quoted strings that may wrap
// onto the next lines. Only that subset is read: no tags are resolved, no anchors or aliases are followed, nothing
// is executed; anything else is kept as text. Every scalar remembers its line so a change can name it.
const MAX_LINES=200000,MAX_DEPTH=40;
const NUMBER=/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
// Fields every MonoBehaviour has; they are not game data.
const SERVICE=new Set(['m_ObjectHideFlags','m_CorrespondingSourceObject','m_PrefabInstance','m_PrefabAsset','m_PrefabParentObject','m_PrefabInternal','m_GameObject','m_Enabled','m_EditorHideFlags','m_Script','m_EditorClassIdentifier']);

function scalar(text){
 const t=String(text).trim();
 if(t==='')return '';
 if(t==='~'||t==='null')return null;
 if(t[0]==="'"&&t.endsWith("'")&&t.length>=2)return t.slice(1,-1).replace(/''/g,"'");
 if(t[0]==='"'&&t.endsWith('"')&&t.length>=2)return t.slice(1,-1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g,(m,e)=>e[0]==='u'||e[0]==='x'?String.fromCharCode(parseInt(e.slice(1),16)):({n:'\n',t:'\t',r:'\r','"':'"','\\':'\\','/':'/',0:'\0',' ':' '}[e]??e));
 if(NUMBER.test(t)){const n=Number(t);if(Number.isFinite(n)&&!(/^[-+]?0\d/.test(t)&&!t.includes('.')))return n;}
 return t;
}
// Flow collections: `{a: 1, b: {c: x}}`, `[1, 2]`. Quoted parts keep their commas.
function flow(text){
 let i=0;const s=String(text);
 const ws=()=>{while(i<s.length&&/\s/.test(s[i]))i++;};
 function value(depth){
  if(depth>MAX_DEPTH)throw Error('too deep');
  ws();
  if(s[i]==='{'){i++;const o={};ws();if(s[i]==='}'){i++;return o;}
   for(;;){ws();const key=token(':');i++;o[String(scalar(key))]=value(depth+1);ws();if(s[i]===','){i++;continue;}if(s[i]==='}'){i++;return o;}throw Error('bad flow map');}}
  if(s[i]==='['){i++;const a=[];ws();if(s[i]===']'){i++;return a;}
   for(;;){a.push(value(depth+1));ws();if(s[i]===','){i++;continue;}if(s[i]===']'){i++;return a;}throw Error('bad flow seq');}}
  return scalar(token(',}]'));
 }
 function token(stops){
  ws();let start=i;
  if(s[i]==="'"||s[i]==='"'){const q=s[i++];while(i<s.length){if(s[i]===q){if(q==="'"&&s[i+1]==="'"){i+=2;continue;}i++;break;}if(q==='"'&&s[i]==='\\')i++;i++;}return s.slice(start,i);}
  while(i<s.length&&!stops.includes(s[i]))i++;
  return s.slice(start,i).trim();
 }
 const v=value(0);ws();if(i<s.length)throw Error('trailing flow text');return v;
}
const isSeq=l=>l.text==='-'||l.text.startsWith('- ');
const KEY=/^((?:'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^\s'"#\-?:,[\]{}][^:]*?|-[^\s:][^:]*?)):(?:[ \t]+(.*))?$/;

// One document's lines → value with `lines` (path → 1-based line) filled.
function parseLines(lines,lineMap){
 let i=0;
 function readScalar(rest,indent,path,line){
  let text=rest.trim();
  // A quoted string that does not close on its line continues on the more indented lines below (folded with spaces).
  const q=text[0];
  if((q==="'"||q==='"')&&!closed(text)){while(i<lines.length&&!closed(text)){text+=' '+lines[i].text.trim();i++;}}
  else if(q!=='{'&&q!=='['&&q!=="'"&&q!=='"'){while(i<lines.length&&lines[i].indent>indent&&!KEY.test(lines[i].text)&&!isSeq(lines[i])){text+=' '+lines[i].text.trim();i++;}}
  let v;
  if(q==='{'||q==='['){try{v=flow(text);}catch{v=text;}}
  else v=scalar(text);
  lineMap[path]=line;
  return v;
 }
 function closed(t){const q=t[0];if(t.length<2)return false;if(!t.endsWith(q))return false;
  if(q==="'"){let n=0;for(let j=t.length-1;j>0&&t[j]==="'";j--)n++;return n%2===1||t.length===2;}
  let b=0;for(let j=t.length-2;j>0&&t[j]==='\\';j--)b++;return b%2===0;}
 function node(indent,path,depth){
  if(depth>MAX_DEPTH)throw Error('Слишком глубокая вложенность YAML.');
  return isSeq(lines[i])?seq(indent,path,depth):map(indent,path,depth);
 }
 function map(indent,path,depth){
  const out={};
  while(i<lines.length&&lines[i].indent===indent&&!isSeq(lines[i])){
   const l=lines[i],m=KEY.exec(l.text);i++;
   if(!m)continue;
   const key=String(scalar(m[1])),p=path?path+'.'+key:key;
   if(m[2]===undefined||m[2].trim()===''){
    const next=lines[i];
    if(next&&(next.indent>indent||next.indent===indent&&isSeq(next)))out[key]=node(next.indent,p,depth+1);
    else{out[key]=null;lineMap[p]=l.line;}
   }else out[key]=readScalar(m[2],indent,p,l.line);
  }
  return out;
 }
 function seq(indent,path,depth){
  const out=[];
  while(i<lines.length&&lines[i].indent===indent&&isSeq(lines[i])){
   const l=lines[i],content=l.text==='-'?'':l.text.slice(2),p=path+'['+out.length+']';
   if(!content.trim()){i++;const next=lines[i];out.push(next&&next.indent>indent?node(next.indent,p,depth+1):null);continue;}
   const inner=indent+2+(content.length-content.trimStart().length);
   if(KEY.test(content.trimStart())&&!/^['"{[]/.test(content.trimStart())){lines[i]={indent:inner,text:content.trimStart(),line:l.line};out.push(map(inner,p,depth+1));}
   else{i++;out.push(readScalar(content,indent,p,l.line));}
  }
  return out;
 }
 if(!lines.length)return null;
 const first=lines[0].indent;
 const v=node(first,'',0);
 return v;
}

// A whole .asset file → [{classId, fileId, type, data, lines}].
function parse(text){
 const raw=String(text||'').replace(/\r\n?/g,'\n').split('\n');
 if(raw.length>MAX_LINES)throw Error('Файл слишком большой.');
 const docs=[];let cur=null;
 raw.forEach((line,idx)=>{
  if(/^%/.test(line))return;
  const head=/^---\s+!u!(\d+)\s+&(-?\d+)(\s+stripped)?\s*$/.exec(line);
  if(head||/^---(?:\s|$)/.test(line)){cur={classId:head?Number(head[1]):null,fileId:head?head[2]:'',stripped:!!head?.[3],lines:[]};docs.push(cur);return;}
  if(!cur){cur={classId:null,fileId:'',lines:[]};docs.push(cur);}
  if(!line.trim()||/^\s*#/.test(line))return;
  const indent=line.length-line.trimStart().length;
  cur.lines.push({indent,text:line.trim().replace(/\s+#\s.*$/,'').trimEnd(),line:idx+1});
 });
 return docs.filter(d=>d.lines.length).map(d=>{
  const lineMap={};let value;
  try{value=parseLines(d.lines,lineMap);}catch(e){return {classId:d.classId,fileId:d.fileId,type:'',data:null,lines:{},error:e.message};}
  const type=value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value)[0]:'';
  const data=type?value[type]:value;
  const lines={};for(const [k,v] of Object.entries(lineMap))lines[type&&k.startsWith(type+'.')?k.slice(type.length+1):k]=v;
  return {classId:d.classId,fileId:d.fileId,type,data,lines};
 });
}
// A Unity object reference: {fileID, guid?, type?}.
const isRef=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&'fileID' in v&&Object.keys(v).every(k=>['fileID','guid','type'].includes(k));
// The ScriptableObject(s) of an .asset: MonoBehaviour documents with their own fields, name and script guid.
function scriptables(text){
 return parse(text).filter(d=>d.type==='MonoBehaviour'&&d.data&&typeof d.data==='object').map(d=>{
  const fields={};for(const [k,v] of Object.entries(d.data))if(!SERVICE.has(k)&&k!=='m_Name')fields[k]=v;
  return {fileId:d.fileId,name:String(d.data.m_Name??''),script:String(d.data.m_Script?.guid||''),fields,lines:d.lines};
 });
}
module.exports={parse,scriptables,flow,scalar,isRef,SERVICE};
