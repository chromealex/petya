// Interface language of Petya: the system language by default, or the user's explicit choice.
// The choice is application-wide (not per company) and lives in userData/interface-language.json.
// Russian is the source language of all interface strings; other languages translate them through
// src/locales/<code>.json, keyed by the Russian text (see scripts/i18n-strings.cjs).
const fs=require('node:fs'),path=require('node:path');
const core=require('./ui/i18n-core.js');
const PREFERENCES=['system',...core.SUPPORTED];
const NAMES={system:'Как в системе',ru:'Русский',en:'English'};
let cached=null;
function electronApp(){try{const electron=require('electron');return typeof electron==='object'?electron.app:null;}catch{return null;}}
function file(app=electronApp()){return app?path.join(app.getPath('userData'),'interface-language.json'):null;}
function readPreference(app=electronApp()){try{const value=JSON.parse(fs.readFileSync(file(app),'utf8')).preference;return PREFERENCES.includes(value)?value:'system';}catch{return 'system';}}
function systemLanguages(app=electronApp()){if(!app)return [];try{const list=app.getPreferredSystemLanguages?.()||[];return list.length?list:[app.getLocale?.()].filter(Boolean);}catch{return [];}}
function strings(language){
 if(language==='ru')return {};
 try{return JSON.parse(fs.readFileSync(path.join(__dirname,'locales',language+'.json'),'utf8')).strings||{};}catch{return {};}
}
function state(){
 if(cached)return cached;
 const app=electronApp();
 // Outside Electron (unit tests, scripts) the interface stays in its source language.
 if(!app){cached={preference:'system',language:'ru',system:[],translator:core.create({})};return cached;}
 // PETYA_INTERFACE_LANGUAGE fixes the language for tests; development smoke tests are written against Russian text.
 const forced=process.env.PETYA_INTERFACE_LANGUAGE||(process.env.PETYA_SMOKE_TEST==='1'&&!app.isPackaged?'ru':'');
 const preference=core.SUPPORTED.includes(forced)?forced:readPreference(app),system=systemLanguages(app),language=core.resolve(preference,system);
 cached={preference,language,system,translator:core.create(strings(language))};
 return cached;
}
function setPreference(preference){
 if(!PREFERENCES.includes(preference))throw Error('Неизвестный язык интерфейса.');
 const app=electronApp(),target=file(app);if(!target)throw Error('Язык интерфейса нельзя сохранить вне приложения.');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target+'.tmp',JSON.stringify({preference}));fs.renameSync(target+'.tmp',target);
 cached=null;return describe();
}
function describe(){
 const s=state();
 return {preference:s.preference,language:s.language,systemLanguage:core.resolve('system',s.system),options:PREFERENCES.map(code=>({code,label:NAMES[code]}))};
}
// What the renderer needs synchronously before the first paint.
function bootstrap(){const s=state();return {language:s.language,preference:s.preference,strings:s.language==='ru'?{}:strings(s.language)};}
function t(text){return state().translator.translate(text);}
function locale(){return state().language==='ru'?'ru-RU':'en-US';}
module.exports={t,locale,bootstrap,describe,setPreference,state,reset(){cached=null;}};
