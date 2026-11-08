// Mail records foundation (src/mail-records, src/features/mail-records.cjs) on fixture e-mails, no network:
// currency and date parsing, schema.org JSON-LD (order, flight, hotel, train, cancelled), plain-text receipts and
// subscriptions in Russian and English, app-store items, renewals (domain, certificate, license), bookings, the
// model fallback with verbatim evidence (made-up fields dropped), app parsers through the registry, dedupe, opt-in,
// incremental scans over fake Gmail / Outlook accounts, notifications, encryption at rest, forget and wipe.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const money=require('../src/mail-records/money.cjs');
const dates=require('../src/mail-records/dates.cjs');
const html=require('../src/mail-records/html.cjs');
const model=require('../src/mail-records/model.cjs');
const fetchMail=require('../src/mail-records/fetch.cjs');
const feature=require('../src/features/mail-records.cjs');
const at=(y,m,d,h=12)=>new Date(y,m-1,d,h).getTime();
(async()=>{
 // --- Money and dates ---------------------------------------------------------------------------------------------
 const cases=[['Итого: 799 ₽',799,'RUB'],['Списано 1 299,00 руб.',1299,'RUB'],['Total $9.99',9.99,'USD'],['US$ 12.00 per month',12,'USD'],['Сумма: 9,99 €',9.99,'EUR'],['EUR 1.299,00',1299,'EUR'],
  ['£4.49/mo',4.49,'GBP'],['2 990 ₸',2990,'KZT'],['1,299.50 USD',1299.5,'USD'],['$1,299',1299,'USD'],['799 р. в месяц',799,'RUB'],['RUB 499',499,'RUB'],['199 грн',199,'UAH'],['1\u00a0490\u00a0₽',1490,'RUB']];
 for(const [t,a,c] of cases)assert.deepEqual([money.parse(t)?.amount,money.parse(t)?.currency],[a,c],t);
 for(const t of ['Order #12345','Рейс SU 1234 в 10:30','12.11.2026','версия 1.299'])assert.equal(money.parse(t),null,'not money: '+t);
 const ref=at(2026,11,9);
 for(const [t,d] of [['Next billing date: December 9, 2026','2026-12-09'],['Renews Dec 9, 2026','2026-12-09'],['Следующее списание 9 дек. 2026','2026-12-09'],['продлится 9 декабря 2026 г.','2026-12-09'],
  ['до 09.12.2026','2026-12-09'],['expires on 2026-12-09','2026-12-09'],['12/09/2026','2026-12-09'],['Следующее списание 15 ноября','2026-11-15'],['Renews on Nov 3','2027-11-03']])assert.equal(dates.parse(t,ref),d,t);
 assert.equal(dates.parse('31.02.2026'),null,'impossible dates are not dates');

 // --- HTML and JSON-LD -----------------------------------------------------------------------------------------------
 assert.equal(html.text('<style>.x{}</style><table><tr><td>Итого</td><td>799&nbsp;₽</td></tr></table><p>Спасибо&amp;пока</p>'),'Итого\t799 ₽\nСпасибо&пока');
 const ld=objects=>'<html><head><script type="application/ld+json">'+JSON.stringify(objects)+'</script></head><body><p>Hello</p></body></html>';
 const mail=(o)=>({id:o.id||'m'+Math.random().toString(16).slice(2,10),account:'me@studio.dev',provider:'google',url:'https://mail.google.com/mail/u/?authuser=me%40studio.dev#all/'+(o.id||'x'),at:o.at||ref,from:o.from,subject:o.subject,text:o.text||(o.html?html.text(o.html):''),html:o.html||''});
 const extract=(m,opts)=>feature.extract(m,opts||{});

 let r=await extract(mail({from:'Spotify <no-reply@spotify.com>',subject:'Your receipt',html:ld({'@context':'http://schema.org','@type':'Order',merchant:{'@type':'Organization',name:'Spotify AB'},orderNumber:'SP-1',orderDate:'2026-11-03T10:00:00Z',priceCurrency:'EUR',price:'10.99',acceptedOffer:{'@type':'Offer',itemOffered:{'@type':'Product',name:'Premium Individual'},price:'10.99',priceCurrency:'EUR',priceSpecification:{'@type':'UnitPriceSpecification',billingDuration:'P1M'}}})}));
 assert.equal(r.length,1);assert.deepEqual([r[0].type,r[0].merchant,r[0].amount,r[0].currency,r[0].period,r[0].date,r[0].source],['subscription','Spotify AB',10.99,'EUR','month','2026-11-03','jsonld']);
 assert.match(r[0].message.url,/^https:\/\/mail\.google\.com\//);
 r=await extract(mail({from:'Aeroflot <noreply@aeroflot.ru>',subject:'Ваш электронный билет',html:ld([{'@context':'http://schema.org','@type':'FlightReservation',reservationNumber:'ABC123',reservationStatus:'http://schema.org/ReservationConfirmed',
  reservationFor:{'@type':'Flight',flightNumber:'1234',airline:{'@type':'Airline',name:'Аэрофлот',iataCode:'SU'},departureAirport:{'@type':'Airport',name:'Шереметьево',iataCode:'SVO'},departureTime:'2026-12-20T08:15:00+03:00',arrivalAirport:{'@type':'Airport',name:'Пулково',iataCode:'LED'},arrivalTime:'2026-12-20T09:45:00+03:00'}},
  {'@context':'http://schema.org','@type':'LodgingReservation',reservationNumber:'H-778',reservationStatus:'Cancelled',reservationFor:{'@type':'LodgingBusiness',name:'Отель'},checkinDate:'2026-12-20'}])}));
 assert.equal(r.length,1,'the cancelled hotel is dropped');
 assert.deepEqual(r[0].booking,{kind:'flight',code:'ABC123',number:'SU 1234',from:'Шереметьево',to:'Пулково',place:'',start:'2026-12-20',startTime:'08:15',end:'2026-12-20',endTime:'09:45'});
 r=await extract(mail({from:'Booking.com <noreply@booking.com>',subject:'Бронирование подтверждено',html:ld({'@context':'http://schema.org','@type':'LodgingReservation',reservationNumber:'4821',reservationFor:{'@type':'LodgingBusiness',name:'Hotel Astoria',address:{'@type':'PostalAddress',addressLocality:'Санкт-Петербург',addressCountry:'RU'}},checkinDate:'2026-12-20T15:00:00',checkoutDate:'2026-12-23T12:00:00'})}));
 assert.deepEqual([r[0].booking.kind,r[0].booking.place,r[0].booking.start,r[0].booking.end],['hotel','Hotel Astoria · Санкт-Петербург, RU','2026-12-20','2026-12-23']);
 r=await extract(mail({from:'RZD <ticket@rzd.ru>',subject:'Билет',html:ld({'@context':'http://schema.org','@type':'TrainReservation',reservationNumber:'72001',reservationFor:{'@type':'TrainTrip',trainNumber:'752А',departureStation:{'@type':'TrainStation',name:'Москва Ленинградская'},arrivalStation:{'@type':'TrainStation',name:'Санкт-Петербург'},departureTime:'2026-12-01T07:00:00',arrivalTime:'2026-12-01T11:00:00'}})}));
 assert.deepEqual([r[0].booking.kind,r[0].booking.number,r[0].booking.from],['train','752А','Москва Ленинградская']);
 assert.equal((await extract(mail({from:'x@y.z',subject:'Hi',html:'<script type="application/ld+json">{broken</script><p>Привет</p>'}))).length,0,'broken JSON-LD is skipped');

 // --- Plain-text receipts and subscriptions ---------------------------------------------------------------------------
 r=await extract(mail({from:'Netflix <info@account.netflix.com>',subject:'Ваш платёж за подписку Netflix',text:'Здравствуйте!\nСпасибо за оплату подписки.\nТариф: Стандартный\nСумма: 799 ₽ в месяц\nСледующее списание: 9 декабря 2026\nКоманда Netflix'}));
 assert.deepEqual([r[0].type,r[0].merchant,r[0].amount,r[0].currency,r[0].period,r[0].nextCharge,r[0].source],['subscription','Netflix',799,'RUB','month','2026-12-09','parser:builtin']);
 assert.equal(r[0].evidence.amount,'Сумма: 799 ₽ в месяц');assert.equal(r[0].evidence.nextCharge,'Следующее списание: 9 декабря 2026');
 r=await extract(mail({from:'"GitHub" <noreply@github.com>',subject:'[GitHub] Payment Receipt for studio',text:'We received payment for your GitHub.com subscription.\nPlan: GitHub Team\nSubtotal: $16.00\nTax: $0.00\nTotal: $16.00 USD\nYour next billing date is December 3, 2026.'}));
 assert.deepEqual([r[0].type,r[0].merchant,r[0].amount,r[0].currency,r[0].nextCharge],['subscription','GitHub',16,'USD','2026-12-03']);
 r=await extract(mail({from:'Apple <no_reply@email.apple.com>',subject:'Your receipt from Apple.',text:'Receipt\nApple ID: me@studio.dev\nApple One Individual (Monthly)\t$19.95\nRenews December 1, 2026\nTotal\t$19.95'}));
 assert.deepEqual([r[0].merchant,r[0].platform,r[0].period,r[0].amount,r[0].nextCharge],['Apple One Individual','Apple','month',19.95,'2026-12-01'],'the item, not the store');
 r=await extract(mail({from:'Яндекс Плюс <plus@yandex.ru>',subject:'Подписка продлена',text:'Мы продлили вашу подписку Яндекс Плюс Мульти.\nСписано 399 ₽.\nСледующее продление 9 декабря.'}));
 assert.deepEqual([r[0].type,r[0].amount,r[0].nextCharge],['subscription',399,'2026-12-09']);
 r=await extract(mail({from:'Ozon <order@ozon.ru>',subject:'Заказ оформлен',text:'Ваш заказ 123-456 оформлен.\nИтого к оплате: 2 490 ₽\nДоставка 12 ноября'}));
 assert.deepEqual([r[0].type,r[0].merchant,r[0].amount],['receipt','Ozon',2490],'a one-off order is a receipt');
 assert.equal((await extract(mail({from:'Маша <masha@studio.dev>',subject:'Обед',text:'Скинься 500 ₽ на пиццу'}))).length,0,'a colleague asking for money is not a receipt');

 // --- Renewals and bookings in plain text ------------------------------------------------------------------------
 r=await extract(mail({from:'REG.RU <support@reg.ru>',subject:'Срок регистрации домена bunkerwars.ru истекает',text:'Срок регистрации домена bunkerwars.ru истекает 01.12.2026.\nПродлите домен заранее: 990 ₽ в год.'}));
 assert.deepEqual([r[0].type,r[0].renewal,r[0].amount],['renewal',{kind:'domain',name:'bunkerwars.ru',expires:'2026-12-01'},990]);
 r=await extract(mail({from:'Certbot monitor <alerts@monitor.dev>',subject:'Certificate expiry warning',text:'The SSL certificate for api.bunkerwars.com will expire on 2026-11-20.\nRenew it to avoid downtime.'}));
 assert.deepEqual(r[0].renewal,{kind:'certificate',name:'api.bunkerwars.com',expires:'2026-11-20'});
 r=await extract(mail({from:'JetBrains Sales <sales@jetbrains.com>',subject:'Your license expires soon',text:'Product: Rider\nYour license expires on January 15, 2027.'}));
 assert.deepEqual(r[0].renewal,{kind:'license',name:'Rider',expires:'2027-01-15'});
 r=await extract(mail({from:'РЖД <noreply@rzd.ru>',subject:'Электронный билет на поезд',text:'Номер заказа: 7520014\nПоезд 752А Москва — Санкт-Петербург\nОтправление: 01.12.2026 07:00\nВагон 5, место 12'}));
 assert.deepEqual([r[0].type,r[0].booking.kind,r[0].booking.code,r[0].booking.start],['booking','train','7520014','2026-12-01']);

 // --- The model: only verbatim, checked fields; a made-up amount or date is dropped ----------------------------------
 // The check itself (model.extract with a stubbed answer).
 const odd=mail({from:'Studio Tools <hello@tools.dev>',subject:'Thanks for your payment',text:'Hi! We charged your card EUR 24.00 for Pro seats this month. See you around.'});
 const modelOf=answer=>model.extract(async(system,user,schema)=>{assert.ok(schema.properties.records);assert.equal(user.text,odd.text);return answer;},odd);
 // «Studio Tools» is only in the From header, not in a quote of the text: the merchant check fails, the record is dropped.
 r=await modelOf({records:[{type:'subscription',merchant:{value:'Studio Tools',evidence:'Studio Tools'},amount:{value:24,evidence:'charged your card EUR 24.00'},currency:{value:'EUR',evidence:'EUR 24.00'}}]});
 assert.equal(r.length,0,'a record without a checked merchant is dropped');
 r=await modelOf({records:[{type:'subscription',merchant:{value:'Pro seats',evidence:'for Pro seats'},amount:{value:24,evidence:'charged your card EUR 24.00'},currency:{value:'EUR',evidence:'x'},period:{value:'month',evidence:'this month'},nextCharge:{value:'2026-12-09',evidence:'next month'}}]});
 assert.deepEqual([r[0].merchant,r[0].amount,r[0].currency,r[0].period,r[0].nextCharge,r[0].source],['Pro seats',24,'EUR','month','','model'],'the unquoted next charge is dropped');
 r=await modelOf({records:[{type:'receipt',merchant:{value:'Pro seats',evidence:'for Pro seats'},amount:{value:42,evidence:'charged your card EUR 24.00'}}]});
 assert.equal(r.length,0,'an amount that does not match its quote is dropped');
 r=await modelOf({records:[{type:'receipt',merchant:{value:'Pro seats',evidence:'for Pro seats'},amount:{value:24,evidence:'we charged your card EUR 24.00 and a fee'}}]});
 assert.equal(r.length,0,'a quote that is not in the message is dropped');
 // The gate: a message the parsers cannot read (a booking without a labelled code) goes to the model; the end date it
 // made up is dropped, the quoted start, code and place stay.
 const stay=mail({from:'Astoria <stay@astoria.example>',subject:'Your reservation',text:'Dear guest, we look forward to your stay at Hotel Astoria from Dec 20.\nReference 4821X.'});
 let asked=0;
 r=await extract(stay,{ask:async()=>{asked++;return {records:[{type:'booking',merchant:{value:'Hotel Astoria',evidence:'your stay at Hotel Astoria'},bookingKind:{value:'hotel',evidence:'your stay at Hotel Astoria'},
  code:{value:'4821X',evidence:'Reference 4821X'},start:{value:'2026-12-20',evidence:'from Dec 20'},end:{value:'2026-12-23',evidence:'until Dec 23'},place:{value:'Hotel Astoria',evidence:'stay at Hotel Astoria'}}]};}});
 assert.equal(asked,1);
 assert.deepEqual([r[0].source,r[0].booking.kind,r[0].booking.code,r[0].booking.start,r[0].booking.end,r[0].booking.place],['model','hotel','4821X','2026-12-20','','Hotel Astoria']);
 assert.equal((await extract(stay,{ask:async()=>{throw Error('model is down');}})).length,0,'a failing model is not an error');
 assert.equal((await extract(mail({from:'a@b.c',subject:'Привет',text:'Как дела?'}),{ask:async()=>{throw Error('model must not be asked');}})).length,0,'ordinary mail never goes to the model');
 assert.equal((await extract(odd,{ask:async()=>{throw Error('parsed mail does not go to the model');}}))[0].source,'parser:builtin');

 // --- Store: dedupe, opt-in, scans over fake accounts, notifications, encryption, forget, wipe ---------------------
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-mail-records-'));
 const settings={...feature.defaults};
 const s={settings,dataRoot:root,saveSettings(v){feature.validate(v);Object.assign(settings,v);}};
 const inbox={google:[
  {id:'a1',from:'Netflix <info@account.netflix.com>',subject:'Ваш платёж за подписку Netflix',text:'Сумма: 799 ₽ в месяц\nСледующее списание: 9 декабря 2026',at:at(2026,11,9)},
  {id:'a2',from:'Netflix <info@account.netflix.com>',subject:'Ваш платёж за подписку Netflix',text:'Сумма: 799 ₽ в месяц\nСледующее списание: 9 ноября 2026',at:at(2026,10,9)},
  {id:'a3',from:'Netflix <info@account.netflix.com>',subject:'Повторно: Ваш платёж за подписку Netflix',text:'Сумма: 799 ₽ в месяц\nСледующее списание: 9 декабря 2026',at:at(2026,11,9,13)}],
  microsoft:[{id:'b1',from:'"Unity" <billing@unity3d.com>',subject:'Unity Pro subscription renewal',text:'Your Unity Pro subscription renews on December 15, 2026.\nAmount: $2,040.00 per year',at:at(2026,11,1)}]};
 const opened=[];
 const fake=provider=>({key:provider+':1',email:provider==='google'?'me@gmail.com':'me@outlook.com',provider,open:async options=>{opened.push({provider,...options});return {ids:inbox[provider].map(m=>m.id),get:async id=>({...inbox[provider].find(m=>m.id===id),account:'me',provider,url:'https://example.invalid/'+id})};}});
 const notes=[];
 const enc={encrypt:v=>Buffer.from('X'+Buffer.from(v).toString('base64')),decrypt:b=>Buffer.from(String(b).slice(1),'base64').toString()};
 let accounts=[fake('google'),fake('microsoft')];
 const records=feature.create(s,{fetchAccounts:()=>accounts,crypt:enc,registry:()=>[],publish:n=>notes.push(n)});
 assert.equal(settings.mailRecords,'false','off by default');
 await assert.rejects(records.scan(),/выключено/);
 assert.equal(opened.length,0,'no mail read while off');
 records.enable(true);
 let res=await records.scan();
 assert.deepEqual([res.read,res.added],[4,3],'the resent receipt (same merchant, amount, day) is one record');
 const netflix=records.list({merchant:'netflix'});
 assert.equal(netflix.length,2);assert.deepEqual(netflix.map(x=>x.date),['2026-11-09','2026-10-09']);
 assert.deepEqual(netflix[0].also,['a3'],'the duplicate message is remembered');
 assert.equal(records.list({types:['subscription']}).find(x=>x.merchant==='Unity').amount,2040);
 assert.equal(opened[0].days,365);assert.equal(opened[0].after,0,'the first scan reads the configured window');
 assert.equal(notes.at(-1).id,'mail-records-scan');assert.match(notes.at(-1).text,/прочитано писем 4, новых записей 3/);
 const raw=fs.readFileSync(path.join(root,'mail-records','records.json'),'utf8');
 assert.ok(raw.startsWith('enc:')&&!raw.includes('Netflix'),'stored encrypted');
 if(process.platform!=='win32')assert.equal(fs.statSync(path.join(root,'mail-records','records.json')).mode&0o777,0o600);
 // The next scan reads only new mail, from the last scan with an overlap.
 inbox.google.push({id:'a4',from:'Spotify <no-reply@spotify.com>',subject:'Your receipt',text:'Premium Individual\nTotal: €10.99 per month\nNext payment: December 3, 2026',at:at(2026,11,3)});
 res=await records.scan();assert.deepEqual([res.read,res.added],[1,1]);assert.ok(opened.at(-1).after>0);
 // A failing account does not hide the others; all failing is an error.
 accounts=[fake('google'),{key:'microsoft:2',email:'x@corp.com',provider:'microsoft',open:async()=>{throw Error('Вход Outlook истёк. Подключите аккаунт заново.');}}];
 res=await records.scan();assert.equal(res.errors.length,1);assert.match(notes.at(-1).text,/Не прочитано: x@corp\.com/);
 accounts=[];await assert.rejects(records.scan(),/Почта не подключена/);
 // Forget and wipe.
 assert.equal(records.forget(netflix[1].id),true);assert.equal(records.list({merchant:'Netflix'}).length,1);
 records.wipe();assert.equal(records.list().length,0);assert.ok(!fs.existsSync(path.join(root,'mail-records')));
 // App parsers through the registry: a matching parser's records win over the built-in ones.
 const app={id:'game-store',name:'Магазин игры',parser:{id:'game-store',match:({from})=>/@shop\.bunker\.dev/.test(from),parse:m=>[{type:'receipt',merchant:'Bunker Shop',amount:4.99,currency:'USD',evidence:{amount:m.text}}]}};
 const withApp=feature.create(s,{fetchAccounts:()=>[],registry:()=>[app]});
 r=await withApp.extract(mail({from:'Shop <pay@shop.bunker.dev>',subject:'Receipt',text:'Gems pack 4.99 USD'}));
 assert.deepEqual([r[0].merchant,r[0].source],['Bunker Shop','parser:game-store']);
 assert.ok(feature.load().every(x=>typeof x.parser.parse==='function'),'real registry entries are well-formed');
 // Settings validation.
 assert.throws(()=>feature.validate({mailRecordsDays:'5'}),/от 30 до 730/);assert.throws(()=>feature.validate({mailRecords:'yes'}));

 // --- Fetch: the Gmail query and the Outlook reader on stubbed REST answers -------------------------------------------
 assert.match(fetchMail.gmailQuery(365,0),/^newer_than:365d \(category:purchases OR subject:\(receipt OR /);
 assert.match(fetchMail.gmailQuery(365,at(2026,11,1)),/^after:\d+ /);
 const calls=[];
 const gclient={access:async()=>'t',json:async url=>{calls.push(url);if(url.includes('/messages?'))return {messages:[{id:'18c0ffee'},{id:'bad id'}]};
  return {id:'18c0ffee',internalDate:String(at(2026,11,3)),payload:{headers:[{name:'From',value:'Spotify <no-reply@spotify.com>'},{name:'Subject',value:'Your receipt'}],parts:[{mimeType:'text/html',body:{data:Buffer.from(ld({'@type':'Order',merchant:{name:'Spotify AB'},price:'10.99',priceCurrency:'EUR'})).toString('base64url')}}]}};}};
 const g=await fetchMail.gmail(gclient,{email:'me@gmail.com'},{days:30});
 assert.deepEqual(g.ids,['18c0ffee'],'malformed ids are skipped');
 const gm=await g.get('18c0ffee');assert.ok(gm.html.includes('ld+json'));assert.equal(gm.url,'https://mail.google.com/mail/u/?authuser=me%40gmail.com#all/18c0ffee');
 assert.equal((await feature.extract(gm,{}))[0].merchant,'Spotify AB');
 const oclient={access:async()=>'t',json:async url=>{assert.match(url,/^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/messages\?/);return {value:[{id:'AAMk1',subject:'Your Unity receipt',from:{emailAddress:{name:'Unity',address:'billing@unity3d.com'}},receivedDateTime:'2026-11-01T10:00:00Z',body:{contentType:'html',content:'<p>Total: $2,040.00</p>'},webLink:'https://outlook.office365.com/owa/?ItemID=AAMk1'},{id:'AAMk2',subject:'Lunch?',body:{content:''}}],'@odata.nextLink':'https://evil.example/next'};}};
 const o=await fetchMail.outlook(oclient,{email:'me@outlook.com'},{days:30});
 assert.deepEqual(o.ids,['AAMk1'],'only receipt-like subjects; a foreign next link is not followed');
 const om=await o.get('AAMk1');assert.equal(om.text,'Total: $2,040.00');assert.equal(om.from,'"Unity" <billing@unity3d.com>');

 fs.rmSync(root,{recursive:true,force:true});
 console.log('Mail records: money, dates, JSON-LD, plain-text receipts/renewals/bookings, verbatim model evidence, registry, dedupe, opt-in scans, encryption, wipe, fetch passed');
})().catch(e=>{console.error(e);process.exit(1);});
