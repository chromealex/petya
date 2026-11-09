// «Встречи 1:1», follow-ups: what each side promised, read by code from the notes the user dictated («я обещал выбить
// бюджет на курсы до пятницы; Олег сделает ревью архитектуры к 20 ноября»). A clause is a follow-up only when its
// subject is clear — the user («я», «с меня», «мне нужно») or the colleague (his name, «он/она», «с него») — and the
// due date is read from «до/к пятнице», «к 20 ноября», «завтра», «до конца недели», «на следующей неделе». Nothing
// is guessed: a clause without a clear owner stays in the notes only.
const text=require('../../people/text.cjs');
const DAY=text.DAY;
const ME_DO='(?:обещал\\p{L}*|пообещал\\p{L}*|обещаю|должен|должна|нужно|надо|беру\\s+на\\s+себя|взял\\p{L}*\\s+на\\s+себя|сделаю|подготовлю|узнаю|посмотрю|договорюсь|напишу|отправлю|согласую|выбью|организую|найду|проверю|поговорю|помогу|дам|верну|пришлю|разберусь|подумаю|спрошу|закажу|забронирую|поставлю|назначу|добавлю|обновлю|сведу|познакомлю|покажу|расскажу|запишу|оформлю|оплачу|продвину|подниму)';
const THEM_DO='(?:обещал\\p{L}*|пообещал\\p{L}*|должен|должна|берет\\s+на\\s+себя|берёт\\s+на\\s+себя|взял\\p{L}*\\s+на\\s+себя|сделает|подготовит|напишет|пришл[её]т|разбер[её]тся|посмотрит|возьм[её]т|проверит|закончит|доделает|отправит|узна[её]т|займ[её]тся|почитает|прочитает|изучит|попробует|обновит|добавит|починит|исправит|поговорит|собер[её]т|оценит|опишет|распишет|покажет|расскажет|подумает|выберет|договорится|созвонится|запланирует|подаст|пройд[её]т)';
// The lead that makes a clause an obligation, and how much of it to drop from the text.
const ME=new RegExp('^(?:я\\s+(?:тоже\\s+|еще\\s+|ещё\\s+)?|мне\\s+)('+ME_DO+')(?=\\s|$)','iu');
const ME_ON=/^(?:с\s+меня|за\s+мной|на\s+мне)(?:\s*[:—-])?\s+/iu;
const THEM_ON=/^(?:с\s+него|с\s+нее|с\s+неё|за\s+ним|за\s+ней|на\s+нем|на\s+нём|на\s+ней)(?:\s*[:—-])?\s+/iu;
const DROP_VERB=/^(?:обещал\p{L}*|пообещал\p{L}*|обещаю|должен|должна|нужно|надо|беру\s+на\s+себя|взял\p{L}*\s+на\s+себя|берет\s+на\s+себя|берёт\s+на\s+себя)$/iu;
const AGREED=/^(?:и\s+|а\s+также\s+|также\s+|еще\s+|ещё\s+)?(?:мы\s+)?(?:договорились|решили|условились)(?:\s*,?\s*что|\s*:)?\s*/iu;
const WEEKDAY_GEN={'понедельник':1,'понедельника':1,'вторник':2,'вторника':2,'среду':3,'среды':3,'четверг':4,'четверга':4,'пятницу':5,'пятницы':5,'пятнице':5,'субботу':6,'субботы':6,'субботе':6,'воскресенье':0,'воскресенья':0,'воскресенью':0,'понедельнику':1,'вторнику':2,'среде':3,'четвергу':4};

const capital=t=>t?t[0].toLocaleUpperCase('ru')+t.slice(1):t;
const tidy=t=>String(t||'').replace(/\s{2,}/g,' ').replace(/^[\s,:;—–-]+|[\s,:;—–.-]+$/gu,'').trim();

