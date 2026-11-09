// «Отсутствия»: who of «Команда» is on vacation, sick leave or a day off — «кто в отпуске на этой неделе», «когда Маша
// вернётся», «отпуска команды» — as a strip of days with a bar per absence; and «Маша в отпуске с 10 по 20» typed in
// the chat, saved only after «Сохранить» on the confirmation card. The data is the people records foundation
// (src/features/people.cjs): typed absences stored locally, out-of-office events of the calendar app and other people
// sources read when asked. Nothing is sent anywhere.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const text=require('../../people/text.cjs');
const ID='absences',BY='Отсутствия';
const DAY=text.DAY;

// --- Routing -------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').replace(/ё/g,'е').trim();
const AWAY='(?:в\\s+отпуске|в\\s+отпуск|на\\s+больничном|болеет|болеют|в\\s+отгуле|отсутствует|отсутствуют|не\\s+работает|не\\s+работают|нет\\s+на\\s+работе|уходит\\s+в\\s+отпуск|уходят\\s+в\\s+отпуск|будет\\s+в\\s+отпуске|будут\\s+в\\s+отпуске|идет\\s+в\\s+отпуск|не\\s+будет|отдыхает|отдыхают)';
const WHO=new RegExp('^(?:а\\s+)?(?:кто|кого)\\s+(?:у\\s+нас\\s+|из\\s+(?:команды|нас|ребят|коллег)\\s+)?(?:сейчас\\s+)?'+AWAY+'(?=$|[\\s,?])','iu');
const LIST=/^(?:покажи\s+|какие\s+)?(?:отпуска|отсутствия|отгулы|больничные)\s+(?:в\s+)?(?:команд\p{L}*|коллег|ребят)|^(?:покажи\s+)?(?:график|календар\p{L}*|план)\s+(?:отпусков|отсутствий)|^кто\s+когда\s+(?:в\s+отпуске|уходит\s+в\s+отпуск|отдыхает)|^(?:покажи\s+)?отсутствия(?:\s+на\s+.+)?$/iu;
const RETURN=/^(?:а\s+)?когда\s+(.{2,40}?)\s+(?:вернется|вернутся|выйдет|выйдут|выходит|выходят|возвращается|возвращаются|будет\s+на\s+работе|будут\s+на\s+работе)(?:\s+(?:из\s+отпуска|с\s+больничного|на\s+работу|из\s+отгула))?$/iu;
const WHEN_OFF=/^(?:а\s+)?когда\s+(?:у\s+)?(.{2,40}?)\s+(?:отпуск|в\s+отпуске|уходит\s+в\s+отпуск|идет\s+в\s+отпуск|уходят\s+в\s+отпуск)$/iu;
const IS_OFF=/^(?:а\s+)?(.{2,40}?)\s+(?:сейчас\s+|сегодня\s+|завтра\s+)?(?:в\s+отпуске|на\s+больничном|в\s+отгуле|отсутствует)(?:\s+(?:сейчас|сегодня|завтра))?$/iu;
// HR questions, the user's own leave and travel: «сколько дней отпуска осталось», «как оформить отпуск», «я в отпуске»,
// «отпуск в Турции», «куда поехать в отпуск». A dated note about a colleague («Маша в отпуске в Турции с 10 по 20»)
// is still a note.
const NOT=/(?:сколько|остал\p{L}*)\s+(?:\p{L}+\s+)?дн\p{L}*\s+отпуск|отпускн\p{L}*|оформ\p{L}*|заявлени|по\s+уходу|декрет|компенсац|перенести\s+отпуск|(?:^|\s)(?:я|мне|меня|мой|моя|мы)\s+(?:в\s+отпуск|отпуск|на\s+больничн|в\s+отгул)|отпусти\p{L}*|что\s+такое|спринт/iu;
const TRAVEL=/турци|египт|тайланд|таиланд|мор[еяю]\b|(?:^|\s)на\s+мор|куда\s+(?:поехать|съездить|полететь)|путевк|тур\s|билет|отел/iu;

