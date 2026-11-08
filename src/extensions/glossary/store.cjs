// The glossary of each project, kept in the company's data folder (<company>/extensions/glossary/glossary.json).
// Only terms the user accepted are stored; candidates live in the chat card until «Принять».
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const langs=require('../localization/langs.cjs');
const MAX_TERMS=500;
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const key=t=>one(t).toLocaleLowerCase().replace(/ё/g,'е');
const list=(v,max=12,len=60)=>[...new Set((Array.isArray(v)?v:String(v||'').split(/[,;\n]/)).map(x=>one(x).slice(0,len)).filter(Boolean))].slice(0,max);

// A term as stored: checked lengths, language codes of translations, de-duplicated lists.
function clean(input={},{id}={}){
 const term=one(input.term);
 if(!term||term.length>60)throw Error('Термин — от 1 до 60 символов.');
 const definition=one(input.definition).slice(0,600);
 const translations={};
 for(const [code,text] of Object.entries(input.translations&&typeof input.translations==='object'?input.translations:{})){
  const lang=langs.code(code),value=one(text).slice(0,80);
  if(!lang)throw Error('Неизвестный код языка перевода: '+String(code).slice(0,12)+'.');
  if(value)translations[lang]=value;
 }
 const sources=(Array.isArray(input.sources)?input.sources:[]).slice(0,8).map(s=>({kind:one(s?.kind).slice(0,20),label:one(s?.label).slice(0,160),...(/^https:\/\//.test(s?.url||'')?{url:String(s.url).slice(0,600)}:{})})).filter(s=>s.kind&&s.label);
 return {id:id||(typeof input.id==='string'&&/^[\w-]{8,64}$/.test(input.id)?input.id:randomUUID()),term,definition,translations,synonyms:list(input.synonyms).filter(s=>key(s)!==key(term)),forbidden:list(input.forbidden),sources};
}

class Store{
 constructor(root){this.file=path.join(root,'extensions','glossary','glossary.json');}
 read(){try{const d=JSON.parse(fs.readFileSync(this.file,'utf8'));return d&&d.version===1&&d.projects&&typeof d.projects==='object'?d:{version:1,projects:{}};}catch{return {version:1,projects:{}};}}
 write(data){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp',JSON.stringify(data,null,1),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 terms(projectId){return (this.read().projects[projectId]?.terms||[]).slice();}
 find(projectId,term){const k=key(term);return this.terms(projectId).find(t=>key(t.term)===k||(t.synonyms||[]).some(s=>key(s)===k))||null;}
 // A new term; an existing term with the same name is not overwritten.
 add(projectId,input,{name='',now=Date.now()}={}){
  const data=this.read(),p=data.projects[projectId]||{name,terms:[]};
  const t=clean(input);
  if(p.terms.some(x=>key(x.term)===key(t.term)))throw Error('Термин «'+t.term+'» уже есть в глоссарии — нажмите «Изменить».');
  if(p.terms.length>=MAX_TERMS)throw Error('В глоссарии проекта уже '+MAX_TERMS+' терминов.');
  const saved={...t,at:now,updatedAt:now};
  p.terms.push(saved);if(name)p.name=name;data.projects[projectId]=p;this.write(data);return saved;
 }
 update(projectId,id,input,{now=Date.now()}={}){
  const data=this.read(),p=data.projects[projectId];const i=p?.terms.findIndex(t=>t.id===id)??-1;
  if(i<0)throw Error('Термина уже нет в глоссарии.');
  const next=clean({...p.terms[i],...input},{id});
  if(p.terms.some((x,j)=>j!==i&&key(x.term)===key(next.term)))throw Error('Термин «'+next.term+'» уже есть в глоссарии.');
  p.terms[i]={...next,at:p.terms[i].at,updatedAt:now};this.write(data);return p.terms[i];
 }
 remove(projectId,id){
  const data=this.read(),p=data.projects[projectId];const i=p?.terms.findIndex(t=>t.id===id)??-1;
  if(i<0)throw Error('Термина уже нет в глоссарии.');
  const [removed]=p.terms.splice(i,1);this.write(data);return removed;
 }
 // «Отменить» after a delete: the same term back with its id.
 restore(projectId,term){
  const data=this.read(),p=data.projects[projectId]||{name:'',terms:[]};
  const t=clean(term,{id:term?.id});
  if(p.terms.some(x=>x.id===t.id||key(x.term)===key(t.term)))throw Error('Термин «'+t.term+'» уже снова в глоссарии.');
  p.terms.push({...t,at:Number(term.at)||Date.now(),updatedAt:Date.now()});data.projects[projectId]=p;this.write(data);return t;
 }
}

const csvCell=v=>{const s=String(v??'');return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
// CSV: term, definition, synonyms, forbidden, then one column per translation language; JSON: the stored terms.
function exportTerms(terms,format,{project=''}={}){
 if(format==='json')return {name:'glossary.json',type:'application/json',content:JSON.stringify({project,exported:new Date().toISOString(),terms:terms.map(({id,term,definition,translations,synonyms,forbidden})=>({term,definition,translations,synonyms,forbidden}))},null,2)};
 if(format!=='csv')throw Error('Формат экспорта — CSV или JSON.');
 const codes=[...new Set(terms.flatMap(t=>Object.keys(t.translations||{})))].sort();
 const rows=[['term','definition','synonyms','forbidden',...codes],...terms.map(t=>[t.term,t.definition,(t.synonyms||[]).join('; '),(t.forbidden||[]).join('; '),...codes.map(c=>t.translations?.[c]||'')])];
 return {name:'glossary.csv',type:'text/csv',content:'﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'};
}
module.exports={Store,clean,exportTerms,key};
