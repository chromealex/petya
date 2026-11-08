// «Локализация»: checks the project's localization files and translates missing strings with the local model.
// Files: Unity String Tables, I2 / plain CSV and TSV, JSON, Android strings.xml, iOS .strings / .xcstrings, .po.
// Checks are code (missing, empty, identical to source, placeholder mismatches, too long); the model only
// translates, its output is verified, and translations are written to NEW files only after «Сохранить переводы».
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const kit=require('../app-kit.cjs');
const langs=require('./langs.cjs');
const checks=require('./checks.cjs');
const formats=require('./formats.cjs');
const find=require('./find.cjs');
const {translate}=require('./translate.cjs');
const ID='localization',BY='Локализация',NOTICE='localization-translate';
const MAX_TRANSLATE=400,PENDING_TTL=6*3600000;

const LOC=/локализац\p{L}*|(?:^|[^\p{L}])(?:l10n|i18n)(?=$|[^\p{L}])|ключ\p{L}* (?:перевод|локализ)\p{L}*|(?:файл|строк|таблиц)\p{L}* (?:перевод|локализ)\p{L}*|string ?tables?|strings\.xml|xcstrings|(?:^|[^\p{L}])i2 ?loc|\.po(?=$|[^\p{L}])|\.strings(?=$|[^\p{L}])|плейсхолдер\p{L}*/iu;
const UNTRANSLATED=/(?:что|какие|сколько|где)[^.?!]{0,30}не переведен\p{L}*|непереведённ\p{L}*|непереведенн\p{L}*|недостающ\p{L}* (?:ключ|перевод|строк)\p{L}*|пропущенн\p{L}* (?:ключ|перевод)\p{L}*/iu;
const FILL=/(?:переведи|перевести|допереведи|доперевести)\s+(?:все\s+|мне\s+)?(?:недостающ\p{L}*|пуст\p{L}*|непереведённ\p{L}*|непереведенн\p{L}*|оставш\p{L}*|отсутствующ\p{L}*)/iu;
const TRANSLATE=/(?:^|[^\p{L}])(?:переведи|перевести|допереведи|доперевести)(?=$|[^\p{L}])/iu;
// Money transfers, task statuses and translating a phrase are someone else's.
const AVOID=/деньг\p{L}*|денежн\p{L}*|оплат\p{L}*|плат[её]ж\p{L}*|рубл\p{L}*|доллар\p{L}*|(?:^|[^\p{L}])евро|на карту|на сч[её]т|в статус|задач\p{L}*|тикет\p{L}*|в колонку|переведи (?:эту|этот|эти|фразу|текст|слово|предложение|письмо|сообщение)/iu;

const attachedFiles=s=>{try{return (s.attachments?.list?.()||[]).filter(f=>/\.(?:csv|tsv|json|xml|strings|xcstrings|po|pot|asset)$/i.test(f.name||''));}catch{return [];}};
function wanted(s,text){
 if(AVOID.test(text))return false;
 if(LOC.test(text)||UNTRANSLATED.test(text)||FILL.test(text))return true;
 return attachedFiles(s).length>0&&/(?:провер\p{L}*|переведи|перевести|что не|недостающ)/iu.test(text);
}
// Target languages named in the request; «с английского на немецкий» → de.
function targets(text){
 const t=String(text).replace(/(?:^|\s)с\s+\p{L}+(?:ого|ого языка)(?=$|[^\p{L}])/giu,' ');
 const codes=[...t.matchAll(/(?:^|\s)(?:на|для)\s+([a-z]{2}(?:-[A-Za-z]{2,4})?)(?=$|[^\p{L}])/giu)].map(m=>langs.code(m[1])).filter(Boolean);
 return [...new Set([...codes,...langs.requested(t)])];
}

// --- notifications (translation can take minutes) ---------------------------------------------------
let operation=null;
function publish(s,text,{busy=false,percent,kind='info'}={}){
 operation={id:NOTICE,title:'Локализация',text,busy,kind,...(percent!==undefined?{percent}:{})};
 try{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('extension-install-progress',operation);}catch{/* window closed */}
}

