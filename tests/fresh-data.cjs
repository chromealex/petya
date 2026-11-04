const assert=require('node:assert/strict');const feature=require('../src/features/fresh-data.cjs');
(async()=>{
 const urls=[];const topic={messages:[]};
 const s={settings:{module_web:'true'},modules:{enabled:()=>true},requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction:(c,t)=>topic.messages.push({role:'user',text:c},{role:'assistant',text:t})},
  request:async url=>{urls.push(url);if(url.includes('geocoding')){return new URL(url).searchParams.get('name')==='Москва'?{results:[{name:'Москва',admin1:'Москва',latitude:55.75,longitude:37.62}]}:{};}
   if(url.includes('forecast'))return {current:{temperature_2m:2.4,apparent_temperature:-1.2,weather_code:3,wind_speed_10m:4.2},daily:{time:['a','b','c'],temperature_2m_min:[-1,0,1],temperature_2m_max:[3,4,5],precipitation_probability_max:[20,60,10],weather_code:[3,63,1]}};
   if(url.includes('cbr'))return {Date:'2026-11-05T11:30:00+03:00',Valute:{USD:{Nominal:1,Value:81.2345,Previous:81.5},CNY:{Nominal:1,Value:11.3,Previous:11.2}}};}};
 const {freshData}=feature.setup(s);
 let r=await freshData.turn('Какая сейчас погода в Москве?');assert.match(r.text,/^Москва сейчас \+2° \(ощущается как −1°|^Москва сейчас \+2° \(ощущается как -1°/);assert.match(r.text,/Завтра: 0…\+4°, дождь, осадки 60%/);assert.equal(r.by,'открытые данные');
 r=await freshData.turn('Погода в Москве завтра');assert.match(r.text,/завтра: 0…\+4°/);
 r=await freshData.turn('Нужен ли зонт?');assert(r.question);
 r=await freshData.turn('Какой курс доллара?');assert.match(r.text,/доллар США — 81,23 ₽ \(−0,27/);
 assert.equal(await freshData.turn('Покажи мои задачи'),null);
 s.request=async()=>{throw Error('offline');};assert.equal(await freshData.turn('Какая погода в Москве?'),null);
 s.modules.enabled=()=>false;assert.equal(await freshData.turn('Какой курс евро?'),null);
 console.log('Fresh data: weather now/tomorrow from Open-Meteo, CBR rates, city in any case, fallback to web search passed');
})().catch(e=>{console.error(e);process.exit(1);});
