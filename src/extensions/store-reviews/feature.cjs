// «Отзывы в сторах»: App Store and Google Play reviews of the user's games in the chat.
// Reads reviews from App Store Connect API and Google Play Android Publisher API, counts the rating distribution,
// the average with its change and reviews per day by code; the local model only groups complaints (quotes are
// checked against the real texts) and drafts replies. A reply is posted only when the user presses «Отправить ответ»
// on the card, with exactly the text shown in the card's editor.
const kit=require('../app-kit.cjs');
const stores=require('./stores.cjs');
const tokens=require('./tokens.cjs');
const a=require('./analysis.cjs');
const ID='store-reviews',BY='Отзывы в сторах';
const STORE_NAMES={appstore:'App Store',play:'Google Play'};

// --- Routing ------------------------------------------------------------------------------------------
// Neighbours' subjects: code and performance reviews, candidates, meeting feedback, revoking access.
const NEAR=/код[- ]?ревью|code[- ]?review|ревью\s+(?:кода|pr|пр|пул\p{L}*|мерж\p{L}*|merge|ветк\p{L}*|коммит\p{L}*)|(?:^|[^\p{L}])(?:pr|пр)(?=$|[^\p{L}])|pull[- ]?request|пул+[- ]?реквест\p{L}*|перф\p{L}*[- ]?ревью|performance[- ]?review|ревью\s+(?:сотрудник|команд|перфоманс)|кандидат\p{L}*|собеседовани\p{L}*|соискател\p{L}*|резюме|ваканси\p{L}*|фидб[эе]к\p{L}*\s+(?:по|о|об|на|после|с)\s+(?:встреч|созвон|митинг|собес|интервью|ревью)|(?:^|[^\p{L}])360(?=$|[^\p{L}])|отзыв\p{L}*\s+(?:о|об|про|на|по|после|с)\s+(?:встреч|созвон|митинг|сотрудник|коллег|подрядчик|стажер|стажёр|доклад|презентаци|ресторан|отел)|отзыв\p{L}*\s+(?:доступ|токен|ключ|сертификат|прав|разрешени|согласи|заявлени|сборк|билд|коммит|оффер)|отозва\p{L}*|(?:напиши|оставь|составь|написать|оставить)\s+(?:\p{L}+\s+)?отзыв(?!\p{L})/iu;
const APPLE=/app\s?store|апп?\s?стор\p{L}*|эпп?\s?стор\p{L}*|(?:^|[^\p{L}])(?:ios|айос\p{L}*)(?=$|[^\p{L}])|айфон\p{L}*|iphone/iu;
const GOOGLE=/google\s?play|гугл[- ]?пле\p{L}*|play\s?market|плей\s?маркет\p{L}*|play\s?console|(?:^|[^\p{L}])(?:android|андроид\p{L}*)(?=$|[^\p{L}])/iu;
const STORE=new RegExp(APPLE.source+'|'+GOOGLE.source+'|(?:^|[^\\p{L}])(?:стор(?:е|ах|ы|ов|ам)?|сторы|магазин\\p{L}* приложений)(?=$|[^\\p{L}])','iu');
const PLAYERS=/игрок\p{L}*|пользовател\p{L}*|юзер\p{L}*|геймер\p{L}*/iu;
const REVIEW=/отзыв\p{L}*/iu;
const REPLY=/(?:ответ\p{L}*|отвеч\p{L}*)\s+(?:на\s+)?(?:\p{L}+\s+)?отзыв/iu;

function wanted(text){
 const t=String(text||'');
 if(!t.trim()||NEAR.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить))/iu.test(t.trim()))return false;
 if(REVIEW.test(t))return true;
 if(/жалоб\p{L}*|что пишут|ругают|хвалят/iu.test(t)&&(STORE.test(t)||PLAYERS.test(t)))return true;
 if(/(?:^|[^\p{L}])reviews?(?=$|[^\p{L}])|оценк\p{L}*|рейтинг\p{L}*|звёзд\p{L}*|звезд\p{L}*/iu.test(t)&&STORE.test(t))return true;
 return false;
}
// The stores the request is about: one named store only, otherwise every connected one.
function requested(text){const apple=APPLE.test(text),google=GOOGLE.test(text);return apple===google?['appstore','play']:apple?['appstore']:['play'];}

