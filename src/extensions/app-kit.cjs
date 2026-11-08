// Shared main-process helpers for app extensions (src/extensions/<app>/feature.cjs):
// whether the app is added, a JSON answer from the local model, and the chat reply with card data
// (message.extensionData.<key>, rendered by the extension's `results` renderer).
const {localEndpoint}=require('../core.cjs');

// An app is added through the catalog switch named in its extension.json ("setting").
const installed=(s,id)=>s.settings['extension_'+id]==='true';

// Structured answer from the chat model; null when no model is chosen or the answer is not valid JSON.
async function modelJSON(s,{system,user,schema,predict=1200,temperature=0.2}){
 if(!s.settings.model)return null;
 const model=s.settings.model;
 const response=await s.request(localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model,stream:false,think:false,format:schema,options:{temperature,num_predict:predict,num_ctx:16384},
   messages:[{role:'system',content:system},{role:'user',content:typeof user==='string'?user:JSON.stringify(user)}]})});
 if(model!==s.settings.model)throw Error('Модель изменилась. Повторите запрос.');
 try{return JSON.parse(response?.message?.content||'null');}catch{return null;}
}

// Records the request and Petya's answer in the active chat and attaches the card data.
function reply(s,command,{text,by,data,sources,error=false,question=false}){
 s.dialogue.rememberAction(command,text);
 const t=s.dialogue.active(),message=t.messages.at(-1);
 message.by=by;
 if(data)message.extensionData={...message.extensionData,...data};
 if(sources?.length)message.sources=sources;
 if(error)message.error=true;
 s.dialogue.persist();
 return {handled:true,text,by,error,question,topicId:t.id,topicTitle:t.title,messages:t.messages,...(data?{extensionData:data}:{})};
}

// A service failure is reported in the chat under the app's name; missing access is told apart from errors.
function failure(s,command,by,error){
 let text=by+' · '+error.message;
 try{const problem=require('../connection-failure.cjs').classify(error);if(problem)text=by+' · '+problem.message;}catch{/* plain message */}
 return reply(s,command,{text,by,error:true});
}

// Russian plural: plural(5,['крэш','крэша','крэшей']).
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};

module.exports={installed,modelJSON,reply,failure,plural};
