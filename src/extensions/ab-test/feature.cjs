// «A/B-тесты»: significance, intervals, SRM and sample size for game experiments, entirely local.
// Numbers come from the request («A: 1000 игроков 120 конверсий, B: 980 и 141»), a pasted table or an attached
// CSV, parsed by code. Only free-form text the parser cannot read is handed to the local model, and only to
// extract numbers into a fixed schema; an extracted number that does not literally occur in the text is refused.
// Every number on the card is computed by code (stats.cjs / analyze.cjs).
const kit=require('../app-kit.cjs');
const parse=require('./parse.cjs');
const {analyze,plan}=require('./analyze.cjs');
const ID='ab-test',BY='A/B-тесты';

const W='(?:^|[^\\p{L}\\p{N}])',E='(?=$|[^\\p{L}\\p{N}])';
const re=s=>new RegExp(s,'iu');
const AB=re(W+'(?:a\\s?/\\s?b|а\\s?/\\s?б|ab[- ]?тест\\p{L}*|аб[- ]?тест\\p{L}*|ab[- ]?test\\p{L}*|сплит[- ]?тест\\p{L}*|split[- ]?test\\p{L}*|srm)'+E);
const SIGNIFICANT=re('значим\\p{L}*|статистическ\\p{L}* (?:значим|разниц)|p[- ]?value|пи[- ]?вэлью');
const TEST_WORD=re(W+'(?:тест\\p{L}{0,4}|эксперимент\\p{L}*|вариант\\p{L}*|групп\\p{L}*|разниц\\p{L}*|результат\\p{L}*|конверси\\p{L}*|контрол\\p{L}*)'+E);
const SAMPLE=re('сколько\\s+(?:нужно|надо|потребуется|нужно будет)\\s+(?:игроков|пользователей|юзеров|установок|людей|человек|трафика)\\s+(?:для|на|в)\\s+(?:a\\s?/\\s?b[- ]?)?(?:тест|эксперимент)|размер\\p{L}* выборки|мощност\\p{L}* (?:теста|эксперимента|a\\s?/\\s?b)');
const WAIT=re('сколько\\s+(?:ещё|еще)\\s+(?:ждать|крутить|держать|гонять)');
const DATA_WORDS=re('конверси\\p{L}*|игрок\\p{L}*|пользовател\\p{L}*|покуп\\p{L}*|контрол\\p{L}*|вариант\\p{L}*|групп\\p{L}*');
// CI tests, code tests and regex tests are other apps' subjects.
const AVOID=re('(?:тест\\p{L}*|test\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:упал|упали|упала|сломал\\p{L}*|красн\\p{L}*|не прош\\p{L}*|пада\\p{L}*|fail\\p{L}*)|(?:упал\\p{L}*|сломал\\p{L}*|красн\\p{L}*|пада\\p{L}*)\\s+(?:\\p{L}+\\s+)?тест|(?:напиши|написать|допиши|добавь|покрой|сгенерируй)\\p{L}*\\s+(?:\\p{L}+\\s+)?тест|юнит[- ]?тест|unit[- ]?test|автотест|интеграционн\\p{L}* тест|e2e|покрыти\\p{L}*|регулярк\\p{L}*|регэксп|regex|(?:запусти|прогони)\\p{L}*\\s+тест');
const QUIET=/^(?:а\s+)?(?:что такое|зачем нуж|объясни,? что такое|как работает)/iu;

function attachedTables(s){
 let files=[];try{files=s.attachments?.list?.()||[];}catch{files=[];}
 return files.filter(f=>/\.(?:csv|tsv|txt)$/i.test(f.name||'')).map(f=>({id:f.id,name:f.name,text:String(s.attachments.pending?.get?.(f.id)?.text||'')})).filter(f=>f.text);
}