// --- Connection --------------------------------------------------------------------------------------------
function connected(settings){
 const out={};
 out.play=!tokens.playAccount(settings).problem;
 const key=tokens.ascKey(settings);
 out.appstore=!key.problem&&(()=>{try{tokens.checkAscKey(key.pem);return true;}catch{return false;}})();
 return out;
}
function connectHint(settings,store){
 if(store==='play'){const {problem}=tokens.playAccount(settings);return 'Google Play: '+(problem||'')+' Ключ сервисного аккаунта импортируется в «Подключения → Google Play»; в Play Console дайте ему права «Просмотр информации о приложении» и «Ответы на отзывы».';}
 return 'App Store: укажите Issuer ID, Key ID и ключ .p8 App Store Connect API в «Настройки → Отзывы в сторах» (роль ключа — Customer Support или выше).';
}

// --- Apps ---------------------------------------------------------------------------------------------------
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');
// Apps of both stores grouped into games by name: «Bunker Wars» on Google Play and on the App Store is one game.
function games(apps){
 const out=[];
 for(const app of apps){
  const n=norm(app.label);
  let g=out.find(x=>(x.key===n||(n.length>=4&&x.key.length>=4&&(x.key.includes(n)||n.includes(x.key))))&&!x[app.store]);
  if(!g){g={key:n,label:app.label};out.push(g);}
  g[app.store]=app;
 }
 return out;
}
function named(list,text){
 const t=norm(text),raw=String(text||'').toLowerCase();
 return list.filter(g=>[g.label,g.play?.label,g.appstore?.label].some(n=>norm(n).length>=3&&t.includes(norm(n)))||[g.play?.id,g.appstore?.bundle,g.appstore?.id].some(id=>id&&raw.includes(String(id).toLowerCase())));
}
// Countries Apple can filter by (filter[territory], ISO alpha-3).
const TERRITORIES=[[/росси|рф(?!\p{L})/iu,'RUS'],[/сша|америк|usa(?!\p{L})/iu,'USA'],[/германи/iu,'DEU'],[/британи|англи/iu,'GBR'],[/франци/iu,'FRA'],[/япони/iu,'JPN'],[/коре/iu,'KOR'],[/кита/iu,'CHN'],[/бразили/iu,'BRA'],[/турци/iu,'TUR'],[/украин/iu,'UKR'],[/казахстан/iu,'KAZ'],[/испани/iu,'ESP'],[/итали/iu,'ITA'],[/канад/iu,'CAN']];
const territory=text=>TERRITORIES.find(([r])=>r.test(text))?.[1]||null;

