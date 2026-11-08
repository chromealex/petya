// «Глоссарий» cards in the real chat: candidates and saved terms with translation chips, mixed-translation marks,
// forbidden variants and usage bars; search; «Принять», «Изменить» and the red trash with «Отменить» through the
// feature IPC (real main process, the company's glossary store); export content; the check card with variant bars
// and the table of differing strings; safe text.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 await js('window.chatNavigationReady');
 const usage=(strings,chat=0,docs=0)=>({strings,chat,docs});
 const chest={term:'сундук',definition:'',translations:{en:'chest',de:'Truhe'},synonyms:[],forbidden:[],saved:false,usage:usage(8,1),
  variants:{en:[{text:'chest',n:5},{text:'box',n:2},{text:'',n:1}],de:[{text:'Truhe',n:8}]},
  examples:[{key:'chest.open',set:'Localization.csv',text:'Открыть сундук'},{key:'chest.hero',set:'Localization.csv',text:'Сундук героя'}],
  chat:[{source:'Slack',title:'Баланс',text:'Сундук героя слишком щедрый, режем награду',url:'https://app.slack.com/archives/C1/p1762000000000100'}],sources:[{kind:'loc',label:'Локализация: 8 строк'},{kind:'chat',label:'Переписка и встречи: 1'}]};
 const mana={term:'мана',definition:'Ресурс для умений героя, восстанавливается со временем.',translations:{en:'mana',de:'Mana'},synonyms:[],forbidden:[],saved:false,usage:usage(3,1,1),
  variants:{en:[{text:'mana',n:3}]},examples:[{key:'mana.low',set:'Localization.csv',text:'Мало маны'}],chat:[],sources:[{kind:'doc',label:'Confluence · Глоссарий Bunker',url:'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=42'}]};
 const candidates=[chest,mana,
  {term:'ивент',definition:'Временное событие с наградами.',translations:{en:'event',de:'Event'},synonyms:['эвент'],forbidden:[],saved:false,usage:usage(4,1),variants:{},examples:[],chat:[],sources:[{kind:'model',label:'Определение предложено по строкам локализации'}]},
  {term:'баттлпасс',definition:'Сезонный пропуск с наградами за задания.',translations:{en:'battle pass',de:'Battle Pass'},synonyms:[],forbidden:[],saved:false,usage:usage(2,0,1),variants:{},examples:[],chat:[],sources:[]},
  {term:'кристаллы',definition:'<img src=x onerror=alert(1)> премиальная валюта',translations:{en:'gems',de:'Kristalle'},synonyms:[],forbidden:['гемы'],saved:false,usage:usage(2),variants:{},examples:[],chat:[],sources:[]}];
 const build={cardId:'card-build',projectId:'general',project:'Bunker',mode:'candidates',terms:[],candidates,scanned:{sets:['Localization.csv','strings.xml'],strings:20,docs:1}};
 const check={cardId:'card-check',projectId:'general',project:'Bunker',mode:'check',candidates:[],
  terms:[{id:'t-1',...chest,definition:'Награда, которая открывается ключом',forbidden:['crate','ларец'],saved:true},{id:'t-2',...mana,forbidden:['МП'],saved:true}],
  check:{total:5,summary:[{term:'сундук',lang:'en',expected:'chest',total:8,variants:[{text:'chest',n:5,ok:true},{text:'box',n:2,ok:false},{text:'',n:1,ok:false}]},{term:'сундук',lang:'de',expected:'',total:8,variants:[{text:'Truhe',n:8,ok:true}]},{term:'мана',lang:'en',expected:'',total:3,variants:[{text:'mana',n:3,ok:true}]}],
   issues:[{kind:'forbidden',term:'сундук',lang:'en',key:'chest.daily',set:'Localization.csv',text:'Daily crate',found:'crate',expected:'chest'},{kind:'forbidden',term:'мана',lang:'ru',key:'mana.mp',set:'Localization.csv',text:'Нужно 5 МП',found:'МП',expected:'мана'},
    {kind:'translation',term:'сундук',lang:'en',key:'chest.hero',set:'Localization.csv',text:"Hero's box",found:'box',expected:'chest'},{kind:'translation',term:'сундук',lang:'en',key:'notif_box',set:'strings.xml',text:'The box is open',found:'box',expected:'chest'},
    {kind:'inconsistent',term:'мана',lang:'de',key:'mana.potion',set:'Localization.csv',text:'Manatrank',found:'Manatrank',expected:'Mana'}]},scanned:{sets:['Localization.csv','strings.xml'],strings:20}};
 await js("window.petya.saveSettings({extension_glossary:'true'})");
 await js(`window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};
  view('home');showDialogueMessages([{role:'user',text:'собери глоссарий проекта'},{role:'assistant',text:'Нашёл 5 кандидатов.',by:'Глоссарий',extensionData:{glossary:${JSON.stringify(build)}}},
   {role:'user',text:'проверь термины в локализации'},{role:'assistant',text:'5 расхождений.',by:'Глоссарий',extensionData:{glossary:${JSON.stringify(check)}}}],'Глоссарий')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.gl-card').length===2"))break;await new Promise(r=>setTimeout(r,40));}
 const first="document.querySelectorAll('.gl-card')[0]",second="document.querySelectorAll('.gl-card')[1]";
 assert.equal(await js(first+".querySelectorAll('.gl-row.candidate').length"),5);
 assert.equal(await js(first+".querySelector('.gl-row .gl-term').textContent"),'сундук');
 assert.deepEqual(await js(`[...${first}.querySelector('.gl-row').querySelectorAll('.gl-tr')].map(n=>n.textContent)`),['ENchest','DETruhe']);
 assert.equal(await js(first+".querySelector('.gl-row .gl-tr.mixed').title"),'В строках: chest — 5, box — 2, другое — 1','several translations are marked');
 assert.equal(await js(first+".querySelector('.gl-row .gl-def.empty')!==null"),true,'no invented definition');
 assert.equal(await js("document.querySelectorAll('.gl-card img').length"),0,'service text is never HTML');
 assert.equal(await js(first+".querySelectorAll('.gl-forbidden').length"),1);
 assert.equal(await js(first+".querySelector('.gl-export').hidden"),true,'nothing to export before a term is saved');
 // Search filters rows.
 await js(first+".querySelector('.gl-search').value='ман';"+first+".querySelector('.gl-search').dispatchEvent(new Event('input'))");
 assert.equal(await js(`[...${first}.querySelectorAll('.gl-row')].filter(r=>!r.hidden).length`),1);
 await js(first+".querySelector('.gl-search').value='';"+first+".querySelector('.gl-search').dispatchEvent(new Event('input'))");
 // «Изменить» then «Принять»: the edited fields are stored in the company's glossary.
 await js(first+".querySelector('.gl-row .gl-actions button:not(.accept)').click()");
 assert.equal(await js(first+".querySelectorAll('.gl-edit').length"),1);
 await js(`(()=>{const f=${first}.querySelector('.gl-edit');const [term,def,tr,syn,forb]=f.querySelectorAll('input,textarea');def.value='Награда, которая открывается ключом';tr.value='en: chest; de: Truhe';forb.value='crate, ларец';f.requestSubmit();})()`);
 for(let i=0;i<60&&!(await js(first+".querySelector('.gl-row').dataset.state==='saved'"));i++)await new Promise(r=>setTimeout(r,40));
 assert.equal(await js(first+".querySelector('.gl-row').dataset.state"),'saved');
 assert.equal(await js(first+".querySelector('.gl-export').hidden"),false,'export appears after the first saved term');
 // «Принять» on the next candidate.
 await js(first+".querySelector('.gl-row.candidate .accept').click()");
 for(let i=0;i<60&&(await js(first+".querySelectorAll('.gl-row.candidate').length"))!==3;i++)await new Promise(r=>setTimeout(r,40));
 const exported=await js("window.petya.feature('glossary','export','general','csv')");
 assert.match(exported.content,/сундук,"Награда, которая открывается ключом",,"crate; ларец",Truhe,chest/);assert.match(exported.content,/\r\nмана,/);
 // Delete is the red trash with «Отменить».
 assert.equal(await js(first+".querySelectorAll('.gl-row[data-state=saved] .delete-button').length"),2);
 await js(first+".querySelector('.gl-row[data-state=saved] .delete-button').click()");
 for(let i=0;i<60&&!(await js(first+".querySelector('.gl-row[data-state=removed]')"));i++)await new Promise(r=>setTimeout(r,40));
 assert.equal(JSON.parse((await js("window.petya.feature('glossary','export','general','json')")).content).terms.length,1);
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<60&&(await js(first+".querySelector('.gl-row[data-state=removed]')"));i++)await new Promise(r=>setTimeout(r,40));
 assert.equal(JSON.parse((await js("window.petya.feature('glossary','export','general','json')")).content).terms.length,2,'«Отменить» restores the term');
 // The check card: variant bars and the table.
 assert.equal(await js(second+".querySelectorAll('.gl-bar-row').length"),3);
 assert.deepEqual(await js(`[...${second}.querySelector('.gl-bar').children].map(s=>s.dataset.ok)`),['true','false','false']);
 assert.equal(await js(second+".querySelectorAll('.gl-table tbody tr').length"),5);
 assert.equal(await js(second+".querySelector('.gl-issue[data-kind=forbidden]').textContent"),'запрещено «crate» → «chest»');
 await js(second+".querySelector('.kit-actions>button:last-child').click()");
 assert.deepEqual(await js('window.__asked.at(-1)'),['Собери глоссарий проекта',true]);
 await js("document.querySelectorAll('.gl-card')[0].querySelector('.gl-row .gl-more').open=true");
 await js(second+".classList.add('gl-shot-check')");
 console.log('Glossary cards: '+await require('./card-shot.cjs')(win,'.gl-card','petya-glossary'));
 await js("(()=>{const box=document.getElementById('card-shot'),keep=document.createElement('div');keep.append(...box.querySelectorAll('.gl-card'));document.body.append(keep);box.remove();})()");
 console.log('Glossary check: '+await require('./card-shot.cjs')(win,'.gl-shot-check','petya-glossary-check'));
 console.log('Glossary cards: candidates and terms, translation chips, search, accept/edit/delete with undo, export, check bars and table, safe text passed');
}};
require('../src/main.cjs');
