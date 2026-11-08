// Offers of missing extensions: a direct request gets the offer instead of an invented answer, ordinary talk
// gets a quiet offer once per chat, a named service wins, equal fits are asked about (never guessed),
// near-misses and added/connected/muted extensions get nothing; accept adds and resumes, dismiss mutes.
const assert=require('node:assert/strict');
const offers=require('../src/features/extension-offers.cjs');
(async()=>{
 // Synthetic neighbours: the decision rules independent of the real wordings.
 const fake=[
  {id:'crash-a',name:'Крэши A',pitch:'a',names:[/sentry/iu],topics:[/крэш/iu],avoid:[/(?:^|\s)anr(?:$|\s)/iu],ready:s=>s.a==='1'},
  {id:'crash-b',name:'Крэши B',pitch:'b',names:[/crashlytics/iu],topics:[/крэш/iu],avoid:[],ready:()=>false},
  {id:'reviews',name:'Отзывы',pitch:'r',names:[/app store/iu],topics:[/отзыв/iu],avoid:[/код[- ]?ревью|отзыв\p{L}* о кандидат/iu],ready:()=>false}
 ];
 const pick=(text,settings={})=>offers.decide(offers.candidates(text,{offers:fake,settings}));
 assert.deepEqual(pick('покажи крэши за неделю').tie.map(r=>r.offer.id),['crash-a','crash-b'],'equal fits are asked about');
 assert.equal(pick('покажи крэши в sentry').one.offer.id,'crash-a','a named service decides');
 assert.equal(pick('крэши в Crashlytics').one.offer.id,'crash-b');
 assert.equal(pick('покажи anr и крэши').one.offer.id,'crash-b','avoid removes only its own extension');
 assert.equal(pick('покажи крэши',{a:'1'}).one.offer.id,'crash-b','a ready extension is not offered');
 assert.equal(pick('покажи крэши',{extensionOffersMuted:'["crash-b"]'}).one.offer.id,'crash-a','a muted extension is not offered');
 assert.equal(pick('оставь отзыв о кандидате'),null);assert.equal(pick('сделай код-ревью'),null);
 assert.equal(pick('что такое крэши?'),null,'questions about the term are not requests');
 assert.equal(pick('не надо подключать отзывы'),null);
 assert.equal(offers.candidates('покажи отзывы в App Store',{offers:fake,settings:{}})[0].direct,true);
 assert.equal(offers.candidates('у нас стало больше отзывов',{offers:fake,settings:{}})[0].direct,false,'mention without a request is not direct');

 // The feature over the real offers (regex-cron and whatever else is declared).
 const real=offers.load();
 assert(real.some(o=>o.id==='regex-cron'),'offers are discovered from extension folders');
 for(const o of real){assert.equal(typeof o.ready,'function');assert(o.name&&o.pitch,'offer '+o.id+' has a name and pitch');assert(['install','settings'].includes(o.connect||'install'));}
 const topic={id:'t',title:'Чат',messages:[]};const saved=[];
 const s={settings:{},saveSettings(p){Object.assign(s.settings,p);saved.push(p);},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const {extensionOffers:feature,ipc}=offers.setup(s);
 // Direct request → the offer is the answer, with the request kept for later.
 const direct=feature.turn('объясни регулярку /^a+$/');
 assert.equal(direct.question,true);assert.match(direct.text,/«Регулярки и cron»/);
 const item=direct.extensionData.extensionOffer.items[0];assert.equal(item.ext,'regex-cron');
 assert.equal(topic.messages.at(-1).extensionData.extensionOffer.direct,true);
 assert.equal(feature.turn('посчитай 2+2'),null,'unrelated requests are untouched');
 assert.equal(feature.turn('создай задачу в Jira про регулярку для email'),null,'requests Petya owns (Jira) are not taken over');
 // Accept → added and the saved request returned for a retry.
 const accepted=ipc.accept(item.id);
 assert.equal(s.settings['extension_regex-cron'],'true');assert.equal(accepted.retry,'объясни регулярку /^a+$/');assert.equal(accepted.settings,undefined);
 assert.throws(()=>ipc.accept(item.id),/устарело/,'an offer is used once');
 assert.equal(feature.turn('объясни регулярку /^a+$/'),null,'added: no more offers');
 // Quiet offer under an ordinary answer: once per chat, not for errors or questions, dismiss forever mutes.
 s.settings['extension_regex-cron']='false';
 const chat={id:'c2',title:'Другой',messages:[]};topic.messages=[];
 s.dialogue.active=()=>chat;
 chat.messages.push({role:'user',text:'у нас в конфиге странный крон'},{role:'assistant',text:'Расскажите подробнее.'});
 const annotated=feature.annotate('у нас в конфиге странный крон',{handled:true,text:'Расскажите подробнее.'});
 assert.equal(annotated.extensionData.extensionOffer.direct,false);assert.equal(chat.messages.at(-1).extensionData.extensionOffer.items[0].ext,'regex-cron');
 chat.messages.push({role:'user',text:'и ещё крон'},{role:'assistant',text:'Ок.'});
 assert.equal(feature.annotate('и ещё крон',{handled:true,text:'Ок.'}).extensionData,undefined,'once per chat');
 const other={id:'c3',title:'Третий',messages:[{role:'user',text:'крон'},{role:'assistant',text:'Ошибка',error:true}]};s.dialogue.active=()=>other;
 assert.equal(feature.annotate('крон',{handled:true,error:true,text:'Ошибка'}).extensionData,undefined,'no offer under an error');
 other.messages.push({role:'assistant',text:'Что именно?'});
 assert.equal(feature.annotate('крон',{handled:true,question:true,text:'Что именно?'}).extensionData,undefined,'no offer under a question');
 other.messages.push({role:'assistant',text:'Понял.'});
 const quiet=feature.annotate('крон',{handled:true,text:'Понял.'});const qid=quiet.extensionData.extensionOffer.items[0].id;
 assert.equal(ipc.accept(qid).retry,null,'a quiet offer does not re-run ordinary talk');
 s.settings['extension_regex-cron']='false';
 const fourth={id:'c4',title:'4',messages:[{role:'user',text:'крон'},{role:'assistant',text:'Да.'}]};s.dialogue.active=()=>fourth;
 const again=feature.annotate('крон',{handled:true,text:'Да.'});
 ipc.dismiss(again.extensionData.extensionOffer.items[0].id,true);
 assert.deepEqual(ipc.muted(),['regex-cron']);
 assert.equal(feature.turn('объясни регулярку /a/'),null,'muted: no offer even for a direct request');
 assert.deepEqual(ipc.unmute('regex-cron'),[]);
 // An added app asks for another one with the same card (`propose`): «Крэши» without a crash source.
 const crashChat=topic;s.dialogue.active=()=>topic;s.settings.extension_crashes='true';
 const asked=feature.propose('какие крэши за неделю',['sentry','crashlytics','google-play','nope'],'Крэши пока неоткуда взять. Какой подключить?','Крэши');
 assert.equal(asked.question,true);assert.equal(asked.by,'Крэши');assert.equal(crashChat.messages.at(-1).by,'Крэши');
 const items=asked.extensionData.extensionOffer.items;
 assert.deepEqual(items.map(i=>[i.ext,i.connect]),[['sentry','settings'],['crashlytics','settings'],['google-play','settings']],'unknown ids are skipped');
 assert.equal(feature.propose('x',['nope'],'?'),null);
 // `also`: accepting a source adds «Крэши» too and keeps the request until the source is connected.
 s.settings.extension_crashes='false';
 const sentry=ipc.accept(items[0].id);
 assert.equal(s.settings.extension_sentry,'true');assert.equal(s.settings.extension_crashes,'true');
 assert.deepEqual([sentry.settings,sentry.service,sentry.retry],['sentry',undefined,'какие крэши за неделю']);
 // `service`: Google Play is connected in Petya's service settings, not in an extension card.
 const play=ipc.accept(items[2].id);
 assert.deepEqual([play.settings,play.service,play.retry],[undefined,'googleplay','какие крэши за неделю']);assert.match(play.text,/Подключите «Google Play» в настройках/);
 s.settings.googlePlayCredential='{}';
 const fresh=feature.propose('крэши в Google Play',['google-play'],'?');
 assert.deepEqual(ipc.accept(fresh.extensionData.extensionOffer.items[0].id).retry,'крэши в Google Play','connected: retried at once');
 console.log('Extension offers: ties asked, named service wins, avoid/ready/muted skipped, direct offer with retry, quiet offer once per chat, accept/dismiss/unmute, propose, also and service passed');
})().catch(e=>{console.error(e);process.exit(1);});
