// «Скриншот → задача»: the bug draft from the picture. A local vision model (the optional gemma3:4b Petya already
// offers for screenshots in attachments, or another installed vision model) reads the image with the window title
// and the user's note and returns title, steps, expected and actual. Without a vision model nothing is guessed:
// the card offers the optional-models download or manual fields.
const {localEndpoint}=require('../../core.cjs');

const PREFERRED='gemma3:4b';
// Names of Ollama models that accept images.
const VISION=/^(?:gemma3(?!:(?:1b|270m))|llava|bakllava|llama3\.2-vision|llama4|minicpm-v|moondream|qwen2\.5vl|qwen2\.5-vl|qwen3-vl|granite3\.2-vision|mistral-small3\.[12]|gemma3n)/i;
function pickModel(installed=[],catalog=[]){
 const names=installed.map(String);
 const known=catalog.filter(m=>m.vision).map(m=>m.name);
 return names.find(n=>n===PREFERRED)||names.find(n=>known.includes(n))||names.find(n=>VISION.test(n))||null;
}
const SCHEMA={type:'object',properties:{title:{type:'string'},steps:{type:'array',items:{type:'string'},maxItems:8},expected:{type:'string'},actual:{type:'string'}},required:['title','steps','expected','actual']};
const SYSTEM='Ты тестировщик. По скриншоту составь баг-репорт по-русски. title — короткий заголовок: что сломано и где. steps — шаги воспроизведения, по одному действию. expected — как должно быть. actual — что видно на скриншоте. Опирайся только на то, что видно на картинке, на заголовок окна и на заметку пользователя; не выдумывай версии, данные и имена. Отмеченное рамками и стрелками — главное.';
const one=(v,n)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
function tidy(r){
 if(!r||typeof r!=='object')return null;
 const steps=(Array.isArray(r.steps)?r.steps:[]).map(x=>one(x,300).replace(/^\d+[.)]\s*/,'')).filter(Boolean).slice(0,8);
 const draft={title:one(r.title,200),steps,expected:one(r.expected,800),actual:one(r.actual,800)};
 return draft.title?draft:null;
}
// {draft} from the model; null when its answer is not usable. `image` is base64 PNG (already downscaled).
async function describe(s,{model,image,window='',note=''}){
 const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:300000,
  body:JSON.stringify({model,stream:false,think:false,format:SCHEMA,options:{temperature:0.2,num_predict:700,num_ctx:8192},
   messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify({window:window||'неизвестно',note:note||''}),images:[image]}]})});
 try{return tidy(JSON.parse(response?.message?.content||'null'));}catch{return null;}
}
// The text that goes into the tracker: steps numbered, expected and actual, where it was seen.
function body({steps=[],expected='',actual='',window='',note=''}={}){
 const parts=[];
 if(steps.length)parts.push('Шаги: '+steps.map((x,i)=>(i+1)+') '+x).join(' '));
 if(expected)parts.push('Ожидалось: '+expected);
 if(actual)parts.push('Фактически: '+actual);
 if(window)parts.push('Окно: '+window);
 if(note)parts.push('Заметка: '+note);
 return parts.join('. ').replace(/\.\./g,'.');
}
module.exports={pickModel,describe,tidy,body,PREFERRED,VISION,SCHEMA};
