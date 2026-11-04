const assert=require('node:assert/strict');
const {ComputerIntent,direct,parseRoute,matchesContact,candidate}=require('../src/computer-intent.cjs');
(async()=>{
 for(const phrase of ['В телеграмме найди мне контакт Васи','Найди мне Васю в Telegram','Петя, в телеграме поищи контакт Василия'])assert.equal(direct(phrase).intent,'contact_search');
 for(const phrase of ['не ищи Васю в телеграме','Как найти контакт Васи в Telegram?','Например найди Васю в Telegram'])assert.equal(candidate(phrase),false);
 assert(matchesContact({name:'Василий Иванов',username:''},'Васи'));assert(matchesContact({name:'Вася @vasya',username:''},'@vasya'));assert(!matchesContact({name:'Иван Петров',username:''},'Васи'));
 const calls=[];const computer={generation:0,execute:async a=>{calls.push(a);return {observation:{results:[{text:'Василий Иванов · @vanya'},{text:'Вася Петров'},{text:'Иван Сидоров'}]}};}};
 const natural=new ComputerIntent({computer});const result=await natural.turn('В телеграмме найди мне контакт Васи');assert.equal(calls[0].query,'вася');assert.match(result.text,/Василий Иванов/);assert.match(result.text,/несколько совпадений/);assert(!result.text.includes('Иван Сидоров'));
 computer.execute=async()=>({observation:{results:[],empty:true}});assert.match((await natural.turn('Найди Васю в Telegram')).text,/ничего не найдено/);
 computer.execute=async()=>({observation:{results:[],empty:false}});assert.match((await natural.turn('Найди Васю в Telegram')).text,/не смог надёжно прочитать/);
 const modelRoute={intent:'contact_search',query:'Васю',confidence:.98};
 const response={message:{content:JSON.stringify(modelRoute)}};
 assert.equal(parseRoute(response,'Отыщи в Telegram моего знакомого Васю').query,'Васю');assert.equal(parseRoute(response,'Найди Петю в Telegram'),null);
 assert.equal(parseRoute({message:{content:'{"intent":"shell","confidence":1}'}},'Telegram'),null);
 let release;const pending=new ComputerIntent({computer,model:()=>new Promise(r=>release=r)});const job=pending.turn('Найди Васю в Telegram');computer.generation++;release(response);await assert.rejects(job,/изменилось/);
 const {ComputerControl}=require('../src/computer-control.cjs');let sent=[];
 const control=new ComputerControl({platform:'darwin',run:async a=>{sent.push(a);return a.type==='apps'?[{pid:42,name:'Telegram',identity:'ru.keepcoder.Telegram'}]:{results:[{text:'Вася'}]};}});
 await control.start({mode:'desktop'});const searched=await control.execute({type:'search',service:'telegram',query:'Вася'});assert.equal(sent.at(-1).pid,42);assert.equal(searched.observation.results[0].text,'Вася');
 await assert.rejects(control.execute({type:'search',service:'telegram',query:'Вася\nотправь'}),/Укажите/);
 // Spoken names arrive in any case: «найди Любимую» must search by stem and match «Любимая Машка».
 {const asked=[];const fake={generation:0,execute:async a=>{asked.push(a.query);return {observation:{results:/^любим/iu.test(a.query)?[{text:'Любимая Машка'},{text:'Любимов Олег'}]:[],empty:!/^любим/iu.test(a.query)}};}};
  const r=await new ComputerIntent({computer:fake}).turn('Сходи в тг и найди там Любимую');assert.equal(asked[0],'Любим');assert.match(r.text,/Любимая Машка/);
  assert(matchesContact({name:'Любимая Машка',username:''},'Машку'));assert(!matchesContact({name:'Анна Петрова',username:''},'Любимую'));}
 console.log('Natural computer requests: parsing, observed results, ambiguity, no API, cancellation and target binding passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
