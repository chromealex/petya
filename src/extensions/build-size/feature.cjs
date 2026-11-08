// «Размер билда»: what an APK / AAB / IPA consists of, and what grew between two builds.
// Builds come from chat attachments picked from disk, paths in the request, or the current project's folders
// («последний билд»). Only the ZIP central directory is read (streamed), so a multi-gigabyte build is fine.
// No model is involved: categories, deltas, warnings and «что сжать» advice are all computed by code.
const path=require('node:path');
const kit=require('../app-kit.cjs');
const analyze=require('./analyze.cjs');
const find=require('./find.cjs');
const ID='build-size',BY='Размер билда';

const FILE=/(?:^|[^\p{L}\p{N}])(?:apk|aab|ipa|апк|ипа)(?=$|[^\p{L}\p{N}])/iu;
const BUILD=/(?:^|[^\p{L}])(?:билд\p{L}*|сборк\p{L}*|build)(?=$|[^\p{L}])/iu;
const SIZE=/размер\p{L}*|(?:^|[^\p{L}])(?:вес(?:ит|ят|ил|ила|ило|а|е)?|мб|гб|mb|gb)(?=$|[^\p{L}])|вырос\p{L}*|подрос\p{L}*|увеличил\p{L}*|уменьшил\p{L}*|потяжел\p{L}*|похудел\p{L}*|раздул\p{L}*|разду(?:лся|лась)|сколько (?:весит|места|занима\p{L}*)|мегабайт\p{L}*|гигабайт\p{L}*/iu;
const COMPOSE=/из чего (?:состо\p{L}*|сделан\p{L}*)|что (?:внутри|занима\p{L}*|в н[её]м)|(?:^|[^\p{L}])состав(?=$|[^\p{L}])|разбивк\p{L}*|разбер\p{L}*|сравни\p{L}*|разниц\p{L}*|(?:^|[^\p{L}])diff(?=$|[^\p{L}])/iu;
const ADVICE=/что (?:можно )?(?:сжать|ужать|урезать)|как (?:уменьшить|сжать|ужать)|(?:^|[^\p{L}])ужать/iu;
const COMPARE=/сравни\p{L}*|вырос\p{L}*|подрос\p{L}*|увеличил\p{L}*|уменьшил\p{L}*|потяжел\p{L}*|похудел\p{L}*|раздул\p{L}*|разниц\p{L}*|изменил\p{L}*|по сравнению|(?:^|[^\p{L}])(?:diff|дифф?)(?=$|[^\p{L}])|(?:двух|обоих|два|оба) (?:билд|сборк|apk|aab|ipa|файл)/iu;
// Same words about other things: build time, tests, crashes, a team or a screen.
const AVOID=/врем\p{L}*|дольше|долго|минут\p{L}*|секунд\p{L}*|быстрее|медленн\p{L}*|тест\p{L}*|ошиб\p{L}*|предупрежден\p{L}*|warning|крэш\p{L}*|краш\p{L}*|упал\p{L}*|команд\p{L}*|экран\p{L}*|шрифт\p{L}*|очеред\p{L}*/iu;

function wanted(s,text){
 const files=find.attached(s).length>0;
 if(AVOID.test(text)&&!FILE.test(text)&&!/\.(?:apk|aab|ipa)/i.test(text))return false;
 const subject=FILE.test(text)||/\.(?:apk|aab|ipa)(?=$|[^\p{L}])/iu.test(text)||files;
 if(subject&&(SIZE.test(text)||COMPOSE.test(text)||ADVICE.test(text)))return true;
 return BUILD.test(text)&&(SIZE.test(text)||ADVICE.test(text)||/из чего состо/iu.test(text));
}

// The last build card in this chat (for «Что сжать?»).
function lastCard(s){
 const messages=s.dialogue.active()?.messages||[];
 for(let i=messages.length-1;i>=0;i--)if(messages[i].extensionData?.buildSize)return messages[i].extensionData.buildSize;
 return null;
}

// Moves used attachments from the composer into the chat, like other extensions do.
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

const ask=(s,command,text)=>kit.reply(s,command,{by:BY,question:true,text});

