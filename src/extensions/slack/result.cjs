// Slack plugin, result adapter: message cards can be selected and answered in their thread.
// A reply is written in the card and sent only by its «Отправить» button (the draft is the preview).
const crypto=require('node:crypto');
const thread=url=>{const m=String(url||'').match(/^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/([CGD][A-Z0-9]+)\/p(\d{10})(\d{6})/);return m?{channel:m[1],ts:m[2]+'.'+m[3]}:null;};
const items=message=>message.extensionData?.slackMessages||message.slackMessages||[];
module.exports={
 id:'slack',
 describe(message){
  return items(message).filter(item=>thread(item.url)).map(item=>({key:[item.url],item,presentationKey:JSON.stringify(['slack',item.url]),
   title:'Slack · '+(item.author||'сообщение'),subtitle:String(item.text||'').slice(0,160),
   actions:[{id:'reply',label:'Ответить в тред',hidden:true}]}));
 },
 async perform(action,row,s,check,args={}){
  if(action!=='reply')throw Error('Неизвестное действие Slack.');
  check();s.modules.assertEnabled(s.settings,'slack');
  const target=thread(row.item.url);if(!target)throw Error('У сообщения нет ссылки на тред.');
  const text=typeof args.text==='string'?args.text.trim():'';
  if(!text||text.length>4000)throw Error('Напишите ответ до 4000 символов.');
  const body={channel:target.channel,thread_ts:target.ts,text:text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),client_msg_id:crypto.randomUUID(),unfurl_links:false,unfurl_media:false,parse:'none'};
  const result=await s.request('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+(s.settings.slackToken||''),'Content-Type':'application/json'},body:JSON.stringify(body)});
  check();
  if(result?.ok!==true)throw Error('Slack не принял ответ: '+String(result?.error||'неизвестная ошибка'));
  return {handled:true,text:'Ответ отправлен в тред '+(row.item.channel?'#'+row.item.channel:'')+'.',sent:true};
 }
};
