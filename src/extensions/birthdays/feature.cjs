// Birthdays plugin: every morning (from 9:00, once a day) looks at the team's birthdays — the field comes from
// Slack profiles or is typed in «Команда» — and says whose birthday is today and tomorrow: a note in the
// «Дни рождения» chat of the general project and a system notification.
const team=require('../../team.cjs');
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
function setup(s){
 const state=()=>require('../../extension-cache.cjs').store(s.dataRoot,'birthdays');
 function run(now=new Date()){
  if(now.getHours()<9)return null;
  const today=isoDay(now),store=state();if(store.peek('last')===today)return null;store.set('last',today);
  let members=[];try{members=team.members(s.settings);}catch{return null;}
  const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
  const a=on(members,now),b=on(members,tomorrow);if(!a.length&&!b.length)return null;
  const message=text(a,b);
  // One chat for these notes in the general project.
  const project=s.dialogue.state.projects.find(p=>p.id==='general');let topic=s.dialogue.state.topics.find(t=>t.birthdays&&!t.archived);
  if(!topic){topic={id:require('node:crypto').randomUUID(),projectId:project?.id||'general',title:'Дни рождения',kind:'chat',birthdays:true,messages:[],at:Date.now()};s.dialogue.state.topics.push(topic);}
  topic.messages.push({role:'assistant',text:message,at:Date.now(),by:'Дни рождения'});topic.at=Date.now();topic.unread=(topic.unread||0)+1;s.dialogue.persist();
  try{const {Notification}=require('electron');if(Notification?.isSupported?.())new Notification({title:'Петя · дни рождения',body:message.split('\n')[0]}).show();}catch{}
  return message;
 }
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>{try{run();}catch(e){console.error('Birthdays:',e.message);}},10*60000);timer.unref?.();setTimeout(()=>{try{run();}catch{}},60000).unref?.();}
 return {birthdays:{run}};
}
module.exports={name:'birthdays',setup,on,text};
