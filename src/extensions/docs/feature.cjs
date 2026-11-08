// Docs plugin: «найди в Confluence / Notion …» answers with page cards (message.extensionData.docItems):
// the matching excerpt, the page's sections and links. Search goes through the workspace's docs search.
const ASK=/(?:^|\s)(?:найди|найти|поищи|ищи|покажи|где)(?=\s|$)/iu;
const WHERE=/(?:confluence|конфл[юу][еэ]нс\p{L}*|notion|ноушен\p{L}*|ноушн\p{L}*|вики|wiki)/iu;
const NOISE=/(?:^|\s)(?:петя|найди|найти|поищи|ищи|покажи|где|мне|пожалуйста|в|во|на|по|про|о|об|страниц\p{L}*|документ\p{L}*|доку|confluence|конфл[юу][еэ]нс\p{L}*|notion|ноушен\p{L}*|ноушн\p{L}*|вики|wiki|спек\p{L}*|описани\p{L}*)(?=\s|$)/giu;
function topic(command){return String(command).replace(/[«»"“”.,!?:;]/g,' ').replace(NOISE,' ').replace(/\s+/g,' ').trim();}
// Sections: lines that look like headings in the flattened page text (short, no final period).
function sections(text){return [...new Set(String(text).split(/\n+/).map(l=>l.trim()).filter(l=>l.length>2&&l.length<70&&!/[.,:;]$/.test(l)&&/^[\p{Lu}\d]/u.test(l)&&l.split(' ').length<=8))].slice(0,8);}
function excerpt(text,terms){
  const flat=String(text).replace(/\s+/g,' ').trim(),low=flat.toLowerCase();
  const at=terms.map(t=>low.indexOf(t.toLowerCase())).filter(i=>i>=0).sort((a,b)=>a-b)[0]??0;
  const start=Math.max(0,at-120);return (start?'…':'')+flat.slice(start,start+420)+(flat.length>start+420?'…':'');
}
function setup(){return {};}
async function turn(s,command){
  const text=String(command||'');if(!ASK.test(text)||!WHERE.test(text))return null;
  const query=topic(text);if(!query)return null;
  s.requestProgress?.report('Ищу в документации: '+query);
  let found;
  try{found=await s.workspace.searchDocs({title:'',text:''},query);}
  catch(e){s.dialogue.rememberAction(text,'Документы · '+e.message);const t=s.dialogue.active();t.messages.at(-1).error=true;s.dialogue.persist();return {handled:true,error:true,text:'Документы · '+e.message,topicId:t.id,messages:t.messages,by:'Документы'};}
  const docs=(found.docs||[]).slice(0,8).filter(d=>/^https:\/\//.test(d.url||''));
  const reply=docs.length?'Нашёл '+docs.length+' '+(docs.length===1?'страницу':docs.length<5?'страницы':'страниц')+' по «'+query+'».':'По «'+query+'» страниц не нашёл.'+(found.warnings?.length?' '+found.warnings.join(' '):'');
  s.dialogue.rememberAction(text,reply);const t=s.dialogue.active(),message=t.messages.at(-1);message.by='Документы';
  if(docs.length){message.extensionData={docItems:docs.map(d=>({source:d.source,title:String(d.title||'').slice(0,300),url:d.url,updated:String(d.updated||'').slice(0,40),excerpt:excerpt(d.text,found.terms||[query]),sections:sections(d.text)}))};message.sources=docs.slice(0,5).map(d=>({title:d.source+' · '+d.title,url:d.url}));}
  s.dialogue.persist();
  return {handled:true,text:reply,topicId:t.id,topicTitle:t.title,messages:t.messages,by:'Документы'};
}
module.exports={name:'docsCards',setup,turn,topic,sections,excerpt};
