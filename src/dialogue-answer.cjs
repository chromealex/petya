// A routing failure is not evidence that the user's words are unclear.
// Only a successful local answer can request semantic clarification.
function prohibitionReply(command='') {
 const text=String(command).trim();
 // Only a standalone prohibition. A quoted, conditional or compound request
 // still needs a normal answer (e.g. «не создавай задачу, а объясни идею»).
 if(!/^(?:петя[,! ]+)?(?:пожалуйста[, ]+)?не (?:отправляй|создавай|удаляй|меняй|публикуй|проверяй|запускай|приглашай|передавай|открывай) [\p{L}\p{N} _-]+[.!]?$/iu.test(text))return null;
 if(/(?:^|\s)(?:и|а|но|если|когда|пока|потому|чтобы|либо|или|просто|лучше|объясни|расскажи|скажи|покажи|что|как|почему|зачем|давай)(?=\s|$)/iu.test(text))return null;
 return 'Понял, не буду выполнять это действие.';
}
function greetingReply(command='') {
 const text=String(command).trim().replace(/^петя[,! ]+/iu,'');
 const match=/^(привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер|как (?:у тебя )?дела|а как дела)(?:[,! ]+петя)?[.!?]*$/iu.exec(text);
 if(!match)return null;
 if(/дела/iu.test(match[1]))return 'На связи и готов помочь. Как ты?';
 const greeting=/^добр/iu.test(match[1])?match[1][0].toUpperCase()+match[1].slice(1).toLowerCase():'Привет';
 return greeting+'! Я на связи.';
}
// «Зови меня Алекс» / «Меня зовут Саша» / «Как меня зовут?» — exact, never paraphrased by the model.
function nameReply(command='',topic,userName=''){
 const text=String(command).trim().replace(/^петя[,! ]+/iu,'');
 const cap=v=>v[0].toLocaleUpperCase('ru')+v.slice(1);
 const set=/^(?:(?:нет|да|ну|а|и)[,\s]+)*(?:вообще-то\s+|лучше\s+|теперь\s+|пожалуйста[,\s]+)*(?:(зови|называй)\s+меня|обращайся ко мне|меня зовут|я\s+[—-])\s+([\p{L}][\p{L}-]{1,30})(?:[,\s]+пожалуйста)?[.!]*$/iu.exec(text);
 if(set&&topic&&!/^(?:не|так|как|просто|теперь|тоже)$/iu.test(set[2])){const name=cap(set[2]);topic.preferredName=name;return /зовут|я\s/iu.test(set[1]||text)&&!set[1]?'Приятно познакомиться, '+name+'!':'Хорошо, буду звать тебя '+name+'.';}
 if(/^(?:а\s+)?(?:как меня зовут|ты помнишь,? как меня зовут|как ты меня называешь)[?.!]*$/iu.test(text)){const name=topic?.preferredName||String(userName||'').trim();return name?'Тебя зовут '+name+'.':null;}
 return null;
}
async function localAnswer({model,command='',topic,teamMembers=[],teamNotes='',supplementalContext='',settings={},skills=[],chooseKnowledgeModel,request,recover,clarify,uncertain,telegram=false}) {
 // Record which path produced the answer (shown under the message) so wrong routing is visible.
 const mark=(source,value)=>{if(topic)topic.answeredBy=source;return value;};
 const capability=require('./capabilities-reply.cjs').answer(command,topic,settings,skills);if(capability)return mark('шаблон: возможности',capability.text);
 const confirmation=require('./action-evidence.cjs').actionConfirmation(command,topic);if(confirmation)return mark('журнал действий',confirmation);
 const roleReply=require('./role-facts.cjs').roleFactReply(command,topic);if(roleReply)return mark('роли команды',roleReply);
 const prohibition=prohibitionReply(command);if(prohibition)return mark('шаблон: запрет',prohibition);
 const named=nameReply(command,topic,settings.userName);if(named)return mark('память: имя',named);
 const greeting=greetingReply(command);if(greeting)return mark('шаблон: приветствие',greeting);
 const calculation=require('./explicit-calculation.cjs').explicitCalculation(command);if(calculation!==null)return mark('калькулятор',calculation);
 const evidence=require('./work-answer.cjs').workEvidenceReply(command,topic,teamMembers,teamNotes,supplementalContext);if(evidence)return mark('данные сервисов',evidence);
 if(!model)return {text:'Не выбрана локальная модель для ответов. Откройте «Подключения → Ollama» и подготовьте модель.',error:true};
 let modelOverrides={};
 if(chooseKnowledgeModel&&require('./knowledge-model.cjs').standaloneKnowledge(command,topic,supplementalContext)){const selected=await chooseKnowledgeModel();if(selected)modelOverrides={model:selected,think:false};}
 const repeat=require('./answer-repeat.cjs');let repeatRetry=false,lowMemory=false,restarted=false;
 for(let attempt=0;attempt<2;attempt++){
  let response;
  try { response=await request(attempt?{...modelOverrides,think:false}:modelOverrides); }
  catch(error){
   const status=Number(error.status);
   // Ollama answers 500 when the model cannot be loaded with this context (usually memory).
   // Retry once with a smaller window before reporting an outage.
   // A crashed runner (panic, Metal/CUDA failure) is fixed by restarting Ollama, not by a smaller context.
   if(status>=500&&recover&&!restarted&&/runner|panic|terminated|metal|cuda|exit status/iu.test(String(error.detail||''))){restarted=true;console.error('Ollama runner crashed, restarting: '+error.detail);try{await recover();}catch(e){console.error(e);}attempt--;continue;}
   if(status>=500&&!lowMemory){lowMemory=true;console.error('Ollama '+status+': '+(error.detail||error.message));modelOverrides={...modelOverrides,think:false,options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1,num_ctx:4096,num_predict:1024}};attempt--;continue;}
   const detail=String(error.detail||'').match(/"error"\s*:\s*"([^"]{1,200})/)?.[1]||'';
   const reason=status===404?'Выбранная модель не найдена.':status===429?'Ollama вернула HTTP 429 — ограничение запросов.':status>=500?'Ollama не смогла обработать запрос.':error.name==='TimeoutError'||error.name==='AbortError'?'Ollama не ответила вовремя.':'Не удалось связаться с Ollama.';
   return {text:reason+(detail?' Ollama: '+detail+'.':'')+' Проверьте «Подключения → Ollama» и повторите запрос.',error:true};
  }
  let parsed;
  try { parsed=JSON.parse(response?.message?.content||'null'); }catch{}
  if(!parsed||typeof parsed.understood!=='boolean'||typeof parsed.answer!=='string'||(parsed.understood&&!parsed.answer.trim())){
   // Reasoning can consume the entire generation budget. Retry locally once,
   // with the same question/context and no thinking; never reinterpret an outage.
   // Small models occasionally break the JSON format; one more try is cheaper than an error.
   if(attempt===0)continue;
   return {text:'Локальная модель вернула некорректный ответ. Повторите запрос; если ошибка повторится, проверьте модель в «Подключения → Ollama».',error:true};
  }
  // Always «ты»: rewrite slips into «вы»/«ваш»/«проверьте» deterministically.
  const answer=require('./informal.cjs').informal(parsed.answer.trim().slice(0,12000));
  // A repeated answer never helps: regenerate once with more variety, then admit the loop.
  if(parsed.understood&&repeat.repeated(answer,topic)){if(!repeatRetry){repeatRetry=true;modelOverrides={...modelOverrides,think:false,options:{temperature:1,top_p:0.95,repeat_penalty:1.3,num_ctx:lowMemory?4096:16384,num_predict:lowMemory?1024:2048}};attempt--;continue;}return mark('защита от повторов',repeat.fallback(topic));}
  const choices=Array.isArray(parsed.clarificationOptions)?[...new Set(parsed.clarificationOptions.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,160)).filter(Boolean))].slice(0,4):[];
  if(parsed.understood&&choices.length>=2)return mark('модель '+(modelOverrides.model||model),{text:answer,question:true,clarificationOptions:choices});
  if(!parsed.understood||uncertain(answer))return mark('уточнение',telegram?'Уточните, что найти в сохранённых сообщениях Telegram.':clarify());
  return mark('модель '+(modelOverrides.model||model),answer);
 }
}
module.exports={localAnswer,prohibitionReply,greetingReply,nameReply};