// What the request asks for: 'wait', 'plan', 'analyze', or null.
function intent(s,text){
 const t=String(text||'').trim();
 if(!t||t.length>20000)return null;
 if(AVOID.test(t))return null;
 const head=t.split('\n')[0];
 if(QUIET.test(head)&&!parse.fromText(t))return null;
 if(WAIT.test(t)&&(AB.test(t)||/тест|эксперимент/iu.test(t)||lastCard(s)))return 'wait';
 if(SAMPLE.test(t))return 'plan';
 if(AB.test(t))return 'analyze';
 if(SIGNIFICANT.test(t)&&(TEST_WORD.test(t)||parse.fromText(t)||attachedTables(s).length))return 'analyze';
 // Bare numbers by group with test vocabulary: «A: 1000 игроков 120 конверсий, B: 980 и 141».
 const parsed=parse.fromText(t);
 if(parsed&&parsed.metric!=='assignment'&&DATA_WORDS.test(t))return 'analyze';
 return null;
}

function lastCard(s){
 const messages=s.dialogue?.active?.()?.messages||[];
 for(let i=messages.length-1;i>=0;i--)if(messages[i].extensionData?.abTestCard)return messages[i].extensionData.abTestCard;
 return null;
}

// Moves the used attachment from the composer into the chat, like other extensions do.
function adopt(s,used){
 if(!used.length)return;
 try{
  const rows=s.attachments.take(used.map(f=>f.id)),topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]),...rows.filter(f=>!topic.attachments?.some(old=>old.id===f.id))];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=rows.map(f=>s.attachments.info(f));
  for(const f of rows)s.attachments.remove(f.id);
  s.dialogue.persist();
 }catch{/* attachments stay in the composer */}
}

// Free-form text the parser could not read: the model only fills a schema, and every number must occur in the text.
const SCHEMA={type:'object',properties:{metric:{type:'string',enum:['conversion','mean','none']},variants:{type:'array',maxItems:8,items:{type:'object',properties:{name:{type:'string'},users:{type:'number'},conversions:{type:'number'},mean:{type:'number'},sd:{type:'number'}},required:['name','users']}}},required:['metric','variants']};
async function extract(s,text){
 if(!s.settings.model)return null;
 const r=await kit.modelJSON(s,{system:'Выпиши из текста числа A/B-теста по группам: name — имя группы, users — сколько игроков в группе, conversions — сколько из них сконвертировались (или mean и sd — среднее и стандартное отклонение). Бери только числа, которые есть в тексте; ничего не придумывай и не считай. Если чисел нет — metric none.',user:text.slice(0,6000),schema:SCHEMA,predict:600,temperature:0}).catch(()=>null);
 if(!r||r.metric==='none'||!Array.isArray(r.variants)||r.variants.length<2)return null;
 const seen=parse.numbersIn(text);
 const keys=r.metric==='mean'?['users','mean','sd']:['users','conversions'];
 const variants=r.variants.map(v=>({name:parse.canonical(String(v.name||'').slice(0,40)),...Object.fromEntries(keys.map(k=>[k,Number(v[k])]))}));
 if(variants.some(v=>!v.name||keys.some(k=>!Number.isFinite(v[k])||!seen.has(v[k]))))return null;
 return {metric:r.metric,variants,source:'model'};
}

function reply(s,command,card,extra=''){
 return kit.reply(s,command,{by:BY,text:card.summary+extra,data:{abTestCard:card}});
}

async function analyzeTurn(s,command){
 const tables=attachedTables(s);
 let input=parse.fromTable(command)||parse.fromText(command),used=[];
 if(!input)for(const f of tables){input=parse.fromTable(f.text)||parse.fromText(f.text);if(input){input.source='csv';input.file=f.name;used=[f];break;}}
 if(!input&&(command.match(/\d+/g)||[]).length>=4){s.requestProgress?.report('Выписываю числа теста');input=await extract(s,command);}
 if(!input)return kit.reply(s,command,{by:BY,question:true,text:'Пришлите числа по группам, например: «A: 1000 игроков 120 конверсий, B: 980 и 141», вставьте таблицу (вариант, игроки, конверсии) или прикрепите CSV с колонками variant и value — посчитаю значимость, интервалы и SRM.'+(tables.length&&!s.settings.model?' В прикреплённом файле не нашёл колонок варианта и значений.':'')});
 const card=analyze({...input,...parse.extras(command)});
 if(input.file)card.file=input.file;
 adopt(s,used);
 return reply(s,command,card);
}

