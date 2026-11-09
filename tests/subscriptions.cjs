// «Подписки и продления» on the real mail records foundation with fixture mail in fake accounts (no network): routing
// and near-misses, not added, no mail connected, consent before reading, services from subscription mail and from
// repeated receipts, one-off orders left out, next charge stated or computed, lapsed services, renewals, totals per
// currency, the week / total / renewals answers, the reminder request, hiding a service, refreshing and failures.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const records=require('../src/features/mail-records.cjs');
const app=require('../src/extensions/subscriptions/feature.cjs');
const services=require('../src/extensions/subscriptions/services.cjs');
const offer=require('../src/extensions/subscriptions/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const at=(y,m,d,h=12)=>new Date(y,m-1,d,h).getTime();
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-subs-'));
 let now=at(2026,11,9,9);
 const settings={...records.defaults,...app.defaults};
 const topic={id:'t',title:'Чат',messages:[]};const progress=[];
 const s={settings,dataRoot:root,saveSettings(v){records.validate(v);app.validate(v);Object.assign(settings,v);},requestProgress:{report:t=>progress.push(t)},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 const mail=[
  ...[[9,9],[9,10],[9,11]].map(([d,m],i)=>({id:'nf'+i,from:'Netflix <info@account.netflix.com>',subject:'Ваш платёж за подписку Netflix',text:'Спасибо за оплату.\nСумма: 799 ₽ в месяц\nСледующее списание: '+d+' '+['','','','','','','','','','сентября','октября','ноября','декабря'][m+1]+' 2026',at:at(2026,m,d)})),
  {id:'sp1',from:'Spotify <no-reply@spotify.com>',subject:'Your receipt',html:'<script type="application/ld+json">'+JSON.stringify({'@type':'Order',merchant:{name:'Spotify'},orderDate:'2026-11-03',price:'10.99',priceCurrency:'EUR',acceptedOffer:{price:'10.99',priceCurrency:'EUR',priceSpecification:{billingDuration:'P1M'}}})+'</script>',text:'',at:at(2026,11,3)},
  {id:'un1',from:'"Unity" <billing@unity3d.com>',subject:'Unity Pro subscription renewal',text:'Your Unity Pro subscription renews on December 15, 2026.\nAmount: $2,040.00 per year',at:at(2026,11,1)},
  // Repeated receipts without a subscription word: a monthly service by its history.
  ...[8,9,10].map((m,i)=>({id:'yc'+i,from:'Yandex Cloud <billing@cloud.yandex.ru>',subject:'Счёт оплачен',text:'Оплата по счёту\nИтого: 1 250,00 ₽',at:at(2026,m,12)})),
  {id:'oz1',from:'Ozon <order@ozon.ru>',subject:'Заказ оформлен',text:'Ваш заказ 123-456 оформлен.\nИтого к оплате: 2 490 ₽',at:at(2026,11,5)},
  // A service with no charge for half a year: lapsed.
  {id:'old',from:'Figma <billing@figma.com>',subject:'Your Figma subscription receipt',text:'Figma Professional (Monthly)\nTotal: $15.00',at:at(2026,4,2)},
  {id:'dom',from:'REG.RU <support@reg.ru>',subject:'Срок регистрации домена bunkerwars.ru истекает',text:'Срок регистрации домена bunkerwars.ru истекает 14.11.2026.\nПродлить: 990 ₽ в год.',at:at(2026,11,1)}
 ];
 const reads=[];let fail=null;
 const accounts=[{key:'google:1',email:'me@gmail.com',provider:'google',open:async o=>{reads.push(o);if(fail)throw Error(fail);return {ids:mail.map(m=>m.id),get:async id=>({...mail.find(m=>m.id===id),account:'me@gmail.com',provider:'google',url:'https://mail.google.com/mail/u/?authuser=me%40gmail.com#all/'+id})};}}];
 let connected=[];
 s.mailRecords=records.create(s,{fetchAccounts:()=>connected,registry:()=>[],now:()=>now});
 const run=async text=>{try{return await app.turn(s,text,{now:()=>now});}catch(e){if(e instanceof InputRequired)return {question:e.spec,resume:e.resume};throw e;}};

 assert.equal(await app.turn(s,'за что я плачу каждый месяц'),null,'not added');
 settings.extension_subscriptions='true';
 for(const p of ['подпишись на канал релизов','подпиши документ','отпишись от рассылки','продли спринт на неделю','продли фокус на 10 минут','сколько стоит Unity Pro','сколько у меня подписчиков','забронируй переговорку','что у меня сегодня в календаре','на что ушёл день'])
  assert.equal(await app.turn(s,p),null,'near-miss: '+p);
 // No mail connected: a question that says where to connect.
 let r=await app.turn(s,'за что я плачу каждый месяц');assert.equal(r.question,true);assert.match(r.text,/Подключения → Почта/);
 connected=accounts;
 // Consent before any mail is read.
 let q=await run('за что я плачу каждый месяц');
 assert.match(q.question.text,/только на этом компьютере/);assert.deepEqual(q.question.options,['Включить и прочитать почту','Не сейчас']);
 r=await q.resume('Не сейчас');assert.match(r.text,/почту не читаю/);assert.equal(reads.length,0);assert.equal(settings.mailRecords,'false');
 q=await run('за что я плачу каждый месяц');r=await q.resume('Включить и прочитать почту');
 assert.equal(settings.mailRecords,'true');assert.equal(reads.length,1);assert.match(progress.at(-1),/Читаю почту/);
 const c=r.extensionData.subscriptionsCard;
 const by=Object.fromEntries(c.services.map(x=>[x.merchant,x]));
 assert.deepEqual(Object.keys(by).sort(),['Figma','Netflix','Spotify','Unity','Yandex Cloud'].sort(),'the one-off Ozon order is not a service');
 assert.deepEqual([by.Netflix.amount,by.Netflix.currency,by.Netflix.period,by.Netflix.next,by.Netflix.days,by.Netflix.charges.length,by.Netflix.periodSource],[799,'RUB','month','2026-12-09',30,3,'mail']);
 assert.deepEqual([by['Yandex Cloud'].period,by['Yandex Cloud'].periodSource,by['Yandex Cloud'].next],['month','history','2026-11-12'],'a monthly service by its history, next charge computed');
 assert.deepEqual([by.Unity.period,by.Unity.monthly,by.Unity.next],['year',170,'2026-12-15']);
 assert.equal(by.Spotify.currency,'EUR');assert.equal(by.Spotify.next,'2026-12-03','next charge from the last charge and the period');
 assert.equal(by.Figma.status,'lapsed');assert.equal(by.Figma.next,'');
 assert.equal(c.services.at(-1).merchant,'Figma','lapsed last');
 assert.equal(c.services[0].merchant,'Yandex Cloud','soonest first');
 assert.deepEqual(c.totals.map(t=>[t.currency,t.monthly]),[['RUB',2049],['USD',170],['EUR',10.99]]);
 assert.deepEqual(c.renewals.map(x=>[x.kind,x.name,x.expires,x.days]),[['domain','bunkerwars.ru','2026-11-14',5]]);
 assert.equal(c.week,2,'Yandex Cloud in 3 days and the domain in 5');
 assert.match(r.text,/^Вы платите за 4 сервиса — 2049 ₽ \+ \$170 \+ 10,99 € в месяц\./);
 assert.equal(by.Netflix.url,'https://mail.google.com/mail/u/?authuser=me%40gmail.com#all/nf2','the latest letter');
 assert.equal(by.Netflix.evidence.amount,'Сумма: 799 ₽ в месяц');
 // Reminders: the request text for «Напоминания», offered only when that app is added.
 assert.equal(c.reminders,false);
 assert.equal(by.Netflix.remind,'Напомни 8 декабря в 10:00: 9 декабря спишется Netflix — 799 ₽');
 assert.equal(by['Yandex Cloud'].remind,'Напомни 11 ноября в 10:00: 12 ноября спишется Yandex Cloud — 1250 ₽');
 assert.equal(app.remindText({next:'2026-11-09',merchant:'X',amount:5,currency:'USD'},now),'Напомни через час: сегодня спишется X — $5');
 settings.extension_reminders='true';

 // The week, the total, renewals; no new reading within 6 hours.
 r=await app.turn(s,'что продлится на этой неделе',{now:()=>now});assert.equal(reads.length,1,'recent reading is reused');
 assert.equal(r.text,'На этой неделе: Yandex Cloud — 12 ноября, 1250 ₽; bunkerwars.ru — истекает 14 ноября.');
 assert.equal(r.extensionData.subscriptionsCard.reminders,true);
 r=await app.turn(s,'сколько уходит на сервисы',{now:()=>now});assert.match(r.text,/^На сервисы уходит 2049 ₽ \+ \$170 \+ 10,99 € в месяц \(4 подписки\)\.$/);
 r=await app.turn(s,'когда истекает домен',{now:()=>now});assert.equal(r.text,'Продления: bunkerwars.ru — до 14 ноября.');

 // Hide a false positive (and bring it back).
 const ipc=app.setup(s).ipc;
 ipc.hide('Yandex Cloud');
 r=await app.turn(s,'мои подписки',{now:()=>now});assert.ok(!r.extensionData.subscriptionsCard.services.some(x=>x.merchant==='Yandex Cloud'));
 ipc.hide('Yandex Cloud',true);assert.equal(settings.subscriptionsHidden,'[]');

 // Later: new mail is read first; a failing read still answers from stored records.
 now+=7*3600000;mail.push({id:'nf9',from:'Netflix <info@account.netflix.com>',subject:'Ваш платёж за подписку Netflix',text:'Сумма: 999 ₽ в месяц\nСледующее списание: 9 декабря 2026',at:now});
 r=await app.turn(s,'мои подписки',{now:()=>now});assert.equal(reads.length,2);assert.ok(reads[1].after>0,'only new mail');
 assert.equal(r.extensionData.subscriptionsCard.services.find(x=>x.merchant==='Netflix').amount,999,'the price change shows');
 r=await app.turn(s,'обнови подписки из почты',{now:()=>now});assert.match(r.text,/^Прочитано писем: 0, новых записей: 0\./);
 fail='Вход Gmail истёк. Подключите аккаунт заново.';now+=7*3600000;
 r=await app.turn(s,'мои подписки',{now:()=>now});assert.match(r.text,/^Почту сейчас прочитать не удалось \(Вход Gmail истёк/);assert.ok(r.extensionData.subscriptionsCard.services.length);
 s.mailRecords.wipe();r=await app.turn(s,'мои подписки',{now:()=>now});assert.equal(r.error,true);assert.match(r.text,/Не удалось прочитать почту/);
 fail=null;

 // Inferred periods and next charges.
 assert.equal(services.infer(['2026-01-05','2026-02-05','2026-03-06']),'month');assert.equal(services.infer(['2025-03-01','2026-03-02']),'year');assert.equal(services.infer(['2026-01-01','2026-01-20']),null);
 assert.equal(services.addPeriod('2026-01-31','month'),'2026-03-03');

 // Offer: own phrases offer it, neighbours do not; connected = reading turned on.
 const off=require('../src/features/extension-offers.cjs');
 const offered=p=>{const x=off.decide(off.candidates(p,{offers:off.load(),settings:{}}));return x?.one?.offer.id||'';};
 for(const p of ['за что я плачу каждый месяц','что продлится на этой неделе','сколько уходит на сервисы','какие у меня подписки','когда истекает домен'])assert.equal(offered(p),'subscriptions',p);
 for(const p of ['подпишись на канал релизов','подпиши договор','продли спринт','сколько стоит Unity Pro','на что ушёл день'])assert.notEqual(offered(p),'subscriptions',p);
 assert.equal(offer.connected({mailRecords:'true'}),true);

 fs.rmSync(root,{recursive:true,force:true});
 console.log('Subscriptions: routing, consent, services and renewals from mail, totals, week/total/renewals, reminders, hide, refresh, failures passed');
})().catch(e=>{console.error(e);process.exit(1);});
