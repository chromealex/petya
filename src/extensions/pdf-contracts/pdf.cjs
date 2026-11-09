// «Договоры в PDF»: a small PDF text-layer reader in plain Node (no dependencies), so every page keeps its lines and
// its number. It reads objects in file order (later definitions win; object streams fill the rest), follows the page
// tree, and interprets the content streams: fonts with ToUnicode CMaps (CID and simple fonts), WinAnsi / Mac /
// Standard encodings with Differences (uniXXXX, Cyrillic afii names), glyph widths for word spacing, the text and
// graphics matrices, Form XObjects and inline images. Glyph runs are put into lines by position (a two-column layout
// is read column by column). Pages without text but with an image are reported as scans; their largest image is
// extracted (JPEG, JPEG 2000, 8-bit gray / RGB / indexed and 1-bit images, CCITT fax as TIFF) for a local OCR.
// Encrypted PDFs are refused with a clear message; nothing is executed (no JavaScript, no fonts loaded).
const zlib=require('node:zlib');

class Name{constructor(n){this.name=n;}}
class Ref{constructor(n,g){this.num=n;this.gen=g;}}
class Str{constructor(b){this.bytes=b;}} // latin1 string of the raw bytes
class Op{constructor(o){this.op=o;}}
const WS=new Set([0,9,10,12,13,32]);
const DELIM=new Set('()<>[]{}/%'.split('').map(c=>c.charCodeAt(0)));