function planTurn(s,command){
 const t=parse.joinThousands(command).toLowerCase(),x=parse.extras(command);
 const base=t.match(/(?:конверси\p{L}*|cr|базов\p{L}*|сейчас|текущ\p{L}*)\D{0,20}(\d+(?:[.,]\d+)?)\s*%/u)||t.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:конверси|cr)/u);
 const groups=Math.min(8,Math.max(2,Number(t.match(/(\d)\s*(?:групп|вариант)/u)?.[1])||2));
 const resume=baseline=>{const card=plan({baseline,mde:x.mde,alpha:x.alpha,groups,dailyTraffic:x.dailyTraffic});return reply(s,command,card,x.mde?'':' Минимальный эффект — 10% по умолчанию; скажите другой, например «MDE 5%».');};
 if(base)return resume(Number(base[1].replace(',','.'))/100);
 return require('../../input-required.cjs').ask({text:'Какая сейчас конверсия, которую будет менять тест? Например, 4%.',label:'Текущая конверсия',placeholder:'например, 4%'},answer=>{
  const v=Number(String(answer).replace(',','.').match(/\d+(?:\.\d+)?/)?.[0]);
  if(!(v>0&&v<100))return kit.reply(s,command,{by:BY,question:true,text:'Не понял конверсию. Напишите процент, например «4%», и я посчитаю размер выборки.'});
  return resume(v/100);
 });
}

// «Сколько ещё ждать?»: days to reach the planned sample at the daily traffic, from the last result in this chat.
function waitTurn(s,command){
 const card=lastCard(s);
 if(!card||!card.power?.required)return kit.reply(s,command,{by:BY,question:true,text:'Сначала пришлите числа теста по группам — тогда скажу, сколько игроков ещё нужно и сколько дней это займёт.'});
 const x=parse.extras(command);
 const finish=daily=>{
  const p=card.power,remaining=Math.max(0,p.required*card.variants.length-card.variants.reduce((a,v)=>a+v.users,0));
  const days=Math.ceil(remaining/daily);
  const next={...card,power:{...p,dailyTraffic:Math.round(daily),trafficGiven:true,waitDays:days}};
  const text=remaining?'Нужно ещё ~'+remaining.toLocaleString('ru-RU')+' '+kit.plural(remaining,['игрок','игрока','игроков'])+' во всех группах: при '+Math.round(daily).toLocaleString('ru-RU')+' в день это ~'+days+' '+kit.plural(days,['день','дня','дней'])+'. Смотрите на результат после этого, а не каждый день.':'Выборки уже хватает для эффекта '+Math.round(p.mde*100)+'% — ждать не нужно.';
  return kit.reply(s,command,{by:BY,text,data:{abTestCard:next}});
 };
 const daily=x.dailyTraffic||card.power.dailyTraffic;
 if(daily>0)return finish(daily);
 return require('../../input-required.cjs').ask({text:'Сколько игроков в день попадает в тест (во все группы вместе)?',label:'Трафик в день',placeholder:'например, 800'},answer=>{
  const v=Number(parse.joinThousands(String(answer)).replace(/\s/g,'').replace(',','.').match(/\d+(?:\.\d+)?/)?.[0]);
  if(!(v>0))return kit.reply(s,command,{by:BY,question:true,text:'Не понял число. Напишите, сколько игроков в день приходит в тест, например «800».'});
  return finish(v);
 });
}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID))return null;
 const kind=intent(s,text);
 if(!kind)return null;
 try{
  if(kind==='wait')return waitTurn(s,text);
  if(kind==='plan')return planTurn(s,text);
  return await analyzeTurn(s,text);
 }catch(e){
  if(e instanceof require('../../input-required.cjs').InputRequired)throw e;
  return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message});
 }
}
module.exports={name:'abTest',defaults:{['extension_'+ID]:'false'},validate(){},setup(){return {};},turn,intent,extract};
