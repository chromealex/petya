// «Дни рождения»: the birthday field on the cards of «Команда» (team-field.js, extension.json "personFields"), a note
// every morning (from 9:00, once a day) about whose birthday is today and tomorrow — in the «Дни рождения» chat of the
// general project and a system notification — and answers «у кого день рождения на этой неделе?», «когда день
// рождения у Маши?». The date itself is part of the person record in «Команда» (`birthday`: typed in the field or
// filled from a Slack profile; «Люди» reads it too), so it is kept whether or not this app is added; only the field,
// the notes and the answers come and go with the app.
// Before 0.16 this app had no catalog switch (it always ran); it is added once by itself where someone already has a
// birthday on their card, so nothing changes for those teams.
const kit=require('../app-kit.cjs');
const team=require('../../team.cjs');
const ID='birthdays',BY='Дни рождения';
const DAY=86400000;
const pad=v=>String(v).padStart(2,'0');
const dayKey=d=>pad(d.getMonth()+1)+'-'+pad(d.getDate());
const isoDay=d=>d.getFullYear()+'-'+dayKey(d);
// People with a birthday on the given date; age when the year is known.
function on(members,date){
 const key=dayKey(date);
 return members.filter(m=>m.birthday&&m.birthday.slice(-5)===key).map(m=>{const year=Number(m.birthday.slice(0,4));return {name:m.name,role:m.role||'',age:year?date.getFullYear()-year:null};});
}
function text(today,tomorrow){
 const who=p=>p.name+(p.age?' ('+p.age+')':'')+(p.role?', '+p.role:'');
 return [today.length?'🎂 Сегодня день рождения: '+today.map(who).join('; ')+'.':'',tomorrow.length?'Завтра: '+tomorrow.map(who).join('; ')+'.':''].filter(Boolean).join('\n');
}
// Every birthday from `now` on, nearest first: {name, role, date, days, age}.
function upcoming(members,now=new Date()){
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 return members.filter(m=>/^(?:\d{4}|-)-\d{2}-\d{2}$/.test(m.birthday||'')).map(m=>{
  const [month,day]=m.birthday.slice(-5).split('-').map(Number),year=Number(m.birthday.slice(0,4))||0;
  let date=new Date(start.getFullYear(),month-1,day);if(date<start)date=new Date(start.getFullYear()+1,month-1,day);
  return {name:m.name,role:m.role||'',date,days:Math.round((date-start)/DAY),age:year?date.getFullYear()-year:null};
 }).sort((a,b)=>a.days-b.days||a.name.localeCompare(b.name,'ru'));
}
// Requests for this app: a question about birthdays in the team. Not: reminders, greetings and gifts, the calendar,
// events and holidays (other apps and the dialogue).
const SUBJECT=/д(?:е|н)\p{L}*\s+рождени\p{L}*|днюх\p{L}*/iu;
const ASK=/^(?:петя[,!\s]+)?(?:а\s+)?(?:у\s+кого|чей|чьи|когда|какие|ближайш\p{L}*|скоро\s+ли|покажи|список|есть\s+ли)/iu;
const AVOID=/напомн|напоминай|поздрав|открытк|подар|календар|ивент|праздн|отпуск|компани|рождеств|событи/iu;
const ABOUT=/(?:когда|скоро\s+ли)\s+(?:будет\s+)?(?:д(?:е|н)\p{L}*\s+рождени\p{L}*|днюх\p{L}*)\s+(?:у\s+)?(.+)$|когда\s+у\s+(.+?)\s+(?:д(?:е|н)\p{L}*\s+рождени|днюх)/iu;
// A name in any case («у Маши», «у Ивана», «у Олежки»): the word without its ending starts a name or alias of about the
// same length («Ивана» is Иван, not Иванова).
const norm=w=>String(w).toLocaleLowerCase('ru').replace(/ё/g,'е');
const stem=w=>{const n=norm(w),cut=n.replace(/(?:ой|ей|ом|ем|ым|им|ую|юю|а|я|у|ю|е|ы|и|о)$/u,'');return cut.length>=3?cut:n;};
const same=(token,word)=>{const t=norm(token),st=stem(word);return t.startsWith(st)&&t.length<=st.length+2;};
function findPeople(members,phrase){
 const words=String(phrase).replace(/[?!.,]/g,' ').split(/\s+/).filter(w=>w.length>=3);
 if(!words.length)return [];
 return members.filter(m=>words.every(w=>[m.name,...String(m.aliases||'').split(',')].some(n=>String(n).split(/\s+/).some(t=>t&&same(t,w)))));
}
const when=(p,locale='ru-RU')=>p.date.toLocaleDateString(locale,{day:'numeric',month:'long'})+(p.days===0?' (сегодня)':p.days===1?' (завтра)':' (через '+p.days+' дн.)');
const line=p=>when(p)+' — '+p.name+(p.age?', исполнится '+p.age:'')+(p.role?' · '+p.role:'');
async function turn(s,command){
 const c=String(command||'').trim().replace(/[.!]+$/u,'');
 if(!SUBJECT.test(c)||!ASK.test(c)||AVOID.test(c)||!kit.installed(s,ID))return null;
 let members=[];try{members=team.members(s.settings);}catch{members=[];}
 const all=upcoming(members);
 const about=ABOUT.exec(c);const name=about&&(about[1]||about[2]).replace(/\?$/,'').trim();
 if(name&&!/^(?:в|на|кого|нас|команд)/iu.test(name)){
  const people=findPeople(members,name);
  if(!people.length)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл «'+name+'» в «Команде». Добавьте человека и его день рождения на странице «Команда».'});
  const found=all.filter(p=>people.some(m=>m.name===p.name));
  if(!found.length)return kit.reply(s,command,{by:BY,text:'У '+people.map(p=>p.name).join(', ')+' день рождения не указан. Его можно выбрать на карточке в «Команде».'});
  return kit.reply(s,command,{by:BY,text:found.map(line).join('\n')});
 }
 if(!all.length)return kit.reply(s,command,{by:BY,text:'В «Команде» пока ни у кого не указан день рождения. Его можно выбрать на карточке человека или взять из профиля Slack.'});
 const limit=/сегодня/iu.test(c)?0:/завтра/iu.test(c)?1:/недел/iu.test(c)?7:/месяц/iu.test(c)?31:30;
 const from=/завтра/iu.test(c)?1:0;
 const rows=all.filter(p=>p.days>=from&&p.days<=limit);
 const span=limit===0?'сегодня':limit===1?'завтра':limit===7?'на этой неделе':'в ближайший месяц';
 if(!rows.length)return kit.reply(s,command,{by:BY,text:'Дней рождения '+span+' нет. Ближайший: '+line(all[0])+'.'});
 return kit.reply(s,command,{by:BY,text:'Дни рождения '+span+':\n'+rows.slice(0,20).map(line).join('\n')});
}
const timers=new Set();
function setup(s){
 const state=()=>require('../../extension-cache.cjs').store(s.dataRoot,'birthdays');
 // Once per company: teams that already keep birthdays get the app added, as it always ran before 0.16.
 try{
  if(s.dataRoot&&!state().peek('switch')){
   state().set('switch','0.16');
   let members=[];try{members=team.members(s.settings);}catch{members=[];}
   if(s.settings?.['extension_'+ID]!=='true'&&members.some(m=>m.birthday))s.saveSettings?.({['extension_'+ID]:'true'});
  }
 }catch(e){console.error('Birthdays:',e.message);}
 function run(now=new Date()){
  if(!kit.installed(s,ID)||now.getHours()<9)return null;
  const today=isoDay(now),store=state();if(store.peek('last')===today)return null;store.set('last',today);
  let members=[];try{members=team.members(s.settings);}catch{return null;}
  const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
  const a=on(members,now),b=on(members,tomorrow);if(!a.length&&!b.length)return null;
  const message=text(a,b);
  // One chat for these notes in the general project.
  const project=s.dialogue.state.projects.find(p=>p.id==='general');let topic=s.dialogue.state.topics.find(t=>t.birthdays&&!t.archived);
  if(!topic){topic={id:require('node:crypto').randomUUID(),projectId:project?.id||'general',title:'Дни рождения',kind:'chat',birthdays:true,messages:[],at:Date.now()};s.dialogue.state.topics.push(topic);}
  topic.messages.push({role:'assistant',text:message,at:Date.now(),by:BY});topic.at=Date.now();topic.unread=(topic.unread||0)+1;s.dialogue.persist();
  try{const {Notification}=require('electron');if(Notification?.isSupported?.())new Notification({title:'Петя · дни рождения',body:message.split('\n')[0]}).show();}catch{}
  return message;
 }
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){
  const timer=setInterval(()=>{try{run();}catch(e){console.error('Birthdays:',e.message);}},10*60000);timer.unref?.();timers.add(timer);
  const first=setTimeout(()=>{try{run();}catch{}},60000);first.unref?.();timers.add(first);
 }
 return {birthdays:{run}};
}
function teardown(){for(const t of timers){clearInterval(t);clearTimeout(t);}timers.clear();}
module.exports={name:'birthdays',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,teardown,on,text,upcoming};