// --- Lexer / parser over a latin1 string ----------------------------------------------------------------------------
class Lexer{
 constructor(src,pos=0){this.s=src;this.i=pos;}
 skip(){const s=this.s;for(;;){while(this.i<s.length&&WS.has(s.charCodeAt(this.i)))this.i++;if(s[this.i]==='%'){while(this.i<s.length&&s[this.i]!=='\n'&&s[this.i]!=='\r')this.i++;continue;}return;}}
 token(){
  this.skip();const s=this.s;if(this.i>=s.length)return undefined;
  const c=s[this.i];
  if(c==='('){return this.literal();}
  if(c==='<'){if(s[this.i+1]==='<'){this.i+=2;return {t:'<<'};}return this.hex();}
  if(c==='>'&&s[this.i+1]==='>'){this.i+=2;return {t:'>>'};}
  if(c==='['||c===']'||c==='{'||c==='}'){this.i++;return {t:c};}
  if(c==='/'){let j=this.i+1;while(j<s.length&&!WS.has(s.charCodeAt(j))&&!DELIM.has(s.charCodeAt(j)))j++;const raw=s.slice(this.i+1,j);this.i=j;return new Name(raw.replace(/#([0-9a-fA-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))));}
  let j=this.i;while(j<s.length&&!WS.has(s.charCodeAt(j))&&!DELIM.has(s.charCodeAt(j)))j++;
  if(j===this.i){this.i++;return {t:c};}
  const w=s.slice(this.i,j);this.i=j;
  if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(w))return Number(w);
  if(w==='true')return true;if(w==='false')return false;if(w==='null')return null;
  return new Op(w);
 }
 literal(){
  const s=this.s;let depth=1,out='';this.i++;
  while(this.i<s.length){
   const c=s[this.i++];
   if(c==='\\'){const n=s[this.i++];
    if(n==='n')out+='\n';else if(n==='r')out+='\r';else if(n==='t')out+='\t';else if(n==='b')out+='\b';else if(n==='f')out+='\f';
    else if(n==='\r'){if(s[this.i]==='\n')this.i++;}else if(n==='\n'){}
    else if(n>='0'&&n<='7'){let o=n;while(o.length<3&&s[this.i]>='0'&&s[this.i]<='7')o+=s[this.i++];out+=String.fromCharCode(parseInt(o,8)&255);}
    else out+=n;continue;}
   if(c==='(')depth++;else if(c===')'){if(--depth===0)break;}
   out+=c;
  }
  return new Str(out);
 }
 hex(){const s=this.s;const end=s.indexOf('>',this.i);const h=s.slice(this.i+1,end<0?s.length:end).replace(/[^0-9a-fA-F]/g,'');this.i=end<0?s.length:end+1;let out='';for(let k=0;k<h.length;k+=2)out+=String.fromCharCode(parseInt((h[k]+(h[k+1]||'0')),16));return new Str(out);}
 // A full object: numbers followed by «n g R» become references.
 value(tok=this.token()){
  if(tok===undefined)return undefined;
  if(tok&&tok.t==='<<'){const d=Object.create(null);for(;;){const k=this.token();if(k===undefined||k.t==='>>')return d;if(!(k instanceof Name))continue;d[k.name]=this.value();}}
  if(tok&&tok.t==='['){const a=[];for(;;){const t=this.token();if(t===undefined||t.t===']')return a;a.push(this.value(t));}}
  if(typeof tok==='number'&&Number.isInteger(tok)){
   const save=this.i;const t2=this.token();
   if(typeof t2==='number'&&Number.isInteger(t2)){const save2=this.i;const t3=this.token();if(t3 instanceof Op&&t3.op==='R')return new Ref(tok,t2);this.i=save2;}
   this.i=save;
  }
  return tok;
 }
}

// --- Filters -----------------------------------------------------------------------------------------------------------
function inflate(buf){
 try{return zlib.inflateSync(buf);}catch{}
 try{return zlib.inflateSync(buf,{finishFlush:zlib.constants.Z_SYNC_FLUSH});}catch{}
 try{return zlib.inflateRawSync(buf,{finishFlush:zlib.constants.Z_SYNC_FLUSH});}catch{}
 return Buffer.alloc(0);
}
function asciiHex(buf){const h=buf.toString('latin1').replace(/>.*$/s,'').replace(/[^0-9a-fA-F]/g,'');return Buffer.from(h.length%2?h+'0':h,'hex');}
function ascii85(buf){
 const s=buf.toString('latin1').replace(/^<~/,'').replace(/~>.*$/s,'').replace(/\s+/g,'');const out=[];let group=[];
 for(const ch of s){if(ch==='z'&&!group.length){out.push(0,0,0,0);continue;}group.push(ch.charCodeAt(0)-33);if(group.length===5){let v=0;for(const g of group)v=v*85+g;out.push(v>>>24&255,v>>>16&255,v>>>8&255,v&255);group=[];}}
 if(group.length){const n=group.length;while(group.length<5)group.push(84);let v=0;for(const g of group)v=v*85+g;const b=[v>>>24&255,v>>>16&255,v>>>8&255,v&255];out.push(...b.slice(0,n-1));}
 return Buffer.from(out);
}
// PNG predictors (Predictor ≥ 10) and TIFF predictor 2 on decoded rows.
function predictor(buf,parms){
 const p=num(parms?.Predictor,1);if(p<2)return buf;
 const colors=num(parms.Colors,1),bpc=num(parms.BitsPerComponent,8),cols=num(parms.Columns,1);
 const bpp=Math.max(1,Math.ceil(colors*bpc/8)),row=Math.ceil(colors*bpc*cols/8);
 if(p===2){if(bpc!==8)return buf;const out=Buffer.from(buf);for(let r=0;r*row<out.length;r++)for(let i=bpp;i<row;i++){const k=r*row+i;if(k<out.length)out[k]=(out[k]+out[k-bpp])&255;}return out;}
 const out=Buffer.alloc(Math.floor(buf.length/(row+1))*row);let prev=Buffer.alloc(row);
 for(let r=0,o=0;r+row<buf.length;r+=row+1,o+=row){
  const type=buf[r],line=Buffer.from(buf.subarray(r+1,r+1+row));
  for(let i=0;i<row;i++){const a=i>=bpp?line[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;
   if(type===1)line[i]=(line[i]+a)&255;else if(type===2)line[i]=(line[i]+b)&255;else if(type===3)line[i]=(line[i]+((a+b)>>1))&255;
   else if(type===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);line[i]=(line[i]+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}}
  line.copy(out,o);prev=line;
 }
 return out;
}
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const nameOf=v=>v instanceof Name?v.name:null;

// --- Document ----------------------------------------------------------------------------------------------------------
class PDF{
 constructor(bytes){
  this.buf=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  this.src=this.buf.toString('latin1');
  if(!/%PDF-\d/.test(this.src.slice(0,1024)))throw Error('Это не PDF.');
  this.objects=new Map();this.parse();
 }
 parse(){
  const re=/(\d{1,7})\s+(\d{1,5})\s+obj\b/g;let m;
  const streams=[];
  while((m=re.exec(this.src))){
   const lex=new Lexer(this.src,re.lastIndex);let value;
   try{value=lex.value();}catch{continue;}
   const after=new Lexer(this.src,lex.i);after.skip();
   let stream=null;
   if(value&&typeof value==='object'&&!(value instanceof Name)&&!(value instanceof Str)&&this.src.startsWith('stream',after.i)){
    let start=after.i+6;if(this.src[start]==='\r')start++;if(this.src[start]==='\n')start++;
    let end=-1;const len=value.Length;
    if(typeof len==='number'&&len>=0&&/^\s*endstream/.test(this.src.slice(start+len,start+len+20)))end=start+len;
    else{end=this.src.indexOf('endstream',start);if(end<0)end=this.src.length;while(end>start&&(this.src[end-1]==='\n'||this.src[end-1]==='\r'))end--;}
    stream={dict:value,raw:this.buf.subarray(start,end)};
    re.lastIndex=Math.max(re.lastIndex,end);
   }
   const obj=stream||{value};
   this.objects.set(Number(m[1]),obj);
   if(stream&&nameOf(value.Type)==='ObjStm')streams.push(stream);
   if(nameOf(value?.Type)==='XRef'&&value.Encrypt||value?.Encrypt&&value?.Root)this.encrypted=true;
  }
  if(/\btrailer\s*<<[^]*?\/Encrypt\b/.test(this.src))this.encrypted=true;
  // Objects inside object streams fill what the file does not define directly.
  for(const st of streams){
   try{
    const data=this.decode(st).toString('latin1');const n=num(st.dict.N,0),first=num(st.dict.First,0);
    const head=new Lexer(data.slice(0,first));const pairs=[];for(let k=0;k<n;k++){const a=head.token(),b=head.token();if(typeof a!=='number'||typeof b!=='number')break;pairs.push([a,b]);}
    for(const [objNum,off] of pairs){if(this.objects.has(objNum))continue;const lex=new Lexer(data,first+off);this.objects.set(objNum,{value:lex.value()});}
   }catch{/* a broken object stream is skipped */}
  }
 }
 get(v){let guard=0;while(v instanceof Ref&&guard++<20){const o=this.objects.get(v.num);if(!o)return null;v=o.raw?o:o.value;}return v;}
 dict(v){const o=this.get(v);return o&&o.raw?o.dict:o;}
 decode(stream){
  let data=stream.raw;const f=this.get(stream.dict.Filter),parms=this.get(stream.dict.DecodeParms);
  const filters=Array.isArray(f)?f.map(x=>nameOf(this.get(x))):f?[nameOf(f)]:[];
  const plist=Array.isArray(parms)?parms.map(x=>this.get(x)):[parms];
  for(let k=0;k<filters.length;k++){
   const name=filters[k],p=plist[k]||null;
   if(name==='FlateDecode'||name==='Fl')data=predictor(inflate(data),p);
   else if(name==='ASCIIHexDecode'||name==='AHx')data=asciiHex(data);
   else if(name==='ASCII85Decode'||name==='A85')data=ascii85(data);
   else break;// image codecs (DCT, JPX, CCITT, JBIG2) stay encoded
  }
  return data;
 }
 pages(){
  const out=[];const seen=new Set();
  const root=Object.values(Object.fromEntries(this.objects)).map(o=>o.value).find(v=>v&&nameOf(v.Type)==='Catalog');
  const walk=(node,inherited,depth)=>{
   const d=this.dict(node);if(!d||depth>30)return;
   const key=node instanceof Ref?node.num:null;if(key!==null){if(seen.has(key))return;seen.add(key);}
   const inh={Resources:d.Resources??inherited.Resources,MediaBox:d.MediaBox??inherited.MediaBox};
   if(nameOf(d.Type)==='Pages'||Array.isArray(this.get(d.Kids)))for(const kid of this.get(d.Kids)||[])walk(kid,inh,depth+1);
   else out.push({dict:d,...inh});
  };
  if(root)walk(root.Pages,{},0);
  if(!out.length)for(const [,o] of [...this.objects].sort((a,b)=>a[0]-b[0]))if(o.value&&nameOf(o.value.Type)==='Page')out.push({dict:o.value,Resources:o.value.Resources,MediaBox:o.value.MediaBox});
  return out;
 }
}

// --- Fonts -------------------------------------------------------------------------------------------------------------
const WIN=(()=>{const t=[];for(let i=0;i<256;i++)t[i]=String.fromCharCode(i);
 const hi={128:0x20ac,130:0x201a,131:0x192,132:0x201e,133:0x2026,134:0x2020,135:0x2021,136:0x2c6,137:0x2030,138:0x160,139:0x2039,140:0x152,142:0x17d,145:0x2018,146:0x2019,147:0x201c,148:0x201d,149:0x2022,150:0x2013,151:0x2014,152:0x2dc,153:0x2122,154:0x161,155:0x203a,156:0x153,158:0x17e,159:0x178};
 for(const [k,v] of Object.entries(hi))t[k]=String.fromCharCode(v);return t;})();
const GLYPHS={space:' ',exclam:'!',quotedbl:'"',numbersign:'#',dollar:'$',percent:'%',ampersand:'&',quotesingle:"'",quoteright:'’',quoteleft:'‘',parenleft:'(',parenright:')',asterisk:'*',plus:'+',comma:',',hyphen:'-',minus:'−',period:'.',slash:'/',
 zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',colon:':',semicolon:';',less:'<',equal:'=',greater:'>',question:'?',at:'@',bracketleft:'[',backslash:'\\',bracketright:']',underscore:'_',
 braceleft:'{',bar:'|',braceright:'}',endash:'–',emdash:'—',quotedblleft:'“',quotedblright:'”',quotedblbase:'„',guillemotleft:'«',guillemotright:'»',bullet:'•',ellipsis:'…',numero:'№',afii61352:'№',section:'§',degree:'°',nbspace:' ',copyright:'©',registered:'®',Euro:'€',sterling:'£',yen:'¥'};
function glyph(name){
 if(!name)return '';
 if(GLYPHS[name])return GLYPHS[name];
 if(/^[A-Za-z]$/.test(name))return name;
 let m=/^uni([0-9A-Fa-f]{4,})$/.exec(name);if(m){let out='';for(let i=0;i+4<=m[1].length;i+=4)out+=String.fromCharCode(parseInt(m[1].slice(i,i+4),16));return out;}
 m=/^u([0-9A-Fa-f]{4,6})$/.exec(name);if(m)return String.fromCodePoint(parseInt(m[1],16));
 m=/^afii(\d{5})$/.exec(name);if(m){const n=Number(m[1]);
  if(n>=10017&&n<=10049)return n===10023?'Ё':String.fromCharCode(0x410+n-10017-(n>10023?1:0));
  if(n>=10065&&n<=10097)return n===10071?'ё':String.fromCharCode(0x430+n-10065-(n>10071?1:0));}
 m=/^([A-Za-z])\.[a-z0-9]+$/.exec(name);if(m)return m[1];
 return '';
}
function cmap(text){
 const map=new Map();const lengths=new Set();
 for(const block of text.matchAll(/begincodespacerange([^]*?)endcodespacerange/g))for(const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))lengths.add(m[1].length/2);
 const u16=h=>{let s='';for(let i=0;i+4<=h.length;i+=4)s+=String.fromCharCode(parseInt(h.slice(i,i+4),16));if(h.length%4===2)s+=String.fromCharCode(parseInt(h.slice(-2),16));return s;};
 for(const block of text.matchAll(/beginbfchar([^]*?)endbfchar/g))for(const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)){map.set(parseInt(m[1],16),u16(m[2]));lengths.add(m[1].length/2);}
 for(const block of text.matchAll(/beginbfrange([^]*?)endbfrange/g)){
  for(const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)){
   const lo=parseInt(m[1],16),hi=parseInt(m[2],16);lengths.add(m[1].length/2);if(hi-lo>65535)continue;
   if(m[3]!==undefined){const base=m[3];const last=parseInt(base.slice(-4),16);for(let c=lo;c<=hi;c++)map.set(c,u16(base.slice(0,-4)+(last+c-lo).toString(16).padStart(4,'0')));}
   else{const list=[...m[4].matchAll(/<([0-9a-fA-F]*)>/g)].map(x=>x[1]);for(let c=lo;c<=hi&&c-lo<list.length;c++)map.set(c,u16(list[c-lo]));}
  }
 }
 return {map,bytes:lengths.size?Math.min(...lengths):null};
}
function font(pdf,ref){
 const d=pdf.dict(ref)||{};
 const subtype=nameOf(d.Subtype);
 const f={bytes:1,map:null,enc:null,widths:new Map(),dw:subtype==='Type0'?1000:0,missing:500};
 const tu=pdf.get(d.ToUnicode);
 if(tu&&tu.raw){try{const c=cmap(pdf.decode(tu).toString('latin1'));f.map=c.map;if(subtype==='Type0'&&c.bytes)f.bytes=c.bytes;}catch{/* no map */}}
 if(subtype==='Type0'){
  f.bytes=f.bytes===1?2:f.bytes;
  const enc=pdf.get(d.Encoding);if(enc&&enc.raw){try{const c=cmap(pdf.decode(enc).toString('latin1'));if(c.bytes)f.bytes=c.bytes;}catch{}}
  else if(nameOf(enc)&&!/Identity|UCS2|UTF16/i.test(nameOf(enc))&&/^(?:[A-Z][A-Za-z]*-)?(?:H|V)$/.test(nameOf(enc)))f.bytes=1;
  const desc=pdf.dict((pdf.get(d.DescendantFonts)||[])[0])||{};
  f.dw=num(desc.DW,1000);
  const w=pdf.get(desc.W)||[];
  for(let i=0;i<w.length;){const a=pdf.get(w[i]),b=pdf.get(w[i+1]);
   if(Array.isArray(b)){b.forEach((x,k)=>f.widths.set(a+k,num(pdf.get(x),f.dw)));i+=2;}
   else{const c=num(pdf.get(w[i+2]),f.dw);for(let k=a;k<=b&&k-a<65536;k++)f.widths.set(k,c);i+=3;}}
  // Without ToUnicode an Identity-H CID font may still use Unicode code points as CIDs (rare); keep them as is.
  return f;
 }
 const first=num(pdf.get(d.FirstChar),0),ws=pdf.get(d.Widths)||[];ws.forEach((x,k)=>f.widths.set(first+k,num(pdf.get(x),0)));
 const desc=pdf.dict(d.FontDescriptor);if(desc)f.missing=num(desc.MissingWidth,0)||(ws.length?0:500);
 const encv=pdf.get(d.Encoding);
 const table=WIN.slice();
 const base=nameOf(encv)||nameOf(encv?.BaseEncoding);
 if(base==='MacRomanEncoding'){for(const [k,v] of Object.entries({128:'Ä',129:'Å',130:'Ç',131:'É',132:'Ñ',133:'Ö',134:'Ü',135:'á',136:'à',137:'â',138:'ä',139:'ã',140:'å',141:'ç',142:'é',143:'è',144:'ê',145:'ë',146:'í',147:'ì',148:'î',149:'ï',150:'ñ',151:'ó',152:'ò',153:'ô',154:'ö',155:'õ',156:'ú',157:'ù',158:'û',159:'ü',165:'•',199:'«',200:'»',201:'…',202:' ',208:'–',209:'—',210:'“',211:'”',212:'‘',213:'’'}))table[k]=v;}
 const diff=pdf.get(encv?.Differences);
 if(Array.isArray(diff)){let code=0;for(const x of diff){const v=pdf.get(x);if(typeof v==='number')code=v;else if(v instanceof Name){const g=glyph(v.name);if(g)table[code]=g;code++;}}}
 f.enc=table;
 return f;
}
function decodeText(f,bytes){
 const out=[];
 for(let i=0;i<bytes.length;){
  let code,n=f.bytes;
  if(n===2&&i+1<bytes.length)code=bytes.charCodeAt(i)<<8|bytes.charCodeAt(i+1);else{code=bytes.charCodeAt(i);n=1;}
  i+=n;
  let u=f.map?.get(code);
  if(u===undefined)u=f.enc?f.enc[code]??'':n===2?(code>=32&&code<0xd800?String.fromCharCode(code):''):String.fromCharCode(code);
  const w=f.widths.has(code)?f.widths.get(code):f.bytes===2?f.dw:f.missing||500;
  out.push({code,u,w,single:n===1&&code===32});
 }
 return out;
}

