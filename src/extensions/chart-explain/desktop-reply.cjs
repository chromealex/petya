// «Объясни график» for a screenshot attached in the composer: messages with attachments go through the chat-extension
// flow (src/features/extension-replies.cjs), not feature.turn. One image plus «почему упал график», «объясни график»,
// «что на графике» — and only while the app is added (this provider never turns the app on by itself).
const query=require('./query.cjs');
const wants=command=>{const t=String(command||'');return query.about(t)!==null||query.WHY.test(t)&&(query.DOWN.test(t)||query.UP.test(t))||/(?:объясни|разбери|прочитай)\p{L}*/iu.test(t)&&/(?:график|диаграмм|chart|скрин)/iu.test(t);};
const provider={
 type:'chart-explain',name:'Объясни график',requiresChat:true,
 description:'Почему упал или вырос график со скриншота: локальная модель читает точки, Петя сопоставляет дату с релизами, инцидентами, кампаниями и праздниками.',
 acceptsFiles:files=>files.length===1&&!!files[0].image,
 matches:(command,context={})=>context.settings?.['extension_chart-explain']==='true'&&(context.files||[]).length===1&&!!context.files[0].image&&wants(command),
 async turn(s,command,context,check){
  check();
  const [file]=s.attachments.take(context.files.map(f=>f.id));
  if(!file?.image)throw Error('Прикрепите скриншот графика (PNG или JPEG).');
  const reply=await require('./feature.cjs').screenshotTurn(s,command,{image:file.image,attachment:file.id});
  check();
  // The screenshot moves from the composer into this chat (the card's «Прочитать график» reads it there later).
  const topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]).filter(a=>a.id!==file.id),file];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=[s.attachments.info(file)];
  s.attachments.remove(file.id);s.dialogue.persist();
  return reply;
 },
 wants
};
module.exports=provider;