// --- pending translations (saved only on «Сохранить переводы») ---------------------------------------
const pending=new Map();
const prune=()=>{for(const [k,v] of pending)if(Date.now()-v.at>PENDING_TTL)pending.delete(k);};

function aggregate(results){
 const by=new Map();
 for(const r of results){const a=by.get(r.lang)||{lang:r.lang,name:r.name,total:0,translated:0,missing:0,empty:0,identical:0,placeholders:0,long:0,sets:[]};
  for(const k of ['total','translated','missing','empty','identical','placeholders','long'])a[k]+=r[k];a.sets.push(r.set);by.set(r.lang,a);}
 return [...by.values()].sort((a,b)=>a.translated/(a.total||1)-b.translated/(b.total||1));
}
const KINDS={missing:'нет перевода',empty:'пусто',identical:'как в исходнике',placeholders:'плейсхолдеры',long:'длинные'};
function summary(rows,sets,source){
 if(!rows.length)return 'В '+sets.map(x=>x.name).join(', ')+' только исходный язык ('+source+') — сравнивать не с чем.';
 const lines=rows.slice(0,5).map(r=>{const parts=Object.keys(KINDS).filter(k=>r[k]).map(k=>KINDS[k]+' '+r[k]);
  return r.name[0].toUpperCase()+r.name.slice(1)+': переведено '+r.translated+' из '+r.total+(parts.length?' ('+parts.join(', ')+')':'')+'.';});
 return 'Проверил '+sets.length+' '+kit.plural(sets.length,['набор','набора','наборов'])+' ('+sets.map(x=>x.name).join(', ')+'), исходный язык — '+langs.name(source)+'.\n'+lines.join('\n')+(rows.length>5?'\nЕщё языков: '+(rows.length-5)+' — в карточке.':'');
}

function adopt(s,used){
 if(!used.length)return;
 try{
  const rows=s.attachments.take(used.map(f=>f.id)),topic=s.dialogue.active();
  topic.attachments=[...(topic.attachments||[]),...rows.filter(f=>!topic.attachments?.some(old=>old.id===f.id))];
  const user=topic.messages.at(-2);if(user?.role==='user')user.attachments=rows.map(f=>s.attachments.info(f));
  for(const f of rows)s.attachments.remove(f.id);s.dialogue.persist();
 }catch{/* attachments stay in the composer */}
}