// --- Reading ---------------------------------------------------------------------------------------------------
async function read(s,game,which,command,now=new Date()){
 const days=a.period(command),f=a.focus(command),terr=territory(command);
 const to=now,since=new Date(now.getTime()-days*a.DAY),prevSince=new Date(now.getTime()-2*days*a.DAY);
 const notes=[],errors=[];let rows=[],appstoreVersions=[];const covered=[];
 if(which.includes('play')&&game.play){
  try{
   s.requestProgress?.report('Читаю отзывы Google Play');
   rows.push(...await stores.playReviews(s,game.play.id));
   if(days>7)notes.push('Google Play отдаёт через API только отзывы с текстом за последние 7 дней — за остальной период там только App Store.');
   else notes.push('Google Play: только отзывы с текстом за последние 7 дней (ограничение API).');
   if(terr)notes.push('Google Play не сообщает страну отзыва — фильтр по стране применён только к App Store.');
   if(2*days<=7)covered.push('play');
  }catch(e){errors.push({store:'play',error:e});}
 }
 if(which.includes('appstore')&&game.appstore){
  try{
   s.requestProgress?.report('Читаю отзывы App Store');
   rows.push(...await stores.ascReviews(s,game.appstore.id,{since:f.update?new Date(now.getTime()-90*a.DAY):prevSince,territory:terr}));
   covered.push('appstore');
   try{const v=await stores.ascVersions(s,game.appstore.id);appstoreVersions=v.versions;for(const r of rows)if(r.store==='appstore'&&v.byReview.has(r.id))r.version=v.byReview.get(r.id);}catch{/* versions are a nicety */}
  }catch(e){errors.push({store:'appstore',error:e});}
 }
 if(errors.length&&errors.length===which.filter(x=>game[x]).length)throw errors[0].error;
 for(const e of errors)notes.push(STORE_NAMES[e.store]+': не удалось прочитать отзывы — '+e.error.message);
 rows=rows.filter(r=>r.date).sort((x,y)=>y.date.localeCompare(x.date));

 let current,previous=null,version=null;
 if(f.update){
  // «После обновления»: reviews of the latest version against the version before it.
  const latest=a.latestVersion(rows,appstoreVersions.map(v=>v.version));
  const prevCode=Math.max(0,...rows.filter(r=>r.versionCode&&r.versionCode<latest.play?.code).map(r=>r.versionCode));
  const pick=(r,which)=>r.store==='play'?(which==='now'?r.versionCode===latest.play?.code:!!prevCode&&r.versionCode===prevCode):!!r.version&&(which==='now'?r.version===latest.appstore:r.version===latest.previousAppstore);
  if(f.version){current=rows.filter(r=>r.version===f.version);previous=null;version=f.version;}
  else{current=rows.filter(r=>pick(r,'now'));const before=rows.filter(r=>pick(r,'before'));previous=before.length?before:null;version=[latest.appstore,latest.play?.version].filter(Boolean).filter((v,i,l)=>l.indexOf(v)===i).join(' / ')||null;}
  if(!current.length&&!version)notes.push('Версии в отзывах не указаны — показываю отзывы за период.');
  if(!current.length&&!version)current=rows.filter(r=>new Date(r.date)>=since);
 }else{
  current=rows.filter(r=>new Date(r.date)>=since);
  const prev=rows.filter(r=>new Date(r.date)<since&&new Date(r.date)>=prevSince&&covered.includes(r.store));
  previous=covered.length?prev:null;
 }
 const avg=a.average(current),prevAvg=previous?a.average(previous):null;
 const summary={count:current.length,average:avg,distribution:a.distribution(current),
  previous:previous?{count:previous.length,average:prevAvg}:null,delta:avg!==null&&prevAvg!==null?Math.round((avg-prevAvg)*100)/100:null,
  compared:f.update?(previous?'previousVersion':null):covered.length?covered:null};
 // After an update the timeline starts at the first review of the version (at most 30 days back).
 const span=f.update&&current.length?{from:new Date(Math.max(Date.parse(current.at(-1).date),now.getTime()-30*a.DAY)),to}:{from:since,to};
 return {days,focus:f,territory:terr,rows,current,summary,timeline:a.timeline(current,span.from,span.to),version,notes,errors};
}

async function cluster(s,rows){
 if(!s.settings.model)return null;
 if(rows.length<2)return [];
 const sample=rows.slice(0,80);
 s.requestProgress?.report('Группирую жалобы');
 const raw=await kit.modelJSON(s,{system:'Сгруппируй жалобы игроков из отзывов в магазинах приложений в темы (не больше 5). title — короткая тема по-русски (например «Вылеты после обновления»). reviews — номера отзывов этой темы. quotes — 1–2 точные цитаты, скопированные из текста отзывов дословно, без изменений и перевода. Отзыв без жалобы не включай.',
  user:a.clusterInput(sample),schema:a.CLUSTER_SCHEMA,predict:1500}).catch(()=>null);
 return raw?a.clusters(raw,sample):[];
}

const stars=n=>n===null?'—':n.toLocaleString('ru-RU',{maximumFractionDigits:2});
function sentence(app,which,r,clusters,reply){
 const store=which.length===1?' в '+STORE_NAMES[which[0]]:'';
 const scope=r.focus.update&&r.version?' · версия '+r.version:' · '+r.days+' '+kit.plural(r.days,['день','дня','дней']);
 if(!r.summary.count)return app+store+scope+': новых отзывов нет.'+(r.notes.some(n=>/7 дней/.test(n))?' Google Play отдаёт только отзывы с текстом за последнюю неделю.':'');
 let text=app+store+scope+': '+r.summary.count+' '+kit.plural(r.summary.count,['отзыв','отзыва','отзывов'])+', средняя оценка '+stars(r.summary.average)+'★';
 if(r.summary.delta!==null)text+=' ('+(r.summary.delta>0?'+':r.summary.delta<0?'−':'±')+stars(Math.abs(r.summary.delta))+(r.focus.update?' к прошлой версии':' к прошлому периоду')+')';
 text+='.';
 const bad=r.summary.distribution[1]+r.summary.distribution[2];if(bad)text+=' Плохих (1–2★): '+bad+'.';
 if(clusters?.length)text+=' Чаще всего жалуются: '+clusters.slice(0,2).map(c=>c.title.toLowerCase()+' ('+c.count+')').join(', ')+'.';
 if(reply)text+=' Нажмите «Черновик ответа» у отзыва, поправьте текст и нажмите «Отправить ответ» — без этого ничего не отправится.';
 return text;
}

