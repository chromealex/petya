// Files Petya builds himself: Word (.docx), Excel (.xlsx), PowerPoint (.pptx) and PDF. The model writes the
// content (Markdown, tables, slides); this module turns it into a real file with plain Office Open XML
// in a ZIP container, no libraries or scripts needed. PDF is rendered from the same Markdown by Chromium
// (src/features/office-files.cjs passes Electron's printToPDF), so Cyrillic text needs no embedded fonts.
const zlib=require('node:zlib');
// ---- ZIP -------------------------------------------------------------------------------------------
function zip(entries){
 const files=[],central=[];let offset=0;
 const date=new Date(),dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),dosDate=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
 for(const [name,content] of entries){
  const data=Buffer.isBuffer(content)?content:Buffer.from(content,'utf8'),packed=zlib.deflateRawSync(data),crc=zlib.crc32(data),nameBytes=Buffer.from(name,'utf8');
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);local.writeUInt16LE(0,28);
  const head=Buffer.alloc(46);head.writeUInt32LE(0x02014b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(20,6);head.writeUInt16LE(0x0800,8);head.writeUInt16LE(8,10);head.writeUInt16LE(dosTime,12);head.writeUInt16LE(dosDate,14);
  head.writeUInt32LE(crc,16);head.writeUInt32LE(packed.length,20);head.writeUInt32LE(data.length,24);head.writeUInt16LE(nameBytes.length,28);head.writeUInt32LE(offset,42);
  files.push(local,nameBytes,packed);central.push(head,nameBytes);offset+=30+nameBytes.length+packed.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...files,dir,end]);
}
// ---- Markdown ---------------------------------------------------------------------------------------
// Characters XML 1.0 does not allow are dropped; everything else is escaped.
const xml=s=>String(s??'').replace(/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// Inline runs: **bold**, *italic* / _italic_, `code`, [text](url).
function inline(text){
 const runs=[],re=/(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;let at=0,m;
 text=String(text??'');
 while((m=re.exec(text))){if(m.index>at)runs.push({text:text.slice(at,m.index)});
  if(m[2]||m[3])runs.push({text:m[2]||m[3],bold:true});else if(m[4]||m[5])runs.push({text:m[4]||m[5],italic:true});else if(m[6])runs.push({text:m[6],code:true});else runs.push({text:m[7],link:m[8]});
  at=m.index+m[0].length;}
 if(at<text.length)runs.push({text:text.slice(at)});
 return runs.length?runs:[{text:''}];
}
const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
function blocks(markdown){
 const lines=String(markdown??'').replace(/\r\n/g,'\n').split('\n'),out=[];let i=0;
 while(i<lines.length){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  let m;
  if(/^\s*(```|~~~)/.test(line)){const fence=line.trim().slice(0,3),body=[];i++;while(i<lines.length&&!lines[i].trim().startsWith(fence))body.push(lines[i++]);i++;out.push({type:'code',text:body.join('\n')});continue;}
  if((m=/^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))){out.push({type:'heading',level:m[1].length,text:m[2]});i++;continue;}
  if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){out.push({type:'rule'});i++;continue;}
  if(/^\s*\|.*\|\s*$/.test(line)&&i+1<lines.length&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1])){
   const rows=[cells(line)];i+=2;while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i]))rows.push(cells(lines[i++]));out.push({type:'table',rows,header:true});continue;}
  if(/^\s*([-*+]|\d+[.)])\s+/.test(line)){
   const ordered=/^\s*\d/.test(line),items=[];
   while(i<lines.length){
    const l=lines[i],item=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if(item){if(!item[1].length&&/^\s*\d/.test(l)!==ordered)break;items.push({text:item[3],level:Math.min(3,Math.floor(item[1].replace(/\t/g,'  ').length/2))});i++;continue;}
    if(items.length&&l.trim()&&/^\s{2,}\S/.test(l)){items[items.length-1].text+=' '+l.trim();i++;continue;}
    break;
   }
   out.push({type:'list',ordered,items});continue;}
  if(/^\s*>/.test(line)){const body=[];while(i<lines.length&&/^\s*>/.test(lines[i]))body.push(lines[i++].replace(/^\s*>\s?/,''));out.push({type:'quote',text:body.join(' ')});continue;}
  const body=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|\s*(```|~~~)|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|.*\|\s*$)/.test(lines[i]))body.push(lines[i++].trim());
  if(!body.length)body.push(lines[i++].trim());
  out.push({type:'paragraph',text:body.join(' ')});
 }
 return out;
}
// ---- DOCX -------------------------------------------------------------------------------------------
const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function docx(markdown,{title=''}={}){
 const links=[];let lists=0;const numbers=[];
 const run=r=>{const props=(r.bold?'<w:b/>':'')+(r.italic?'<w:i/>':'')+(r.code?'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>':'')+(r.link?'<w:rStyle w:val="Hyperlink"/>':'');
  const body='<w:r>'+(props?'<w:rPr>'+props+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xml(r.text)+'</w:t></w:r>';
  if(!r.link)return body;links.push(r.link);return '<w:hyperlink r:id="rLink'+links.length+'">'+body+'</w:hyperlink>';};
 const para=(text,style,extra='')=>'<w:p>'+(style||extra?'<w:pPr>'+(style?'<w:pStyle w:val="'+style+'"/>':'')+extra+'</w:pPr>':'')+inline(text).map(run).join('')+'</w:p>';
 let body=title&&!/^#\s/.test(String(markdown).trim())?para(title,'Title'):'';
 for(const b of blocks(markdown)){
  if(b.type==='heading')body+=para(b.text,'Heading'+Math.min(3,b.level));
  else if(b.type==='paragraph')body+=para(b.text);
  else if(b.type==='quote')body+=para(b.text,'Quote');
  else if(b.type==='rule')body+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
  else if(b.type==='code')body+=b.text.split('\n').map(l=>'<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr><w:r><w:t xml:space="preserve">'+xml(l)+'</w:t></w:r></w:p>').join('');
  else if(b.type==='list'){const id=b.ordered?(numbers.push(++lists),1+numbers.length):1;for(const it of b.items)body+=para(it.text,'ListParagraph','<w:numPr><w:ilvl w:val="'+it.level+'"/><w:numId w:val="'+id+'"/></w:numPr>');}
  else if(b.type==='table'){const width=Math.max(...b.rows.map(r=>r.length)),col=Math.floor(9000/width);
   body+='<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid>'+'<w:gridCol w:w="'+col+'"/>'.repeat(width)+'</w:tblGrid>'+
    b.rows.map((r,ri)=>'<w:tr>'+Array.from({length:width},(_,ci)=>'<w:tc><w:tcPr><w:tcW w:w="'+col+'" w:type="dxa"/>'+(ri===0&&b.header?'<w:shd w:val="clear" w:color="auto" w:fill="E8EEF4"/>':'')+'</w:tcPr>'+
     '<w:p>'+inline(r[ci]??'').map(x=>run(ri===0&&b.header?{...x,bold:true}:x)).join('')+'</w:p></w:tc>').join('')+'</w:tr>').join('')+'</w:tbl>'+para('');}
 }
 const document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document '+W+'><w:body>'+(body||para(''))+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
 const style=(id,name,run,para='',based='Normal')=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+name+'"/><w:basedOn w:val="'+based+'"/><w:next w:val="Normal"/><w:qFormat/>'+(para?'<w:pPr>'+para+'</w:pPr>':'')+'<w:rPr>'+run+'</w:rPr></w:style>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles '+W+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'+
  style('Title','Title','<w:b/><w:sz w:val="40"/><w:color w:val="1F3864"/>','<w:spacing w:after="240"/>')+
  style('Heading1','heading 1','<w:b/><w:sz w:val="32"/><w:color w:val="1F3864"/>','<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>')+
  style('Heading2','heading 2','<w:b/><w:sz w:val="26"/><w:color w:val="2E5395"/>','<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>')+
  style('Heading3','heading 3','<w:b/><w:sz w:val="23"/><w:color w:val="2E5395"/>','<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/>')+
  style('Quote','Quote','<w:i/><w:color w:val="595959"/>','<w:ind w:left="567"/>')+
  style('Code','Code','<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="19"/>','<w:spacing w:after="0"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>')+
  style('ListParagraph','List Paragraph','','<w:spacing w:after="60"/>')+
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'+
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/><w:left w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/><w:right w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
 const level=(i,fmt,text)=>'<w:lvl w:ilvl="'+i+'"><w:start w:val="1"/><w:numFmt w:val="'+fmt+'"/><w:lvlText w:val="'+text+'"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+(360+i*360)+'" w:hanging="360"/></w:pPr></w:lvl>';
 const numbering='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering '+W+'>'+
  '<w:abstractNum w:abstractNumId="0">'+[0,1,2,3].map(i=>level(i,'bullet',['•','–','▪','•'][i])).join('')+'</w:abstractNum>'+
  '<w:abstractNum w:abstractNumId="1">'+[0,1,2,3].map(i=>level(i,i%2?'lowerLetter':'decimal',i%2?'%'+(i+1)+')':'%'+(i+1)+'.')).join('')+'</w:abstractNum>'+
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'+numbers.map((_,k)=>'<w:num w:numId="'+(k+2)+'"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>').join('')+'</w:numbering>';
 const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'+
  links.map((url,k)=>'<Relationship Id="rLink'+(k+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+xml(url)+'" TargetMode="External"/>').join('')+'</Relationships>';
 return zip([
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
  ['docProps/core.xml',core(title)],
  ['word/document.xml',document],['word/styles.xml',styles],['word/numbering.xml',numbering],['word/_rels/document.xml.rels',rels]]);
}
function core(title){const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xml(title)+'</dc:title><dc:creator>Петя</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified></cp:coreProperties>';}
// ---- XLSX -------------------------------------------------------------------------------------------
const column=n=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
function sheetNames(sheets){const used=new Set();return sheets.map((s,i)=>{let name=String(s.name||'Лист '+(i+1)).replace(/[[\]:*?/\\]/g,' ').trim().slice(0,31)||'Лист '+(i+1);let k=2;while(used.has(name.toLowerCase()))name=name.slice(0,28)+' '+k++;used.add(name.toLowerCase());return name;});}
function cell(value,ref,header){
 if(value===null||value===undefined||value==='')return '';
 if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+ref+'"'+(header?' s="1"':'')+'><v>'+value+'</v></c>';
 if(typeof value==='boolean')return '<c r="'+ref+'" t="b"><v>'+(value?1:0)+'</v></c>';
 const text=String(value);
 if(!header&&/^=[A-Za-z(]/.test(text)&&text.length<8000&&safeFormula(text))return '<c r="'+ref+'"><f>'+xml(text.slice(1))+'</f></c>';
 if(!header&&/^-?\d+(?:[.,]\d+)?$/.test(text.trim())&&text.trim().length<16)return '<c r="'+ref+'"><v>'+Number(text.trim().replace(',','.'))+'</v></c>';
 return '<c r="'+ref+'" t="inlineStr"'+(header?' s="1"':' s="2"')+'><is><t xml:space="preserve">'+xml(text)+'</t></is></c>';
}
// Filters need a hidden defined name per sheet, or Excel repairs the file.
function filterNames(parts,names){
 const rows=parts.map((p,k)=>{const ref=/<autoFilter ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(p);return ref?'<definedName name="_xlnm._FilterDatabase" localSheetId="'+k+'" hidden="1">\''+xml(names[k].replace(/'/g,"''"))+'\'!$'+ref[1]+'$'+ref[2]+':$'+ref[3]+'$'+ref[4]+'</definedName>':'';}).join('');
 return rows?'<definedNames>'+rows+'</definedNames>':'';
}
// Formulas from model output: only common calculation functions, no links, external references or DDE
// («=cmd|…», WEBSERVICE, HYPERLINK); anything else is kept as text.
const FUNCTIONS=new Set('SUM AVERAGE MIN MAX COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS SUMIF SUMIFS AVERAGEIF AVERAGEIFS PRODUCT MEDIAN ROUND ROUNDUP ROUNDDOWN ABS INT MOD POWER SQRT IF IFS IFERROR AND OR NOT CONCATENATE CONCAT TEXT LEN LEFT RIGHT MID UPPER LOWER TRIM TODAY NOW DATE YEAR MONTH DAY WEEKDAY NETWORKDAYS DATEDIF VLOOKUP HLOOKUP XLOOKUP INDEX MATCH RANK PERCENTILE STDEV VAR'.split(' '));
function safeFormula(text){if(/[|\[\]]/.test(text))return false;for(const m of text.matchAll(/([A-Za-z][A-Za-z0-9._]*)\s*\(/g))if(!FUNCTIONS.has(m[1].toUpperCase()))return false;return true;}
function xlsx(sheets,{title=''}={}){
 sheets=(Array.isArray(sheets)&&sheets.length?sheets:[{name:'Лист 1',rows:[]}]).slice(0,50);
 const names=sheetNames(sheets);
 const parts=sheets.map((s,k)=>{
  const rows=[...(Array.isArray(s.columns)&&s.columns.length?[s.columns]:[]),...(s.rows||[])].map(r=>Array.isArray(r)?r:[r]);
  const header=Array.isArray(s.columns)&&s.columns.length>0,width=Math.max(1,...rows.map(r=>r.length));
  const widths=Array.from({length:width},(_,c)=>Math.min(60,Math.max(8,...rows.slice(0,500).map(r=>String(r[c]??'').length+2))));
  const data=rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>cell(v,column(ci)+(ri+1),header&&ri===0)).join('')+'</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
   (header?'<sheetViews><sheetView workbookViewId="0"'+(k===0?' tabSelected="1"':'')+'><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'')+
   '<cols>'+widths.map((w,c)=>'<col min="'+(c+1)+'" max="'+(c+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+data+'</sheetData>'+
   (header&&rows.length>1?'<autoFilter ref="A1:'+column(width-1)+rows.length+'"/>':'')+'</worksheet>';
 });
 return zip([
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+parts.map((_,k)=>'<Override PartName="/xl/worksheets/sheet'+(k+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
  ['docProps/core.xml',core(title)],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,k)=>'<sheet name="'+xml(n)+'" sheetId="'+(k+1)+'" r:id="rS'+(k+1)+'"/>').join('')+'</sheets>'+filterNames(parts,names)+'</workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+parts.map((_,k)=>'<Relationship Id="rS'+(k+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(k+1)+'.xml"/>').join('')+'<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ...parts.map((p,k)=>['xl/worksheets/sheet'+(k+1)+'.xml',p])]);
}
// ---- PPTX -------------------------------------------------------------------------------------------
const A='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const SW=12192000,SH=6858000;
const arun=(r,size,color='1F2937')=>'<a:r><a:rPr lang="ru-RU" sz="'+size+'"'+(r.bold?' b="1"':'')+(r.italic?' i="1"':'')+' dirty="0"><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill>'+(r.code?'<a:latin typeface="Courier New"/>':'<a:latin typeface="Calibri"/><a:cs typeface="Calibri"/>')+'</a:rPr><a:t>'+xml(r.text)+'</a:t></a:r>';
function shape(id,name,x,y,w,h,paras,{anchor='t',autofit=true}={}){
 return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+name+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'+
  '<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="'+anchor+'">'+(autofit?'<a:normAutofit/>':'')+'</a:bodyPr><a:lstStyle/>'+paras+'</p:txBody></p:sp>';
}
function slideXml(s,index,total){
 const title=String(s.title||'').trim(),bullets=(Array.isArray(s.bullets)?s.bullets:[]).map(b=>typeof b==='string'?{text:b,level:0}:{text:String(b?.text||''),level:Math.min(2,Number(b?.level)||0)}).filter(b=>b.text.trim());
 const cover=index===0&&!bullets.length;
 const size=bullets.length>7?1800:bullets.length>5?2000:2400;
 const titlePara='<a:p><a:pPr algn="'+(cover?'ctr':'l')+'"/>'+inline(title).map(r=>arun({...r,bold:true},cover?4400:3200,'1F3864')).join('')+'</a:p>';
 const body=bullets.map(b=>'<a:p><a:pPr marL="'+(342900+b.level*342900)+'" indent="-342900"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="'+(b.level?'–':'•')+'"/></a:pPr>'+inline(b.text).map(r=>arun(r,size-b.level*200)).join('')+'</a:p>').join('');
 const subtitle=cover&&s.subtitle?'<a:p><a:pPr algn="ctr"/>'+arun({text:String(s.subtitle)},2400,'595959')+'</a:p>':'';
 const tree=cover?shape(2,'Title',609600,2130000,SW-1219200,1470000,titlePara,{anchor:'b'})+(subtitle?shape(3,'Subtitle',609600,3700000,SW-1219200,900000,subtitle):'')
  :shape(2,'Title',609600,380000,SW-1219200,1000000,titlePara,{anchor:'b'})+(body?shape(3,'Content',609600,1500000,SW-1219200,SH-2100000,body):'')+
   shape(4,'Slide number',SW-1600000,SH-560000,1000000,360000,'<a:p><a:pPr algn="r"/>'+arun({text:(index+1)+' / '+total},1200,'8C8C8C')+'</a:p>',{autofit:false});
 const notes=String(s.notes||'').trim();
 return {xml:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld '+A+'><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'+tree+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',notes};
}
const THEME='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Petya"><a:themeElements><a:clrScheme name="Petya"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E8EEF4"/></a:lt2><a:accent1><a:srgbClr val="2E5395"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Petya"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Petya"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
const EMPTY_TREE='<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
function pptx(slides,{title=''}={}){
 slides=(Array.isArray(slides)&&slides.length?slides:[{title:title||'Презентация'}]).slice(0,200);
 const built=slides.map((s,i)=>slideXml(s,i,slides.length));
 const rel=(id,type,target)=>'<Relationship Id="'+id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'+type+'" Target="'+target+'"/>';
 const rels=body=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+body+'</Relationships>';
 const entries=[
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+built.map((_,i)=>'<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join('')+'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
  ['_rels/.rels',rels(rel('rId1','officeDocument','ppt/presentation.xml')+'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>')],
  ['docProps/core.xml',core(title)],
  ['ppt/presentation.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation '+A+' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rMaster"/></p:sldMasterIdLst><p:sldIdLst>'+built.map((_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rSlide'+(i+1)+'"/>').join('')+'</p:sldIdLst><p:sldSz cx="'+SW+'" cy="'+SH+'"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'],
  ['ppt/_rels/presentation.xml.rels',rels(rel('rMaster','slideMaster','slideMasters/slideMaster1.xml')+rel('rTheme','theme','theme/theme1.xml')+built.map((_,i)=>rel('rSlide'+(i+1),'slide','slides/slide'+(i+1)+'.xml')).join(''))],
  ['ppt/slideMasters/slideMaster1.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster '+A+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'+EMPTY_TREE+'</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rLayout"/></p:sldLayoutIdLst></p:sldMaster>'],
  ['ppt/slideMasters/_rels/slideMaster1.xml.rels',rels(rel('rLayout','slideLayout','../slideLayouts/slideLayout1.xml')+rel('rTheme','theme','../theme/theme1.xml'))],
  ['ppt/slideLayouts/slideLayout1.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout '+A+' type="blank" preserve="1"><p:cSld name="Blank">'+EMPTY_TREE+'</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'],
  ['ppt/slideLayouts/_rels/slideLayout1.xml.rels',rels(rel('rMaster','slideMaster','../slideMasters/slideMaster1.xml'))],
  ['ppt/theme/theme1.xml',THEME],
  ...built.flatMap((b,i)=>[['ppt/slides/slide'+(i+1)+'.xml',b.xml],['ppt/slides/_rels/slide'+(i+1)+'.xml.rels',rels(rel('rLayout','slideLayout','../slideLayouts/slideLayout1.xml'))]])
 ];
 return zip(entries);
}
// ---- HTML for PDF -----------------------------------------------------------------------------------
function html(markdown,{title=''}={}){
 const span=r=>{let t=xml(r.text);if(r.code)t='<code>'+t+'</code>';if(r.bold)t='<strong>'+t+'</strong>';if(r.italic)t='<em>'+t+'</em>';if(r.link)t='<a href="'+xml(r.link)+'">'+t+'</a>';return t;};
 const text=s=>inline(s).map(span).join('');
 let body=title&&!/^#\s/.test(String(markdown).trim())?'<h1>'+xml(title)+'</h1>':'';
 for(const b of blocks(markdown)){
  if(b.type==='heading')body+='<h'+Math.min(4,b.level)+'>'+text(b.text)+'</h'+Math.min(4,b.level)+'>';
  else if(b.type==='paragraph')body+='<p>'+text(b.text)+'</p>';
  else if(b.type==='quote')body+='<blockquote>'+text(b.text)+'</blockquote>';
  else if(b.type==='rule')body+='<hr>';
  else if(b.type==='code')body+='<pre>'+xml(b.text)+'</pre>';
  else if(b.type==='list')body+='<'+(b.ordered?'ol':'ul')+'>'+b.items.map(it=>'<li style="margin-left:'+it.level*1.5+'em">'+text(it.text)+'</li>').join('')+'</'+(b.ordered?'ol':'ul')+'>';
  else if(b.type==='table')body+='<table>'+b.rows.map((r,i)=>'<tr>'+r.map(c=>i===0&&b.header?'<th>'+text(c)+'</th>':'<td>'+text(c)+'</td>').join('')+'</tr>').join('')+'</table>';
 }
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>'+xml(title)+'</title><style>body{font:11pt/1.5 -apple-system,"Segoe UI",Arial,sans-serif;color:#1f2937;margin:0}h1{font-size:20pt;color:#1f3864;margin:0 0 12pt}h2{font-size:15pt;color:#2e5395;margin:18pt 0 6pt}h3,h4{font-size:12.5pt;color:#2e5395;margin:14pt 0 4pt}p{margin:0 0 8pt}table{border-collapse:collapse;width:100%;margin:6pt 0 12pt;font-size:10pt}th,td{border:1px solid #a6a6a6;padding:4pt 6pt;text-align:left;vertical-align:top}th{background:#e8eef4}pre{background:#f2f2f2;padding:8pt;font:9pt/1.4 Menlo,Consolas,monospace;white-space:pre-wrap}code{font-family:Menlo,Consolas,monospace;font-size:9.5pt}blockquote{margin:0 0 8pt 16pt;color:#595959;font-style:italic}a{color:#0563c1}h1,h2,h3{page-break-after:avoid}tr{page-break-inside:avoid}</style></head><body>'+body+'</body></html>';
}
// A safe file name from a title: no path characters, not empty, at most 80 characters.
function fileName(title,ext){let base=String(title||'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,' ').replace(/\s+/g,' ').trim().replace(/^\.+/,'').replace(/[. ]+$/,'').slice(0,80)||'Документ';
 // Names Windows reserves for devices cannot be files.
 if(/^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(base))base+='_';return base+'.'+ext;}
// A file that came from a script is marked as downloaded from the internet, so the system warns before
// opening it (macOS quarantine, Windows Mark of the Web). Best effort: the file is kept either way.
function markDownloaded(file){
 try{
  if(process.platform==='darwin')require('node:child_process').execFileSync('/usr/bin/xattr',['-w','com.apple.quarantine','0081;'+Math.floor(Date.now()/1000).toString(16)+';Petya;',file],{timeout:3000,stdio:'ignore'});
  else if(process.platform==='win32')require('node:fs').writeFileSync(file+':Zone.Identifier','[ZoneTransfer]\r\nZoneId=3\r\n');
 }catch{/* Not supported by the file system. */}
}
module.exports={zip,blocks,inline,docx,xlsx,pptx,html,fileName,xml,markDownloaded,safeFormula};
