// «Отзывы в сторах»: routing and near-misses, the offer gate, connection questions, App Store / Google Play reading
// (stubbed HTTP, no network), numbers counted by code, verbatim-only complaint quotes, model-free cards,
// reply drafts and replies posted only through the card action with the exact text.
const assert=require('node:assert/strict');
const {generateKeyPairSync,createVerify,createPublicKey}=require('node:crypto');
const app=require('../src/extensions/store-reviews/feature.cjs');
const offer=require('../src/extensions/store-reviews/offer.cjs');
const tokens=require('../src/extensions/store-reviews/tokens.cjs');
const analysis=require('../src/extensions/store-reviews/analysis.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');
(async()=>{
 const DAY=86400000,now=Date.now(),ago=(d,h=0)=>new Date(now-d*DAY-h*3600000);
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const ec=generateKeyPairSync('ec',{namedCurve:'P-256',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const playKey=JSON.stringify({type:'service_account',client_email:'petya@studio.iam.gserviceaccount.com',private_key:rsa.privateKey});
 const ISSUER='69a6de7e-1111-47e3-e053-5b8c7c11a4d1';

 // --- Routing: the wave's phrases are ours, the neighbours' are not ---------------------------------------
 for(const t of ['что пишут в отзывах','отзывы в App Store за неделю','жалобы игроков в Google Play','плохие отзывы после обновления','ответь на отзыв','оценки в App Store за месяц','что пишут игроки в сторах'])assert.equal(app.wanted(t),true,t);
 const near=['код-ревью','сделай код-ревью этой ветки','ревью PR #42','перфоманс-ревью Пети','отзыв кандидата','напиши отзыв о кандидате','фидбэк по встрече','ANR в Google Play','размер APK в Google Play','отзыв доступа к репозиторию','напиши отзыв о ресторане','рейтинг игроков в лидерборде','что такое отзывы в сторах'];
 for(const t of near)assert.equal(app.wanted(t),false,t);
 assert.deepEqual(app.requested('отзывы в App Store за неделю'),['appstore']);
 assert.deepEqual(app.requested('жалобы игроков в Google Play'),['play']);
 assert.deepEqual(app.requested('что пишут в отзывах'),['appstore','play']);
 assert.deepEqual(app.requested('отзывы в App Store и Google Play'),['appstore','play']);
 // Period and focus are read by code.
 assert.equal(analysis.period('отзывы за месяц'),30);assert.equal(analysis.period('за 3 дня'),3);assert.equal(analysis.period('что пишут'),7);assert.equal(analysis.period('за сегодня'),1);
 assert.deepEqual(analysis.focus('плохие отзывы после обновления'),{bad:true,update:true,version:null});
 assert.equal(analysis.focus('отзывы о версии 1.4.2').version,'1.4.2');

 // --- Offer: proposed when not added/connected, never for the neighbours' subjects ------------------------------
 const offerRows=(t,settings={})=>offers.candidates(t,{offers:[offer],settings,topic:null});
 assert.equal(offerRows('отзывы в App Store за неделю')[0]?.direct,true,'named store + reviews is a direct request');
 assert.equal(offerRows('что пишут в отзывах')[0]?.direct,true);
 for(const t of near)assert.equal(offerRows(t).length,0,'no offer: '+t);
 assert.equal(offerRows('отзывы в App Store',{'extension_store-reviews':'true',googlePlayCredential:playKey}).length,0,'added and connected: no offer');
 assert.equal(offerRows('отзывы в App Store',{'extension_store-reviews':'true'}).length,1,'added but not connected: still offered (settings)');
 assert.equal(offer.connect,'settings');

 // --- Stubbed services -------------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},requestProgress:{report(){}},
  dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 let calls=[],model=[],fail={};
 const playRow=(id,stars,text,d,{code=412,name='4.12',lang='ru',reply}={})=>({reviewId:id,authorName:'Игрок '+id,comments:[{userComment:{text,starRating:stars,reviewerLanguage:lang,appVersionCode:code,appVersionName:name,lastModified:{seconds:String(Math.floor(d.getTime()/1000)),nanos:0}}},...reply?[{developerComment:{text:reply,lastModified:{seconds:String(Math.floor(d.getTime()/1000)+60)}}}]:[]]});
 const ascRow=(id,stars,title,body,d,terr='USA',resp)=>({type:'customerReviews',id,attributes:{rating:stars,title,body,reviewerNickname:'nick'+id,createdDate:d.toISOString(),territory:terr},relationships:{response:{data:resp?{type:'customerReviewResponses',id:'r'+id}:null}}});
 const play=[
  playRow('p1',1,'Вылетает после обновления\tИгра вылетает на загрузке после обновления, Samsung A52',ago(0,2),{code:413,name:'4.13'}),
  playRow('p2',2,'Вылетает при входе в бой, верните старую версию',ago(1),{code:413,name:'4.13'}),
  playRow('p3',5,'Отличная игра, играю каждый день',ago(2),{code:412,name:'4.12'}),
  playRow('p4',4,'Good game but too many ads',ago(3),{code:412,name:'4.12',lang:'en',reply:'Thanks! We reduced ads.'}),
  playRow('p5',1,'Слишком много рекламы, каждые 30 секунд',ago(4),{code:412,name:'4.12'})
 ];
 const asc=[
  ascRow('a1',2,'Crashes','The game crashes after the update on iPhone 12',ago(0,5)),
  ascRow('a2',5,'Love it','Best strategy game on mobile',ago(2),'GBR'),
  ascRow('a3',3,'Ads','Too many ads between battles',ago(5),'DEU','yes'),
  // Previous week (for the change of the average): two reviews of 5★.
  ascRow('a4',5,'Great','Great',ago(9)),ascRow('a5',5,'Nice','Nice',ago(10))
 ];
 s.request=async(url,options={})=>{
  calls.push({url,options});
  if(url.includes('11434')){const body=JSON.parse(options.body);const next=model.shift();assert.ok(next,'unexpected model call: '+body.messages[0].content.slice(0,60));return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}
  if(url==='https://oauth2.googleapis.com/token'){
   const assertion=new URLSearchParams(options.body).get('assertion'),[h,p,sig]=assertion.split('.');
   assert.equal(JSON.parse(Buffer.from(p,'base64url')).scope,'https://www.googleapis.com/auth/androidpublisher','reviews need the androidpublisher scope');
   assert.ok(createVerify('RSA-SHA256').update(h+'.'+p).verify(rsa.publicKey,sig,'base64url'),'signed with the service-account key');
   return {access_token:'play-token',expires_in:3600};
  }
  if(url.startsWith('https://playdeveloperreporting.googleapis.com/'))throw Error('reporting API should not be needed when packages are configured');
  if(url.startsWith('https://androidpublisher.googleapis.com/')){
   if(fail.play)throw Object.assign(Error('HTTP 403: The caller does not have permission'),{status:403});
   assert.equal(options.headers.Authorization,'Bearer play-token');
   if(url.endsWith(':reply')){assert.equal(options.method,'POST');return {result:{replyText:JSON.parse(options.body).replyText,lastEdited:{seconds:String(Math.floor(now/1000))}}};}
   assert.match(url,/applications\/com\.studio\.bunker\/reviews\?maxResults=100/);
   return {reviews:play};
  }
  if(url.startsWith('https://api.appstoreconnect.apple.com/v1/')){
   if(fail.appstore)throw Object.assign(Error('HTTP 401: NOT_AUTHORIZED'),{status:401});
   const jwt=options.headers.Authorization.replace('Bearer ',''),[h,p,sig]=jwt.split('.');
   assert.deepEqual(JSON.parse(Buffer.from(h,'base64url')),{alg:'ES256',kid:'2X9R4HXF34',typ:'JWT'});
   const claims=JSON.parse(Buffer.from(p,'base64url'));assert.equal(claims.iss,ISSUER);assert.equal(claims.aud,'appstoreconnect-v1');assert.ok(claims.exp-claims.iat<=1200);
   assert.ok(createVerify('SHA256').update(h+'.'+p).verify({key:createPublicKey(ec.publicKey),dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url')),'ES256 raw signature');
   const u=new URL(url);
   if(u.pathname==='/v1/apps')return {data:[{type:'apps',id:'1234567890',attributes:{name:'Bunker Wars',bundleId:'com.studio.bunker'}}]};
   if(u.pathname==='/v1/apps/1234567890/customerReviews'){assert.equal(u.searchParams.get('sort'),'-createdDate');assert.equal(u.searchParams.get('include'),'response');return {data:asc,included:[{type:'customerReviewResponses',id:'ra3',attributes:{responseBody:'Thanks, fewer ads soon',state:'PUBLISHED',lastModifiedDate:ago(4).toISOString()}}],links:{}};}
   if(u.pathname==='/v1/apps/1234567890/appStoreVersions')return {data:[{id:'v13',attributes:{versionString:'4.13',createdDate:ago(6).toISOString(),appVersionState:'READY_FOR_DISTRIBUTION'}},{id:'v12',attributes:{versionString:'4.12',createdDate:ago(30).toISOString(),appVersionState:'REPLACED_WITH_NEW_VERSION'}},{id:'v14',attributes:{versionString:'4.14',createdDate:ago(0).toISOString(),appVersionState:'PREPARE_FOR_SUBMISSION'}}]};
   if(u.pathname==='/v1/appStoreVersions/v13/customerReviews')return {data:[{id:'a1'},{id:'a2'}]};
   if(u.pathname==='/v1/appStoreVersions/v12/customerReviews')return {data:[{id:'a3'},{id:'a4'},{id:'a5'}]};
   if(u.pathname==='/v1/customerReviewResponses'){const body=JSON.parse(options.body);assert.equal(body.data.type,'customerReviewResponses');assert.deepEqual(body.data.relationships.review.data,{type:'customerReviews',id:'a1'});return {data:{type:'customerReviewResponses',id:'ra1',attributes:{responseBody:body.data.attributes.responseBody,state:'PENDING_PUBLISH',lastModifiedDate:new Date(now).toISOString()}}};}
  }
  throw Error('unexpected request '+url);
 };

 // Not added: nothing here (the offer handles it).
 assert.equal(await app.turn(s,'что пишут в отзывах'),null,'not added → null');
 s.settings['extension_store-reviews']='true';
 for(const t of near)assert.equal(await app.turn(s,t),null,'near-miss with the app added: '+t);
 assert.equal(calls.length,0,'near-misses make no requests');

 // Added but no store connected: a question telling where to connect.
 const ask=await app.turn(s,'что пишут в отзывах');
 assert.equal(ask.question,true);assert.match(ask.text,/Google Play/);assert.match(ask.text,/App Store Connect API/);
 // A browser (OAuth) Google sign-in has only the vitals scope: told apart, still a question.
 s.settings.googlePlayCredential=JSON.stringify({type:'oauth',client:{client_id:'x'},refresh_token:'r'});
 const oauth=await app.turn(s,'жалобы игроков в Google Play');
 assert.equal(oauth.question,true);assert.match(oauth.text,/сервисного аккаунта/);

 // Connect both stores.
 s.settings.googlePlayCredential=playKey;s.settings.storeReviewsPlayPackages='Bunker Wars = com.studio.bunker';
 Object.assign(s.settings,{storeReviewsAscIssuer:ISSUER,storeReviewsAscKeyId:'2X9R4HXF34',storeReviewsAscKey:ec.privateKey});
 assert.deepEqual(app.connected(s.settings),{play:true,appstore:true});
 assert.equal(offer.ready(s.settings),true);

 // Named store only: Google Play is not touched.
 calls=[];model=[{clusters:[]}];
 const apple=await app.turn(s,'отзывы в App Store за неделю');
 assert.equal(calls.some(c=>c.url.includes('androidpublisher')),false,'one store named → only that store');
 const ac=apple.extensionData.storeReviews;
 assert.deepEqual(ac.stores,['appstore']);
 assert.equal(ac.summary.count,3);assert.deepEqual(ac.summary.distribution,{1:0,2:1,3:1,4:0,5:1});
 assert.equal(ac.summary.average,3.33);assert.equal(ac.summary.previous.average,5);assert.equal(ac.summary.delta,-1.67,'change against the previous week');
 assert.equal(ac.timeline.length,8,'every day of the window, empty days included');
 assert.equal(ac.timeline.reduce((n,d)=>n+d.counts.reduce((a,b)=>a+b,0),0),3);
 assert.equal(ac.reviews.find(r=>r.id==='a1').version,'4.13','version from the version review lists');
 assert.equal(ac.reviews.find(r=>r.id==='a3').reply.text,'Thanks, fewer ads soon','existing response is shown');
 assert.match(apple.text,/^Bunker Wars в App Store · 7 дней: 3 отзыва, средняя оценка 3,33★ \(−1,67 к прошлому периоду\)\./);
 assert.equal(topic.messages.at(-1).by,'Отзывы в сторах');

 // Both stores, complaints grouped by the model; an invented quote and a cluster without reviews are dropped.
 calls=[];
 model=[body=>{const text=body.messages[1].content;assert.match(text,/Игра вылетает на загрузке/);
  return {clusters:[
   {title:'Вылеты после обновления',reviews:[1,2,3],quotes:['Игра вылетает на загрузке после обновления','Игра постоянно крашится на всех устройствах']},
   {title:'Много рекламы',reviews:[4,5],quotes:['«Слишком много рекламы»','Too many ads between battles']},
   {title:'Выдуманная тема',reviews:[99],quotes:['нет такого']}]};}];
 const both=await app.turn(s,'что пишут в отзывах');
 const b=both.extensionData.storeReviews;
 assert.deepEqual(b.stores,['appstore','play']);
 assert.equal(b.summary.count,8);
 assert.deepEqual(b.summary.compared,['appstore'],'Google Play keeps one week: the change is App Store only');
 assert.deepEqual(b.clusters.map(c=>[c.title,c.count]),[['Вылеты после обновления',3],['Много рекламы',2]]);
 assert.deepEqual(b.clusters[0].quotes.map(q=>q.text),['Игра вылетает на загрузке после обновления'],'quotes not in any review are dropped');
 assert.deepEqual(b.clusters[1].quotes.map(q=>q.text),['Слишком много рекламы','Too many ads between battles']);
 const p1=b.reviews.find(r=>r.id==='p1');
 assert.equal(p1.title,'Вылетает после обновления');assert.equal(p1.text,'Игра вылетает на загрузке после обновления, Samsung A52','Play «title\\tbody» is split');
 assert.equal(p1.version,'4.13');assert.equal(p1.language,'ru');assert.equal(p1.limit,350);
 assert.equal(b.reviews.find(r=>r.id==='p4').reply.text,'Thanks! We reduced ads.');
 assert.ok(b.notes.some(n=>/последние 7 дней/.test(n)),'the one-week limit of Google Play is said');
 assert.match(both.text,/Чаще всего жалуются: вылеты после обновления \(3\)/);

 // Bad reviews after the update: the latest version against the one before, only 1–2★ in the list.
 model=[{clusters:[{title:'Вылеты',reviews:[1,2,3],quotes:['crashes after the update']}]}];
 const update=await app.turn(s,'плохие отзывы после обновления');
 const u=update.extensionData.storeReviews;
 assert.equal(u.version,'4.13');assert.equal(u.focus.bad,true);assert.equal(u.focus.update,true);
 assert.deepEqual(u.reviews.map(r=>r.id).sort(),['a1','p1','p2']);
 assert.equal(u.summary.compared,'previousVersion');assert.equal(u.summary.count,4);
 assert.equal(u.summary.previous.count,6,"4.12 on both stores");

 // «Ответь на отзыв» shows the reviews with reply actions; nothing is posted from the chat.
 calls=[];model=[{clusters:[]}];
 const replyTurn=await app.turn(s,'ответь на отзыв в Google Play');
 assert.equal(replyTurn.extensionData.storeReviews.focus.reply,true);
 assert.equal(calls.some(c=>c.options.method==='POST'&&!c.url.includes('11434')&&!c.url.includes('oauth2')),false,'a chat turn never posts a reply');
 assert.match(replyTurn.text,/«Отправить ответ»/);
 assert.equal(replyTurn.extensionData.storeReviews.reviews[0].reply,null,'unanswered reviews first');

 // Card actions: draft in the review's language, then send exactly the edited text.
 const ipc=app.setup(s).ipc;
 model=[body=>{assert.match(body.messages[0].content,/на том же языке.*подсказка: en/s);assert.match(body.messages[1].content,/too many ads/);return {reply:'Thank you! We are reducing ads in the next update.'};}];
 const draft=await ipc.draft({store:'play',app:'com.studio.bunker',id:'p4'});
 assert.equal(draft.text,'Thank you! We are reducing ads in the next update.');assert.equal(draft.limit,350);
 await assert.rejects(ipc.send({store:'play',app:'com.studio.bunker',id:'p1'},'x'.repeat(351)),/длиннее 350/);
 await assert.rejects(ipc.send({store:'play',app:'com.studio.bunker',id:'p1'},'   '),/Напишите текст/);
 await assert.rejects(ipc.send({store:'play',app:'com.other',id:'p1'},'Hi'),/не найден/,'only reviews Petya showed');
 calls=[];
 const edited='  Спасибо! Исправили вылет в 4.13.1 — обновите игру, пожалуйста.';
 const sent=await ipc.send({store:'play',app:'com.studio.bunker',id:'p1'},edited);
 const post=calls.find(c=>c.url.endsWith('/reviews/p1:reply'));
 assert.equal(post.url,'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.studio.bunker/reviews/p1:reply');
 assert.equal(JSON.parse(post.options.body).replyText,edited,'exactly the text from the editor');
 assert.match(sent.text,/опубликован в Google Play/);
 assert.ok(topic.messages.filter(m=>m.extensionData?.storeReviews).every(m=>{const r=m.extensionData.storeReviews.reviews.find(x=>x.id==='p1'&&x.store==='play');return !r||r.reply?.text===edited;}),'the chip survives reopening the chat');
 const appleSent=await ipc.send({store:'appstore',app:'1234567890',id:'a1'},'Thanks for the report! Fixed in 4.13.1.');
 assert.equal(appleSent.reply.state,'pending');assert.match(appleSent.text,/после проверки Apple/);
 // Duplicate click while sending is refused.
 const slow=s.request;let release;s.request=async(url,o)=>{if(url.endsWith(':reply'))await new Promise(r=>{release=r;});return slow(url,o);};
 const first=ipc.send({store:'play',app:'com.studio.bunker',id:'p2'},'Спасибо!');
 await new Promise(r=>setImmediate(r));
 await assert.rejects(ipc.send({store:'play',app:'com.studio.bunker',id:'p2'},'Спасибо!'),/уже отправляется/);
 release();await first;s.request=slow;

 // Service errors: one store failing is a note, all failing is an error reply.
 fail={play:true};model=[{clusters:[]}];
 const partial=await app.turn(s,'что пишут в отзывах');
 assert.ok(partial.extensionData.storeReviews.notes.some(n=>/Google Play: не удалось прочитать отзывы — HTTP 403/.test(n)));
 fail={appstore:true};
 const broken=await app.turn(s,'отзывы в App Store за неделю');
 assert.equal(broken.error,true);assert.match(broken.text,/^Отзывы в сторах · /);
 fail={};

 // Several games: asked through the shared question panel, the answer resumes the request.
 s.settings.storeReviewsPlayPackages='Bunker Wars = com.studio.bunker\nMetro Wars = com.studio.metro';
 delete topic.storeReviewsApp;
 let question;try{await app.turn(s,'жалобы игроков в Google Play');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.deepEqual(question.spec.options,['Bunker Wars · Google Play','Metro Wars · Google Play']);
 model=[{clusters:[]}];
 const resumed=await question.resume('Bunker Wars · Google Play');
 assert.equal(resumed.extensionData.storeReviews.app,'Bunker Wars');
 // Named in the request: no question.
 model=[{clusters:[]}];
 assert.equal((await app.turn(s,'жалобы игроков Bunker Wars в Google Play')).extensionData.storeReviews.app,'Bunker Wars');

 // Without a model: numbers and reviews still shown, no themes; drafting says what is missing.
 s.settings.model='';calls=[];
 const plain=await app.turn(s,'что пишут в отзывах Bunker Wars');
 assert.equal(plain.extensionData.storeReviews.clusters,null);assert.equal(plain.extensionData.storeReviews.model,false);
 assert.equal(plain.extensionData.storeReviews.summary.count,8);
 assert.equal(calls.some(c=>c.url.includes('11434')),false,'no model calls');
 await assert.rejects(ipc.draft({store:'play',app:'com.studio.bunker',id:'p3'}),/выберите локальную модель/);

 // Settings validation and the App Store token.
 assert.throws(()=>app.validate({storeReviewsAscIssuer:'not-a-uuid'}),/UUID/);
 assert.throws(()=>app.validate({storeReviewsAscKey:rsa.privateKey}),/ES256/);
 assert.throws(()=>app.validate({storeReviewsAscApps:'com.wrong'}),/Некорректный/);
 assert.doesNotThrow(()=>app.validate({storeReviewsAscIssuer:ISSUER,storeReviewsAscKeyId:'2X9R4HXF34',storeReviewsAscKey:ec.privateKey,storeReviewsAscApps:'Bunker Wars = 1234567890',storeReviewsPlayPackages:'com.studio.bunker'}));
 assert.equal(tokens.ascToken(s.settings),tokens.ascToken(s.settings),'token reused while fresh');
 assert.equal(app.secrets.includes('storeReviewsAscKey'),true);
 assert.equal(Object.keys(app.defaults).some(k=>k.endsWith('Credential')),false,'settings are saved from the renderer: no *Credential names');
 console.log('Store reviews: routing and near-misses, offer gate, connection questions, one-store requests, counted distribution/average/change/timeline, verbatim quotes only, update focus, reply drafts and confirmed sends with exact text, partial/total failures, game question, model-free card passed');
})().catch(e=>{console.error(e);process.exit(1);});