async function answer(s,command,game,which){
 const topic=s.dialogue.active();if(topic)topic.storeReviewsApp=game.key;
 const r=await read(s,game,which,command);
 const reply=REPLY.test(command);
 let list=r.current;
 if(r.focus.bad)list=list.filter(x=>x.rating<=2);
 if(reply){
  // A named author or a quoted fragment narrows the list to that review.
  const t=command.toLowerCase(),hit=list.filter(x=>(x.author&&x.author.length>=3&&t.includes(x.author.toLowerCase()))||(x.text&&command.match(/[«"]([^»"]{8,})[»"]/u)&&x.text.includes(command.match(/[«"]([^»"]{8,})[»"]/u)[1])));
  list=hit.length?hit:[...list.filter(x=>!x.reply),...list.filter(x=>x.reply)];
 }
 const complaints=r.current.filter(x=>x.rating<=(r.focus.bad?2:3)&&x.text);
 const clusters=await cluster(s,complaints);
 const app=game.label;
 const data={storeReviews:{app,stores:which.filter(x=>game[x]),apps:Object.fromEntries(which.filter(x=>game[x]).map(x=>[x,game[x].id])),days:r.days,from:r.timeline[0]?.date||null,to:r.timeline.at(-1)?.date||null,
  focus:{bad:r.focus.bad,update:r.focus.update,reply},version:r.version,territory:r.territory,summary:r.summary,timeline:r.timeline,clusters,
  reviews:list.slice(0,40).map(x=>({...x,limit:stores.LIMITS[x.store]})),more:Math.max(0,list.length-40),notes:r.notes,model:!!s.settings.model,at:Date.now()}};
 const sources=data.storeReviews.stores.map(x=>x==='play'?{title:'Google Play Console · Отзывы',url:'https://play.google.com/console/'}:{title:'App Store Connect · Оценки и отзывы',url:'https://appstoreconnect.apple.com/apps/'+game.appstore.id+'/distribution/activity/ios/ratingsResponses'});
 return kit.reply(s,command,{by:BY,text:sentence(app,data.storeReviews.stores,r,clusters,reply),data,sources});
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 const which=requested(text),ready=connected(s.settings),usable=which.filter(x=>ready[x]);
 if(!usable.length)return kit.reply(s,command,{by:BY,question:true,text:(which.length===1?'Отзывы '+STORE_NAMES[which[0]]+' пока недоступны. ':'Чтобы читать отзывы, подключите хотя бы один магазин. ')+which.map(x=>connectHint(s.settings,x)).join(' ')});
 let apps=[];const errors=[];
 for(const store of usable){try{apps.push(...await (store==='play'?stores.playApps(s):stores.ascApps(s)));}catch(e){errors.push(e);}}
 if(!apps.length){
  if(errors.length)return kit.failure(s,command,BY,errors[0]);
  return kit.reply(s,command,{by:BY,question:true,text:'Не вижу приложений'+(usable.length===1?' в '+STORE_NAMES[usable[0]]:'')+'. Укажите id приложений App Store или пакеты Google Play в «Настройки → Отзывы в сторах».'});
 }
 const list=games(apps),topic=s.dialogue.active();
 const hit=named(list,text);
 let game=hit.length===1?hit[0]:hit.length?null:list.find(g=>g.key===topic?.storeReviewsApp)||(list.length===1?list[0]:null);
 if(!game){
  const options=(hit.length?hit:list).slice(0,8),labels=options.map(g=>g.label+' · '+['appstore','play'].filter(x=>g[x]).map(x=>STORE_NAMES[x]).join(', '));
  return require('../../input-required.cjs').ask({text:'Отзывы какой игры показать?',label:'Игра',options:labels,strictChoices:true},choice=>answer(s,command,options[labels.indexOf(choice)]||options.find(g=>choice.startsWith(g.label)),usable).catch(e=>kit.failure(s,command,BY,e)));
 }
 try{return await answer(s,command,game,usable);}
 catch(e){if(e instanceof require('../../input-required.cjs').InputRequired)throw e;return kit.failure(s,command,BY,e);}
}

