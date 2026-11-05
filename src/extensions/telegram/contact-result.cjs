// Only observed search rows become cards; never derive contact IDs or usernames from a query.
function contacts(rows){
 return [...new Map(rows.filter(r=>typeof r.text==='string'&&r.text.trim()).map(r=>{
  const observed=r.text.trim().slice(0,500),name=observed.split(' · ')[0].trim();
  return [observed,{name,observed,source:'Telegram'}];
 })).values()].slice(0,12);
}
function offer(result,settings,completed=true){
 if(!require('../../service-access.cjs').ready('telegram',settings||{}))return {...result,telegramConnect:true,text:result.text+'\n\nTelegram не подключён как сервис. '+(completed?'Поиск выполнен через окно приложения.':'Подключите его или разрешите поиск через окно приложения.')};
 return result;
}
function remember(dialogue,command,result,resume=false,settings={}){
 result=offer(result,settings);
 if(!resume||!dialogue.active())dialogue.rememberAction(command,result.text);
 else dialogue.active().messages.push({role:'assistant',text:result.text,at:Date.now()});
 const topic=dialogue.active(),message=topic.messages.at(-1);
 if(result.telegramContacts?.length)message.telegramContacts=result.telegramContacts;
 if(result.telegramConnect)message.telegramConnect=true;
 message.by='поиск Telegram';dialogue.persist();
 return {...result,topicId:topic.id,messages:topic.messages};
}
module.exports={contacts,remember,offer};
