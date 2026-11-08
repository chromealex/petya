#!/usr/bin/env node
// Collects user-facing Russian strings from the interface sources.
// Usage: node scripts/i18n-strings.cjs [--missing en] [--json]
// --missing en lists strings that src/locales/en.json neither translates nor marks as "untranslated" (names and
// other text that must stay as written); tests/interface-language.cjs fails while that list is not empty.
// Russian is the source language: the Russian text itself is the translation key.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const CYR=/[А-Яа-яЁё]/;
// Interface sources: renderer files, extensions (their cards and settings), and errors/notices raised by the main process.
function files(){
 const out=[];
 const walk=(dir,test)=>{for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,entry.name);if(entry.isDirectory()){if(!/node_modules|vendor|__pycache__|catalog-icons|skill-library/.test(entry.name))walk(rel,test);}else if(test(rel))out.push(rel);}};
 walk('src/ui',f=>/\.(js|html)$/.test(f));
 walk('src/extensions',f=>/\.(js|cjs|html|json)$/.test(f));
 return out;
}
// Main-process files: only text that reaches the interface (errors shown as notices, menu and notification labels).
function mainFiles(){
 const out=['src/tray-menu.cjs','src/language-catalog.json'];
 for(const dir of ['src','src/features'])for(const name of fs.readdirSync(path.join(root,dir)))if(name.endsWith('.cjs')&&!out.includes(dir+'/'+name))out.push(dir+'/'+name);
 return out;
}
// Strings that are patterns or model prompts, not interface text.
function skip(s,markup=false){
 const text=s.trim();
 if(!CYR.test(text))return true;
 if(markup)return false;
 if(text.length>400)return true;
 if(/\(\?[:=!<]|\\[bdswpu]|\[\^|\|\(|\)\||^\^|\$$/.test(text))return true;
 if(/\|/.test(text)&&!/\s\|\s/.test(text))return true;
 return false;
}
function literals(source){
 const found=[];let i=0;
 while(i<source.length){
  const c=source[i];
  if(c==='/'&&source[i+1]==='/'){const end=source.indexOf('\n',i);i=end<0?source.length:end;continue;}
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
  if(c==='/'){ // regex literal: skip when the previous significant char cannot end an expression
   let j=i-1;while(j>=0&&/\s/.test(source[j]))j--;
   if(j<0||/[(,=:[!&|?{};+\-*%<>~^]/.test(source[j])||/\b(return|typeof|case)$/.test(source.slice(Math.max(0,j-6),j+1))){
    let k=i+1,klass=false;while(k<source.length){const d=source[k];if(d==='\\'){k+=2;continue;}if(d==='[')klass=true;else if(d===']')klass=false;else if(d==='/'&&!klass)break;else if(d==='\n')break;k++;}
    i=k+1;continue;
   }
  }
  if(c==='"'||c==="'"||c==='`'){
   let k=i+1,buf='',parts=[];
   while(k<source.length&&source[k]!==c){
    if(source[k]==='\\'){const n=source[k+1];buf+=n==='n'?'\n':n==='t'?'\t':n==='u'?String.fromCharCode(parseInt(source.slice(k+2,k+6),16)):n;k+=n==='u'?6:2;continue;}
    if(c==='`'&&source[k]==='$'&&source[k+1]==='{'){parts.push(buf);buf='';let depth=1;k+=2;while(k<source.length&&depth){if(source[k]==='{')depth++;else if(source[k]==='}')depth--;k++;}continue;}
    if(c!=='`'&&source[k]==='\n')break;
    buf+=source[k];k++;
   }
   parts.push(buf);for(const p of parts)found.push(p);
   i=k+1;continue;
  }
  i++;
 }
 return found;
}
function htmlStrings(source){
 const found=[];
 const body=source.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');
 for(const m of body.matchAll(/>([^<>]+)</g))found.push(m[1].replace(/&nbsp;/g,'\u00a0').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
 for(const m of body.matchAll(/\s(?:title|aria-label|placeholder|alt|data-label)="([^"]*)"/g))found.push(m[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"'));
 return found;
}
function collect(){
 const map=new Map();
 for(const file of mainFiles()){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  let list=[];
  if(file.endsWith('tray-menu.cjs'))list=literals(source);
  else if(file.endsWith('language-catalog.json'))list=Object.values(JSON.parse(source)).map(v=>v.label);
  else for(const m of source.matchAll(/(?:\bError\(|\b(?:label|title|message)\s*:\s*)(['"`])((?:\\.|(?!\1).)*)\1/g))list.push(...literals(m[1]+m[2]+m[1]));
  for(const raw of list){const key=raw.replace(/\s+/g,' ').trim();if(skip(key))continue;if(!map.has(key))map.set(key,new Set());map.get(key).add(file);}
 }
 for(const file of files()){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  let list;
  if(file.endsWith('.html'))list=[...htmlStrings(source),...literals((source.match(/<script>[\s\S]*?<\/script>/g)||[]).join('\n'))];
  else if(file.endsWith('.json'))list=[];
  else list=literals(source);
  if(file.endsWith('.json')){try{const walk=v=>{if(typeof v==='string')list.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(JSON.parse(source));}catch{}}
  const markup=file.endsWith('.html')?new Set(htmlStrings(source).map(raw=>raw.replace(/\s+/g,' ').trim())):new Set();
  for(const raw of list){const key=raw.replace(/\s+/g,' ').trim();if(skip(key,markup.has(key)))continue;if(!map.has(key))map.set(key,new Set());map.get(key).add(file);}
 }
 return map;
}
module.exports={collect,literals,htmlStrings};
if(require.main===module){
 const map=collect();const args=process.argv.slice(2);
 const missingIndex=args.indexOf('--missing');
 let keys=[...map.keys()].sort();
 if(missingIndex>=0){const locale=args[missingIndex+1];const dict=require(path.join(root,'src/locales',locale+'.json'));keys=keys.filter(k=>!(k in dict.strings)&&!(dict.untranslated||[]).includes(k));}
 if(args.includes('--json'))process.stdout.write(JSON.stringify(keys,null,1)+'\n');
 else{for(const k of keys)console.log(k);console.error(keys.length+' strings');}
}
