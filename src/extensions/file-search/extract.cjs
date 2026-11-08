// Text of a file for the index, with the chunker's type: code and markdown as they are, PDF through Petya's own
// reader (src/pdf-reader.cjs, pages marked «[Страница N]»), Word through the attachment reader, PowerPoint slides
// («[Слайд N]», with the titles and series of the charts on the slide, so «презентация с графиком LTV» is found),
// Excel shared strings by sheet. Nothing is executed and no external tool is used.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {isBinary}=require('../../semantic-index/ignore.cjs');
const {typeOf}=require('../../semantic-index/chunk.cjs');

const LIMIT=4*1024*1024;
// Central directory of a ZIP (Office files): name → reader. Encrypted or oversized entries are refused.
function zip(bytes){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Файл повреждён или это не документ Office.');
 const count=bytes.readUInt16LE(end+10);let offset=bytes.readUInt32LE(end+16);
 if(count>20000)throw Error('Слишком сложный документ.');
 const entries=new Map();
 for(let i=0;i<count;i++){
  if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Повреждённый документ.');
  const method=bytes.readUInt16LE(offset+10),flags=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+20),expanded=bytes.readUInt32LE(offset+24);
  const nameSize=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42);
  entries.set(bytes.subarray(offset+46,offset+46+nameSize).toString('utf8'),{method,flags,size,expanded,local});
  offset+=46+nameSize+extra+comment;
 }
 const read=name=>{
  const e=entries.get(name);if(!e)return null;
  if(e.flags&1||e.expanded>LIMIT)return null;
  if(e.local+30>bytes.length||bytes.readUInt32LE(e.local)!==0x04034b50)return null;
  const start=e.local+30+bytes.readUInt16LE(e.local+26)+bytes.readUInt16LE(e.local+28);
  const data=bytes.subarray(start,start+e.size);
  const out=e.method===8?zlib.inflateRawSync(data,{maxOutputLength:LIMIT}):e.method===0?data:null;
  return out?out.toString('utf8'):null;
 };
 return {names:[...entries.keys()],read};
}
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,'&');
// Text runs of DrawingML/Office XML (<a:t>, <t>, <c:v> in chart titles and series), paragraphs as lines.
function runs(xml,tags=['a:t','t']){
 const out=[];const re=new RegExp('<(?:'+tags.join('|')+')(?:\\s[^>]*)?>([^<]*)</(?:'+tags.join('|')+')>|<(?:a:p|w:p|si)[\\s>/]','g');let m,line='';
 while((m=re.exec(xml))){if(m[1]!==undefined)line+=decode(m[1]);else{if(line.trim())out.push(line.trim());line='';}}
 if(line.trim())out.push(line.trim());
 return out.join('\n');
}
function slides(bytes){
 const z=zip(bytes);
 const numbers=z.names.map(n=>/^ppt\/slides\/slide(\d+)\.xml$/.exec(n)).filter(Boolean).map(m=>Number(m[1])).sort((a,b)=>a-b);
 if(!numbers.length)throw Error('В презентации нет слайдов.');
 const parts=[];
 for(const n of numbers.slice(0,300)){
  let text=runs(z.read('ppt/slides/slide'+n+'.xml')||'');
  // Charts on the slide: titles, axis titles and series names (cached values <c:v> inside <c:tx>).
  const rels=z.read('ppt/slides/_rels/slide'+n+'.xml.rels')||'';
  for(const m of rels.matchAll(/Target="\.\.\/charts\/(chart\d+\.xml)"/g)){
   const chart=z.read('ppt/charts/'+m[1])||'';
   const titles=[...chart.matchAll(/<c:tx>([\s\S]*?)<\/c:tx>/g)].map(x=>runs(x[1],['a:t','c:v'])).filter(Boolean);
   const kind=(/<c:(bar|line|pie|area|scatter|doughnut|radar|bubble)Chart>/.exec(chart)||[])[1];
   if(titles.length||kind)text+='\nГрафик'+(kind?' ('+kind+')':'')+': '+[...new Set(titles)].join('; ');
  }
  const notes=z.read('ppt/notesSlides/notesSlide'+n+'.xml');if(notes){const t=runs(notes).replace(/^\d+$/gm,'').trim();if(t)text+='\nЗаметки: '+t;}
  if(text.trim())parts.push('[Слайд '+n+']\n'+text.trim());
 }
 return parts.join('\n\n');
}
function sheets(bytes){
 const z=zip(bytes);
 const shared=runs(z.read('xl/sharedStrings.xml')||'',['t']);
 const book=z.read('xl/workbook.xml')||'';
 const names=[...book.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m=>decode(m[1]));
 return [names.length?'Листы: '+names.join(', '):'',shared].filter(Boolean).join('\n');
}

// {text, type} for the chunker, or null when the file has no readable text. `pdf(bytes)` is injected (it needs
// Electron); `docx(bytes)` defaults to the attachment reader.
async function extract(file,{pdf,docx}={}){
 const ext=path.extname(file).slice(1).toLowerCase();
 const bytes=fs.readFileSync(file);
 if(ext==='pdf'){
  if(bytes.subarray(0,5).toString()!=='%PDF-')return null;
  const read=pdf||(b=>require('../../pdf-reader.cjs').readPDF(b));
  const r=await read(bytes);return r?.text?{text:r.text,type:'text'}:null;
 }
 if(ext==='docx'){const read=docx||(b=>require('../../attachments.cjs').docx(b));const text=read(bytes);return text?.trim()?{text,type:'text'}:null;}
 if(ext==='pptx'){const text=slides(bytes);return text.trim()?{text,type:'text'}:null;}
 if(ext==='xlsx'){const text=sheets(bytes);return text.trim()?{text,type:'text'}:null;}
 if(isBinary(bytes))return null;
 let text=bytes.toString('utf8');
 if(ext==='html'||ext==='htm'||ext==='xml')text=decode(text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ');
 if(ext==='rtf')text=text.replace(/\\[a-z]+-?\d* ?|[{}]/gi,'');
 return text.trim()?{text,type:typeOf(file)}:null;
}

module.exports={extract,zip,runs,slides,sheets};