async function run(s,command){
 const text=String(command);
 const ratio=Number(s.settings.localizationLengthRatio)||1.4,preferred=langs.code(s.settings.localizationSourceLanguage)||'en';
 const only=targets(text);
 const wantsTranslation=FILL.test(text)||TRANSLATE.test(text)&&(LOC.test(text)||UNTRANSLATED.test(text)||/ключ|строк/iu.test(text));
 const att=await find.attached(s);
 const roots=find.projectRoots(s);
 let parts;
 if(att.length)parts=att.map(a=>a.part);
 else{
  if(!roots.length)return kit.reply(s,command,{by:BY,question:true,text:'Где файлы локализации? Подключите папку проекта в контексте чата или прикрепите файл: Unity String Table (.asset), CSV/TSV (I2 Localization), JSON, strings.xml, .strings, .xcstrings или .po.'});
  s.requestProgress?.report('Ищу файлы локализации в папке проекта');
  parts=await find.scan(roots);
 }
 const sets=formats.sets(parts,{source:preferred});
 if(!sets.length)return kit.reply(s,command,{by:BY,question:true,text:att.length?'Не узнал формат прикреплённых файлов. Поддерживаю Unity String Tables, CSV/TSV (ключ + колонки языков), JSON, strings.xml, .strings, .xcstrings и .po.':'В папке проекта ('+roots.map(r=>path.basename(r)).join(', ')+') не нашёл файлов локализации. Прикрепите файл или скажите, где они лежат.'});
 const results=[];let problems=[],problemCount=0;
 for(const set of sets){const r=checks.check(set,{ratio,only,limit:300});results.push(...r.rows);problems.push(...r.problems);problemCount+=r.rows.reduce((n,x)=>n+x.missing+x.empty+x.identical+x.placeholders+x.long,0);}
 const all=new Set(sets.flatMap(x=>x.langs));
 if(only.length&&!results.length){const have=[...all].filter(l=>!sets.some(x=>x.source===l));
  return kit.reply(s,command,{by:BY,question:true,text:'В файлах локализации нет языка «'+only.map(langs.name).join(', ')+'». Есть: '+(have.map(langs.name).join(', ')||'только исходный')+'. Добавьте колонку или файл для языка — или назовите другой.'});}
 const rows=aggregate(results);
 problems=problems.sort((a,b)=>Object.keys(KINDS).indexOf(a.kind)-Object.keys(KINDS).indexOf(b.kind)).slice(0,300);
 const source=sets[0].source;
 const card={sets:sets.map(x=>({name:x.name,format:formats.LABELS[x.format],source:x.source,langs:x.langs.length,keys:x.keys.length,files:x.files?.length||1})),source,ratio,only,
  langs:rows,problems,problemCount,filter:/плейсхолдер/iu.test(text)?'placeholders':''};
 let reply=summary(rows,sets,source);
 if(wantsTranslation){
  if(!s.settings.model)reply+='\n\nЧтобы перевести недостающие строки, выберите локальную модель в настройках. Проверка работает и без неё.';
  else{
   const jobs=[];let total=0,capped=false;
   for(const set of sets)for(const lang of set.langs){if(lang===set.source||only.length&&!only.some(o=>langs.same(o,lang)))continue;
    let items=checks.todo(set,lang).filter(x=>!set.plural?.has(x.key));if(total+items.length>MAX_TRANSLATE){items=items.slice(0,MAX_TRANSLATE-total);capped=true;}
    if(items.length){jobs.push({set,lang,items});total+=items.length;}}
   if(!total)reply+='\n\nПереводить нечего: недостающих и пустых строк нет.';
   else{
    const done=[],failed=[];let counted=0;
    publish(s,'Перевожу '+total+' '+kit.plural(total,['строку','строки','строк'])+'…',{busy:true,percent:0});
    try{
     for(const job of jobs){
      s.requestProgress?.report('Перевожу на '+langs.name(job.lang)+': '+job.items.length+' '+kit.plural(job.items.length,['строка','строки','строк']));
      const r=await translate(s,job.items,{from:job.set.source,to:job.lang,check:()=>require('../../answer-cancel.cjs').check(),
       progress:(n)=>publish(s,'Перевожу на '+langs.name(job.lang)+': '+(counted+n)+' из '+total,{busy:true,percent:Math.round(100*(counted+n)/total)})});
      counted+=job.items.length;
      done.push({set:job.set,lang:job.lang,translations:r.done});
      for(const f of r.failed)failed.push({...f,lang:job.lang,set:job.set.name,source:job.items.find(x=>x.key===f.key)?.source||''});
     }
    }catch(e){publish(s,'Перевод прерван: '+e.message,{kind:'error'});throw e;}
    const count=done.reduce((n,d)=>n+d.translations.size,0);
    const exists=p=>fs.existsSync(p);
    const base=roots[0]||path.join(os.homedir(),'Downloads');
    const outputs=done.filter(d=>d.translations.size).map(d=>{const out=formats.write(d.set,d.lang,d.translations,exists);// A file attached without its path on disk has no folder: its translation goes to the project folder or Downloads.
     const file=path.isAbsolute(String(out.path))?out.path:path.join(base,path.basename(out.path));return {set:d.set,lang:d.lang,translations:d.translations,file};});
    prune();const id=require('node:crypto').randomUUID();
    if(count)pending.set(id,{id,company:s.companyId,topicId:s.dialogue.active()?.id,outputs,at:Date.now()});
    card.translation={id:count?id:'',count,failedCount:failed.length,failed:failed.slice(0,50),
     items:done.flatMap(d=>[...d.translations].map(([key,t])=>({key,lang:d.lang,set:d.set.name,source:d.set.values[d.set.source].get(key),text:t}))).slice(0,150),
     files:outputs.map(o=>({lang:o.lang,path:o.file})),saved:false,capped};
    publish(s,count?'Переведено '+count+' '+kit.plural(count,['строка','строки','строк'])+(failed.length?', не удалось '+failed.length:'')+'. Проверьте и сохраните в карточке.':'Перевести не удалось: '+failed.length+' '+kit.plural(failed.length,['строка','строки','строк'])+'.',{kind:count?(failed.length?'attention':'success'):'error'});
    reply+='\n\n'+(count?'Перевёл '+count+' '+kit.plural(count,['строку','строки','строк'])+(failed.length?', не удалось '+failed.length+' (список в карточке)':'')+'. Файлы ещё не записаны: проверьте и нажмите «Сохранить переводы» — исходники не изменятся, переводы лягут в новые файлы рядом.':'Не удалось перевести ни одной строки: модель портила плейсхолдеры или не отвечала. Список — в карточке.')+(capped?' За раз перевожу до '+MAX_TRANSLATE+' строк — повторите для остальных.':'');
   }
  }
 }
 const result=kit.reply(s,command,{by:BY,text:reply,data:{localization:card}});
 adopt(s,att.filter(a=>a.path||a.part));
 return result;
}

