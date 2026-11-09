// Builds small PDFs for the «Договоры в PDF» tests, so no binary fixtures are committed. What real generators do:
// a Type0 font with Identity-H codes and a ToUnicode CMap (Word, LibreOffice, Chrome), a simple font with a
// WinAnsi base and Cyrillic glyph names in Differences (cp1251 codes, older generators), Flate content streams, words
// placed one by one (spacing from the glyph widths), kerning arrays in TJ, an object stream, a two-column page, a
// scanned page (an image and no text), and an /Encrypt entry for the refusal.
const zlib=require('node:zlib');
const W=500,SIZE=10;// every glyph is half an em wide

const CP1251=(()=>{const m=new Map();for(let i=0;i<64;i++)m.set(String.fromCharCode(0x410+i),0xC0+i);m.set('Ё',0xA8);m.set('ё',0xB8);m.set('№',0xB9);return m;})();
const afii=c=>{const u=c.charCodeAt(0);if(c==='Ё')return 'afii10023';if(c==='ё')return 'afii10071';if(u>=0x410&&u<=0x42F)return 'afii'+(10017+(u-0x410)+(u>0x415?1:0));if(u>=0x430&&u<=0x44F)return 'afii'+(10065+(u-0x430)+(u>0x435?1:0));return null;};
const hex2=s=>[...s].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
function simple(s){let out='';for(const c of s){const code=CP1251.get(c)??(c.charCodeAt(0)<128?c.charCodeAt(0):c==='«'?0xAB:c==='»'?0xBB:c==='—'?0x97:c==='–'?0x96:0x3F);out+=code.toString(16).padStart(2,'0');}return out;}
function wrap(text,width=88){const out=[];let line='';for(const w of String(text).split(/\s+/)){if(line&&(line+' '+w).length>width){out.push(line);line=w;}else line=line?line+' '+w:w;}if(line)out.push(line);return out;}