// --- Card actions: a reply draft and sending it -----------------------------------------------------------------
// The card passes {store, app, id}; the review itself is taken from the card data Petya saved in the chat.
function locate(s,ref){
 const found=[];
 for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){
  const card=message.extensionData?.storeReviews;if(!card)continue;
  for(const review of card.reviews||[])if(review.id===ref?.id&&review.store===ref?.store&&review.app===ref?.app)found.push({message,card,review});
 }
 return found;
}
function setup(s){
 const sending=new Set();
 async function draft(ref){
  const [hit]=locate(s,ref);if(!hit)throw Error('Отзыв не найден в чате. Обновите список отзывов.');
  if(!s.settings.model)throw Error('Для черновика ответа выберите локальную модель в настройках. Ответ можно написать и самому.');
  const r=hit.review,limit=stores.LIMITS[r.store],lang=a.language(r);
  const out=await kit.modelJSON(s,{system:'Ты отвечаешь от имени разработчиков игры «'+hit.card.app+'» на отзыв игрока в '+STORE_NAMES[r.store]+'. Пиши на том же языке, на котором написан отзыв'+(lang?' (подсказка: '+lang+')':'')+'. Вежливо и по существу: поблагодари, признай проблему, если она есть, подскажи, что можно сделать. Не обещай сроков и не выдумывай факты об игре. Без подписи. Не длиннее '+Math.min(limit-30,600)+' символов.',
   user:{rating:r.rating,title:r.title,text:r.text,version:r.version||undefined},schema:{type:'object',properties:{reply:{type:'string'}},required:['reply']},temperature:0.4,predict:600});
  const text=String(out?.reply||'').trim();
  if(!text)throw Error('Модель не смогла составить ответ. Напишите его сами или попробуйте ещё раз.');
  return {text,limit,language:lang};
 }
 async function send(ref,text){
  const hits=locate(s,ref);if(!hits.length)throw Error('Отзыв не найден в чате. Обновите список отзывов.');
  const r=hits[0].review,limit=stores.LIMITS[r.store];
  if(typeof text!=='string'||!text.trim())throw Error('Напишите текст ответа.');
  if(text.length>limit)throw Error('Ответ длиннее '+limit+' символов — '+STORE_NAMES[r.store]+' его не примет. Сократите текст.');
  const key=r.store+':'+r.id;if(sending.has(key))throw Error('Ответ уже отправляется.');
  sending.add(key);
  try{
   // Exactly the text the user saw and pressed «Отправить ответ» for.
   const result=r.store==='play'?await stores.playReply(s,r.app,r.id,text):await stores.ascReply(s,r.id,text);
   const reply={...result,text,sentByPetya:true};
   for(const h of hits)h.review.reply=reply;
   s.dialogue.persist();
   return {reply,text:reply.state==='pending'?'Ответ отправлен в App Store — появится после проверки Apple.':'Ответ опубликован в '+STORE_NAMES[r.store]+'.'};
  }finally{sending.delete(key);}
 }
 function status(){const c=connected(s.settings);return {play:c.play,appstore:c.appstore,playProblem:c.play?null:tokens.playAccount(s.settings).problem,hasAscKey:!!s.settings.storeReviewsAscKey};}
 return {ipc:{draft,send,status}};
}

function validate(next){
 if(next.storeReviewsAscKey)tokens.checkAscKey(next.storeReviewsAscKey);
 if(next.storeReviewsAscIssuer&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next.storeReviewsAscIssuer.trim()))throw Error('Issuer ID App Store Connect — это UUID из раздела «Ключи API».');
 if(next.storeReviewsAscKeyId&&!/^[A-Z0-9]{10}$/.test(next.storeReviewsAscKeyId.trim()))throw Error('Key ID App Store Connect — 10 латинских букв и цифр.');
 stores.list(next.storeReviewsAscApps,stores.APP_ID);stores.list(next.storeReviewsPlayPackages,stores.PACKAGE);
}
// Dashboards (src/features/dashboards.cjs): read-only requests refresh there by themselves.
const dashboard={accepts:text=>wanted(String(text||''))&&!/(?:ответ\p{L}*|напиши)\s+(?:на\s+)?(?:отзыв|review)/iu.test(String(text||'')),widgets:[{title:'Отзывы за неделю',command:'отзывы в сторах за неделю'},{title:'Плохие отзывы',command:'отзывы с низкой оценкой в сторах'}]};
module.exports={name:'storeReviews',dashboard,
 defaults:{['extension_'+ID]:'false',storeReviewsAscIssuer:'',storeReviewsAscKeyId:'',storeReviewsAscKey:'',storeReviewsAscApps:'',storeReviewsPlayPackages:''},
 secrets:['storeReviewsAscKey'],validate,setup,turn,wanted,requested,games,named,read,locate,connected};
