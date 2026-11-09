// «Что изменилось в документе»: «что поменяли в GDD за неделю», «сравни спеку лиг с прошлой версией». Finds the
// document (find.cjs: the project's Markdown, Confluence, Google Docs), reads its versions (history.cjs: git history,
// Confluence page versions, Drive revisions with the read-only scope) and compares the version before the period with
// the newest one section by section (diff.cjs). The card shows each changed section with an inline word diff, who
// changed it and when, and a short summary. The summary may only describe the actual changed sections: each point must
// cite hunk numbers, and code drops a point whose numbers or words are not in the hunks it cites (`diff.grounded`).
// Nothing is changed anywhere.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const diff=require('./diff.cjs');
const history=require('./history.cjs');
const find=require('./find.cjs');
const ID='doc-diff',BY='Что изменилось в документе';
const DAY=86400000;

// --- Routing --------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[?!.]+$/u,'').replace(/ё/g,'е').trim();
const DOC='(?:gdd|гдд|диздок\\p{L}*|геймдизайн\\p{L}*(?:[\\s-]+документ\\p{L}*)?|спек\\p{L}*|спецификаци\\p{L}*|документ\\p{L}*|доке|доку|страниц\\p{L}*|вики|wiki|readme|ридми|confluence|конфлюенс\\p{L}*|(?:гугл|google)[\\s-]*док\\p{L}*|google\\s+docs?|регламент\\p{L}*|[\\w./-]+\\.(?:md|markdown)|«[^»]{2,80}»|https://\\S+)';
const DOC_RE=new RegExp(DOC,'iu');
const CHANGED='(?:поменял\\p{L}*|поменялось|изменил\\p{L}*|изменилось|правил\\p{L}*|поправил\\p{L}*|менял\\p{L}*|менялось|переписал\\p{L}*|дописал\\p{L}*|добавил\\p{L}*|внесли)';
const PERIOD='(?:\\s+(?:за|с|со|начиная\\s+с)\\s+(.{2,40}))?';
const CHANGES=[
 new RegExp('^(?:а\\s+)?(?:что|кто\\s+и\\s+что|кто\\s+что|какие\\s+(?:правки|изменения))\\s+(?:\\p{L}+\\s+)?'+CHANGED+'\\s+(?:в|во|на)\\s+(.+?)'+PERIOD+'$','iu'),
 new RegExp('^(?:а\\s+)?(?:какие|покажи)\\s+(?:правки|изменения)\\s+(?:в|во|на)\\s+(.+?)'+PERIOD+'$','iu')
];
const COMPARE=new RegExp('^(?:сравни|сопоставь|покажи\\s+(?:разницу|дифф?|diff)|дифф?|diff)\\s+(.+?)\\s+(?:с|со)\\s+(?:е[её]\\s+|его\\s+)?(?:прошл|предыдущ|прежн|стар|последн)\\p{L}*\\s+(?:верси\\p{L}*|ревизи\\p{L}*|редакци\\p{L}*|правк\\p{L}*)$','iu');
const HISTORY=new RegExp('^(?:покажи\\s+)?(?:истори\\p{L}*\\s+(?:изменений|правок|версий)|кто\\s+(?:менял|правил|редактировал|поменял|изменил))\\s+(.+?)'+PERIOD+'$','iu');
// Code, configs, a repository, tasks, chats and meetings are other apps' changes («что изменилось в коде» is git's).
const NOT=/(?:^|\s)(?:код\p{L}*|репозитори\p{L}*|ветк\p{L}*|коммит\p{L}*|баланс\p{L}*|конфиг\p{L}*|сборк\p{L}*|билд\p{L}*|задач\p{L}*|спринт\p{L}*|тикет\p{L}*|канал\p{L}*|чат\p{L}*|тред\p{L}*|встреч\p{L}*|созвон\p{L}*|календар\p{L}*|почт\p{L}*|диск\p{L}*|таблиц\p{L}*|метрик\p{L}*|релиз\p{L}*|верси[ия]\s+\d|apk|ipa)(?=$|[^\p{L}])/iu;
function days(text){
 const t=String(text||'').toLowerCase();if(!t.trim())return null;
 let m=/(\d{1,3})\s*(?:дн|день|сут)/u.exec(t);if(m)return Math.min(365,Math.max(1,Number(m[1])));
 m=/(\d{1,2})\s*недел/u.exec(t);if(m)return Math.min(365,Number(m[1])*7);
 m=/(\d{1,2})\s*месяц/u.exec(t);if(m)return Math.min(365,Number(m[1])*30);
 if(/недел/u.test(t))return 7;if(/месяц/u.test(t))return 30;if(/квартал/u.test(t))return 90;if(/год/u.test(t))return 365;
 if(/сегодня/u.test(t))return 1;if(/вчера/u.test(t))return 2;
 return null;
}
function kind(text){
 const t=clean(text);
 if(!t||t.length>600||/^\/|(?:^|\s)скилл/iu.test(t))return null;
 let m,mode;
 for(const r of CHANGES)if((m=r.exec(t)))break;
 if(m)mode='changes';
 else if((m=COMPARE.exec(t)))mode='previous';
 else if((m=HISTORY.exec(t)))mode='changes';
 else return null;
 const subject=m[1].trim();
 if(!DOC_RE.test(subject)||NOT.test(subject))return null;
 const d=mode==='previous'?null:days(m[2]||'');
 return {kind:'diff',subject,days:d,mode:d?'period':'previous'};
}

