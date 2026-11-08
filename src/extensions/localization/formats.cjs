// Localization formats: parse files into sets (one source language + targets, key → text per language) and
// write translations into a NEW file next to the source. Source files are never modified.
// Formats: Unity Localization String Tables (YAML .asset + SharedTableData), I2 Localization / plain CSV / TSV,
// JSON (one file per language or one file with language sections), Android strings.xml (values-xx),
// iOS .strings (xx.lproj) and .xcstrings, gettext .po (+ .pot).
const path=require('node:path');
const langs=require('./langs.cjs');

// --- helpers -----------------------------------------------------------------------------------
function decode(buffer){
 if(typeof buffer==='string')return buffer.replace(/^\ufeff/,'');
 if(buffer[0]===0xff&&buffer[1]===0xfe)return buffer.subarray(2).toString('utf16le');
 if(buffer[0]===0xfe&&buffer[1]===0xff){const b=Buffer.from(buffer.subarray(2));b.swap16();return b.toString('utf16le');}
 return buffer.toString('utf8').replace(/^\ufeff/,'');
}
// New file name beside `file`: «Localization.csv» → «Localization.petya-de.csv»; never an existing file.
function outName(file,lang,ext=path.extname(file),exists=()=>false){
 const dir=path.dirname(file),stem=path.basename(file,path.extname(file));
 for(let i=1;i<100;i++){const p=path.join(dir,stem+'.petya-'+lang+(i>1?'-'+i:'')+ext);if(!exists(p))return p;}
 throw Error('Не нашёл свободное имя файла рядом с '+file);
}
const entity=s=>s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(lt|gt|amp|quot|apos));/gi,(m,h,d,n)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(+d):{lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[n.toLowerCase()]);