function setup(s){
 // «Сохранить переводы»: writes each language into a new file (never over an existing one).
 function save(id){
  prune();const row=pending.get(id);
  if(!row)throw Error('Переводы устарели или уже сохранены. Попросите перевести заново.');
  if(row.company!==s.companyId)throw Error('Компания изменилась. Откройте её, чтобы сохранить переводы.');
  const written=[];
  try{
   for(const o of row.outputs){
    const out=formats.write(o.set,o.lang,o.translations,p=>fs.existsSync(p));
    // The name shown in the card, unless a file with that name appeared since then.
    let file=o.file;for(let i=2;fs.existsSync(file)&&i<100;i++)file=o.file.replace(/(\.[^.\\/]+)$/,'-'+i+'$1');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,out.content,{flag:'wx'});written.push(file);
   }
  }catch(e){publish(s,'Не удалось сохранить переводы: '+e.message+(written.length?' Уже записано: '+written.map(f=>path.basename(f)).join(', ')+'.':''),{kind:'error'});throw Error('Не удалось сохранить: '+e.message);}
  pending.delete(id);
  const topic=s.dialogue.state?.topics?.find(t=>t.id===row.topicId);
  const message=topic?.messages?.find(m=>m.extensionData?.localization?.translation?.id===id);
  if(message){message.extensionData.localization.translation.saved=true;message.extensionData.localization.translation.files=written.map((p,i)=>({lang:row.outputs[i].lang,path:p}));s.dialogue.persist();}
  publish(s,'Переводы сохранены: '+written.map(f=>path.basename(f)).join(', '),{kind:'success'});
  return {files:written};
 }
 return {ipc:{save,progress:()=>operation}};
}
async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!wanted(s,text))return null;
 return run(s,text);
}
function validate(next){
 const ratio=Number(next.localizationLengthRatio);
 if(!(ratio>=1.05&&ratio<=5))throw Error('Порог длины перевода — число от 1.05 до 5 (например, 1.4).');
 if(!langs.code(next.localizationSourceLanguage))throw Error('Исходный язык локализации — код вроде en, ru или pt-BR.');
}
module.exports={name:'localizationApp',defaults:{['extension_'+ID]:'false',localizationLengthRatio:'1.4',localizationSourceLanguage:'en'},validate,setup,turn,wanted,targets,pending};
