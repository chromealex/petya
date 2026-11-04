const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { LocalVoice, spokenText } = require('../src/local-voice.cjs');
(async()=>{
 assert.equal(spokenText('**Привет!**\n[Документ](https://example.com)'),'Привет! Документ');
 assert.throws(()=>spokenText('x'.repeat(12001)));
 const voice = new LocalVoice({roots:[]});
 assert.throws(()=>voice.speak('Привет'),/не установлен/);
 const child = new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('exit');
 voice.child=child;
 const cancelled=voice.speak('Привет');voice.stop();await assert.rejects(cancelled,/остановлено/);assert.equal(voice.pending,null);
 const real=new LocalVoice({roots:[process.cwd()]});
 if(process.env.PETYA_TEST_VOICE==='1'){
  try{const encoded=await real.speak('Привет! Я Петя. Давай спокойно разберёмся. Я посмотрю, что уже готово, и помогу со следующим шагом. С чего начнём?');const wav=Buffer.from(encoded,'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert(wav.length>48000);require('node:fs').writeFileSync('docs/petya-voice.wav',wav);console.log('Real offline synthesis verified:',wav.length,'bytes');for(const phrase of ['Hello! I can speak English. Please check the project in Slack.','Привет! Проект Bunker Wars открыт в Jira. Please check Slack.','Снова русский ответ.']){const result=Buffer.from(await real.speak(phrase),'base64');assert.equal(result.toString('ascii',0,4),'RIFF');assert(result.length>48000,phrase);}console.log('Real English, mixed and Russian follow-up synthesis passed');}finally{real.stop();}
 }
 console.log('Local voice checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
