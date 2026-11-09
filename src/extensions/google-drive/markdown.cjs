// A Petya answer (Markdown as the chat shows it) → blocks for the confirmation card's preview and → HTML that Drive
// converts into a Google Doc with real headings, lists, tables and code. Everything is escaped: the answer's text never
// becomes markup it did not ask for; links are kept only for http(s).
const MAX=200000;
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Markdown → [{type:'heading', level, text} | {type:'p', text} | {type:'li', text, ordered, level} |
// {type:'code', text} | {type:'table', rows} | {type:'quote', text}]. Inline marks stay in `text` for inline().
function blocks(markdown){
 const lines=String(markdown||'').slice(0,MAX).replace(/\r\n?/g,'\n').split('\n');
 const out=[];let para=[],i=0;
 const flush=()=>{if(para.length){out.push({type:'p',text:para.join(' ').trim()});para=[];}};
 while(i<lines.length){
  const line=lines[i];
  const fence=/^\s*(```|~~~)/.exec(line);
  if(fence){flush();const body=[];i++;while(i<lines.length&&!lines[i].trim().startsWith(fence[1])){body.push(lines[i]);i++;}i++;out.push({type:'code',text:body.join('\n')});continue;}
  if(!line.trim()){flush();i++;continue;}
  let m=/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if(m){flush();out.push({type:'heading',level:m[1].length,text:m[2]});i++;continue;}
  if(/^\s*\|.*\|\s*$/.test(line)){
   flush();const rows=[];
   while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){const cells=lines[i].trim().slice(1,-1).split('|').map(c=>c.trim());if(!cells.every(c=>/^:?-{2,}:?$/.test(c)))rows.push(cells);i++;}
   out.push({type:'table',rows});continue;
  }
  m=/^(\s*)(?:[-*+•]|(\d{1,3})[.)])\s+(.*)$/.exec(line);
  if(m){flush();out.push({type:'li',text:m[3],ordered:!!m[2],level:Math.min(3,Math.floor(m[1].length/2))});i++;continue;}
  m=/^\s*>\s?(.*)$/.exec(line);
  if(m){flush();out.push({type:'quote',text:m[1]});i++;continue;}
  para.push(line.trim());i++;
 }
 flush();
 return out;
}
// Inline marks → HTML: **bold**, *italic*, `code`, [text](https://…); everything else escaped.
function inline(text){
 let html='',rest=String(text);
 const re=/\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
 for(let m=re.exec(rest);m;m=re.exec(rest)){
  html+=esc(rest.slice(0,m.index));
  if(m[1]||m[2])html+='<b>'+esc(m[1]||m[2])+'</b>';
  else if(m[3])html+='<i>'+esc(m[3])+'</i>';
  else if(m[4])html+='<code>'+esc(m[4])+'</code>';
  else html+='<a href="'+esc(m[6])+'">'+esc(m[5])+'</a>';
  rest=rest.slice(m.index+m[0].length);
 }
 return html+esc(rest);
}
// Plain text of inline marks (for previews and titles).
const plain=text=>String(text).replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,'$1$2').replace(/\*([^*\s][^*]*)\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1');

function html(title,list){
 const out=['<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title></head><body>'];
 let open=null;
 const close=()=>{if(open){out.push('</'+open+'>');open=null;}};
 for(const b of list){
  if(b.type==='li'){const tag=b.ordered?'ol':'ul';if(open!==tag){close();out.push('<'+tag+'>');open=tag;}out.push('<li'+(b.level?' style="margin-left:'+(b.level*24)+'pt"':'')+'>'+inline(b.text)+'</li>');continue;}
  close();
  if(b.type==='heading')out.push('<h'+b.level+'>'+inline(b.text)+'</h'+b.level+'>');
  else if(b.type==='code')out.push('<pre style="font-family:monospace">'+esc(b.text)+'</pre>');
  else if(b.type==='quote')out.push('<blockquote>'+inline(b.text)+'</blockquote>');
  else if(b.type==='table'){out.push('<table border="1" style="border-collapse:collapse">');b.rows.forEach((r,i)=>out.push('<tr>'+r.map(c=>(i===0?'<th>':'<td>')+inline(c)+(i===0?'</th>':'</td>')).join('')+'</tr>'));out.push('</table>');}
  else out.push('<p>'+inline(b.text)+'</p>');
 }
 close();out.push('</body></html>');
 return out.join('\n');
}
// A title for the new document: the first heading, else the first sentence, ≤ 80 characters.
function title(markdown,fallback='Ответ Пети'){
 const list=blocks(markdown);
 const h=list.find(b=>b.type==='heading');
 let t=plain(h?.text||list.find(b=>b.type==='p')?.text||'').replace(/\s+/g,' ').trim();
 if(!h){const s=/^(.{12,80}?[.!?])(?:\s|$)/.exec(t);t=s?s[1].replace(/[.!]$/,''):t;}
 if(t.length>80)t=t.slice(0,79).replace(/\s+\S*$/,'')+'…';
 return t||fallback;
}
module.exports={blocks,inline,plain,html,title,esc,MAX};
