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
async function localAnswer({model,command='',topic,teamMembers=[],teamNotes='',supplementalContext='',settings={},skills=[],chooseKnowledgeModel,request,clarify,uncertain,telegram=false}) {
 // Record which path produced the answer (shown under the message) so wrong routing is visible.
 const mark=(source,value)=>{if(topic)topic.answeredBy=source;return value;};
 const capability=require('./capabilities-reply.cjs').answer(command,topic,settings,skills);if(capability)return mark('шаблон: возможности',capability.text);
 const confirmation=require('./action-evidence.cjs').actionConfirmation(command,topic);if(confirmation)return mark('журнал действий',confirmation);
 const roleReply=require('./role-facts.cjs').roleFactReply(command,topic);if(roleReply)return mark('роли команды',roleReply);
 const prohibition=prohibitionReply(command);if(prohibition)return mark('шаблон: запрет',prohibition);
 const greeting=greetingReply(command);if(greeting)return mark('шаблон: приветствие',greeting);
 const calculation=require('./explicit-calculation.cjs').explicitCalculation(command);if(calculation!==null)return mark('калькулятор',calculation);
 const evidence=require('./work-answer.cjs').workEvidenceReply(command,topic,teamMembers,teamNotes,supplementalContext);if(evidence)return mark('данные сервисов',evidence);
 if(!model)return {text:'Не выбрана локальная модель для ответов. Откройте «Подключения → Ollama» и подготовьте модель.',error:true};
 let modelOverrides={};
 if(chooseKnowledgeModel&&require('./knowledge-model.cjs').standaloneKnowledge(command,topic,supplementalContext)){const selected=await chooseKnowledgeModel();if(selected)modelOverrides={model:selected,think:false};}
 const repeat=require('./answer-repeat.cjs');let repeatRetry=false;
 for(let attempt=0;attempt<2;attempt++){
  let response;
  try { response=await request(attempt?{...modelOverrides,think:false}:modelOverrides); }
  catch(error){
   const status=Number(error.status);
   const reason=status===404?'Выбранная модель не найдена.':status===429?'Ollama вернула HTTP 429 — ограничение запросов.':status>=500?'Ollama не смогла обработать запрос.':error.name==='TimeoutError'||error.name==='AbortError'?'Ollama не ответила вовремя.':'Не удалось связаться с Ollama.';
   return {text:reason+' Проверьте «Подключения → Ollama» и повторите запрос.',error:true};
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
  const answer=parsed.answer.trim().slice(0,12000);
  // A repeated answer never helps: regenerate once with more variety, then admit the loop.
  if(parsed.understood&&repeat.repeated(answer,topic)){if(!repeatRetry){repeatRetry=true;modelOverrides={...modelOverrides,think:false,options:{temperature:1,top_p:0.95,repeat_penalty:1.3,num_ctx:16384,num_predict:2048}};attempt--;continue;}return mark('защита от повторов',repeat.fallback(topic));}
  const choices=Array.isArray(parsed.clarificationOptions)?[...new Set(parsed.clarificationOptions.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,160)).filter(Boolean))].slice(0,4):[];
  if(parsed.understood&&choices.length>=2)return mark('модель '+(modelOverrides.model||model),{text:answer,question:true,clarificationOptions:choices});
  if(!parsed.understood||uncertain(answer))return mark('уточнение',telegram?'Уточните, что найти в сохранённых сообщениях Telegram.':clarify());
  return mark('модель '+(modelOverrides.model||model),answer);
 }
}
module.exports={localAnswer,prohibitionReply,greetingReply};
