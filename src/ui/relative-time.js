// Interface rule: past (and near-future) moments are shown relative to now — «12 секунд назад», «5 минут назад»,
// «сегодня в 14:05», «вчера в 23:30», «в понедельник в 10:00»; a date only when it is more than a week away.
// Hovering shows the full date and time. See AGENTS.md → «Interface rules».
//   window.relativeTime(date)        → the text
//   window.timeElement(date)         → a <time> that keeps itself up to date and has the full date as its tooltip
//   any <time datetime="…"> added to the page gets the same treatment unless it has data-absolute.
(()=>{
 const lang=()=>window.petyaLanguage==='en'?'en':'ru',locale=()=>window.petyaLocale||(lang()==='en'?'en-US':'ru-RU');
 const DAY=86400000;
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 const UNITS={second:['секунду','секунды','секунд'],minute:['минуту','минуты','минут'],hour:['час','часа','часов']};
 const WEEK_RU=['в воскресенье','в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу'];
 const clock=d=>d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
 const startOf=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
 function amount(n,unit,past){
  if(lang()==='en')return new Intl.RelativeTimeFormat('en',{numeric:'always'}).format(past?-n:n,unit);
  const text=n+' '+plural(n,UNITS[unit]);return past?text+' назад':'через '+text;
 }
 function relativeTime(value,now=new Date()){
  const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
  const ms=now-d,past=ms>=0,abs=Math.abs(ms),en=lang()==='en';
  if(abs<5000)return en?'just now':'только что';
  if(abs<60000)return amount(Math.floor(abs/1000),'second',past);
  if(abs<3600000)return amount(Math.floor(abs/60000),'minute',past);
  const days=Math.round((startOf(d)-startOf(now))/DAY),at=clock(d);
  if(days===0)return abs<3*3600000?amount(Math.floor(abs/3600000),'hour',past):(en?'today at ':'сегодня в ')+at;
  if(days===-1)return (en?'yesterday at ':'вчера в ')+at;
  if(days===1)return (en?'tomorrow at ':'завтра в ')+at;
  if(Math.abs(days)<7)return en?(days<0?'last ':'')+d.toLocaleDateString('en-US',{weekday:'long'})+' at '+at:WEEK_RU[d.getDay()]+' в '+at;
  return d.toLocaleDateString(locale(),{day:'numeric',month:'short',...(d.getFullYear()===now.getFullYear()?{}:{year:'numeric'})});
 }
 // Compact form for narrow places (the chat list): «сейчас», «5 мин», «3 ч», «вчера», «пн», then the date.
 function shortTime(value,now=new Date()){
  const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';const ms=now-d,en=lang()==='en';
  if(ms<60000)return en?'now':'сейчас';if(ms<3600000)return Math.floor(ms/60000)+(en?' min':' мин');
  const days=Math.round((startOf(now)-startOf(d))/DAY);if(days===0)return Math.floor(ms/3600000)+(en?' h':' ч');if(days===1)return en?'yesterday':'вчера';
  if(days<7)return d.toLocaleDateString(locale(),{weekday:'short'});return d.toLocaleDateString(locale(),{day:'2-digit',month:'2-digit',...(d.getFullYear()===now.getFullYear()?{}:{year:'2-digit'})});
 }
 const full=d=>d.toLocaleString(locale(),{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 function paint(el){const d=new Date(el.getAttribute('datetime'));if(Number.isNaN(d.getTime()))return;const text=el.dataset.style==='short'?shortTime(d):relativeTime(d);if(el.textContent!==text)el.textContent=text;if(!el.dataset.fullTitle){el.title=(el.dataset.prefix||'')+full(d);el.dataset.fullTitle='1';}el.setAttribute('translate','no');}
 function timeElement(value,{prefix=''}={}){const d=value instanceof Date?value:new Date(value);const el=document.createElement('time');if(Number.isNaN(d.getTime()))return el;el.dateTime=d.toISOString();if(prefix)el.dataset.prefix=prefix;el.dataset.relative='1';paint(el);return el;}
 // <time datetime> elements anywhere become relative (except data-absolute), and stay current.
 const relative=el=>el.tagName==='TIME'&&el.hasAttribute('datetime')&&!el.hasAttribute('data-absolute')&&/T\d{2}:\d{2}/.test(el.getAttribute('datetime'));
 const scan=root=>{if(root.nodeType!==1)return;if(relative(root))paint(root);for(const el of root.querySelectorAll?.('time[datetime]:not([data-absolute])')||[])if(relative(el))paint(el);};
 new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)scan(n);}).observe(document.documentElement,{childList:true,subtree:true});
 setInterval(()=>{for(const el of document.querySelectorAll('time[datetime]:not([data-absolute])'))if(relative(el))paint(el);},30000);
 window.relativeTime=relativeTime;window.shortTime=shortTime;window.timeElement=timeElement;window.fullTime=d=>full(d instanceof Date?d:new Date(d));
})();
