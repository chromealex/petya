// Interface translation shared by the main process (require) and the renderer (window.PetyaI18nCore).
// Russian is the source language: the trimmed Russian text is the key, the locale file gives its translation.
// Text built in code from several literals is translated piece by piece: each known fragment that stands
// on word boundaries is replaced, so «Скачать язык: » + name still reads in the chosen language.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetyaI18nCore=api;})(typeof self!=='undefined'?self:this,function(){
 const CYRILLIC=/[А-Яа-яЁё]/;
 const LETTER=/[A-Za-zА-Яа-яЁё0-9_]/;
 const SUPPORTED=['ru','en'];
 // An explicit choice wins; otherwise the first supported system language, then English.
 function resolve(preference,systemLanguages){
  if(SUPPORTED.includes(preference))return preference;
  for(const tag of systemLanguages||[]){const code=String(tag||'').toLowerCase().split(/[-_]/)[0];if(SUPPORTED.includes(code))return code;}
  return 'en';
 }
 function create(strings){
  const map=new Map();
  for(const [key,value] of Object.entries(strings||{}))if(typeof value==='string'&&value)map.set(key.replace(/\s+/g,' ').trim(),value);
  // Fragments are looked up by their first two characters, longest first.
  const buckets=new Map();
  for(const key of [...map.keys()].filter(k=>k.length>=3&&CYRILLIC.test(k)).sort((a,b)=>b.length-a.length)){
   const head=key.slice(0,2);if(!buckets.has(head))buckets.set(head,[]);buckets.get(head).push(key);
  }
  // Keys shorter than three letters are too ambiguous for composed text, except a word between two numbers («2 из 3»).
  const short=[...map.keys()].filter(k=>k.length<3&&CYRILLIC.test(k));
  const DIGIT=/[0-9]/;
  function fragments(text){
   let out='',i=0;
   while(i<text.length){
    let hit=null;
    if(!LETTER.test(text[i-1]||'')||!LETTER.test(text[i])){
     for(const key of buckets.get(text.slice(i,i+2))||[]){
      if(!text.startsWith(key,i))continue;
      const end=i+key.length;
      if(LETTER.test(key[key.length-1])&&LETTER.test(text[end]||''))continue;
      hit=key;break;
     }
     if(!hit&&text[i-1]===' '&&DIGIT.test(text[i-2]||''))hit=short.find(key=>text.startsWith(key,i)&&text[i+key.length]===' '&&DIGIT.test(text[i+key.length+1]||''))||null;
    }
    if(hit){out+=map.get(hit);i+=hit.length;}else{out+=text[i];i++;}
   }
   return out;
  }
  function translate(text){
   if(typeof text!=='string'||!CYRILLIC.test(text))return text;
   const lead=text.match(/^\s*/)[0];const body=text.slice(lead.length);const trail=body.match(/\s*$/)[0];
   const core=body.slice(0,body.length-trail.length).replace(/\s+/g,' ');
   if(map.has(core))return lead+map.get(core)+trail;
   // A composed string is used only when most of it is known; otherwise a half-translated sentence
   // would read worse than the original.
   const result=fragments(text),before=(text.match(/[А-Яа-яЁё]/g)||[]).length,after=(result.match(/[А-Яа-яЁё]/g)||[]).length;
   return after<=before/2?result:text;
  }
  return {translate,has:text=>map.has(String(text).replace(/\s+/g,' ').trim()),size:map.size};
 }
 return {create,resolve,SUPPORTED};
});
