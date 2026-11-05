const team = require('./team.cjs');
const clean = value => String(value || '').trim().replace(/^петя[\s,:.!?—-]*/iu, '');
const normalized = value => value.trim().toLocaleLowerCase().replace(/ё/g, 'е');
const labels = {name:'имя',aliases:'варианты имени',role:'роль',projects:'проекты',responsibilities:'обязанности',email:'email',slackId:'Slack ID',jiraId:'Jira ID'};
// «Можешь команде добавить роли?», «Проставь роли в команде», «Заполни обязанности коллег»: add roles to the saved team.
function rolesRequest(text) {
 const value=clean(text).replace(/[?!.]+$/u,'');
 return /(?:добав|заполн|простав|укаж|укази|обнов|допиш|подтян|найд)\p{L}*/iu.test(value)&&/(?:рол|должност|обязанност)\p{L}*/iu.test(value)&&/(?:команд|коллег|сотрудник|участник)\p{L}*/iu.test(value)&&!/(?:jira|джир|задач|баг)/iu.test(value);
}
function isTeamFill(text) {
 if(rolesRequest(text))return true;
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
// Screen and chat text is full of doubled spaces and line breaks: quotes are compared with whitespace collapsed.
const flat=v=>String(v||'').replace(/\s+/gu,' ').trim();
// Slack sidebar: the people in «Личные сообщения / Direct messages» are the colleagues the user writes to.
// Names are taken from the lines of that section; apps, bots and the user's own entry are skipped.
const SECTION=/^(?:личные сообщения|direct messages|личная переписка|dms?)$/iu;
const NEXT=/^(?:каналы|channels|приложения|apps|избранное|starred|добавить коллег|add coworkers|add teammates|пригласить|invite people|ветки|threads|упоминания|mentions|черновики|drafts|activity|активность|later|позже|huddles|канвасы|canvases|lists|списки|файлы|files)$/iu;
const NOT_PERSON=/^(?:заметки|notes|сохранённое|сохраненное|saved|напоминания|reminders|slackbot|jira|jira cloud|github|gitlab|google drive|google calendar|zoom|asana|notion|confluence|figma|loom|polly|donut|workflow builder|ещё|more|show more|показать ещё)$|(?:\bbot\b|бот$|\(you\)|\(вы\)|\bapp\b)/iu;
function directMessages(text=''){
 const lines=String(text).split('\n').map(l=>l.replace(/\s+/gu,' ').trim()).filter(Boolean);const start=lines.findIndex(l=>SECTION.test(l));if(start<0)return [];
 const names=[];for(const line of lines.slice(start+1,start+80)){if(NEXT.test(line))break;
  // A group conversation lists several people: «Мария, Олег».
  for(const part of line.replace(/^(?:личное сообщение|direct message)(?: с| with)?\s*/iu,'').replace(/·.*$/u,'').split(/,\s*/u)){const name=part.replace(/\s+\d+$/u,'').trim();
   if(!/^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){0,3}$/u.test(name)||NOT_PERSON.test(name)||names.includes(name))continue;names.push(name);}}
 return names.slice(0,60);
}
function grounded(result,sources,stats={}) {
 if(!result||!Array.isArray(result.members)||result.members.length>100)throw Error('Не удалось разобрать сведения о команде.');
 const rows=[];stats.proposed=result.members.length;stats.unquoted=0;
 for(const row of result.members) {
  // Local models return the source id as a number as often as a string.
  const source=sources.find(s=>s.id===String(row.source??''))||(sources.length===1?sources[0]:null),quote=flat(row.evidence),text=flat(source?.text);
  if(!source||!quote||!text.includes(quote)||!row.name||!quote.includes(flat(row.name))){stats.unquoted++;continue;}
  const data={};
  for(const key of Object.keys(team.limits))if(typeof row[key]==='string'&&row[key].trim()) {
   const value=flat(row[key]);
   if(quote.includes(value))data[key]=value;
  }
  if(!data.name)continue;
  try{rows.push({member:team.validate([data])[0],evidence:quote.slice(0,1000),source:source.title});}catch{/* Invalid contacts never reach the directory. */}
 }
 return rows;
}
class TeamFill {
 // screen(): reads the visible Slack window; approve(): asks for computer control when it is needed.
 constructor({settings,save,sources,extract,roster,jiraRoster,enrich,scope,screen,approve,now=Date.now}) {Object.assign(this,{settings,save,sources,extract,roster,jiraRoster,enrich,scope,screen,approve,now});this.pending=null;this.busy=false;this.epoch=0;}
 reset(){this.pending=null;this.epoch++;}
 reply(text,extra={}){return {handled:true,text,...extra};}
 async turn(command,answer=false,screenSources=null,preset=null) {
  if(!screenSources&&!preset&&!answer&&!isTeamFill(command)){this.pending=null;return null;}
  if(this.busy)return this.reply('Уже заполняю команду. Дождитесь результата.');
  this.busy=true;
  try {
   if(answer)return await this.respond(command);
   this.pending=null;
   const scope=this.scope(),epoch=this.epoch,settings=this.settings();
   const baseline=settings.teamMembers||'[]',notes=settings.teamRoles||'';
   // Roles for the saved team: its own cards are the people; Slack profiles and Jira add the roles.
   const saved=!preset&&!screenSources&&rolesRequest(command)?team.members(settings):[];
   if(rolesRequest(command)&&!preset&&!screenSources&&!saved.length)return this.askDetails('В разделе «Команда» пока никого нет. Скажи «Заполни команду» — соберу коллег из Slack и Jira вместе с ролями.');
   const roster=preset||(saved.length?saved.map(member=>({member:{...member},evidence:'Команда · '+member.name,source:'Команда'})):null)||(screenSources?null:this.roster?await this.roster(command):null);
   let budget=32000;const sources=(screenSources||(roster===null?this.sources(command):[{title:'Команда',text:command}])).map((s,i)=>({...s,id:String(i),text:String(s.text||'')})).filter(s=>s.text.trim()).map(s=>{const text=s.text.slice(0,Math.max(0,budget));budget-=text.length;return {...s,text};}).filter(s=>s.text);
   if(!sources.length&&!screenSources&&!preset){const rows=await this.fromJira();if(rows?.length){this.busy=false;return this.turn(command,false,null,rows);}}
   if(!sources.length)return this.askDetails('В памяти пока нет сведений о коллегах. Назовите имена и обязанности, например: «Полина — тестирование, Иван — серверная часть».');
   const extracted=roster===null?(this.extract?await this.extract(sources,clean(command)):directRows(sources.filter(s=>s.direct))):null;
   if(epoch!==this.epoch||scope!==this.scope()||baseline!==(this.settings().teamMembers||'[]')||notes!==(this.settings().teamRoles||''))return this.reply('Сведения или компания изменились во время заполнения. Повторите команду.');
   const stats={};let candidates=roster===null?grounded(extracted,sources,stats):roster;const members=team.members(settings),conflicts=[];let added=0,filled=0,ambiguous=0;
   // Nothing in Slack or memory: the people assigned in Jira are the team (names, Jira IDs, projects).
   // Nobody with roles in the window: the people from the sidebar's direct messages are the team (names only).
   let fromSidebar=false;if(!candidates.length&&screenSources){const names=directMessages(screenSources.map(x=>x.text).join('\n'));if(names.length){candidates=names.map(name=>({member:team.validate([{name}])[0],evidence:'Slack: личные сообщения · '+name,source:'Slack · личные сообщения'}));fromSidebar=true;}}
   let fromJira=!!preset;if(!candidates.length&&!preset){const rows=await this.fromJira();if(rows?.length){candidates=rows;fromJira=true;}}
   // Names without roles (sidebar, Jira, a plain list): add the Slack profile title and the Jira components and labels.
   let enriched=0;if(candidates.length&&this.enrich&&candidates.some(c=>!c.member.role||!c.member.responsibilities)){try{const before=candidates.filter(c=>c.member.role||c.member.responsibilities).length;candidates=await this.enrich(candidates);enriched=candidates.filter(c=>c.member.role||c.member.responsibilities).length-before;}catch(e){console.error('Team enrich:',e.message);}}
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
   if(!candidates.length){
    // Say what was read and why nothing was taken, instead of a bare «не нашёл».
    const read=screenSources?'Прочитал '+(screenSources[0]?.title||'окно Slack')+' ('+flat(screenSources[0]?.text).length+' символов). ':'';
    const why=stats.proposed?'Модель нашла '+stats.proposed+' '+(stats.proposed===1?'человека':'человек')+', но не смогла подтвердить '+(stats.unquoted===stats.proposed?'никого':stats.unquoted)+' точной цитатой из текста — такие карточки не сохраняю. ':screenSources?'Имён коллег с ролями или обязанностями в этом окне нет. ':'';
    const jira=this.jiraError?'Jira тоже не помогла: '+this.jiraError+'. ':'';
    const hint=screenSources?'Открой в Slack список участников канала или сообщение, где перечислена команда, и повтори «Заполни команду»; или назови коллег сам: «Заполни команду: Полина — тестирование».':'Назовите коллег и обязанности или прикрепите список команды.';
    return this.askDetails((read||why?read+why:'Не нашёл однозначных сведений о составе команды. ')+jira+hint);}
   const without=candidates.filter(c=>!c.member.role&&!c.member.responsibilities).map(c=>c.member.name);
   return this.reply(summary+(fromSidebar?' Взял коллег из личных сообщений Slack слева.':'')+(fromJira?' Взял исполнителей задач из Jira.':'')+(enriched?' Роли и обязанности добавил для '+enriched+': должность — из профиля Slack, обязанности — по компонентам и меткам их задач в Jira.':'')+(without.length?' Без роли остались: '+without.slice(0,8).join(', ')+(without.length>8?' и ещё '+(without.length-8):'')+' — в Slack у них не указана должность, а в Jira нет компонентов и меток. Допиши в «Команде» или скажи «Заполни команду: '+without[0]+' — тестирование».':'')+' Сведения сохранены в разделе «Команда».',{teamUpdated:!!(added||filled)});
  }catch(e){
   // Slack rate limit: offer to read the Slack app window instead of waiting.
   if(!screenSources&&(e.status===429||/HTTP 429|ограничил запросы/u.test(e.message||''))){const rows=await this.fromJira().catch(()=>null);if(rows?.length){this.busy=false;return this.turn(command,false,null,rows);}}
   if(!screenSources&&this.screen&&(e.status===429||/HTTP 429|ограничил запросы/u.test(e.message||''))){const wait=Math.ceil(e.retryAfter||30);this.pending={kind:'screen',command,scope:this.scope(),at:this.now(),wait};return this.reply('Slack временно ограничил запросы (повторить можно через '+wait+' с). Могу сам посмотреть в приложении Slack: переключусь на него и прочитаю то, что видно в окне, например открытый канал команды или список участников. Посмотреть?',{question:true,teamFillReply:true,clarificationOptions:['Посмотреть в Slack','Не сейчас'],clarificationInput:{choicesOnly:true,cancelLabel:'Не сейчас'}});}
   if(e.teamChannels||e.code==='SLACK_CHANNEL_LOOKUP_REQUIRED'){const lookup=e.channelInput||e.code==='SLACK_CHANNEL_LOOKUP_REQUIRED';const reply=this.askDetails(lookup?'Из какого канала Slack взять участников команды? Введите точное название с # или вставьте ссылку на канал.':e.message);if(lookup)reply.clarificationInput={label:'Канал Slack',placeholder:'#название или ссылка на канал',submit:'Продолжить'};this.pending.channelInput=lookup;this.pending.prefix='Заполни команду из Slack ';this.pending.channelOptions=e.channelOptions||[];return reply;}return this.reply('Не удалось заполнить команду: '+e.message,{error:true});}
  finally{this.busy=false;}
 }
 async fromJira(){this.jiraError='';if(!this.jiraRoster)return null;try{const rows=await this.jiraRoster();if(rows&&!rows.length)this.jiraError='в Jira нет исполнителей задач за 90 дней';if(rows===null)this.jiraError='Jira не подключена или не выбраны проекты';return rows;}catch(e){console.error('Team from Jira:',e.message);this.jiraError=e.message;return null;}}
 // Fill the team from the visible Slack window; ask for computer control if it is off.
 async fromScreen(command){
  let view;
  try{view=await this.screen();}
  catch(e){if(e.code==='COMPUTER_PERMISSION_REQUIRED'&&this.approve)return this.approve(command,{type:'teamFillScreen'});return this.reply('Не удалось прочитать Slack с экрана: '+e.message,{error:true});}
  if(!String(view?.text||'').trim()){this.pending={kind:'screen',command,scope:this.scope(),at:this.now(),wait:30};return this.reply('В окне Slack не нашёл текста. Открой в Slack канал команды или список участников и скажи «да» — посмотрю ещё раз.',{question:true,teamFillReply:true});}
  return this.turn(command,false,[{title:view.title||'Экран Slack',text:String(view.text).slice(0,32000)}]);
 }
 // The question was recorded into a chat created for it: the pending answer belongs to that chat now.
 rescope(){if(this.pending)this.pending.scope=this.scope();}
 askDetails(text){this.pending={kind:'details',scope:this.scope(),at:this.now()};return this.reply(text,{question:true,teamFillReply:true});}
 question(){const p=this.pending,c=p.conflicts[0],member=JSON.parse(p.baseline)[c.index];return this.reply(p.summary+' '+member.name+', '+labels[c.key]+': сохранено «'+member[c.key]+'», найдено «'+c.value+'» ('+c.source+'). Оставить прежнее или заменить?',{teamUpdated:true,question:true,teamFillReply:true});}
 respond(command){
  const p=this.pending;
  if(!p||p.scope!==this.scope()||this.now()-p.at>600000){this.pending=null;return this.reply('Уточнение устарело. Скажите «заполни команду» ещё раз.');}
  const value=clean(command).toLowerCase().replace(/[.!?]+$/,'');
  if(/^(?:отмена|стоп|не надо|отмени)$/.test(value)){this.pending=null;return this.reply('Уточнение отменено. Уже сохранённые сведения остались в команде.');}
  if(p.kind==='screen'){
   this.pending=null;
   if(/^(?:да|давай|ага|ок|окей|хорошо|можно|посмотреть в slack|посмотри|смотри|разрешаю|конечно)(?:[\s,!].*)?$/iu.test(value)){this.busy=false;return this.fromScreen(p.command);}
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
module.exports={TeamFill,isTeamFill,rolesRequest,grounded,directRows,directMessages};
