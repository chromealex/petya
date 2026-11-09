// Chat route «reference»: «посмотри, что не так» with nothing attached and no recent chat (`contextual`), or a
// question about the build log in the Slack thread being read — the discussion (logs.cjs) becomes a chat of its own
// with the thread's files, and the local model explains it from that data only.
const {isLogQuestion}=require('./logs.cjs');
const modules=require('../../modules.cjs');
module.exports={id:'slack-reference',stage:'reference',
 async turn(s,original,{choice,contextual}){
  const active=s.dialogue.active();
  if(!contextual&&(choice||s.attachments.list().length||active?.attachments?.length&&!active?.slackLog&&!/slack|слак/iu.test(original)||!isLogQuestion(original)))return null;
  modules.assertEnabled(s.settings,'slack');
  try{const found=await s.slack.logs.collect({contextual});const topic={id:s.randomUUID(),title:(contextual?'Обсуждение Slack: ':'Лог Slack: ')+found.title.slice(0,60),kind:'chat',attachments:found.attachments,messages:[],at:Date.now(),reviewScope:require('../../review-assistant.cjs').sourceScope(s.dialogue,found.url),slackLog:true,slackSource:{url:found.url,viewId:found.viewId,evidence:found.evidence||[],at:found.at}};
   s.dialogue.state.topics.push(topic);s.dialogue.state.activeId=topic.id;s.dialogue.persist();
   const question=contextual?original+' Разбери это обсуждение: кратко объясни, что происходит и что заслуживает внимания. Если есть ошибка, объясни её по приведённым данным. Если непонятно, что интересует пользователя, задай конкретный уточняющий вопрос. Не предполагай, что речь обязательно о падении сборки.':original+' Объясни причину падения сборки по этому логу: приведи точную строку ошибки, отдели первопричину от последствий, предложи проверку или исправление. Если данных недостаточно, скажи, какой фрагмент нужен. Не выдумывай причину.';
   topic.messages.push({role:'user',text:original,at:Date.now()});s.dialogue.persist();
   let answer,error=false;try{answer=await s.analyzeMaterials(topic,question);}catch(e){answer=e.message;error=true;}
   if(!s.dialogue.state.topics.includes(topic))return {handled:true,text:'Тема удалена; результат не сохранён.'};
   answer=(contextual?'Последнее просмотренное обсуждение (':'Последнее просмотренное обсуждение с логом (')+new Date(found.at).toLocaleString('ru-RU')+'). '+answer+(found.notes.length?'\n'+found.notes.join('\n'):'');
   const sources=found.url?[{title:'Тред Slack',url:found.url}]:[];
   topic.messages.push({role:'assistant',text:answer,sources,usedMaterials:error?[]:require('../../chat-attribution.cjs').fileRefs(topic.attachments,answer),at:Date.now()});s.dialogue.persist();return {handled:true,text:answer,error,sources,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
  }catch(e){return {handled:true,text:e.message,error:true};}
 }};