async function run(s,command){
 const text=String(command);
 const compare=COMPARE.test(text);
 const wantExt=/(?:^|[^\p{L}])(apk|aab|ipa)(?=$|[^\p{L}])/iu.exec(text)?.[1]?.toLowerCase()||'';
 if(ADVICE.test(text)&&!find.written(text).length&&!find.attached(s).length){
  const last=lastCard(s);
  if(last)return kit.reply(s,command,{by:BY,text:analyze.advice(last)});
 }
 const roots=find.projectRoots(s);
 const attached=find.attached(s);
 const blind=attached.filter(f=>!f.path);
 let found=null;const scan=async()=>found??=(s.requestProgress?.report('Ищу APK, AAB и IPA в папке проекта'),await find.scan(roots));
 const explicit=attached.filter(f=>f.path).map(f=>f.path);
 for(const p of find.written(text)){
  const full=await find.resolve(p,roots,path.isAbsolute(p)?[]:await scan());
  if(!full)return kit.reply(s,command,{by:BY,error:true,text:'Не нашёл файл «'+p+'»'+(roots.length?' ни по этому пути, ни в папке проекта.':'. Напишите полный путь или подключите папку проекта.')});
  if(!explicit.includes(full))explicit.push(full);
 }
 if(!explicit.length&&blind.length)return ask(s,command,'Файл «'+blind[0].name+'» прикреплён без пути к нему на диске, а билд я читаю прямо с диска, не загружая целиком. Выберите файл кнопкой «Прикрепить» или напишите путь, например: «размер билда ~/Builds/game.apk».');
 let picked=[...explicit],note='';
 if(picked.length>2){note=' Взял два первых файла из '+picked.length+'.';picked=picked.slice(0,2);}
 if(!picked.length||picked.length===1&&compare){
  if(!roots.length){
   if(!picked.length)return ask(s,command,'Какой билд посмотреть? Прикрепите APK, AAB или IPA кнопкой «Прикрепить», напишите путь к файлу или подключите папку проекта в контексте чата — тогда найду последний билд сам.');
   note+=' Второй билд для сравнения не нашёл: прикрепите его или напишите путь.';
  }else{
   const list=(await scan()).filter(f=>!picked.includes(f.path));
   const ext=wantExt||(picked[0]?path.extname(picked[0]).slice(1).toLowerCase():list[0]?.name.split('.').pop().toLowerCase());
   const same=list.filter(f=>f.name.toLowerCase().endsWith('.'+ext));
   if(!picked.length&&!same.length)return ask(s,command,'В папке проекта ('+roots.map(r=>path.basename(r)).join(', ')+') не нашёл '+(wantExt?wantExt.toUpperCase():'APK, AAB или IPA')+'. Прикрепите файл или напишите путь к нему.');
   const need=compare?2-picked.length:1-picked.length;
   picked.push(...same.slice(0,need).map(f=>f.path));
   if(compare&&picked.length<2)note+=' Для сравнения нашёл только один '+ext.toUpperCase()+' — показываю его состав.';
   else if(!explicit.length)note+=' Взял из папки проекта: '+picked.map(p=>path.relative(roots.find(r=>p.startsWith(r))||'',p)||path.basename(p)).join(' и ')+'.';
  }
 }
 const builds=[];
 for(const file of picked){
  s.requestProgress?.report('Читаю каталог '+path.basename(file));
  try{builds.push(await analyze.inspect(file));}
  catch(e){return kit.reply(s,command,{by:BY,error:true,text:e.code==='ENOENT'?'Файл не найден: '+file:e.code==='EACCES'?'Нет доступа к файлу '+file+'.':e.message});}
 }
 if(builds.length===2&&builds[0].kind!==builds[1].kind)return kit.reply(s,command,{by:BY,error:true,text:'Сравниваю только билды одного типа, а здесь '+builds[0].kind.toUpperCase()+' и '+builds[1].kind.toUpperCase()+'.'});
 const card=builds.length===2?await analyze.diff(builds[0],builds[1]):await analyze.single(builds[0]);
 const reply=kit.reply(s,command,{by:BY,text:(ADVICE.test(text)?analyze.advice(card)+'\n\n':'')+analyze.text(card)+note,data:{buildSize:card}});
 adopt(s,attached.filter(f=>f.path&&picked.includes(f.path)));
 return reply;
}

function setup(){
 // «Сравнить с другим билдом…»: the user picks files; the card then sends an ordinary request with their paths.
 async function pick(){
  const {dialog,BrowserWindow}=require('electron');
  const r=await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()||undefined,{title:'Билды для сравнения',properties:['openFile','multiSelections'],filters:[{name:'APK, AAB, IPA',extensions:['apk','aab','ipa']}]});
  return r.canceled?[]:r.filePaths.filter(f=>find.EXT.test(f)).slice(0,2);
 }
 return {ipc:{pick}};
}
async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!wanted(s,text))return null;
 return run(s,text);
}
module.exports={name:'buildSize',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,wanted};