// --- Summary --------------------------------------------------------------------------------------------------------
const clip=(t,n=300)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const STATUS={added:'Добавлен раздел',removed:'Удалён раздел',changed:'Изменён раздел'};
const ruleItems=hunks=>hunks.slice(0,6).map(h=>({text:STATUS[h.status]+' «'+h.title+'»',hunks:[h.n]}));
async function summary(s,hunks){
 if(!hunks.length)return {items:[],by:'rules',dropped:0};
 if(s.settings.model){
  try{
   const r=await kit.modelJSON(s,{system:'Кратко перескажи по-русски изменения документа: до 5 пунктов. Каждый пункт — одно предложение только о том, что видно в изменениях, с номерами изменений, на которых он основан (hunks). Не додумывай причин и того, чего нет в тексте изменений.',
    user:{changes:hunks.slice(0,20).map(h=>({n:h.n,section:h.path||h.title,status:h.status,removed:clip(h.ops.filter(o=>o.op==='del').map(o=>o.text).join(' … '),600),added:clip(h.ops.filter(o=>o.op==='ins').map(o=>o.text).join(' … '),600)}))},
    schema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{text:{type:'string'},hunks:{type:'array',items:{type:'integer'}}},required:['text','hunks']}}},required:['items']},predict:600,temperature:0.2});
   const all=(r?.items||[]).filter(x=>typeof x?.text==='string'&&x.text.trim()).slice(0,8).map(x=>({text:clip(x.text,280),hunks:[...new Set((x.hunks||[]).map(Number))]}));
   // Only points that describe the hunks they cite stay.
   const ok=all.filter(x=>diff.grounded(x,hunks));
   if(ok.length)return {items:ok.slice(0,5),by:'model',dropped:all.length-ok.length};
   return {items:ruleItems(hunks),by:'rules',dropped:all.length};
  }catch{/* rules */}
 }
 return {items:ruleItems(hunks),by:'rules',dropped:0};
}

