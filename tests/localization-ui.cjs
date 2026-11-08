// «Локализация» card in the real chat: data from the fixture project (Unity, I2 CSV, Android, iOS, JSON, .po)
// with a stubbed model translation; progress bars per language, filters by kind, the placeholders button,
// translations waiting for «Сохранить переводы», and texts never parsed as HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/localization/feature.cjs');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-loc-ui-'));fs.cpSync(path.join(__dirname,'fixtures/localization'),tmp,{recursive:true});
 const topic={id:'t',projectId:'p',messages:[]};
 const s={settings:{extension_localization:'true',localizationLengthRatio:'1.4',localizationSourceLanguage:'en',model:'stub',ollamaUrl:'http://127.0.0.1:11434'},companyId:'c',requestProgress:{report(){}},projectMemory:{get:()=>null},
  dialogue:{state:{projects:[{id:'p',folders:[tmp]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{list:()=>[]},
  async request(url,options){const {items}=JSON.parse(JSON.parse(options.body).messages[1].content);return {message:{content:JSON.stringify({items:items.map(x=>({id:x.id,text:/gems/.test(x.text)?'Kaufe Edelsteine':'Übersetzt: '+x.text}))})}};}};
 const reply=await app.turn(s,'переведи недостающие строки на немецкий');
 const card=reply.extensionData.localization;
 // A hostile source string must stay text.
 card.problems[0]={...card.problems[0],source:'<img src=x onerror=alert(1)> Play'};
 const report=(await app.turn(s,'проверь локализацию')).extensionData.localization;
 const messages=[{role:'user',text:'проверь локализацию'},{role:'assistant',text:'Проверил.',by:'Локализация',extensionData:{localization:report}},
  {role:'user',text:'переведи недостающие строки на немецкий'},{role:'assistant',text:reply.text,by:'Локализация',extensionData:{localization:card}}];
 await js(`view('home');showDialogueMessages(${JSON.stringify(messages)},'Локализация')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.loc-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.loc-card').length"),2);
 const first="document.querySelectorAll('.loc-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.loc-lang').length"),report.langs.length,'one progress bar per language');
 assert.ok(report.langs.length>=4);
 assert.equal(await js(first+".querySelectorAll('[role=progressbar]').length"),report.langs.length);
 assert.equal(await js("document.querySelectorAll('.loc-card img').length"),0,'texts are never HTML');
 assert.ok(await js("document.querySelectorAll('.loc-card [data-no-i18n]').length")>20,'keys, codes and texts are left to the translator');
 const rows=()=>js(first+".querySelectorAll('.loc-problems tbody tr').length");
 assert.equal(await rows(),12,'first page of problems');
 // The placeholders button filters the table (state lives in data-kind, not in labels).
 const buttons=await js(first+".querySelectorAll('.kit-actions button').length");assert.equal(buttons,2);
 await js(first+".querySelectorAll('.kit-actions button')[1].click()");
 assert.equal(await js(first+".querySelector('.loc-filter[aria-pressed=\"true\"]').dataset.kind"),'placeholders');
 const placeholderRows=report.problems.filter(p=>p.kind==='placeholders').length;
 assert.equal(await rows(),Math.min(12,placeholderRows));
 assert.ok(await js("[..."+first+".querySelectorAll('.loc-problems .loc-kind')].every(n=>n.classList.contains('kind-placeholders'))"));
 // A language counter narrows to that language.
 await js(first+".querySelector('.loc-counter.kind-missing').click()");
 const lang=await js(first+".querySelector('.loc-counter.kind-missing').dataset.lang");
 assert.ok(await js("[..."+first+".querySelectorAll('.loc-problems tbody tr td:nth-child(2)')].every(n=>n.textContent==="+JSON.stringify(lang)+")"));
 await js(first+".querySelector('.loc-reset').click()");await js(first+".querySelector('.loc-filter[data-kind=\"placeholders\"]').click()");
 // The translation card: review list, failures, planned new files and the save button.
 const second="document.querySelectorAll('.loc-card')[1]";
 assert.ok(await js(second+".querySelectorAll('.loc-tr').length")>=6);
 assert.equal(await js(second+".querySelectorAll('.loc-failed li').length"),card.translation.failed.length);
 assert.ok(card.translation.files.length>=4&&card.translation.files.every(f=>/\.petya-de/.test(f.path)));
 assert.equal(await js(second+".querySelectorAll('.loc-files li').length"),card.translation.files.length);
 assert.equal(await js(second+".querySelector('.kit-actions button.primary') !== null"),true,'save is the main action');
 assert.ok(card.translation.files.every(f=>!fs.existsSync(f.path)),'nothing written before the button');
 const file=await require('./card-shot.cjs')(win,'.loc-card','petya-localization');
 await js("document.querySelector('#card-shot .loc-translation').scrollIntoView({block:'start'})");await new Promise(r=>setTimeout(r,200));
 const lower=path.join(os.tmpdir(),'petya-localization-2.png');fs.writeFileSync(lower,(await win.webContents.capturePage()).toPNG());
 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Localization cards: per-language progress, filters, placeholders button, language counters, translations with failures and planned files passed · '+file+' · '+lower);
}};
require('../src/main.cjs');
