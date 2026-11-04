// «Что нового в Slack?» — a digest of the Slack messages Petya already synced, never an invented answer.
// Nothing synced yet (or Slack is rate-limited): start the sync and offer to read the Slack window instead.
const DAY=86400000;
const YES=/^(?:да|давай|ага|ок|окей|хорошо|можно|посмотри|смотри|прочитай|читай|разрешаю|конечно)(?:[\s,!].*)?$/iu;
const NO=/^(?:нет|не надо|не нужно|отмена|стоп|подожду|позже|потом)(?:[\s,!].*)?$/iu;
function question(command=''){
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/[?!.]+$/u,'');
 if(!/(?:slack|слак)/iu.test(text))return null;
 if(/(?:отправ|напиши в|написать в|опубликуй|пошли|перешли|ответь в|подключ|настро|токен|лимит|ошибк|лог\b|логи\b|билд|сборк)/iu.test(text))return null;
 if(!/(?:что (?:нового|новенького|там|было|пишут|обсуждают|случилось|происходит)|какие новости|новости|что в (?:slack|слаке?)|сводк|дайджест|кратко|перескажи|кто (?:писал|что писал)|что мне писали|упоминан|есть (?:что-то |что-нибудь )?нов)/iu.test(text))return null;
 const days=/(?:за|на) недел/iu.test(text)?7:/вчера|за (?:два|2) дня/iu.test(text)?2:1;
 const mentions=/(?:мне|меня|упоминан)/iu.test(text);
 return {days,mentions};
}
class SlackDigest{
 constructor({settings,enabled,ready,items,sync,status,summarize,screen,approve,now=Date.now}){Object.assign(this,{settings,enabled,ready,items,sync,status,summarize,screen,approve,now});this.pending=null;}
 reply(text,extra={}){return {handled:true,text,by:'Slack: сводка',...extra};}
 async turn(command){
  const p=this.pending;
  if(p&&this.now()-p.at<600000){
   const value=String(command).trim().toLowerCase().replace(/[.!?]+$/u,'');
   if(YES.test(value)){this.pending=null;return this.fromScreen(p.command,p.ask);}
   if(NO.test(value)){this.pending=null;return this.reply('Хорошо. Обновление Slack идёт в фоне — спроси «что нового в Slack» через пару минут.');}
  }
  this.pending=null;
  const ask=question(command);if(!ask)return null;
  if(!this.enabled())return null; // service-access offers to connect Slack
  if(!this.ready())return null;
  const since=this.now()-ask.days*DAY;
  const rows=this.items().filter(i=>i.source==='Slack'&&Array.isArray(i.messages)).map(i=>({...i,messages:i.messages.filter(m=>m.at>=since)})).filter(i=>i.messages.length).sort((a,b)=>b.at-a.at);
  const status=this.status()||{};
  if(!rows.length){
   try{const started=this.sync();started?.catch?.(()=>{});}catch{}
   this.pending={command,ask,at:this.now()};
   const limited=/лимит|ограничил/iu.test(status.message||'');
   return this.reply((limited?'Slack сейчас ограничил запросы, ':'В памяти нет сообщений Slack за '+(ask.days===1?'последние сутки':ask.days+' дн.')+'. ')+'Запустил обновление — из-за лимитов Slack оно идёт примерно по каналу в минуту. Могу сразу прочитать открытое окно Slack с экрана. Прочитать?',{question:true,clarificationOptions:['Да, прочитай с экрана','Нет, подожду обновления']});
  }
  const messages=rows.flatMap(i=>i.messages.map(m=>({channel:i.channel,thread:i.title,at:m.at,user:m.user,text:String(m.text||'').slice(0,600)}))).sort((a,b)=>b.at-a.at).slice(0,80);
  const answer=await this.summarize(command,messages,ask);
  const updated=status.updatedAt?' Данные Slack на '+new Date(status.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'.':'';
  return this.reply(String(answer||'').trim()+updated,{sources:rows.slice(0,5).map(i=>({title:'Slack · '+i.title,url:i.url}))});
 }
 async fromScreen(command,ask={days:1}){
  let view;
  try{view=await this.screen();}
  catch(e){if(e.code==='COMPUTER_PERMISSION_REQUIRED'&&this.approve)return this.approve(command,{type:'slackDigestScreen'});return this.reply('Не удалось прочитать Slack с экрана: '+e.message,{error:true});}
  const text=String(view?.text||'').trim();
  if(!text){this.pending={command,ask,at:this.now()};return this.reply('В окне Slack не нашёл текста. Открой нужный канал или «Упоминания» и скажи «да» — посмотрю ещё раз.',{question:true});}
  const answer=await this.summarize(command,[{channel:view.title||'Окно Slack',at:this.now(),user:'',text:text.slice(0,24000)}],{...ask,screen:true});
  return this.reply(String(answer||'').trim()+' Прочитал с экрана: только то, что видно в окне Slack.',{by:'Slack: экран'});
 }
}
module.exports={question,SlackDigest};