// --- Content streams ---------------------------------------------------------------------------------------------------
const mul=(a,b)=>[a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5]];
function interpret(pdf,content,resources,ctm0,out,depth=0){
 if(depth>6)return;
 const res=pdf.dict(resources)||{};
 const fontsDict=pdf.dict(res.Font)||{},xobjects=pdf.dict(res.XObject)||{};
 const fonts=new Map();
 const fontOf=name=>{if(!fonts.has(name))fonts.set(name,fontsDict[name]?font(pdf,fontsDict[name]):{bytes:1,map:null,enc:WIN,widths:new Map(),missing:500});return fonts.get(name);};
 const lex=new Lexer(content);
 let ctm=ctm0.slice(),stack=[];
 let tm=[1,0,0,1,0,0],tlm=tm.slice(),f=null,size=0,tc=0,tw=0,th=1,tl=0,rise=0;
 const args=[];
 const show=(items)=>{
  if(!f)f=fontOf('');
  const start=mul(tm,ctm);const sx=start[4],sy=start[5];
  const scale=Math.hypot(start[2],start[3])*size||size;
  let text='';
  for(const it of items){
   if(typeof it==='number'){const tx=-it/1000*size*th;tm=mul([1,0,0,1,tx,0],tm);if(it<-180&&text&&!text.endsWith(' '))text+=' ';continue;}
   for(const g of decodeText(f,it)){text+=g.u;const tx=(g.w/1000*size+tc+(g.single?tw:0))*th;tm=mul([1,0,0,1,tx,0],tm);}
  }
  const end=mul(tm,ctm);
  if(text)out.runs.push({x:sx,y:sy,x2:end[4],size:Math.abs(scale)||1,text,dir:Math.abs(start[1])>Math.abs(start[0])?1:0});
 };
 for(;;){
  const t=lex.value();if(t===undefined)break;
  if(!(t instanceof Op)){args.push(t);if(args.length>64)args.shift();continue;}
  const a=args.splice(0);
  switch(t.op){
   case 'q':stack.push(ctm.slice());if(stack.length>64)stack.shift();break;
   case 'Q':ctm=stack.pop()||ctm0.slice();break;
   case 'cm':if(a.length>=6)ctm=mul(a.slice(-6).map(Number),ctm);break;
   case 'BT':tm=[1,0,0,1,0,0];tlm=tm.slice();break;
   case 'Tf':{const n=a[a.length-2];f=n instanceof Name?fontOf(n.name):f;size=num(a[a.length-1],size);break;}
   case 'Tc':tc=num(a[0],0);break;case 'Tw':tw=num(a[0],0);break;case 'Tz':th=num(a[0],100)/100;break;case 'TL':tl=num(a[0],0);break;case 'Ts':rise=num(a[0],0);break;
   case 'Td':tlm=mul([1,0,0,1,num(a[0],0),num(a[1],0)],tlm);tm=tlm.slice();break;
   case 'TD':tl=-num(a[1],0);tlm=mul([1,0,0,1,num(a[0],0),num(a[1],0)],tlm);tm=tlm.slice();break;
   case 'Tm':if(a.length>=6){tlm=a.slice(-6).map(Number);tm=tlm.slice();}break;
   case 'T*':tlm=mul([1,0,0,1,0,-tl],tlm);tm=tlm.slice();break;
   case 'Tj':if(a[0] instanceof Str)show([a[0].bytes]);break;
   case "'":tlm=mul([1,0,0,1,0,-tl],tlm);tm=tlm.slice();if(a[0] instanceof Str)show([a[0].bytes]);break;
   case '"':tw=num(a[0],tw);tc=num(a[1],tc);tlm=mul([1,0,0,1,0,-tl],tlm);tm=tlm.slice();if(a[2] instanceof Str)show([a[2].bytes]);break;
   case 'TJ':if(Array.isArray(a[0]))show(a[0].map(x=>x instanceof Str?x.bytes:typeof x==='number'?x:'').filter(x=>x!==''));break;
   case 'BI':{// inline image: skip its data
    const id=lex.s.indexOf('ID',lex.i);if(id<0){lex.i=lex.s.length;break;}
    const ei=lex.s.slice(id+3).search(/\sEI(?=\s|$)/);out.images.push({inline:true,w:0,h:0,area:Math.abs(ctm[0]*ctm[3])});
    lex.i=ei<0?lex.s.length:id+3+ei+3;break;}
   case 'Do':{
    const n=a[0];if(!(n instanceof Name))break;const ref=xobjects[n.name];const x=pdf.get(ref);if(!x||!x.raw)break;
    const sub=nameOf(x.dict.Subtype);
    if(sub==='Form'){const m=pdf.get(x.dict.Matrix);const inner=Array.isArray(m)&&m.length===6?mul(m.map(v=>num(pdf.get(v),0)),ctm):ctm;interpret(pdf,pdf.decode(x).toString('latin1'),x.dict.Resources||resources,inner,out,depth+1);}
    else if(sub==='Image')out.images.push({ref:ref instanceof Ref?ref.num:null,stream:x,w:num(pdf.get(x.dict.Width),0),h:num(pdf.get(x.dict.Height),0),area:Math.abs(ctm[0]*ctm[3]-ctm[1]*ctm[2])});
    break;}
   default:break;
  }
 }
}

