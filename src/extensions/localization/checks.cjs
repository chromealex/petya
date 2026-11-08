// Localization checks done by code, never by the model: missing and empty strings, strings identical to the
// source (likely untranslated), placeholder/tag mismatches ({0}, {name}, {{x}}, %s, %1$d, %@, <b>, <color=…>)
// and strings much longer than the source (a risk for buttons).
const langs=require('./langs.cjs');

// One regex for every token kind; order matters ({{x}} before {x}).
const TOKEN=/\{\{\s*[\w.-]+\s*\}\}|\{\d+(?:[,:][^{}]*)?\}|\{[A-Za-z_][\w.-]*(?:[,:][^{}]*)?\}|%%|%\([\w.]+\)[sdifr]|%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?(?:hh|h|ll|l|z|j|t|L)?[sdifuxXeEgGcpo@]|<\/?[A-Za-z][\w-]*(?:\s*=\s*[^>]*|\s[^>]*)?\/?>/g;
function normal(t){
 if(t.startsWith('{{'))return '{{'+t.slice(2,-2).trim()+'}}';
 if(t.startsWith('{'))return '{'+t.slice(1,-1).split(/[,:]/)[0]+'}';
 if(t.startsWith('%('))return t;
 if(t.startsWith('%')){const pos=/^%(\d+)\$/.exec(t)?.[1];return '%'+(pos?pos+'$':'')+t.at(-1).replace(/[iu]/,'d');}
 const tag=/^<(\/?)([A-Za-z][\w-]*)/.exec(t);return '<'+tag[1]+tag[2].toLowerCase()+'>';
}
// Placeholder tokens of a string as a sorted list (%% is a literal percent and is ignored).
function placeholders(text){return (String(text||'').match(TOKEN)||[]).filter(t=>t!=='%%').map(normal).sort();}
function mismatch(source,target){
 const a=placeholders(source),b=placeholders(target);
 if(a.join('\u0000')===b.join('\u0000'))return null;
 const rest=[...b],lost=[];for(const t of a){const i=rest.indexOf(t);if(i>=0)rest.splice(i,1);else lost.push(t);}
 return {lost,extra:rest};
}
const describe=m=>[m.lost.length?'нет '+m.lost.join(' '):'',m.extra.length?'лишние '+m.extra.join(' '):''].filter(Boolean).join('; ');

const letters=t=>(String(t).replace(TOKEN,'').match(/\p{L}/gu)||[]).length;
const BUTTON=/(?:^|[._\-\s/])(?:btn|button|cta|action)s?(?:$|[._\-\s/])|button|кнопк/i;

// Checks one set against its source language. `only` limits the target languages.
function check(set,{ratio=1.4,only=[],limit=400}={}){
 const source=set.source,src=set.values[source]||new Map();
 const keys=set.keys.filter(k=>!set.skip?.has(k));
 const targets=set.langs.filter(l=>l!==source&&(!only.length||only.some(o=>langs.same(o,l))));
 const rows=[],problems=[];
 for(const lang of targets){
  const values=set.values[lang]||new Map();
  const row={lang,name:langs.name(lang),set:set.name,total:0,translated:0,missing:0,empty:0,identical:0,placeholders:0,long:0};
  for(const key of keys){
   const s=src.get(key);if(s===undefined||s==='')continue;
   row.total++;
   const t=values.get(key);
   const add=(kind,detail='')=>{row[kind]++;if(problems.length<limit)problems.push({key,lang,kind,source:s.slice(0,300),current:(t??'').slice(0,300),detail,set:set.name});};
   if(t===undefined){add('missing');continue;}
   if(t===''||!t.trim()){add('empty');continue;}
   row.translated++;
   if(t===s&&!langs.same(lang,source)&&letters(s)>=4&&/\p{Ll}/u.test(s)&&!/^(?:https?:|www\.)/.test(s))add('identical');
   const m=mismatch(s,t);if(m)add('placeholders',describe(m));
   const ls=s.length,lt=t.length;
   if(letters(s)>=3&&lt>ls*ratio&&lt-ls>=4)add('long',Math.round(lt/ls*100)+'% от исходника'+(BUTTON.test(key)||ls<=20?' — кнопка может не вместить':''));
  }
  rows.push(row);
 }
 return {rows,problems};
}
// Keys to translate for a language: missing or empty, with a non-empty source.
function todo(set,lang){
 const src=set.values[set.source]||new Map(),values=set.values[lang]||new Map();
 return set.keys.filter(k=>!set.skip?.has(k)&&src.get(k)&&!(values.get(k)||'').trim()).map(key=>({key,source:src.get(key)}));
}
module.exports={placeholders,mismatch,describe,check,todo,TOKEN};
