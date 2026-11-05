// Feature: «Создай задачу по этому обсуждению» in a chat — the draft is built from this chat
// (what the user marked as important first, then the latest messages) and shown for review;
// nothing is created in Jira until the user confirms the draft.
const ASK=/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:создай|заведи|сделай|оформи|подготовь)\s+(?:мне\s+)?(?:задач[уи]|таск[уи]?|тикет|issue)(?:\s+в\s+(?:jira|джир\w*|жир\w*))?(?:\s+(?:по|из|на основе)\s+(?:этому|этой|этого|нему|ней|него|обсуждени\w*|разговор\w*|чат\w*|переписк\w*|выделенно\w*|важно\w*|сказанно\w*)(?:\s+\S+){0,3})?\s*(?::\s*([\s\S]+))?[.!]*$/iu;
const REFERS=/(?:по|из|на основе)\s+(?:этому|этой|этого|нему|ней|него|обсуждени|разговор|чат|переписк|выделенно|важно|сказанно)/iu;
function material(topic,important=[],limit=4000){
 const lines=[];let size=0;
 if(important.length){const block='Важное (отмечено пользователем):\n'+important.map(v=>'• '+v).join('\n');lines.push(block);size+=block.length;}
 const recent=[];for(const m of [...(topic?.messages||[])].reverse()){if(!['user','assistant'].includes(m.role)||!m.text||m.pending)continue;if(m.agentPlan)continue;const row=(m.role==='user'?'Пользователь: ':'Петя: ')+String(m.text).replace(/\s+/g,' ').slice(0,800);if(size+row.length>limit)break;recent.unshift(row);size+=row.length;if(recent.length>=12)break;}
 if(recent.length)lines.push('Разговор:\n'+recent.join('\n'));
 return lines.join('\n\n');
}
module.exports={
 name:'chat-tasks',
 material,
 setup(s){
  const turn=command=>{
   const text=String(command).trim(),m=ASK.exec(text);if(!m)return null;
   const topic=s.dialogue.active();const explicit=(m[1]||'').trim();
   if(!explicit&&(!REFERS.test(text)||!topic?.messages?.length))return null; // the dictation flow handles the rest
   const important=s.highlights?.collect?.(topic)||[];
   const body=explicit?explicit+(topic?.messages?.length?'\n\n'+material(topic,important,2500):''):material(topic,important);
   if(!body.trim())return null;
   const title=(explicit||important[0]||topic?.title||'Задача из чата').replace(/\s+/g,' ').slice(0,100);
   const reply='Готовлю черновик задачи по '+(explicit?'описанию и этому чату':'этому чату')+'. Проверь его — в Jira ничего не создам без подтверждения.';
   s.dialogue.rememberAction(command,reply);const last=s.dialogue.active()?.messages?.at(-1);if(last?.role==='assistant')last.by='задача из чата';
   return {handled:true,topicId:s.dialogue.active()?.id,messages:s.dialogue.active()?.messages,text:'Готовлю черновик задачи по '+(explicit?'описанию и этому чату':'этому чату')+'. Проверь его — в Jira ничего не создам без подтверждения.',by:'задача из чата',draftMaterial:{title,text:body}};
  };
  // The draft flow reads its material from the context snapshots (as after «plan»).
  const ipc={prepare:(title,text)=>{const body=String(text||'').trim().slice(0,12000);if(!body)throw Error('Нет текста для задачи.');const item={id:require('node:crypto').randomUUID(),title:String(title||'Задача из чата').slice(0,200),source:'Заметка',text:body,at:Date.now(),url:''};s.snapshots.set(item.id,item);return item;}};
  return {chatTasks:{turn,material},ipc};
 }
};