// A due date in the clause: {due:'YYYY-MM-DD', rest: the clause without the date words} or {due:'', rest}.
function due(clause,now){
 const today=text.dayStart(now);let m;
 const at=(d,re)=>({due:text.ymd(d),rest:tidy(clause.replace(re,' '))});
 m=/(?:^|\s)(?:до|к|ко)\s+(понедельник[ау]?|вторник[ау]?|сред[уеы]|четверг[ау]?|пятниц[уеы]|суббот[уеы]|воскресень[еяю])(?=$|[\s,.;])/iu.exec(clause);
 if(m){const want=WEEKDAY_GEN[m[1].toLocaleLowerCase('ru')];const d=new Date(today);do d.setDate(d.getDate()+1);while(d.getDay()!==want);return at(d,m[0]);}
 m=/(?:^|\s)(?:в|во)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?=$|[\s,.;])/iu.exec(clause);
 if(m){const want=WEEKDAY_GEN[m[1].toLocaleLowerCase('ru')];const d=new Date(today);do d.setDate(d.getDate()+1);while(d.getDay()!==want);return at(d,m[0]);}
 m=/(?:^|\s)(?:до|к|ко)\s+(\d{1,2})(?:[./](\d{1,2})(?:[./](\d{2,4}))?|\s+([а-яё]+))?(?:-?го)?(?=$|[\s,.;])/iu.exec(clause);
 if(m&&(m[2]||m[4]&&text.monthOf(m[4])>=0||!m[4])){
  const month=m[2]?Number(m[2])-1:m[4]?text.monthOf(m[4]):today.getMonth();
  let d=new Date(m[3]?Number(m[3].length===2?'20'+m[3]:m[3]):today.getFullYear(),month,Number(m[1]));
  if(d.getDate()!==Number(m[1]))return {due:'',rest:clause};
  if(d<today&&!m[3]){if(m[2]||m[4])d.setFullYear(d.getFullYear()+1);else d=new Date(today.getFullYear(),today.getMonth()+1,Number(m[1]));}
  return at(d,m[0]);
 }
 m=/(?:^|\s)послезавтра(?=$|[\s,.;])/iu.exec(clause);if(m)return at(new Date(today.getTime()+2*DAY),m[0]);
 m=/(?:^|\s)(?:до\s+)?завтра(?=$|[\s,.;])/iu.exec(clause);if(m)return at(new Date(today.getTime()+DAY),m[0]);
 m=/(?:^|\s)(?:(?:до|к)\s+конц[ау]\s+(?:этой\s+)?недели|на\s+этой\s+неделе)(?=$|[\s,.;])/iu.exec(clause);
 if(m){const d=new Date(today);while(d.getDay()!==5)d.setDate(d.getDate()+1);return at(d,m[0]);}
 m=/(?:^|\s)(?:на\s+следующей\s+неделе|(?:до|к)\s+(?:конц[ау]\s+)?следующей\s+недел\p{L}*)(?=$|[\s,.;])/iu.exec(clause);
 if(m){const d=new Date(today);d.setDate(d.getDate()+1);while(d.getDay()!==1)d.setDate(d.getDate()+1);d.setDate(d.getDate()+4);return at(d,m[0]);}
 m=/(?:^|\s)(?:до|к)\s+конц[ау]\s+(?:этого\s+)?месяца(?=$|[\s,.;])/iu.exec(clause);
 if(m)return at(new Date(today.getFullYear(),today.getMonth()+1,0),m[0]);
 m=/(?:^|\s)через\s+(\d{1,2}|неделю|две\s+недели)\s*(дн\p{L}*|недел\p{L}*)?(?=$|[\s,.;])/iu.exec(clause);
 if(m){const n=/неделю/iu.test(m[1])?7:/две/iu.test(m[1])?14:Number(m[1])*(/недел/iu.test(m[2]||'')?7:1);if(n>0&&n<=120)return at(new Date(today.getTime()+n*DAY),m[0]);}
 return {due:'',rest:clause};
}

// Clauses of the notes: lines, «;», sentences, bullets and «, я …» / «, он …» inside a sentence.
function clauses(body){
 return String(body||'').split(/\n+|;\s*|(?<=[.!?])\s+(?=[\p{Lu}\d«"])|(?:^|\s)[•·]\s+|,\s+(?=(?:а\s+|и\s+|но\s+)?(?:я|мне|с\s+меня|за\s+мной|он|она|с\s+него|с\s+нее|с\s+неё)\s)/iu).map(l=>l.replace(/^\s*(?:[-–—*]|\d+[.)])\s+/u,'').trim()).filter(l=>l.length>=4).slice(0,40);
}

// {followups:[{text, owner:'me'|'them', due, quote}]} from the notes about `member`.
function extract(body,{member,members=[],now=Date.now()}={}){
 const out=[];
 const nameOf=word=>member&&text.member(word,[member])?member:null;
 for(const raw of clauses(body)){
  let c=raw.replace(AGREED,'').replace(/^(?:и|а|но|еще|ещё|плюс)\s+/iu,'').trim();
  let owner='',rest='';
  let m=ME.exec(c);
  if(m){owner='me';rest=DROP_VERB.test(m[1])?c.slice(m[0].length):m[1]+c.slice(m[0].length);}
  else if((m=ME_ON.exec(c))){owner='me';rest=c.slice(m[0].length);}
  else if((m=THEM_ON.exec(c))){owner='them';rest=c.slice(m[0].length);}
  else{
   // «Олег сделает …», «Олег Смирнов обещал …», «он подготовит …».
   const words=c.split(/\s+/);
   for(const n of [2,1]){
    if(words.length<=n)continue;
    const subject=words.slice(0,n).join(' ');
    const isThem=/^(?:он|она)$/iu.test(subject)||!!nameOf(subject);
    if(!isThem)continue;
    const v=new RegExp('^'+THEM_DO+'(?=\\s|$)','iu').exec(words.slice(n).join(' '));
    if(!v)continue;
    owner='them';const after=words.slice(n).join(' ');rest=DROP_VERB.test(v[0])?after.slice(v[0].length):after;break;
   }
   // Someone else of the team promised it: not a follow-up between the two of you.
   if(!owner)continue;
  }
  rest=rest.replace(/^(?:что\s+)?(?:я\s+|он\s+|она\s+)?/iu,'').trim();
  const d=due(rest,now);
  const t=capital(tidy(d.rest)).slice(0,300);
  if(t.length<3)continue;
  if(out.some(f=>f.text===t&&f.owner===owner))continue;
  out.push({text:t,owner,due:d.due,quote:raw.slice(0,300)});
 }
 return {followups:out.slice(0,20)};
}
module.exports={extract,due,clauses};