// Runs → lines by position; a page with a clear vertical gutter is read column by column.
function lines(runs){
 const flat=runs.filter(r=>r.dir===0);
 if(!flat.length)return [];
 const sorted=flat.slice().sort((a,b)=>b.y-a.y||a.x-b.x);
 const rows=[];
 for(const r of sorted){
  const row=rows.find(l=>Math.abs(l.y-r.y)<=Math.max(1.5,0.45*Math.min(l.size,r.size)));
  if(row){row.runs.push(r);row.size=Math.max(row.size,r.size);}else rows.push({y:r.y,size:r.size,runs:[r]});
 }
 rows.sort((a,b)=>b.y-a.y);
 const join=list=>{
  list.sort((a,b)=>a.x-b.x);let text='',endX=null,last=null;
  for(const r of list){
   // Fake bold: the same text drawn again a fraction of a glyph to the right.
   if(last&&r.text===last.text&&Math.abs(r.x-last.x)<0.5*r.size)continue;
   if(endX!==null){const gap=r.x-endX;if(gap>0.18*r.size&&!text.endsWith(' ')&&!r.text.startsWith(' '))text+=' ';}
   text+=r.text;endX=Math.max(endX??-Infinity,r.x2);last=r;
  }
  return text.replace(/\s+/g,' ').trim();
 };
 // Gutter: an x that many rows have a wide gap across and almost none cross.
 const split=row=>{const list=row.runs.slice().sort((a,b)=>a.x-b.x);const parts=[[list[0]]];let end=list[0].x2;for(const r of list.slice(1)){if(r.x-end>2.5*row.size)parts.push([r]);else parts[parts.length-1].push(r);end=Math.max(end,r.x2);}return parts;};
 const gaps=[];for(const row of rows){const p=split(row);for(let k=1;k<p.length;k++)gaps.push((Math.max(...p[k-1].map(r=>r.x2))+Math.min(...p[k].map(r=>r.x)))/2);}
 let gutter=null;
 if(rows.length>=6&&gaps.length>=rows.length*0.3){
  gaps.sort((a,b)=>a-b);const mid=gaps[Math.floor(gaps.length/2)];
  const crossing=rows.filter(row=>row.runs.some(r=>r.x<mid-2&&r.x2>mid+2)).length;
  const gapped=rows.filter(row=>split(row).length>1).length;
  if(crossing<=rows.length*0.1&&gapped>=rows.length*0.3)gutter=mid;
 }
 if(gutter===null)return rows.map(row=>join(row.runs)).filter(Boolean);
 const left=rows.map(row=>join(row.runs.filter(r=>r.x<gutter))).filter(Boolean),right=rows.map(row=>join(row.runs.filter(r=>r.x>=gutter))).filter(Boolean);
 return [...left,...right];
}