// --- The turn -------------------------------------------------------------------------------------------------------
const SOURCE={git:'репозиторий',confluence:'Confluence',google:'Google Документы'};
async function read(s,c,range,deps){
 if(c.source==='git')return history.gitHistory({dir:c.dir,rel:c.rel},range,{git:deps.git||history.runGit,now:deps.now||new Date()});
 if(c.source==='confluence')return history.confluenceHistory(s,{id:c.id},range);
 return history.googleHistory(s,{id:c.id},range,{fetchText:deps.fetchText});
}
async function diffTurn(s,command,intent,deps={}){
 const now=deps.now||new Date();
 const range=intent.mode==='period'?{mode:'period',since:new Date(+now-intent.days*DAY)}:{mode:'previous'};
 const run=async c=>{
  if(!c)return kit.reply(s,command,{by:BY,text:'Такого документа нет среди вариантов. Повторите запрос.',error:true});
  s.requestProgress?.report?.('Читаю версии: '+c.title);
  let h;
  try{h=await read(s,c,range,deps);}catch(e){return kit.failure(s,command,BY,e);}
  if(!h.versions.length){
   const text='«'+h.doc.title+'» ('+SOURCE[h.doc.source]+')'+(range.mode==='period'?' за '+intent.days+' '+kit.plural(intent.days,['день','дня','дней'])+' не менялся.':' — изменений не нашёл.');
   return kit.reply(s,command,{by:BY,text,data:{docDiffCard:{doc:h.doc,range:{mode:range.mode,days:intent.days||0,since:range.since?.toISOString()||''},versions:[],hunks:[],summary:{items:[],by:'rules',dropped:0},totals:{added:0,removed:0,sections:0},notes:h.notes}}});
  }
  const hunks=history.changes(h);
  const sum=await summary(s,hunks);
  const totals={added:hunks.reduce((n,x)=>n+x.added,0),removed:hunks.reduce((n,x)=>n+x.removed,0),sections:hunks.length};
  const authors=[...new Set(h.versions.map(v=>v.author).filter(Boolean))];
  const card={doc:h.doc,range:{mode:range.mode,days:intent.days||0,since:range.since?.toISOString()||'',from:h.versions[0].at},
   versions:h.versions.map(v=>({id:v.id,label:v.label,author:v.author,at:v.at,url:v.url||'',local:!!v.local})),
   hunks:hunks.slice(0,40).map(x=>({n:x.n,title:x.title,path:x.path,level:x.level,status:x.status,ops:x.ops,added:x.added,removed:x.removed,by:x.by,at:x.at})),
   summary:sum,totals,notes:h.notes};
  const when=range.mode==='period'?'за '+intent.days+' '+kit.plural(intent.days,['день','дня','дней']):'в последней правке';
  const text=!hunks.length?'«'+h.doc.title+'» '+when+': правки без изменений текста.':
   '«'+h.doc.title+'» '+when+': '+hunks.length+' '+kit.plural(hunks.length,['раздел изменён','раздела изменено','разделов изменено'])+(authors.length?', '+authors.slice(0,3).join(', '):'')+'. '+sum.items.slice(0,3).map(i=>i.text.replace(/[.\s]+$/,'')).join('; ')+'.';
  return kit.reply(s,command,{by:BY,text,data:{docDiffCard:card},sources:h.doc.url?[{title:h.doc.title,url:h.doc.url}]:[]});
 };
 const found=await find.resolve(s,intent.subject,{git:deps.git||history.runGit});
 if(found.one)return run(found.one);
 if(found.many){
  const label=c=>c.label;
  return ask({text:'Какой документ сравнить?',label:'Документ',options:found.many.map(label),strictChoices:true},answer=>run(found.many.find(c=>label(c)===String(answer).trim())));
 }
 const roots=find.repos(find.projectRoots(s));
 return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл документ «'+clip(intent.subject,80)+'»'+(roots.length?' в репозитории проекта':'')+(find.confluenceReady(s.settings)?', Confluence':'')+(s.settings['extension_google-drive']==='true'?' и Google Документах':'')+'. Пришлите ссылку или путь к .md-файлу.'+(found.notes?.length?' '+found.notes.join(' '):'')});
}

async function turn(s,command,deps={}){
 if(!kit.installed(s,ID))return null;
 const intent=kind(command);if(!intent)return null;
 try{return await diffTurn(s,String(command),intent,deps);}
 catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'docDiff',defaults:{['extension_'+ID]:'false'},validate(){},setup(){return {};},turn,kind,days,summary,teardown(){},
 dashboard:{accepts:command=>!!kind(command),size:'l',widgets:[]}};
