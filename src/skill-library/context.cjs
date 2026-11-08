// The instructions of a skill for one request, whatever their size. The full SKILL.md and its reference
// texts stay in the skill's folder (the archive); a request gets all of it when it fits, otherwise the
// sections that matter for it, compacted if needed, plus an outline of the sections left in the archive.
const compactor=require('../context-compactor.cjs');
const {localEndpoint}=require('../core.cjs');
// Tokens a skill may take in one request: the rest of the window is the conversation and the data.
const BUDGET=3500,SECTION=3000;
const split=new Map();
function pieces(text){const key=compactor.hash(text);let hit=split.get(key);if(!hit){hit=compactor.sections(text,compactor.charsFor(SECTION,text));split.set(key,hit);if(split.size>50)split.delete(split.keys().next().value);}return hit;}
const full=skill=>String(skill?.body??'');
// Titles of the sections left in the archive: top-level ones first, at most 60.
function titles(omitted){const seen=new Set(),out=[];for(const p of [...omitted.filter(p=>p.level<=2),...omitted.filter(p=>p.level>2)]){const t=(p.title||'без заголовка').replace(/ \(часть \d+ из \d+\)$/,'');if(!seen.has(t)){seen.add(t);out.push(t);}}return out.slice(0,60);}
function render(chosen,omitted,compacted=false){
 let text=chosen.map(p=>p.text).join('\n\n');
 if(omitted.length)text+='\n\n— Разделы навыка, которые не вошли в этот запрос (они сохранены в навыке; если без них не обойтись, скажи, какой раздел нужен): '+titles(omitted).join('; ')+(titles(omitted).length<new Set(omitted.map(p=>p.title)).size?' и другие':'')+'.';
 if(compacted)text+='\n— Часть разделов сжата под этот запрос.';
 return text;
}
const outlineCost=all=>compactor.tokens(titles(all).join('; '))+60;
// Without the model: the first section, then the most relevant ones by shared words.
function fit(skill,query='',budget=BUDGET){
 const text=full(skill);if(compactor.tokens(text)<=budget)return text;
 const all=pieces(text),room=budget-outlineCost(all);
 const {chosen,omitted}=compactor.choose(all,Math.max(400,room),{query,keep:[all[0]?.id]});
 return render(chosen,omitted);
}
// With the model: it reads the outline and picks the sections the request needs; what still does not
// fit is compacted for this request. Any failure falls back to fit().
async function prepare(skill,query,{request,settings,budget=BUDGET,progress}={}){
 const text=full(skill);if(compactor.tokens(text)<=budget)return text;
 const model=settings?.model;if(!request||!model)return fit(skill,query,budget);
 const endpoint=localEndpoint(settings.ollamaUrl),all=pieces(text);
 try{
  const outline=all.map(p=>({id:p.id,title:p.title||'Начало',preview:p.text.replace(/\s+/g,' ').slice(0,160)}));
  let ids=[];
  const key=compactor.hash(['skill-sections',model,query,text]),hit=compactor.shared.get(key);
  if(hit)ids=hit;else{
   const r=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,think:false,
    format:{type:'object',properties:{sections:{type:'array',items:{enum:all.map(p=>p.id)}}},required:['sections'],additionalProperties:false},
    options:{temperature:0,num_predict:400},messages:[
     {role:'system',content:'Ты выбираешь разделы инструкции навыка, нужные для запроса пользователя. Верни id всех разделов, без которых запрос не выполнить правильно: шаги, правила, форматы и примеры для этого случая. Общие и посторонние разделы не бери. Верни JSON {"sections":["s1",...]}.'},
     {role:'user',content:JSON.stringify({request:query,skill:skill.name,outline})}]})});
   ids=JSON.parse(r?.message?.content||'null')?.sections;if(!Array.isArray(ids))ids=[];
   compactor.shared.set(key,ids);
  }
  const wanted=new Set([all[0].id,...ids]),chosen=all.filter(p=>wanted.has(p.id)),omitted=all.filter(p=>!wanted.has(p.id));
  const room=budget-outlineCost(omitted)-20;
  const body=chosen.map(p=>p.text).join('\n\n');
  if(compactor.tokens(body)<=room)return render(chosen,omitted);
  progress?.('Сжимаю инструкции навыка '+skill.name);
  const compacted=await compactor.compact({text:body,purpose:'skill',question:query,target:Math.max(600,room),request,endpoint,model});
  return render([{text:compacted}],omitted,true);
 }catch(e){if(e?.name==='AbortError')throw e;return fit(skill,query,budget);}
}
module.exports={prepare,fit,BUDGET};