// The largest image of a page as a file an OCR program reads, or {unsupported}.
function imageFile(pdf,img){
 if(!img?.stream)return null;
 const d=img.stream.dict;
 const f=pdf.get(d.Filter),filters=(Array.isArray(f)?f.map(x=>nameOf(pdf.get(x))):f?[nameOf(f)]:[]);
 const last=filters[filters.length-1];
 const pre=s=>{let data=s.raw;for(const name of filters.slice(0,-1)){if(name==='FlateDecode')data=inflate(data);else if(name==='ASCIIHexDecode')data=asciiHex(data);else if(name==='ASCII85Decode')data=ascii85(data);}return data;};
 const w=img.w,h=img.h;
 if(last==='DCTDecode'||last==='DCT')return {ext:'jpg',data:pre(img.stream)};
 if(last==='JPXDecode')return {ext:'jp2',data:pre(img.stream)};
 if(last==='JBIG2Decode')return {unsupported:'JBIG2'};
 if(last==='CCITTFaxDecode'||last==='CCF'){
  const p=pdf.get(Array.isArray(d.DecodeParms)?d.DecodeParms[d.DecodeParms.length-1]:d.DecodeParms)||{};
  const k=num(pdf.get(p.K),0),cols=num(pdf.get(p.Columns),1728),rows=num(pdf.get(p.Rows),h)||h,black1=pdf.get(p.BlackIs1)===true;
  return {ext:'tif',data:tiff(pre(img.stream),{width:cols||w,height:rows,compression:k<0?4:3,t4:k>0?1:0,photometric:black1?1:0})};
 }
 const data=pdf.decode(img.stream);
 const bpc=num(pdf.get(d.BitsPerComponent),8);
 let cs=pdf.get(d.ColorSpace);let comps=1,palette=null;
 const csName=x=>nameOf(x)||(Array.isArray(x)?nameOf(pdf.get(x[0])):null);
 if(d.ImageMask===true)return {ext:'pbm',data:Buffer.concat([Buffer.from('P4\n'+w+' '+h+'\n'),data.subarray(0,Math.ceil(w/8)*h)])};
 if(csName(cs)==='Indexed'){const base=pdf.get(cs[1]),lut=pdf.get(cs[3]);const baseN=csName(base)==='DeviceRGB'||csName(base)==='CalRGB'?3:csName(base)==='ICCBased'?num(pdf.dict(pdf.get(base)[1])?.N,3):1;palette={n:baseN,bytes:lut instanceof Str?Buffer.from(lut.bytes,'latin1'):lut?.raw?pdf.decode(lut):Buffer.alloc(0)};}
 else if(['DeviceRGB','CalRGB'].includes(csName(cs)))comps=3;
 else if(csName(cs)==='DeviceCMYK')comps=4;
 else if(csName(cs)==='ICCBased')comps=num(pdf.dict(pdf.get(cs)[1])?.N,3);
 if(palette&&bpc===8){const out=Buffer.alloc(w*h*3);for(let i=0;i<w*h;i++){const idx=data[i]*palette.n;for(let c=0;c<3;c++)out[i*3+c]=palette.n===1?palette.bytes[idx]:palette.bytes[idx+c]||0;}return {ext:'ppm',data:Buffer.concat([Buffer.from('P6\n'+w+' '+h+'\n255\n'),out])};}
 if(bpc===1&&comps===1){const row=Math.ceil(w/8),out=Buffer.alloc(row*h);for(let i=0;i<out.length&&i<data.length;i++)out[i]=~data[i]&255;return {ext:'pbm',data:Buffer.concat([Buffer.from('P4\n'+w+' '+h+'\n'),out])};}
 if(bpc!==8)return {unsupported:bpc+'-bit'};
 if(comps===1)return {ext:'pgm',data:Buffer.concat([Buffer.from('P5\n'+w+' '+h+'\n255\n'),data.subarray(0,w*h)])};
 if(comps===3)return {ext:'ppm',data:Buffer.concat([Buffer.from('P6\n'+w+' '+h+'\n255\n'),data.subarray(0,w*h*3)])};
 if(comps===4){const out=Buffer.alloc(w*h*3);for(let i=0;i<w*h;i++){const k=data[i*4+3];for(let c=0;c<3;c++)out[i*3+c]=255-Math.min(255,data[i*4+c]+k);}return {ext:'ppm',data:Buffer.concat([Buffer.from('P6\n'+w+' '+h+'\n255\n'),out])};}
 return {unsupported:'color space'};
}
// A one-strip TIFF around CCITT fax data, which OCR programs read directly.
function tiff(data,{width,height,compression,t4,photometric}){
 const entries=[[256,4,width],[257,4,height],[258,3,1],[259,3,compression],[262,3,photometric],[273,4,0],[277,3,1],[278,4,height],[279,4,data.length],...(compression===3?[[292,4,t4]]:[])];
 const ifd=8,size=2+entries.length*12+4,dataAt=ifd+size;
 const b=Buffer.alloc(dataAt);b.write('II',0,'latin1');b.writeUInt16LE(42,2);b.writeUInt32LE(ifd,4);b.writeUInt16LE(entries.length,ifd);
 entries.forEach(([tag,type,value],i)=>{const o=ifd+2+i*12;b.writeUInt16LE(tag,o);b.writeUInt16LE(type,o+2);b.writeUInt32LE(1,o+4);if(tag===273)value=dataAt;if(type===3)b.writeUInt16LE(value,o+8);else b.writeUInt32LE(value,o+8);});
 return Buffer.concat([b,data]);
}