function period(t,now){
 const today=text.dayStart(now),dow=(today.getDay()+6)%7;
 const monday=new Date(today);monday.setDate(today.getDate()-dow);
 const span=(a,b,label)=>({from:text.ymd(a),to:text.ymd(b),label});
 if(/сегодня|сейчас/iu.test(t))return span(today,today,'сегодня');
 if(/послезавтра/iu.test(t)){const d=new Date(today);d.setDate(d.getDate()+2);return span(d,d,'послезавтра');}
 if(/завтра/iu.test(t)){const d=new Date(today);d.setDate(d.getDate()+1);return span(d,d,'завтра');}
 if(/следующ\p{L}*\s+недел/iu.test(t)){const a=new Date(monday);a.setDate(a.getDate()+7);const b=new Date(a);b.setDate(b.getDate()+6);return span(a,b,'на следующей неделе');}
 if(/(?:эт\p{L}*|текущ\p{L}*)\s+недел|на\s+неделе/iu.test(t)){const b=new Date(monday);b.setDate(b.getDate()+6);return span(monday,b,'на этой неделе');}
 if(/(?:две|2)\s+недел/iu.test(t)){const b=new Date(monday);b.setDate(b.getDate()+13);return span(monday,b,'за две недели');}
 if(/следующ\p{L}*\s+месяц/iu.test(t)){const a=new Date(today.getFullYear(),today.getMonth()+1,1),b=new Date(today.getFullYear(),today.getMonth()+2,0);return span(a,b,'в следующем месяце');}
 if(/(?:эт\p{L}*|текущ\p{L}*)\s+месяц/iu.test(t)){const a=new Date(today.getFullYear(),today.getMonth(),1),b=new Date(today.getFullYear(),today.getMonth()+1,0);return span(a,b,'в этом месяце');}
 const m=[...t.matchAll(/(?:^|\s)в\s+([а-я]+)(?=$|\s)/giu)].find(x=>text.monthOf(x[1])>=0);const month=m?text.monthOf(m[1]):-1;
 if(month>=0){let y=today.getFullYear();if(month<today.getMonth())y++;const a=new Date(y,month,1),b=new Date(y,month+1,0);return span(a,b,'в '+m[1].toLocaleLowerCase('ru'));}
 // Without a period: two weeks from Monday of this week.
 const b=new Date(monday);b.setDate(b.getDate()+13);return span(monday,b,'за две недели');
}

// {type:'add', note} | {type:'list', t} | {type:'person', who, t} | null. `members` decides whether a note names a
// colleague; without them only list requests are recognised.
function route(command,members=[],now=new Date()){
 const t=clean(command);
 // Names are echoed as typed («Пётр», not «Петр»): ё→е keeps every index, so the original is cut at the same place.
 const typed=String(command||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/u,'').trim();
 const orig=v=>{const i=t.indexOf(v);return i>=0?typed.substr(i,v.length):v;};
 if(!t||t.length>240)return null;
 if(/^\/|(?:^|\s)скилл/iu.test(t))return null;
 if(NOT.test(t))return null;
 const travel=TRAVEL.test(t);
 if(!travel&&(WHO.test(t)||LIST.test(t)))return {type:'list',t};
 let m=RETURN.exec(t)||WHEN_OFF.exec(t);
 if(m&&!travel&&!/^(?:я|мы|ты|вы|отпуск|он|она|они)$/iu.test(m[1].trim()))return {type:'person',who:orig(m[1].trim()),t};
 const note=text.parseNote(t,now);
 if(note){const who=note.who.replace(/^(?:что\s+)/iu,'');if(/^(?:я|мы|ты|вы)$/iu.test(who))return null;return {type:'add',note:{...note,who},t};}
 m=IS_OFF.exec(t);
 if(m&&!travel&&!/^(?:я|мы|ты|вы|кто|он|она|они)$/iu.test(m[1].trim())&&text.member(m[1].trim(),members))return {type:'person',who:orig(m[1].trim()),t};
 return null;
}

// --- Words ---------------------------------------------------------------------------------------------------------
const KIND={vacation:'отпуск',sick:'больничный',dayoff:'отгул',away:'нет на месте'};
const date=(d,opts={day:'numeric',month:'long'})=>new Date(d+'T12:00:00').toLocaleDateString('ru-RU',opts);
const range=(a,b)=>a===b?date(a):a.slice(0,7)===b.slice(0,7)?'с '+Number(a.slice(8))+' по '+date(b):'с '+date(a)+' по '+date(b);
// The first working day after an absence.
function back(to){const d=new Date(to+'T12:00:00');do d.setDate(d.getDate()+1);while([0,6].includes(d.getDay()));return text.ymd(d);}

// --- Card data -------------------------------------------------------------------------------------------------------
function cardOf(s,{mode,from,to,label,rows,notes=[],focus='',draft=null,people}){
 const team=s.people.members();
 const absent=[...new Set(rows.map(r=>r.member))];
 return {absenceCard:{mode,from,to,label,today:text.ymd(s.people.now()),focus,
  people:(people||absent).map(k=>team.find(m=>m.key===k)).filter(Boolean).map(m=>({member:m.key,name:m.name,role:m.role||''})),
  rows:rows.map(r=>({id:r.id||'',member:r.member,name:r.name,from:r.from,to:r.to,kind:r.kind,source:r.source,sourceName:r.sourceName||'',title:r.title||'',note:r.note||'',removable:!!r.removable})),
  present:Math.max(0,team.length-absent.length),notes,...draft?{draft}:{}}};
}