// --- CSV / TSV (I2 Localization exports, Google Sheets, plain key + language columns) ---------------------------
function csvRows(text,delimiter){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell==='')quoted=true;else if(c===delimiter){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;}
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 return rows.filter(r=>r.some(c=>c!==''));
}
const csvCell=(v,d)=>/["\n\r]/.test(v)||v.includes(d)||/^\s|\s$/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
const META=/^(?:keys?|id|term|type|desc|description|comments?|notes?|context|category|group|max ?length|tags?|screenshot|ключ|описание|комментарий)$/i;
function delimiterOf(file,text){const head=text.split(/\r?\n/,1)[0];if(/\.tsv$/i.test(file)||head.split('\t').length>head.split(',').length)return '\t';return head.split(';').length>head.split(',').length?';':',';}
function csvColumns(header){
 const keyColumn=Math.max(0,header.findIndex(h=>/^(?:keys?|term|ключ)$/i.test(h.trim())));
 const columns=header.map((h,i)=>i===keyColumn||META.test(h.trim())?null:langs.header(h)).map((lang,i)=>lang?{i,lang}:null).filter(Boolean);
 return {keyColumn,columns};
}
function csv(file,text){
 const delimiter=delimiterOf(file,text),rows=csvRows(text,delimiter);if(rows.length<2)return null;
 const {keyColumn,columns}=csvColumns(rows[0]);if(!columns.length)return null;
 const values={},keys=[];for(const c of columns)values[c.lang]=new Map();
 for(const row of rows.slice(1)){const key=(row[keyColumn]||'').trim();if(!key||values[columns[0].lang].has(key)&&keys.includes(key))continue;keys.push(key);for(const c of columns)values[c.lang].set(key,row[c.i]??'');}
 return {format:'csv',group:file,file,name:path.basename(file),keys,values,langs:columns.map(c=>c.lang),write:{rows,delimiter,keyColumn,columns}};
}
function writeCsv(set,lang,tr,exists){
 const {rows,delimiter,keyColumn,columns}=set.write;const col=columns.find(c=>c.lang===lang);
 const out=rows.map((r,n)=>{const row=[...r];if(n&&col){const t=tr.get((row[keyColumn]||'').trim());if(t!==undefined&&!(row[col.i]||'').trim()){while(row.length<=col.i)row.push('');row[col.i]=t;}}return row.map(c=>csvCell(c,delimiter)).join(delimiter);});
 return {path:outName(set.file,lang,undefined,exists),content:out.join('\n')+'\n'};
}

// --- JSON -----------------------------------------------------------------------------------------
function flatten(value,prefix=[],out=new Map()){
 if(typeof value==='string')out.set(prefix.join('.'),{text:value,path:prefix});
 else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))flatten(v,[...prefix,Array.isArray(value)?Number(k):k],out);
 return out;
}
// Language of a JSON file from its name or a folder: en.json, locales/de/common.json, i18n/pt-BR.json.
function jsonLang(file){
 const parts=file.split(/[\\/]/),stem=path.basename(file,'.json');
 if(langs.code(stem))return {lang:langs.code(stem),group:path.join(path.dirname(file),'{lang}.json')};
 for(let i=parts.length-2;i>=Math.max(0,parts.length-4);i--)if(langs.code(parts[i])){const copy=[...parts];copy[i]='{lang}';return {lang:langs.code(parts[i]),group:copy.join(path.sep)};}
 return null;
}
function json(file,text){
 let data;try{data=JSON.parse(text);}catch{return null;}
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const top=Object.keys(data),sections=top.filter(k=>langs.code(k)&&data[k]&&typeof data[k]==='object');
 if(sections.length>=2&&sections.length===top.length){
  const values={},paths=new Map(),keys=[];
  for(const k of sections){const flat=flatten(data[k]);values[langs.code(k)]=new Map([...flat].map(([key,v])=>[key,v.text]));for(const [key,v] of flat){if(!paths.has(key)){paths.set(key,v.path);keys.push(key);}}}
  return {format:'json',group:file,file,name:path.basename(file),keys,values,langs:sections.map(langs.code),write:{multi:true,data,sections,paths}};
 }
 const where=jsonLang(file);if(!where)return null;
 const flat=flatten(data);if(!flat.size)return null;
 return {format:'json',group:where.group,file,lang:where.lang,data,flat};
}
function setPath(target,keys,value){let o=target;keys.forEach((k,i)=>{if(i===keys.length-1)o[k]=value;else{if(!o[k]||typeof o[k]!=='object')o[k]=typeof keys[i+1]==='number'?[]:{};o=o[k];}});}
function writeJson(set,lang,tr,exists){
 if(set.write?.multi){const data=structuredClone(set.write.data);const section=set.write.sections.find(k=>langs.code(k)===lang);for(const [key,t] of tr)setPath(data[section],set.write.paths.get(key),t);return {path:outName(set.file,lang,'.json',exists),content:JSON.stringify(data,null,2)+'\n'};}
 const part=set.parts[lang],source=set.parts[set.source];
 const data=structuredClone(part?.data||{});for(const [key,t] of tr)setPath(data,source.flat.get(key)?.path||key.split('.'),t);
 const file=part?.file||set.group.replace('{lang}',lang);
 return {path:outName(exists(path.dirname(file))?file:path.join(path.dirname(source.file),path.basename(file)),lang,'.json',exists),content:JSON.stringify(data,null,2)+'\n'};
}

