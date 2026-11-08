// Interface rule: moments are relative («12 секунд назад», «вчера в 23:30»); a date only after a week.
const assert=require('node:assert/strict');
global.window={petyaLanguage:'ru',petyaLocale:'ru-RU'};global.document={documentElement:{},querySelectorAll:()=>[]};
global.MutationObserver=class{observe(){}};const interval=global.setInterval;global.setInterval=()=>0;
require('../src/ui/relative-time.js');global.setInterval=interval;
const now=new Date(2026,10,9,15,0),ago=ms=>window.relativeTime(new Date(now-ms),now);
assert.equal(ago(2000),'только что');assert.equal(ago(12000),'12 секунд назад');assert.equal(ago(61000),'1 минуту назад');assert.equal(ago(22*60000),'22 минуты назад');
assert.equal(ago(2*3600000+60000),'2 часа назад');assert.equal(window.relativeTime(new Date(2026,10,9,9,5),now),'сегодня в 09:05');
assert.equal(window.relativeTime(new Date(2026,10,8,23,30),now),'вчера в 23:30');assert.equal(window.relativeTime(new Date(2026,10,5,10,0),now),'в четверг в 10:00');
assert.equal(window.relativeTime(new Date(2026,10,10,9,0),now),'завтра в 09:00');assert.equal(window.relativeTime(new Date(now.getTime()+5*60000),now),'через 5 минут');
assert.match(window.relativeTime(new Date(2026,9,20),now),/^20 окт/);assert.match(window.relativeTime(new Date(2025,9,20),now),/2025/);
assert.equal(window.shortTime(new Date(2026,10,9,14,40),now),'20 мин');assert.equal(window.shortTime(new Date(2026,10,8,20,0),now),'вчера');
window.petyaLanguage='en';window.petyaLocale='en-US';assert.equal(ago(21*60000),'21 minutes ago');assert.match(window.relativeTime(new Date(2026,10,8,23,30),now),/^yesterday at 11:30/);
console.log('Relative time: seconds, minutes, hours, today/yesterday/tomorrow, weekday, date after a week, English passed');