// --- Turns ---------------------------------------------------------------------------------------------------------
const drafts=new Map();
const DRAFT_TTL=30*60000;
function pick(s,command,list,resume){
 const label=m=>m.name+(m.role?' · '+m.role:'');
 return ask({text:'Кого вы имеете в виду?',label:'Коллега',options:list.slice(0,8).map(label),strictChoices:true},answer=>{
  const m=list.find(x=>label(x)===String(answer).trim());
  return m?resume(m):kit.reply(s,command,{by:BY,text:'Такого человека нет в списке. Повторите запрос.',error:true});
 });
}
function whom(s,who){
 const team=s.people.members();
 const one=text.member(who,team);if(one)return {member:one};
 const many=text.candidates(who.split(/\s+/)[0],team);
 return many.length>1?{many}:null;
}

function addTurn(s,command,note){
 const run=m=>{
  const id=randomUUID();
  const row={member:m.key,name:m.name,from:note.from,to:note.to,kind:note.kind,note:clean(command).slice(0,300)};
  drafts.set(id,{...row,company:s.companyId||'',at:Date.now()});
  for(const [k,v] of drafts)if(Date.now()-v.at>DRAFT_TTL)drafts.delete(k);
  const view=periodAround(note.from,note.to);
  const existing=s.people.stored({from:view.from,to:view.to}).filter(r=>r.member===m.key);
  const card=cardOf(s,{mode:'confirm',...view,label:'',rows:existing,focus:m.key,people:[m.key],draft:{id,...row}});
  return kit.reply(s,command,{by:BY,text:'Отметить: '+m.name+' — '+KIND[note.kind]+' '+range(note.from,note.to)+'? Подтвердите на карточке — без подтверждения ничего не сохраню.',data:card});
 };
 const found=whom(s,note.who);
 if(!found)return null;
 if(found.many)return pick(s,command,found.many,run);
 return run(found.member);
}
// The strip around one absence: from its Monday, at least two weeks, at most six.
function periodAround(from,to){
 const a=new Date(from+'T12:00:00');a.setDate(a.getDate()-((a.getDay()+6)%7));
 const b=new Date(to+'T12:00:00');b.setDate(b.getDate()+(7-b.getDay())%7);
 if((b-a)/DAY<13)b.setTime(a.getTime()+13*DAY);
 if((b-a)/DAY>41)b.setTime(a.getTime()+41*DAY);
 return {from:text.ymd(a),to:text.ymd(b)};
}

async function listTurn(s,command,t){
 const p=period(t,new Date(s.people.now()));
 s.requestProgress?.report?.('Смотрю отсутствия команды');
 const r=await s.people.absences({from:p.from,to:p.to});
 const names=[...new Set(r.rows.map(x=>x.name))];
 const by=name=>r.rows.filter(x=>x.name===name).map(x=>KIND[x.kind]+' '+range(x.from<p.from?p.from:x.from,x.to)).join(', ');
 const head=names.length?(p.from===p.to?'Отсутствуют '+p.label+': ':'Отсутствуют '+p.label+' ('+range(p.from,p.to)+'): '):'';
 const body=names.length?head+names.map(n=>n+' — '+by(n)).join('; ')+'.':'Отсутствий '+p.label+' не отмечено'+(s.people.sources().length?'':' (календарь не подключён — учтены только отмеченные в чате)')+'.';
 return kit.reply(s,command,{by:BY,text:body+(r.notes.length?' '+r.notes.join(' '):''),data:cardOf(s,{mode:'list',from:p.from,to:p.to,label:p.label,rows:r.rows,notes:r.notes})});
}

async function personTurn(s,command,who){
 const run=async m=>{
  const today=text.ymd(s.people.now());
  const until=text.ymd(new Date(s.people.now()+120*DAY));
  s.requestProgress?.report?.('Смотрю отсутствия: '+m.name);
  const r=await s.people.absences({from:today,to:until,key:m.key});
  const rows=r.rows;
  // Adjacent absences (a vacation right after a day off) count as one stretch for «когда вернётся».
  const now=rows.filter(x=>x.from<=today&&x.to>=today);
  let end=now.length?now.map(x=>x.to).sort().at(-1):'';
  for(let moved=true;end&&moved;){moved=false;for(const x of rows)if(x.from<=back(end)&&x.to>end){end=x.to;moved=true;}}
  const next=rows.find(x=>x.from>today);
  let answer;
  if(end)answer=m.name+' сейчас отсутствует ('+KIND[now[0].kind]+') до '+date(end)+' включительно — вернётся '+date(back(end),{weekday:'long',day:'numeric',month:'long'})+'.';
  else if(next)answer=m.name+' сейчас на работе. Ближайшее отсутствие — '+KIND[next.kind]+' '+range(next.from,next.to)+'.';
  else answer=m.name+' на работе: отсутствий на ближайшие 4 месяца не отмечено'+(s.people.sources().length?'.':' (календарь не подключён — учтены только отмеченные в чате).');
  const view=rows.length?periodAround(today,(end||next?.to||today)):periodAround(today,today);
  return kit.reply(s,command,{by:BY,text:answer+(r.notes.length?' '+r.notes.join(' '):''),data:cardOf(s,{mode:'person',...view,label:'',rows:rows.filter(x=>x.from<=view.to),notes:r.notes,focus:m.key,people:[m.key]})});
 };
 const found=whom(s,who);
 if(!found)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл «'+who+'» в «Команде». Отсутствия отмечаются для коллег из «Команды» — добавьте человека там или назовите иначе.'});
 if(found.many)return pick(s,command,found.many,run);
 return run(found.member);
}

