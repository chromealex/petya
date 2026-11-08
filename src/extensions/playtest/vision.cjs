// «Разбор плейтеста»: one sampled frame → a short label from a local vision model (gemma3:4b from Petya's optional
// models, or another installed vision model). The label is evidence for a moment only: what kind of screen it is,
// the text visible on it, one sentence of what is seen, and whether a tap or cursor hits an empty place.
const {localEndpoint}=require('../../core.cjs');
const PREFERRED='gemma3:4b';
const VISION=/^(?:gemma3(?!:(?:1b|270m))|llava|bakllava|llama3\.2-vision|llama4|minicpm-v|moondream|qwen2\.5vl|qwen2\.5-vl|qwen3-vl|granite3\.2-vision|mistral-small3\.[12]|gemma3n)/i;
function pickModel(installed=[],catalog=[]){
 const names=installed.map(String),known=catalog.filter(m=>m.vision).map(m=>m.name);
 return names.find(n=>n===PREFERRED)||names.find(n=>known.includes(n))||names.find(n=>VISION.test(n))||null;
}
const SCREENS=['gameplay','fail','win','menu','loading','dialog','other'];
const SCHEMA={type:'object',properties:{screen:{type:'string',enum:SCREENS},text:{type:'string'},description:{type:'string'},tapOnNothing:{type:'boolean'},tapNote:{type:'string'}},required:['screen','text','description','tapOnNothing','tapNote']};
const SYSTEM='Ты смотришь один кадр записи игровой сессии. Опиши только то, что видно. screen: gameplay — игра идёт; fail — экран поражения, смерти или «попробовать снова»; win — победа или уровень пройден; menu — меню, магазин, настройки; loading — загрузка; dialog — окно с текстом или подсказкой; other — другое. text — заметный текст на экране дословно (коротко, или пусто). description — одно короткое предложение по-русски. tapOnNothing — true только если явно видно касание или курсор в пустом месте, где нет кнопки; иначе false. tapNote — что именно видно, или пусто.';
const one=(v,n)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
function tidy(r){
 if(!r||typeof r!=='object'||!SCREENS.includes(r.screen))return null;
 return {screen:r.screen,text:one(r.text,120),description:one(r.description,240),tapOnNothing:r.tapOnNothing===true&&!!one(r.tapNote,10),tapNote:one(r.tapNote,200)};
}
async function label(s,{model,image,at,signal}){
 const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:180000,signal,
  body:JSON.stringify({model,stream:false,think:false,format:SCHEMA,options:{temperature:0.1,num_predict:300,num_ctx:4096},
   messages:[{role:'system',content:SYSTEM},{role:'user',content:'Кадр на '+Math.round(at)+' с.',images:[image]}]})});
 try{return tidy(JSON.parse(response?.message?.content||'null'));}catch{return null;}
}
module.exports={pickModel,label,tidy,PREFERRED,SCHEMA,SCREENS};