// The whole document: pages with their lines; scans flagged with their image.
function read(bytes,{maxPages=200}={}){
 const pdf=new PDF(bytes);
 if(pdf.encrypted)throw Object.assign(Error('PDF зашифрован или защищён паролем — текст не прочитать. Сохраните его без защиты и прикрепите снова.'),{code:'encrypted'});
 const list=pdf.pages();
 if(!list.length)throw Error('В PDF не нашлось страниц.');
 const pages=[];
 for(const [i,p] of list.slice(0,maxPages).entries()){
  const box=(pdf.get(p.MediaBox)||[0,0,612,792]).map(v=>num(pdf.get(v),0));
  const out={runs:[],images:[]};
  const contents=pdf.get(p.dict.Contents);
  const parts=Array.isArray(contents)?contents.map(c=>pdf.get(c)):[contents];
  const content=parts.filter(x=>x&&x.raw).map(x=>pdf.decode(x).toString('latin1')).join('\n');
  try{interpret(pdf,content,p.Resources,[1,0,0,1,0,0],out);}catch{/* a broken stream leaves what was read */}
  const text=lines(out.runs);
  const chars=text.join('').replace(/\s/g,'').length;
  const pageArea=Math.abs((box[2]-box[0])*(box[3]-box[1]))||1;
  const big=out.images.filter(x=>x.area>=pageArea*0.25).sort((a,b)=>b.area-a.area);
  const scanned=chars<40&&big.length>0;
  pages.push({n:i+1,lines:text,text:text.join('\n'),chars,scanned,image:scanned?big[0]:null});
 }
 return {pdf,pages,numPages:list.length,truncated:list.length>maxPages};
}
module.exports={read,imageFile,lines,cmap,glyph,Lexer,PDF,tiff};