async function turn(s,command){
 if(!kit.installed(s,ID))return null;
 const members=s.people?.members?.()||(()=>{try{return require('../../team.cjs').members(s.settings);}catch{return [];}})();
 const now=new Date(s.people?.now?.()||Date.now());
 const r=route(command,members,now);
 if(!r)return null;
 // A typed note about somebody outside «Команда» is not ours («Пётр в отпуске» may be about anyone).
 if(r.type==='add'&&!text.member(r.note.who,members)&&text.candidates(r.note.who.split(/\s+/)[0],members).length<2)return null;
 if(!s.people)return kit.reply(s,command,{by:BY,question:true,text:'Записи о коллегах ещё загружаются. Повторите через минуту.'});
 if(!members.length)return kit.reply(s,command,{by:BY,question:true,text:'Отсутствия отмечаются для коллег из «Команды», а она пуста. Заполните её на вкладке «Команда» или скажите «Петя, заполни команду».'});
 try{
  if(r.type==='add')return addTurn(s,command,r.note);
  if(r.type==='person')return await personTurn(s,command,r.who);
  return await listTurn(s,command,r.t);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}

function setup(s){
 const need=()=>{if(!kit.installed(s,ID))throw Error('Приложение «Отсутствия» не добавлено.');if(!s.people)throw Error('Записи о коллегах ещё загружаются.');};
 const id=v=>{if(typeof v!=='string'||!/^[\w-]{8,80}$/.test(v))throw Error('Некорректная отметка.');return v;};
 return {ipc:{
  // «Сохранить» on the confirmation card: the only way a typed absence is written.
  confirm(draftId){
   need();id(draftId);
   if(s.people.draft(draftId))return {ok:true,saved:true,text:'Уже сохранено'};
   const d=drafts.get(draftId);
   if(!d||d.company!==(s.companyId||'')||Date.now()-d.at>DRAFT_TTL)throw Error('Карточка устарела — повторите запрос в чате.');
   const row=s.people.addAbsence(d.member,{from:d.from,to:d.to,kind:d.kind,note:d.note,draft:draftId});
   drafts.delete(draftId);
   return {ok:true,saved:true,row,text:row.existed?'Такое отсутствие уже было отмечено':'Сохранено: '+d.name+' — '+KIND[d.kind]+' '+range(d.from,d.to)};
  },
  cancel(draftId){id(draftId);drafts.delete(draftId);return {ok:true};},
  state(draftId){id(draftId);if(!s.people)return 'expired';return s.people.draft(draftId)?'saved':drafts.has(draftId)?'pending':'expired';},
  remove(member,rowId){need();if(typeof member!=='string'||member.length>260)throw Error('Некорректная отметка.');const row=s.people.removeAbsence(member,id(rowId));return {ok:true,row,text:'Отметка удалена: '+row.name+' — '+range(row.from,row.to)};},
  restore(member,row){need();if(typeof member!=='string'||member.length>260)throw Error('Некорректная отметка.');s.people.restoreAbsence(member,row);return {ok:true,text:'Отметка возвращена'};}
 }};
}
// A typed absence goes to this app before others that read the same phrase (sprint planning keeps it when this app
// is not added).
const claims=command=>{const t=clean(command);return !NOT.test(t)&&!!text.parseNote(t);};
// Dashboards (src/features/dashboards.cjs): the read-only questions.
const dashboard={accepts:command=>{const r=route(command);return !!r&&r.type==='list';},widgets:[{title:'Кто в отпуске на этой неделе',command:'кто в отпуске на этой неделе'},{title:'Отсутствия на две недели',command:'отпуска команды'}]};
module.exports={name:'absences',dashboard,defaults:{['extension_'+ID]:'false'},validate(){},setup,teardown(){drafts.clear();},turn,route,period,claims,back,drafts};
