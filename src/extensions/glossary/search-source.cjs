// Search source of «Глоссарий» for «Поиск по всему» (`search-source`, src/extensions/search-all/registry.cjs):
// accepted terms of the chat project's glossary (<company>/extensions/glossary/glossary.json).
const fs=require('node:fs');
const path=require('node:path');
const Q=require('../search-all/query.cjs');
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const file=s=>s?.dataRoot?path.join(s.dataRoot,'extensions','glossary','glossary.json'):'';
const EMPTY='Глоссарий проекта пуст.';
module.exports={
 id:'glossary',label:'Глоссарий',order:90,icon:'book',in:'в глоссарии',
 ready:(settings,s)=>!!file(s)&&fs.existsSync(file(s)),
 off:EMPTY,
 search(s,{terms}){
  let data;try{data=JSON.parse(fs.readFileSync(file(s),'utf8'));}catch{return {state:'off',items:[],note:EMPTY};}
  const state=s.dialogue?.state||{},topic=s.dialogue?.active?.();
  const id=topic?.projectId||state.activeProjectId||'general';
  const list=data?.projects?.[id]?.terms||[];
  if(!list.length)return {state:'off',items:[],note:EMPTY};
  const re=Q.pattern(terms);if(!re)return {items:[]};
  return {items:list.filter(t=>{const text=Q.norm([t.term,t.definition,...(t.synonyms||[]),...Object.values(t.translations||{})].join(' '));re.lastIndex=0;return re.test(text);}).map(t=>({source:'glossary',id:'glossary:'+t.id,title:one(t.term).slice(0,80),
   text:[one(t.definition),(t.synonyms||[]).length?'Синонимы: '+t.synonyms.join(', '):'',Object.entries(t.translations||{}).map(([k,v])=>k+': '+v).join(', ')].filter(Boolean).join('\n').slice(0,2000),url:'',at:Number(t.updatedAt||t.at)||0,meta:''}))};
 }
};
