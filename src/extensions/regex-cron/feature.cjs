// «Регулярки и cron»: explains, tests and writes regular expressions and cron schedules in the chat.
// Everything checkable is checked by code, not by the model: a pattern is run on the samples (with a time limit),
// a cron expression is parsed and its next runs computed. The model only explains and drafts, and a drafted
// pattern is shown only after it passed its own examples.
const kit=require('../app-kit.cjs');
const cron=require('./cron.cjs');
const regex=require('./regex.cjs');
const ID='regex-cron',BY='Регулярки и cron';
const REGEX=/регулярк\p{L}*|регулярн\p{L}* выражени\p{L}*|регэксп\p{L}*|регекс\p{L}*|(?:^|[^\p{L}])regexp?(?=$|[^\p{L}])|regular expression/iu;
const CRON=/(?:^|[^\p{L}])(?:cron|crontab|крон\p{L}{0,3}|кронтаб\p{L}*)(?=$|[^\p{L}])/iu;
const BUILD=/(?:напиши|составь|сделай|собери|придумай|нужн\p{L}*|подбери|сгенерируй|как (?:написать|составить))/iu;
const EXPLAIN=/(?:объясни|что (?:значит|означает|делает|ловит)|расшифруй|разбери|как работает)/iu;

function kind(text){
 if(CRON.test(text))return 'cron';
 if(REGEX.test(text))return 'regex';
 return null;
}
const PARTS={type:'array',items:{type:'object',properties:{part:{type:'string'},meaning:{type:'string'}},required:['part','meaning']},maxItems:12};

async function explain(s,pattern){
 const r=await kit.modelJSON(s,{system:'Разбери регулярное выражение на части по порядку. part — точный фрагмент выражения, meaning — коротко по-русски, что он ловит. Без лишнего.',
  user:{pattern},schema:{type:'object',properties:{parts:PARTS,summary:{type:'string'}},required:['parts','summary']}});
 if(!r)return null;
 // A part the model made up (not in the pattern) is dropped rather than shown.
 return {summary:String(r.summary||'').slice(0,300),parts:(r.parts||[]).filter(p=>p.part&&pattern.includes(p.part)).map(p=>({part:p.part,meaning:String(p.meaning).slice(0,200)}))};
}
function verdict(rows,expect){return rows.map(r=>({...r,expect,ok:expect==='match'?r.matches.length>0:r.matches.length===0}));}

async function draftRegex(s,request){
 const schema={type:'object',properties:{pattern:{type:'string'},flags:{type:'string'},explanation:{type:'string'},shouldMatch:{type:'array',items:{type:'string'},maxItems:6},shouldNotMatch:{type:'array',items:{type:'string'},maxItems:6}},required:['pattern','flags','explanation','shouldMatch','shouldNotMatch']};
 let feedback='';
 for(let attempt=0;attempt<2;attempt++){
  const r=await kit.modelJSON(s,{system:'Составь регулярное выражение JavaScript по просьбе. Дай 3–5 строк, которые должны совпасть, и 3–5 похожих, которые не должны. Флаги — только из dimsuy.',
   user:request+feedback,schema,temperature:attempt?0.1:0.2});
  if(!r?.pattern)return null;
  try{
   const rows=[...verdict(regex.test(r.pattern,r.flags,r.shouldMatch||[]),'match'),...verdict(regex.test(r.pattern,r.flags,r.shouldNotMatch||[]),'no')];
   const failed=rows.filter(x=>!x.ok);
   if(!failed.length||attempt===1)return {pattern:r.pattern,flags:regex.compile(r.pattern,r.flags),summary:String(r.explanation||'').slice(0,300),rows,verified:!failed.length};
   feedback='\nПрошлый вариант '+r.pattern+' ошибся на: '+failed.map(x=>x.line+(x.expect==='match'?' (должна совпасть)':' (не должна)')).join('; ');
  }catch(e){feedback='\nПрошлый вариант не работает: '+e.message;}
 }
 return null;
}

