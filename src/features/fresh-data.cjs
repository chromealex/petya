// Feature: weather and currency rates from open APIs (Open-Meteo, Bank of Russia rates) instead of a
// Google search that keeps asking for a CAPTCHA. Anything else still goes to the web search.
const WEATHER=/(?:^|[\s,])(?:погод\p{L}*|прогноз\p{L}*|температур\p{L}*|дожд\p{L}*|снег\p{L}*|зонт\p{L}*)(?:$|[\s,.!?])/iu;
const RATE=/(?:курс\p{L}*|сколько стоит|почём|почем)\s+(?:\p{L}+\s+)?(доллар\p{L}*|евро|юан\p{L}*|фунт\p{L}*|франк\p{L}*|иен\p{L}*|йен\p{L}*|лир\p{L}*|тенге|рубл\p{L}*|бел\p{L}*\s+рубл\p{L}*|usd|eur|cny|gbp|chf|jpy|try|kzt|byn)/iu;
const CODES={доллар:'USD',usd:'USD',евро:'EUR',eur:'EUR',юан:'CNY',cny:'CNY',фунт:'GBP',gbp:'GBP',франк:'CHF',chf:'CHF',иен:'JPY',йен:'JPY',jpy:'JPY',лир:'TRY',try:'TRY',тенге:'KZT',kzt:'KZT',бел:'BYN',byn:'BYN'};
const NAMES={USD:'доллар США',EUR:'евро',CNY:'юань',GBP:'фунт стерлингов',CHF:'швейцарский франк',JPY:'японская иена',TRY:'турецкая лира',KZT:'тенге',BYN:'белорусский рубль'};
const WMO={0:'ясно',1:'преимущественно ясно',2:'переменная облачность',3:'пасмурно',45:'туман',48:'изморозь',51:'слабая морось',53:'морось',55:'сильная морось',56:'ледяная морось',57:'ледяная морось',61:'небольшой дождь',63:'дождь',65:'сильный дождь',66:'ледяной дождь',67:'ледяной дождь',71:'небольшой снег',73:'снег',75:'сильный снег',77:'снежные зёрна',80:'ливень',81:'ливни',82:'сильные ливни',85:'снегопад',86:'сильный снегопад',95:'гроза',96:'гроза с градом',99:'гроза с сильным градом'};
const num=(v,d=0)=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d});
const signed=v=>(v>0?'+':'')+num(Math.round(v));
function weatherQuestion(command=''){
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'');
 if(!WEATHER.test(text)||/(?:что такое|почему|как работает|объясни|в игре|в проекте)/iu.test(text))return null;
 const day=/послезавтра/iu.test(text)?2:/завтра/iu.test(text)?1:0;
 const city=/\s(?:в|во)\s+((?:\p{Lu}[\p{L}-]*)(?:[\s-]+\p{Lu}[\p{L}-]*)*)/u.exec(text)?.[1]||/\s(?:в|во)\s+([\p{L}-]{3,}(?:\s+[\p{L}-]+)?)\s*(?:сегодня|завтра|послезавтра|сейчас)?[?.!]*$/iu.exec(text)?.[1]||'';
 return {day,city:city.replace(/\s+(?:сегодня|завтра|послезавтра|сейчас)$/iu,'').trim()};
}
function rateQuestion(command=''){const m=RATE.exec(String(command));if(!m)return null;const word=m[1].toLowerCase();const code=Object.entries(CODES).find(([k])=>word.startsWith(k))?.[1];return code&&code!=='RUB'?{code}:null;}
// «Москве» → «Москва», «Петербурге» → «Петербург», «Казани» → «Казань».
function cityVariants(city){const c=city.trim();const out=[c];if(/е$/u.test(c)){out.push(c.slice(0,-1)+'а',c.slice(0,-1),c.slice(0,-1)+'я');}if(/и$/u.test(c))out.push(c.slice(0,-1)+'ь',c.slice(0,-1)+'я');if(/у$/u.test(c))out.push(c.slice(0,-1)+'а');return [...new Set(out)].filter(v=>v.length>1);}
module.exports={
 name:'fresh-data',
 weatherQuestion,rateQuestion,cityVariants,
 setup(s){
  const get=async url=>s.request(url,{headers:{Accept:'application/json'}});
  const reply=(command,text,sources)=>{s.dialogue.rememberAction(command,text);const t=s.dialogue.active();const last=t?.messages?.at(-1);if(last?.role==='assistant'){last.by='открытые данные';last.sources=sources;}s.dialogue.persist();return {handled:true,text,by:'открытые данные',sources,topicId:t?.id,topicTitle:t?.title,messages:t?.messages};};
  const weather=async(command,q)=>{
   if(!q.city)return {handled:true,question:true,text:'В каком городе посмотреть погоду?',by:'открытые данные'};
   s.requestProgress.report('Смотрю погоду: '+q.city);
   let place=null;for(const name of cityVariants(q.city)){const found=await get('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name,count:'1',language:'ru',format:'json'}));if(found?.results?.length){place=found.results[0];break;}}
   if(!place)return {handled:true,question:true,text:'Не нашёл город «'+q.city+'». Уточни название.',by:'открытые данные'};
   const f=await get('https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',timezone:'auto',forecast_days:'3',wind_speed_unit:'ms'}));
   if(!f?.daily?.time?.length)throw Error('Сервис погоды не ответил.');
   const where=place.name+(place.admin1&&place.admin1!==place.name?', '+place.admin1:'');const d=q.day,daily=f.daily;
   const dayText=(i,label)=>label+': '+signed(daily.temperature_2m_min[i])+'…'+signed(daily.temperature_2m_max[i])+'°, '+(WMO[daily.weather_code[i]]||'без осадков')+(daily.precipitation_probability_max?.[i]!=null?', осадки '+daily.precipitation_probability_max[i]+'%':'');
   const text=d===0&&f.current?where+' сейчас '+signed(f.current.temperature_2m)+'° (ощущается как '+signed(f.current.apparent_temperature)+'°), '+(WMO[f.current.weather_code]||'')+', ветер '+num(f.current.wind_speed_10m)+' м/с.\n'+dayText(0,'Сегодня')+'\n'+dayText(1,'Завтра'):where+' — '+dayText(d,d===1?'завтра':'послезавтра')+'.';
   return reply(command,text,[{title:'Open-Meteo · '+where,url:'https://open-meteo.com/'}]);
  };
  const rate=async(command,q)=>{
   s.requestProgress.report('Смотрю курс ЦБ');
   const data=await get('https://www.cbr-xml-daily.ru/daily_json.js');const v=data?.Valute?.[q.code];if(!v)throw Error('Курс не найден.');
   const per=v.Nominal>1?' за '+v.Nominal:'';const change=v.Value-v.Previous;const date=new Date(data.Date).toLocaleDateString('ru-RU');
   const text='Курс ЦБ на '+date+': '+NAMES[q.code]+per+' — '+num(v.Value,2)+' ₽ ('+(change>=0?'+':'−')+num(Math.abs(change),2)+' к прошлому дню).';
   return reply(command,text,[{title:'Банк России · курсы валют',url:'https://www.cbr.ru/currency_base/daily/'}]);
  };
  const turn=async command=>{
   if(!s.modules.enabled(s.settings,'web'))return null;
   const w=weatherQuestion(command),r=!w&&rateQuestion(command);if(!w&&!r)return null;
   try{return w?await weather(command,w):await rate(command,r);}catch(e){console.error('Fresh data:',e.message);return null;} // fall back to the web search
  };
  return {freshData:{turn}};
 }
};
