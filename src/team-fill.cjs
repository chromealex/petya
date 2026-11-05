const team = require('./team.cjs');
const clean = value => String(value || '').trim().replace(/^петя[\s,:.!?—-]*/iu, '');
const normalized = value => value.trim().toLocaleLowerCase().replace(/ё/g, 'е');
const labels = {name:'имя',aliases:'варианты имени',role:'роль',projects:'проекты',responsibilities:'обязанности',email:'email',slackId:'Slack ID',jiraId:'Jira ID'};
function isTeamFill(text) {
 return /^(?:пожалуйста[,\s]+)?(?:заполни|дополни|обнови|собери|сформируй)\s+(?:(?:раздел|справочник|состав|карточки)\s+)?(?:нашу\s+|мою\s+)?(?:команду|команды|команда)(?=$|[\s,.!:—-])/iu.test(clean(text));
}
function directRows(sources) {
 const rows=[];
 for(const source of sources)for(const line of source.text.replace(/^(?:петя[\s,:.!?—-]*)?(?:заполни|дополни|обнови|собери|сформируй)\s+(?:(?:раздел|справочник|состав|карточки)\s+)?(?:нашу\s+|мою\s+)?(?:команду|команды|команда)[\s:,.!—-]*/iu,'').split(/[\n;]|,(?=\s*[\p{L}]+(?:\s+[\p{L}]+){0,2}\s+[—–-])/u)) {
  const match=/^\s*([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2})\s+(?:[—–-]|отвечает за|занимается)\s+(.{2,160})[.!]?$/u.exec(line);
  if(match)rows.push({name:match[1],responsibilities:match[2],source:source.id,evidence:line.trim()});
 }
 return {members:rows.slice(0,100)};
}
function grounded(result,sources) {
 if(!result||!Array.isArray(result.members)||result.members.length>100)throw Error('Не удалось разобрать сведения о команде.');
 const rows=[];
 for(const row of result.members) {
  const source=sources.find(s=>s.id===row.source),quote=String(row.evidence||'');
  if(!source||!quote||!source.text.includes(quote)||!row.name||!quote.includes(row.name))continue;
  const data={};
  for(const key of Object.keys(team.limits))if(typeof row[key]==='string'&&row[key].trim()) {
   const value=row[key].trim();
   if(quote.includes(value))data[key]=value;
  }
  if(!data.name)continue;
  try{rows.push({member:team.validate([data])[0],evidence:quote.slice(0,1000),source:source.title});}catch{/* Invalid contacts never reach the directory. */}
 }
 return rows;
}
class TeamFill {
 // screen(): reads the visible Slack window; approve(): asks for computer control when it is needed.
 constructor({settings,save,sources,extract,roster,scope,screen,approve,now=Date.now}) {Object.assign(this,{settings,save,sources,extract,roster,scope,screen,approve,now});this.pending=null;this.busy=false;this.epoch=0;}
 reset(){this.pending=null;this.epoch++;}
 reply(text,extra={}){return {handled:true,text,...extra};}
 async turn(command,answer=false,screenSources=null) {
  if(!screenSources&&!answer&&!isTeamFill(command)){this.pending=null;return null;}
  if(this.busy)return this.reply('Уже заполняю команду. Дождитесь результата.');
  this.busy=true;
  try {
   if(answer)return await this.respond(command);
   this.pending=null;
   const scope=this.scope(),epoch=this.epoch,settings=this.settings();
   const baseline=settings.teamMembers||'[]',notes=settings.teamRoles||'';
   const roster=screenSources?null:this.roster?await this.roster(command):null;
   let budget=32000;const sources=(screenSources||(roster===null?this.sources(command):[{title:'Команда',text:command}])).map((s,i)=>({...s,id:String(i),text:String(s.text||'')})).filter(s=>s.text.trim()).map(s=>{const text=s.text.slice(0,Math.max(0,budget));budget-=text.length;return {...s,text};}).filter(s=>s.text);
   if(!sources.length)return this.askDetails('В памяти пока нет сведений о коллегах. Назовите имена и обязанности, например: «Полина — тестирование, Иван — серверная часть».');
   const extracted=roster===null?(this.extract?await this.extract(sources):directRows(sources.filter(s=>s.direct))):null;
   if(epoch!==this.epoch||scope!==this.scope()||baseline!==(this.settings().teamMembers||'[]')||notes!==(this.settings().teamRoles||''))return this.reply('Сведения или компания изменились во время заполнения. Повторите команду.');
   const candidates=roster===null?grounded(extracted,sources):roster,members=team.members(settings),conflicts=[];let added=0,filled=0,ambiguous=0;
   for(const {member,evidence,source} of candidates) {
    const ids=['slackId','jiraId','email'];
    let matches=members.map((m,i)=>({m,i})).filter(({m})=>ids.some(k=>member[k]&&m[k]&&normalized(member[k])===normalized(m[k])));
    if(!matches.length)matches=members.map((m,i)=>({m,i})).filter(({m})=>normalized(m.name)===normalized(member.name)&&!ids.some(k=>member[k]&&m[k]&&normalized(member[k])!==normalized(m[k])));
    if(matches.length>1){ambiguous++;continue;}
    if(!matches.length){if(members.length>=100){ambiguous++;continue;}members.push(member);added++;continue;}
    const {m,i}=matches[0];
    for(const key of Object.keys(team.limits)) {
     if(!member[key]||normalized(m[key])===normalized(member[key]))continue;
     if(!m[key]){m[key]=member[key];filled++;}
     else if(!conflicts.some(c=>c.index===i&&c.key===key&&c.value===member[key]))conflicts.push({index:i,key,value:member[key],evidence,source});
    }
   }
   if(added||filled)this.save(team.validate(members));
   const summary=`Добавлено коллег: ${added}. Заполнено полей: ${filled}.`+(ambiguous?' Неоднозначные карточки не изменены: '+ambiguous+'. Уточните полные имена и контакты.':'');
   if(conflicts.length){this.pending={kind:'conflict',conflicts,baseline:JSON.stringify(members),scope,at:this.now(),summary};return this.question();}
   if(!candidates.length)return this.askDetails('Не нашёл однозначных сведений о составе команды. Назовите коллег и обязанности или прикрепите список команды.');
   return this.reply(summary+' Сведения сохранены в разделе «Команда».',{teamUpdated:!!(added||filled)});
  }catch(e){
   // Slack rate limit: offer to read the Slack app window instead of waiting.
   if(!screenSources&&this.screen&&(e.status===429||/HTTP 429|ограничил запросы/u.test(e.message||''))){const wait=Math.ceil(e.retryAfter||30);this.pending={kind:'screen',command,scope:this.scope(),at:this.now(),wait};return this.reply('Slack временно ограничил запросы (повторить можно через '+wait+' с). Могу сам посмотреть в приложении Slack: переключусь на него и прочитаю то, что видно в окне, например открытый канал команды или список участников. Посмотреть? Скажи «да» или «нет».',{question:true,teamFillReply:true});}
   if(e.teamChannels||e.code==='SLACK_CHANNEL_LOOKUP_REQUIRED'){const lookup=e.channelInput||e.code==='SLACK_CHANNEL_LOOKUP_REQUIRED';const reply=this.askDetails(lookup?'Из какого канала Slack взять участников команды? Введите точное название с # или вставьте ссылку на канал.':e.message);if(lookup)reply.clarificationInput={label:'Канал Slack',placeholder:'#название или ссылка на канал',submit:'Продолжить'};this.pending.channelInput=lookup;this.pending.prefix='Заполни команду из Slack ';this.pending.channelOptions=e.channelOptions||[];return reply;}return this.reply('Не удалось заполнить команду: '+e.message,{error:true});}
  finally{this.busy=false;}
 }
 // Fill the team from the visible Slack window; ask for computer control if it is off.
 async fromScreen(command){
  let view;
  try{view=await this.screen();}
  catch(e){if(e.code==='COMPUTER_PERMISSION_REQUIRED'&&this.approve)return this.approve(command,{type:'teamFillScreen'});return this.reply('Не удалось прочитать Slack с экрана: '+e.message,{error:true});}
  if(!String(view?.text||'').trim()){this.pending={kind:'screen',command,scope:this.scope(),at:this.now(),wait:30};return this.reply('В окне Slack не нашёл текста. Открой в Slack канал команды или список участников и скажи «да» — посмотрю ещё раз.',{question:true,teamFillReply:true});}
  return this.turn(command,false,[{title:view.title||'Экран Slack',text:String(view.text).slice(0,32000)}]);
 }
 askDetails(text){this.pending={kind:'details',scope:this.scope(),at:this.now()};return this.reply(text,{question:true,teamFillReply:true});}
 question(){const p=this.pending,c=p.conflicts[0],member=JSON.parse(p.baseline)[c.index];return this.reply(p.summary+' '+member.name+', '+labels[c.key]+': сохранено «'+member[c.key]+'», найдено «'+c.value+'» ('+c.source+'). Оставить прежнее или заменить?',{teamUpdated:true,question:true,teamFillReply:true});}
 respond(command){
  const p=this.pending;
  if(!p||p.scope!==this.scope()||this.now()-p.at>600000){this.pending=null;return this.reply('Уточнение устарело. Скажите «заполни команду» ещё раз.');}
  const value=clean(command).toLowerCase().replace(/[.!?]+$/,'');
  if(/^(?:отмена|стоп|не надо|отмени)$/.test(value)){this.pending=null;return this.reply('Уточнение отменено. Уже сохранённые сведения остались в команде.');}
  if(p.kind==='screen'){
   this.pending=null;
   if(/^(?:да|давай|ага|ок|окей|хорошо|можно|посмотри|смотри|разрешаю|конечно)(?:[\s,!].*)?$/iu.test(value)){this.busy=false;return this.fromScreen(p.command);}
   return this.reply('Хорошо. Повтори «Заполни команду» через '+p.wait+' с, когда Slack снимет ограничение.');
  }
  if(p.kind==='details'){
   if(p.channelInput&&/^[\p{L}\p{N}_-]+$/u.test(command.trim()))command='#'+command.trim();
   if(p.channelOptions?.length){
    const ordinal={первый:0,первое:0,второй:1,второе:1,третий:2,третье:2};
    const index=/^\d+$/.test(value)?Number(value)-1:ordinal[value];
    const matches=p.channelOptions.filter(c=>c.name.toLowerCase()===value||c.id.toLowerCase()===value||c.name.toLowerCase().split('-').includes(value));
    const selected=Number.isInteger(index)?p.channelOptions[index]:matches.length===1?matches[0]:null;
    if(selected)command='#'+selected.name;
   }
   this.pending=null;
   // Re-enter through the same validation and scoped write path.
   this.busy=false;return this.turn((p.prefix||'Заполни команду\n')+command);
  }
  if(p.baseline!==(this.settings().teamMembers||'[]')){this.pending=null;return this.reply('Команда уже изменена. Повторите заполнение, чтобы учесть новые данные.');}
  const replace=/^(?:замени|заменить|обнови|новое|второй|второе|2)$/.test(value);
  const keep=/^(?:оставь|оставить|оставь прежнее|оставь как есть|прежнее|первый|первое|1)$/.test(value);
  if(!replace&&!keep)return this.question();
  const c=p.conflicts.shift(),members=JSON.parse(p.baseline);
  if(replace){members[c.index][c.key]=c.value;this.save(team.validate(members));p.baseline=JSON.stringify(members);}
  p.summary=replace?'Изменение сохранено.':'Прежнее значение оставлено.';
  if(p.conflicts.length)return this.question();
  this.pending=null;return this.reply(p.summary+' Команда заполнена.',{teamUpdated:true});
 }
}
module.exports={TeamFill,isTeamFill,grounded,directRows};