// --- Android strings.xml --------------------------------------------------------------------------------
function androidLang(file){
 const m=/[\\/]values(?:-([^\\/]+))?[\\/]strings\.xml$/.exec(file);if(!m)return undefined;
 if(!m[1])return null;
 const q=m[1].split('-');return langs.code(q[0]+(q[1]&&/^r[A-Z]{2}$/.test(q[1])?'-'+q[1]:''))||(/^b\+/.test(q[0])?langs.code(q[0]):undefined);
}
function androidText(raw){
 let v=raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,c)=>c.replace(/[&<]/g,m=>m==='&'?'\u0001':'\u0002'));
 v=v.trim();if(/^"[\s\S]*"$/.test(v)&&!/^"[\s\S]*[^\\]"[\s\S]*"$/.test(v))v=v.slice(1,-1);
 return entity(v).replace(/\\(u[0-9a-fA-F]{4}|.)/g,(_,c)=>c[0]==='u'&&c.length===5?String.fromCharCode(parseInt(c.slice(1),16)):({n:'\n',t:'\t'})[c]??c).replace(/\u0001/g,'&').replace(/\u0002/g,'<');
}
function androidEscape(v){
 return v.replace(/\\/g,'\\\\').replace(/&(?!(?:#\d+|#x[0-9a-f]+|lt|gt|amp|quot|apos);)/gi,'&amp;').replace(/<(?![/]?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>)/g,'&lt;')
  .replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/^([@?])/,'\\$1');
}
const STRING=/<string\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/string>)/g;
function android(file,text){
 const lang=androidLang(file);if(lang===undefined)return null;
 const map=new Map(),skip=new Set();let m;STRING.lastIndex=0;
 while((m=STRING.exec(text))){const name=/\bname\s*=\s*"([^"]+)"/.exec(m[1])?.[1];if(!name)continue;if(/translatable\s*=\s*"false"/.test(m[1]))skip.add(name);map.set(name,m[2]===undefined?'':androidText(m[2]));}
 return {format:'android',group:path.dirname(path.dirname(file)),file,lang,map,skip,text};
}
function writeAndroid(set,lang,tr,exists){
 const part=set.parts[lang];let content=part?.text||'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
 const added=[];
 for(const [key,t] of tr){
  const esc=androidEscape(t);let replaced=false;
  content=content.replace(new RegExp('<string\\s+([^>]*\\bname\\s*=\\s*"'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*?)(?:\\/>|>\\s*<\\/string>)'),(_,attrs)=>{replaced=true;return '<string '+attrs.replace(/\s+$/,'')+'>'+esc+'</string>';});
  if(!replaced)added.push('    <string name="'+key+'">'+esc+'</string>');
 }
 if(added.length)content=content.replace(/\s*<\/resources>\s*$/,'\n'+added.join('\n')+'\n</resources>\n');
 // Outside res/ so the build never picks it up (a «-» in a resource file name would break aapt).
 return {path:outName(path.join(path.dirname(set.group),'strings.xml'),lang,'.xml',exists),content};
}

// --- iOS .strings ---------------------------------------------------------------------------------
function stringsUnescape(s){return s.replace(/\\(U[0-9a-fA-F]{4}|u[0-9a-fA-F]{4}|.)/g,(_,c)=>c.length===5?String.fromCharCode(parseInt(c.slice(1),16)):({n:'\n',t:'\t',r:'\r'})[c]??c);}
const stringsEscape=s=>s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\t/g,'\\t');
function stringsPairs(text){
 const out=[];let i=0;const n=text.length;
 const str=()=>{let s='';i++;while(i<n&&text[i]!=='"'){if(text[i]==='\\'){s+=text[i]+text[i+1];i+=2;}else s+=text[i++];}i++;return stringsUnescape(s);};
 const skip=()=>{for(;;){while(i<n&&/\s/.test(text[i]))i++;if(text.startsWith('/*',i)){const e=text.indexOf('*/',i+2);i=e<0?n:e+2;}else if(text.startsWith('//',i)){const e=text.indexOf('\n',i);i=e<0?n:e+1;}else break;}};
 while(i<n){skip();if(i>=n)break;
  if(text[i]!=='"'){const e=text.indexOf(';',i);i=e<0?n:e+1;continue;}
  const key=str();skip();if(text[i]!=='='){const e=text.indexOf(';',i);i=e<0?n:e+1;continue;}i++;skip();
  if(text[i]!=='"'){const e=text.indexOf(';',i);i=e<0?n:e+1;continue;}
  const value=str();skip();if(text[i]===';')i++;out.push([key,value]);}
 return out;
}
function strings(file,text){
 const m=/(?:^|[\\/])([^\\/]+)\.lproj[\\/]([^\\/]+)\.strings$/.exec(file);if(!m)return null;
 const lang=m[1]==='Base'?null:langs.code(m[1]);if(lang===undefined||m[1]!=='Base'&&!lang)return null;
 return {format:'strings',group:path.join(path.dirname(path.dirname(file)),m[2]+'.strings'),file,lang,map:new Map(stringsPairs(text)),text,table:m[2]};
}
function writeStrings(set,lang,tr,exists){
 const part=set.parts[lang];let content=part?.text||'';const added=[];
 for(const [key,t] of tr){
  const k=stringsEscape(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');let replaced=false;
  content=content.replace(new RegExp('("'+k+'"\\s*=\\s*)""'),(_,head)=>{replaced=true;return head+'"'+stringsEscape(t)+'"';});
  if(!replaced)added.push('"'+stringsEscape(key)+'" = "'+stringsEscape(t)+'";');
 }
 if(added.length)content=content.replace(/\s*$/,'')+(content.trim()?'\n\n':'')+'/* Petya: переводы на проверку */\n'+added.join('\n')+'\n';
 const file=part?.file||path.join(path.dirname(set.group),lang+'.lproj',set.table+'.strings');
 return {path:outName(exists(path.dirname(file))?file:path.join(path.dirname(set.group),set.table+'.strings'),lang,'.strings',exists),content};
}

// --- .xcstrings ---------------------------------------------------------------------------------------
function xcstrings(file,text){
 let data;try{data=JSON.parse(text);}catch{return null;}
 if(!data?.strings||typeof data.strings!=='object')return null;
 const source=langs.code(data.sourceLanguage)||'en',keys=Object.keys(data.strings),skip=new Set(),values={[source]:new Map()};
 for(const key of keys){
  const e=data.strings[key]||{},loc=e.localizations||{};
  if(e.shouldTranslate===false)skip.add(key);
  if(loc[data.sourceLanguage]?.variations)skip.add(key);
  values[source].set(key,loc[data.sourceLanguage]?.stringUnit?.value??key);
  for(const [l,v] of Object.entries(loc)){const c=langs.code(l);if(!c||c===source)continue;values[c]??=new Map();values[c].set(key,v.stringUnit?v.stringUnit.value??'':v.variations?'\u0000':'');}
 }
 for(const l of Object.keys(values))for(const [k,v] of values[l])if(v==='\u0000'){values[l].set(k,values[source].get(k));skip.add(k);}
 return {format:'xcstrings',group:file,file,name:path.basename(file),keys,values,langs:Object.keys(values),source,skip,write:{data}};
}
function writeXcstrings(set,lang,tr,exists){
 const data=structuredClone(set.write.data);
 const code=Object.keys(Object.values(data.strings).find(e=>Object.keys(e.localizations||{}).some(l=>langs.code(l)===lang))?.localizations||{}).find(l=>langs.code(l)===lang)||lang;
 for(const [key,t] of tr){const e=data.strings[key]??={};e.localizations??={};e.localizations[code]={stringUnit:{state:'needs_review',value:t}};}
 return {path:outName(set.file,lang,'.xcstrings',exists),content:JSON.stringify(data,null,2)+'\n'};
}

// --- gettext .po / .pot ---------------------------------------------------------------------------------
const poString=lines=>lines.map(l=>/^"([\s\S]*)"$/.exec(l.trim())?.[1]||'').join('').replace(/\\(.)/g,(_,c)=>({n:'\n',t:'\t','"':'"','\\':'\\'})[c]??c);
const poEscape=s=>s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\t/g,'\\t');
function po(file,text){
 const isPot=/\.pot$/i.test(file);const lines=text.split(/\r?\n/),entries=[];let e=null,field=null;
 const flush=()=>{if(e?.msgidLines)entries.push(e);e=null;field=null;};
 lines.forEach((line,n)=>{
  const t=line.trim();
  if(!t){flush();return;}
  if(t.startsWith('#')){if(e?.msgidLines)flush();e??={flags:'',start:n};if(t.startsWith('#,'))e.flags+=t;return;}
  const m=/^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+(".*")$/.exec(t);
  if(m){if((m[1]==='msgctxt'||m[1]==='msgid')&&e?.msgidLines)flush();e??={flags:'',start:n};field=m[1].startsWith('msgstr')?(m[2]&&m[2]!=='0'?'other':'msgstr'):m[1];
   if(field==='msgstr'){e.strFrom=n;e.strTo=n;}
   if(field!=='other')e[field+'Lines']=[m[3]];return;}
  if(t.startsWith('"')&&e&&field&&field!=='other'){e[field+'Lines'].push(t);if(field==='msgstr')e.strTo=n;}
 });
 flush();
 const map=new Map(),plural=new Set();let lang=null;
 for(const x of entries){
  x.msgid=poString(x.msgidLines||[]);const ctx=x.msgctxtLines?poString(x.msgctxtLines):'';
  const str=poString(x.msgstrLines||[]);
  if(!x.msgid&&!ctx){lang=langs.code(/Language:\s*([\w@-]+)/.exec(str)?.[1]||'')||null;continue;}
  const key=(ctx?ctx+'\u0004':'')+x.msgid;x.key=key;
  if(x.msgid_pluralLines)plural.add(key);
  map.set(key,isPot||/fuzzy/.test(x.flags)?'':str);
 }
 if(!isPot&&!lang){const stem=path.basename(file,'.po'),parts=file.split(/[\\/]/);lang=langs.code(stem)||langs.code(parts.at(-3)||'')||langs.code(stem.split(/[.-]/).at(-1))||null;}
 if(!isPot&&!lang)return null;
 const domain=/[\\/]LC_MESSAGES[\\/]/.test(file)?path.join(path.dirname(path.dirname(path.dirname(file))),'{lang}',path.basename(file).replace(/\.pot?$/,'')):path.dirname(file);
 return {format:'po',group:isPot?'pot:'+path.dirname(file):domain,file,lang:isPot?'template':lang,map,plural,text,entries:entries.filter(x=>x.key)};
}
function writePo(set,lang,tr,exists){
 const part=set.parts[lang];const lines=part.text.split(/\r?\n/);const done=new Set();
 // Replace from the end so earlier line numbers stay valid.
 for(const x of [...part.entries].sort((a,b)=>b.strFrom-a.strFrom)){
  const t=tr.get(x.key);if(t===undefined||x.strFrom===undefined||set.plural?.has(x.key))continue;
  lines.splice(x.strFrom,x.strTo-x.strFrom+1,'msgstr "'+poEscape(t)+'"');done.add(x.key);
  if(/fuzzy/.test(x.flags)){const at=lines.findIndex((l,i)=>i>=x.start&&i<x.strFrom&&/^#,.*fuzzy/.test(l));if(at>=0){const rest=lines[at].replace(/,?\s*fuzzy/,'');if(/^#,?\s*$/.test(rest))lines.splice(at,1);else lines[at]=rest;}}
 }
 while(lines.length&&!lines.at(-1).trim())lines.pop();
 for(const [key,t] of tr)if(!done.has(key)&&!set.plural?.has(key)){const [ctx,id]=key.includes('\u0004')?key.split('\u0004'):[null,key];lines.push('',...(ctx?['msgctxt "'+poEscape(ctx)+'"']:[]),'msgid "'+poEscape(id)+'"','msgstr "'+poEscape(t)+'"');}
 return {path:outName(part.file,lang,'.po',exists),content:lines.join('\n').replace(/\n*$/,'\n')};
}

// --- Unity Localization (String Tables) -------------------------------------------------------------------
function yamlScalar(lines){
 const first=lines[0].trim();
 if(!first)return '';
 const fold=parts=>{let out='';parts.forEach((p,i)=>{const t=i?p.trim():p;if(i&&t==='')out+='\n';else out+=(i&&out&&!out.endsWith('\n')?' ':'')+t;});return out;};
 if(first.startsWith("'")){const body=fold([first,...lines.slice(1)]);return body.slice(1,body.lastIndexOf("'")).replace(/''/g,"'");}
 if(first.startsWith('"')){
  let raw='';[first,...lines.slice(1)].forEach((p,i)=>{let t=i?p.trim():p;if(raw.endsWith('\\')&&!raw.endsWith('\\\\')){raw=raw.slice(0,-1);raw+=t;return;}raw+=(i?(t===''?'\n':' '):'')+t;});
  raw=raw.slice(1,raw.lastIndexOf('"'));
  return raw.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g,(_,c)=>c[0]==='x'&&c.length===3||c[0]==='u'&&c.length===5?String.fromCharCode(parseInt(c.slice(1),16)):({n:'\n',t:'\t',r:'\r','0':'\0',' ':' ','/':'/','"':'"','\\':'\\',N:'\u0085',_:'\u00a0'})[c]??c);
 }
 return fold([first,...lines.slice(1)]);
}
function unityEntries(text,valueKey){
 const lines=text.split(/\r?\n/),out=[];let id=null;
 for(let i=0;i<lines.length;i++){
  const idm=/^\s*- m_Id:\s*(-?\d+)/.exec(lines[i]);if(idm){id=idm[1];continue;}
  const vm=new RegExp('^(\\s*)'+valueKey+':(.*)$').exec(lines[i]);
  if(vm&&id!==null){const indent=vm[1].length,parts=[vm[2].replace(/^ /,'')];
   while(i+1<lines.length&&!/^\s*(?:- )?m_\w+:/.test(lines[i+1])&&(lines[i+1].trim()===''||lines[i+1].search(/\S/)>indent)){parts.push(lines[++i]);}
   out.push([id,yamlScalar(parts)]);id=null;}
 }
 return out;
}
function unity(file,text,meta=''){
 if(/^\s*m_TableCollectionName:/m.test(text)&&/^\s*m_Entries:/m.test(text)){
  return {format:'unity',kind:'shared',file,guid:/^guid:\s*([0-9a-f]+)/m.exec(meta)?.[1]||'',collection:/m_TableCollectionName:\s*(.*)/.exec(text)[1].trim(),entries:unityEntries(text,'m_Key')};
 }
 if(/^\s*m_TableData:/m.test(text)&&/m_SharedData:/.test(text)){
  const lang=langs.code(/m_LocaleId:\s*\n\s*m_Code:\s*([\w-]+)/.exec(text)?.[1]||'');if(!lang)return null;
  return {format:'unity',kind:'table',file,lang,shared:/m_SharedData:\s*\{[^}]*guid:\s*([0-9a-f]+)/.exec(text)?.[1]||'',name:/m_Name:\s*(.*)/.exec(text)?.[1].trim()||path.basename(file,'.asset'),entries:unityEntries(text,'m_Localized')};
 }
 return null;
}
function writeUnity(set,lang,tr,exists){
 const values=set.values[lang]||new Map();
 const head=['Key','Id',(langs.NAMES[langs.base(lang)]?langs.name(lang).replace(/ \(.*\)$/,''):lang)+'('+lang+')'];
 const rows=[head.join(',')];
 for(const key of set.keys){const t=tr.get(key)??values.get(key)??'';rows.push([key,set.write.ids.get(key)||'',t].map(c=>csvCell(String(c),',')).join(','));}
 return {path:outName(path.join(path.dirname(set.parts[set.source]?.file||set.file),set.write.collection+'.csv'),lang,'.csv',exists),content:rows.join('\n')+'\n'};
}

// --- loading and grouping ---------------------------------------------------------------------------------
function parse(file,text,meta){
 const lower=file.toLowerCase();
 if(lower.endsWith('.asset'))return unity(file,text,meta);
 if(/\.(?:csv|tsv)$/.test(lower))return csv(file,text);
 if(lower.endsWith('.xcstrings'))return xcstrings(file,text);
 if(lower.endsWith('.json'))return json(file,text);
 if(lower.endsWith('strings.xml'))return android(file,text);
 if(lower.endsWith('.strings'))return strings(file,text);
 if(/\.pot?$/.test(lower))return po(file,text);
 return null;
}
// Groups parsed files into sets. `source` is the preferred source language (settings), used when files do not say.
function sets(parts,{source='en'}={}){
 const out=[];
 const pick=(available)=>available.find(l=>langs.same(l,source))||available.find(l=>l==='en')||available[0];
 for(const p of parts.filter(p=>p&&p.keys)){const s={...p,source:p.source||pick(p.langs),skip:p.skip||new Set()};out.push(s);}
 const groups=new Map();
 for(const p of parts.filter(p=>p&&!p.keys&&p.format!=='unity')){const k=p.format+'|'+p.group;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}
 for(const [k,list] of groups){
  const format=k.split('|')[0];
  if(format==='po'&&k.startsWith('po|pot:'))continue;
  const values={},partsBy={},skip=new Set(),keys=[];let src;
  if(format==='po'){
   // The .pot template sits beside the .po files or a few folders up (locale/<lang>/LC_MESSAGES/x.po).
   let pot=null;for(let dir=path.dirname(list[0].file),i=0;i<4&&!pot;i++,dir=path.dirname(dir))pot=groups.get('po|pot:'+dir)?.[0]||null;
   src=source;values[src]=new Map();const plural=new Set();
   for(const p of [...(pot?[pot]:[]),...list]){for(const [key] of p.map)if(!values[src].has(key)){values[src].set(key,key.split('\u0004').at(-1));keys.push(key);}for(const x of p.plural)plural.add(x);}
   for(const p of list){values[p.lang]=p.map;partsBy[p.lang]=p;}
   out.push({format,group:list[0].group,file:list[0].file,name:path.basename(list[0].file)+(list.length>1?' +'+(list.length-1):''),keys,values,langs:[src,...list.map(p=>p.lang)],source:src,skip:new Set(),plural,parts:partsBy,files:list.map(p=>p.file)});
   continue;
  }
  for(const p of list){
   const lang=p.lang===null?'\u0000default':p.lang;if(partsBy[lang])continue;
   partsBy[lang]=p;values[lang]=p.format==='json'?new Map([...p.flat].map(([key,v])=>[key,v.text])):p.map;
   for(const x of p.skip||[])skip.add(x);
  }
  if(partsBy['\u0000default']){const d=partsBy['\u0000default'];delete partsBy['\u0000default'];const v=values['\u0000default'];delete values['\u0000default'];
   const lang=Object.keys(values).some(l=>langs.same(l,source))?'\u0000':source;// a default folder never shadows an explicit one
   if(lang!=='\u0000'){partsBy[lang]=d;values[lang]=v;}}
  const available=Object.keys(values);if(available.length<1)continue;
  src=pick(available);
  for(const key of values[src].keys())keys.push(key);
  const display=format==='json'?path.basename(list[0].group).replace('{lang}','*'):format==='android'?'strings.xml':format==='strings'?path.basename(list[0].group):path.basename(list[0].file);
  out.push({format,group:list[0].group,file:partsBy[src].file,name:display,keys,values,langs:available,source:src,skip,parts:partsBy,table:list[0].table,files:list.map(p=>p.file)});
 }
 // Unity: string tables joined to their shared data by GUID (or by collection name when .meta files are absent).
 const shared=parts.filter(p=>p?.format==='unity'&&p.kind==='shared'),tables=parts.filter(p=>p?.format==='unity'&&p.kind==='table');
 for(const sh of shared){
  const own=tables.filter(t=>sh.guid?t.shared===sh.guid:path.basename(t.file).startsWith(sh.collection));if(!own.length)continue;
  const ids=new Map(sh.entries.map(([id,key])=>[id,key])),keys=sh.entries.map(([,key])=>key),values={},partsBy={};
  for(const t of own){values[t.lang]=new Map(t.entries.filter(([id])=>ids.has(id)).map(([id,v])=>[ids.get(id),v]));partsBy[t.lang]=t;}
  const available=Object.keys(values),src=pick(available);
  out.push({format:'unity',group:sh.file,file:partsBy[src].file,name:sh.collection,keys,values,langs:available,source:src,skip:new Set(),parts:partsBy,files:[sh.file,...own.map(t=>t.file)],write:{collection:sh.collection,ids:new Map(sh.entries.map(([id,key])=>[key,id]))}});
 }
 return out.filter(s=>s.langs.length>=1&&s.keys.length);
}
const WRITERS={csv:writeCsv,json:writeJson,android:writeAndroid,strings:writeStrings,xcstrings:writeXcstrings,po:writePo,unity:writeUnity};
// The new file with translations for one language; `exists(path)` keeps names unique and checks folders.
function write(set,lang,translations,exists=()=>false){return WRITERS[set.format](set,lang,translations,exists);}
const LABELS={csv:'CSV',json:'JSON',android:'Android strings.xml',strings:'iOS .strings',xcstrings:'Xcode String Catalog',po:'gettext .po',unity:'Unity String Table'};
module.exports={parse,sets,write,decode,csvRows,yamlScalar,stringsPairs,androidText,androidEscape,outName,LABELS};
