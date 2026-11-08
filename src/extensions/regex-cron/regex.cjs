// Regular expressions: finding one in the request, the sample lines to try, and a safe test run.
// Matching runs in a separate V8 context with a time limit, so a catastrophic pattern cannot freeze Petya.
const vm=require('node:vm');

// «/^\d{3}-\d{2}$/i», `^\w+@\w+$`, «регулярка ^a+$».
function extract(text){
 const s=String(text||'');
 const literal=/(?:^|[\s«"(:])\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+)\/([dgimsuvy]*)(?=$|[\s»").,?!:])/u.exec(s);
 if(literal)return {pattern:literal[1],flags:literal[2]};
 const code=/`([^`\n]+)`/u.exec(s);
 if(code)return {pattern:code[1],flags:''};
 const quoted=/(?:регуляр\p{L}*|regexp?|выражени\p{L}*|паттерн\p{L}*|шаблон\p{L}*)\s*[:«"]\s*«?([^»"\n]+)[»"]?/iu.exec(s);
 if(quoted&&/[\\^$[\]()*+?{}|]/.test(quoted[1]))return {pattern:quoted[1].trim(),flags:''};
 return null;
}
// Sample lines: everything after «на строках:», «примеры:», or the lines after the first one.
function samples(text){
 const s=String(text||'');
 const after=/(?:на (?:строках|строке|примерах|примере|тексте)|примеры|строки)\s*:?\s*([\s\S]+)$/iu.exec(s);
 const body=after?after[1]:s.split('\n').slice(1).join('\n');
 const quoted=[...body.matchAll(/«([^»]+)»|"([^"]+)"/gu)].map(m=>m[1]||m[2]);
 const lines=quoted.length?quoted:body.split(/\n|;\s*/u).map(l=>l.replace(/^\s*[-*•\d.)]+\s+/u,'').trim()).filter(Boolean);
 return lines.slice(0,20).map(l=>l.slice(0,300));
}
function compile(pattern,flags=''){
 if(String(pattern).length>2000)throw Error('Слишком длинное выражение.');
 const clean=[...new Set(String(flags).replace(/[^dimsuvy]/g,''))].join('');
 try{new RegExp(pattern,clean);}catch(e){throw Error('Выражение не компилируется: '+e.message.replace(/^Invalid regular expression: /,''));}
 return clean;
}
// Every match in every sample with its position; `timeout` guards against catastrophic backtracking.
function test(pattern,flags,lines,{timeout=250}={}){
 const clean=compile(pattern,flags);
 const sandbox={pattern,flags:clean+'g',lines,out:null};
 try{
  vm.runInNewContext(`out=lines.map(line=>{const r=new RegExp(pattern,flags);const found=[];let m;while((m=r.exec(line))&&found.length<50){found.push({index:m.index,text:m[0],groups:m.slice(1)});if(m[0]==='')r.lastIndex++;}return found;});`,sandbox,{timeout});
 }catch(e){
  if(/timed out/i.test(e.message))throw Error('Выражение слишком долго проверяется: вероятен катастрофический возврат (вложенные квантификаторы вроде (a+)+).');
  throw e;
 }
 return lines.map((line,i)=>({line,matches:sandbox.out[i].map(m=>({index:m.index,text:m.text,groups:[...m.groups].map(g=>g??null)}))}));
}
// Patterns known to backtrack badly: nested quantifiers on overlapping parts.
function risky(pattern){return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern);}
module.exports={extract,samples,compile,test,risky};
