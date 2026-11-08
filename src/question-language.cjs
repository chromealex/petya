// Language settings for conversation:
// - «Язык ответов» (communicationLanguage): a fixed language code, or 'auto' — answer in the language
//   of the question. The question language is known for the whole request through AsyncLocalStorage:
//   a request rewritten from another language (src/command-language.cjs) carries its language, a
//   Russian request is Russian.
// - «Язык речи» (speechLanguage): the language hint for speech recognition. '' (default) follows a
//   fixed non-Russian reply language as before, otherwise the interface language; 'interface' always the
//   interface language; 'auto' lets the recogniser decide (it may hear Russian as Czech); or a code.
const {AsyncLocalStorage}=require('node:async_hooks');
const store=new AsyncLocalStorage();
const CYRILLIC=/[А-Яа-яЁё]/u;
const CODE=/^[a-z]{2}$/;
function run(language,work){return store.run({language:CODE.test(language||'')?language:''},work);}
function current(){return store.getStore()?.language||'';}
// The code the answer should be in, or 'same' when it is unknown and the model should follow the question.
function replyLanguage(setting,question=''){
 if(setting!=='auto')return CODE.test(setting||'')?setting:'ru';
 return current()||(CYRILLIC.test(String(question))?'ru':'same');
}
// The voice of an answer under 'auto' follows the answer text itself.
function voiceLanguage(setting,text=''){
 if(setting!=='auto')return CODE.test(setting||'')?setting:'ru';
 return CYRILLIC.test(String(text))?'ru':current()||'en';
}
function speechLanguage(settings={},interfaceLanguage='ru'){
 const choice=settings.speechLanguage||'';
 if(choice==='auto')return '';
 if(CODE.test(choice))return choice;
 const reply=settings.communicationLanguage;
 if(choice===''&&CODE.test(reply||'')&&reply!=='ru')return reply;
 return interfaceLanguage;
}
module.exports={run,current,replyLanguage,voiceLanguage,speechLanguage};