async function regexTurn(s,command){
 const found=regex.extract(command);
 if(!found){
  if(!BUILD.test(command))return kit.reply(s,command,{by:BY,question:true,text:'Пришлите выражение (например, /^\\d{3}$/ или в `обратных кавычках`) и строки для проверки — или скажите, что оно должно ловить, и я составлю его.'});
  s.requestProgress?.report('Составляю выражение и проверяю на примерах');
  const draft=await draftRegex(s,command);
  if(!draft)return kit.reply(s,command,{by:BY,error:true,text:s.settings.model?'Не получилось составить выражение, которое проходит свои примеры. Уточните, что именно должно совпадать.':'Чтобы составить выражение, выберите локальную модель в настройках. Проверить готовое выражение можно и без неё.'});
  const text=(draft.verified?'Составил и проверил на примерах: ':'Составил, но часть примеров не прошла — посмотрите отмеченные строки: ')+'/'+draft.pattern+'/'+draft.flags;
  return kit.reply(s,command,{by:BY,text,data:{regexCard:{mode:'draft',...draft,risky:regex.risky(draft.pattern)}}});
 }
 const lines=regex.samples(command.replace(/\/(?:\\.|[^/\n])+\/[a-z]*|`[^`]+`/u,''));
 let rows=[];
 try{rows=lines.length?regex.test(found.pattern,found.flags,lines):[];regex.compile(found.pattern,found.flags);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:e.message,data:{regexCard:{mode:'error',pattern:found.pattern,flags:found.flags,error:e.message}}});}
 const wantExplain=EXPLAIN.test(command)||!lines.length;
 if(wantExplain)s.requestProgress?.report('Разбираю выражение по частям');
 const explained=wantExplain?await explain(s,found.pattern).catch(()=>null):null;
 const hits=rows.filter(r=>r.matches.length).length;
 const text=lines.length?'Совпадает '+hits+' из '+rows.length+' '+kit.plural(rows.length,['строки','строк','строк'])+'.'+(explained?.summary?' '+explained.summary:''):(explained?.summary||'Выражение корректно. Пришлите строки, чтобы проверить совпадения.');
 return kit.reply(s,command,{by:BY,text,data:{regexCard:{mode:'test',pattern:found.pattern,flags:regex.compile(found.pattern,found.flags),rows,summary:explained?.summary||'',parts:explained?.parts||[],risky:regex.risky(found.pattern)}}});
}

async function cronTurn(s,command,now=new Date()){
 let expression=cron.find(command),drafted=false;
 if(!expression){
  if(!BUILD.test(command)&&!/кажд|по будням|в \d/iu.test(command))return kit.reply(s,command,{by:BY,question:true,text:'Пришлите cron-выражение (например, */15 9-18 * * 1-5) или скажите словами, когда запускать, — составлю и покажу ближайшие запуски.'});
  s.requestProgress?.report('Составляю расписание cron');
  const r=await kit.modelJSON(s,{system:'Составь классическое cron-выражение из 5 полей (минуты часы день месяц день_недели) по просьбе. Только выражение.',user:command,schema:{type:'object',properties:{expression:{type:'string'}},required:['expression']},temperature:0.1});
  if(!r?.expression)return kit.reply(s,command,{by:BY,error:true,text:s.settings.model?'Не смог составить расписание. Скажите точнее: дни и время.':'Чтобы составить расписание словами, выберите локальную модель. Готовое cron-выражение разберу и без неё.'});
  expression=r.expression.trim();drafted=true;
 }
 let parsed;
 try{parsed=cron.parse(expression);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:'«'+expression+'»: '+e.message,data:{cronCard:{expression,error:e.message}}});}
 const description=cron.describe(parsed);
 const runs=cron.next(parsed,now,5).map(d=>d.toISOString());
 const text=(drafted?'Составил: '+expression+' — ':'«'+expression+'» — ')+description+'.';
 return kit.reply(s,command,{by:BY,text,data:{cronCard:{expression,fields:parsed.fields,description,runs,drafted}}});
}

function setup(){return {};}
async function turn(s,command){
 const text=String(command||'');
 const k=kind(text);
 if(!k||!kit.installed(s,ID))return null;
 if(/^(?:а\s+)?(?:что такое|зачем нуж)/iu.test(text.trim())&&!regex.extract(text)&&!cron.find(text))return null;
 return k==='cron'?cronTurn(s,text):regexTurn(s,text);
}
module.exports={name:'regexCron',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,cronTurn,regexTurn};