// pages: [{lines:[…]} | {columns:[[…],[…]]} | {scan:true}], options: {objstm, encrypt, simpleHeadings, words}
function make(pages,{objstm=false,encrypt=false,simpleHeadings=true,words=true}={}){
 const objs=[];// [num, body(string|{dict, stream})]
 const add=body=>{objs.push(body);return objs.length;};
 const used=new Set();for(const p of pages)for(const l of [...(p.lines||[]),...(p.columns||[]).flat()])for(const c of l)used.add(c);
 const chars=[...used].sort();
 const blocks=[];for(let i=0;i<chars.length;i+=90)blocks.push(chars.slice(i,i+90));
 const cmapText='/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Petya-UCS def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n'+
  blocks.map(b=>b.length+' beginbfchar\n'+b.map(c=>'<'+hex2(c)+'> <'+hex2(c)+'>').join('\n')+'\nendbfchar').join('\n')+'\nendcmap CMapName currentdict /CMap defineresource pop end end';
 const toUnicode=add({dict:'/Length LEN /Filter /FlateDecode',stream:zlib.deflateSync(Buffer.from(cmapText,'latin1'))});
 const cid=add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PetyaSerif /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW '+W+' >>');
 const f1=add('<< /Type /Font /Subtype /Type0 /BaseFont /PetyaSerif /Encoding /Identity-H /DescendantFonts ['+cid+' 0 R] /ToUnicode '+toUnicode+' 0 R >>');
 const diffs=[];for(let i=0;i<64;i++)diffs.push(0xC0+i,'/'+afii(String.fromCharCode(0x410+i)));
 const f2=add('<< /Type /Font /Subtype /TrueType /BaseFont /PetyaSans /FirstChar 32 /LastChar 255 /Widths ['+Array(224).fill(W).join(' ')+'] /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [168 /afii10023 184 /afii10071 185 /afii61352 '+diffs.join(' ')+'] >> >>');
 const pagesNum=objs.length+1;objs.push(null);// placeholder for /Pages
 const kids=[];
 const heading=l=>/^(?:\d+\.\s+)?[А-ЯЁA-Z0-9№«»\s,.\-—/]+$/.test(l)&&/[А-ЯЁ]{4}/.test(l);
 const lineOps=(l,x,y)=>{
  if(simpleHeadings&&heading(l))return 'BT /F2 '+SIZE+' Tf '+x+' '+y+' Td <'+simple(l)+'> Tj ET';
  if(words&&l.length%3===0){// word by word, each placed after the previous one plus a space
   let ops='',cx=x;for(const w of l.split(' ')){ops+='BT /F1 '+SIZE+' Tf 1 0 0 1 '+cx.toFixed(2)+' '+y+' Tm <'+hex2(w)+'> Tj ET\n';cx+=(w.length+1)*W/1000*SIZE;}return ops;
  }
  if(l.length%3===1){// TJ with small kerning inside words and a space glyph between them
   const parts=l.split(' ');return 'BT /F1 '+SIZE+' Tf '+x+' '+y+' Td ['+parts.map((w,i)=>'<'+hex2(w.slice(0,1))+'> 12 <'+hex2(w.slice(1)+(i<parts.length-1?' ':''))+'>').join(' ')+'] TJ ET';
  }
  return 'BT /F1 '+SIZE+' Tf 14 TL '+x+' '+y+' Td <'+hex2(l)+'> Tj ET';
 };
 for(const p of pages){
  let content='',resources='/Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >>';
  if(p.scan){
   const w=120,h=160,px=Buffer.alloc(w*h,255);for(let y=10;y<h-10;y+=6)for(let x=10;x<w-10;x++)if((x*7+y)%11<8)px[y*w+x]=20;
   const img=add({dict:'/Type /XObject /Subtype /Image /Width '+w+' /Height '+h+' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length LEN',stream:zlib.deflateSync(px)});
   resources+=' /XObject << /Im1 '+img+' 0 R >>';content='q 595 0 0 842 0 0 cm /Im1 Do Q';
  }else if(p.columns){
   let y=800;for(let i=0;i<Math.max(p.columns[0].length,p.columns[1].length);i++){if(p.columns[0][i])content+=lineOps(p.columns[0][i],40,y)+'\n';if(p.columns[1][i])content+=lineOps(p.columns[1][i],320,y)+'\n';y-=14;}
  }else{let y=800;for(const l of p.lines){content+=lineOps(l,50,y)+'\n';y-=14;}}
  const c=add({dict:'/Length LEN /Filter /FlateDecode',stream:zlib.deflateSync(Buffer.from(content,'latin1'))});
  kids.push(add('<< /Type /Page /Parent '+pagesNum+' 0 R /MediaBox [0 0 595 842] /Resources << '+resources+' >> /Contents '+c+' 0 R >>'));
 }
 objs[pagesNum-1]='<< /Type /Pages /Kids ['+kids.map(k=>k+' 0 R').join(' ')+'] /Count '+kids.length+' >>';
 const catalog=add('<< /Type /Catalog /Pages '+pagesNum+' 0 R >>');
 // Fonts (dictionaries, not streams) go into an object stream when asked, as PDF 1.5 writers do.
 const packed=objstm?[cid,f1,f2]:[];
 if(packed.length){
  let head='',body='';for(const n of packed){head+=n+' '+body.length+' ';body+=objs[n-1]+'\n';}
  add({dict:'/Type /ObjStm /N '+packed.length+' /First '+head.length+' /Filter /FlateDecode /Length LEN',stream:zlib.deflateSync(Buffer.from(head+body,'latin1'))});
 }
 const parts=[Buffer.from('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n','latin1')];const offsets=[];let size=parts[0].length;
 objs.forEach((o,i)=>{
  const n=i+1;if(packed.includes(n)){offsets.push(null);return;}
  offsets.push(size);
  const chunk=typeof o==='string'?Buffer.from(n+' 0 obj\n'+o+'\nendobj\n','latin1'):Buffer.concat([Buffer.from(n+' 0 obj\n<< '+o.dict.replace('LEN',String(o.stream.length))+' >>\nstream\n','latin1'),o.stream,Buffer.from('\nendstream\nendobj\n','latin1')]);
  parts.push(chunk);size+=chunk.length;
 });
 const enc=encrypt?' /Encrypt << /Filter /Standard /V 2 /R 3 /O <00> /U <00> /P -4 >>':'';
 if(packed.length){
  // Objects inside an object stream need a cross-reference stream (PDF 1.5): type 1 = offset, type 2 = in the stream.
  const stm=objs.length,xrefNum=objs.length+1,rows=[Buffer.from([0,0,0,0,0,255,255])];
  offsets.forEach((o,i)=>{const b=Buffer.alloc(7);if(packed.includes(i+1)){b[0]=2;b.writeUInt32BE(stm,1);b.writeUInt16BE(packed.indexOf(i+1),5);}else{b[0]=1;b.writeUInt32BE(o,1);}rows.push(b);});
  const self=Buffer.alloc(7);self[0]=1;self.writeUInt32BE(size,1);rows.push(self);
  const data=Buffer.concat(rows);
  parts.push(Buffer.from(xrefNum+' 0 obj\n<< /Type /XRef /Size '+(xrefNum+1)+' /W [1 4 2] /Root '+catalog+' 0 R'+enc+' /Length '+data.length+' >>\nstream\n','latin1'),data,Buffer.from('\nendstream\nendobj\nstartxref\n'+size+'\n%%EOF\n','latin1'));
  return Buffer.concat(parts);
 }
 const xref='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offsets.map(o=>o===null?'0000000000 00000 f \n':String(o).padStart(10,'0')+' 00000 n \n').join('');
 parts.push(Buffer.from(xref+'trailer\n<< /Size '+(objs.length+1)+' /Root '+catalog+' 0 R'+enc+' >>\nstartxref\n'+size+'\n%%EOF\n','latin1'));
 return Buffer.concat(parts);
}
// A contract as pages of lines (wrapped at about 88 characters).
function contract(paragraphs,{perPage=48}={}){
 const lines=paragraphs.flatMap(p=>wrap(p));const pages=[];
 for(let i=0;i<lines.length;i+=perPage)pages.push({lines:lines.slice(i,i+perPage)});
 return pages;
}
module.exports={make,contract,wrap};
