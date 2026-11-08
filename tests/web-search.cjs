const assert=require('node:assert/strict');const {WebSearch,queryText,searchCommand}=require('../src/web-search.cjs');const {publicURL,publicIP}=require('../src/public-web.cjs');const {linksFrom,passed}=require('../src/search-browser.cjs');
// A Google check shown in the chat's browser is over once the page leaves «sorry», consent and sign-in.
assert(!passed('https://www.google.com/sorry/index?continue=x'));assert(!passed('https://consent.google.com/m?continue=x'));assert(!passed('https://accounts.google.com/signin'));assert(passed('https://www.google.com/search?q=x'));
(async()=>{
 assert.equal(searchCommand('обычный вопрос',{}),null);assert.equal(searchCommand('не ищи в интернете пароль',{}),null);assert.equal(searchCommand('Найди в интернете, Electron Tray',{}).query,'Electron Tray');assert.equal(searchCommand('А для Windows?',{}),null);assert.equal(searchCommand('А для Windows?',{webQuery:'Electron Tray'}).query,'Electron Tray А для Windows?');
 assert.throws(()=>queryText('ошибка token=secret'));assert.throws(()=>queryText('письмо a@example.com'));assert.throws(()=>publicURL('https://localhost/'));assert.throws(()=>publicURL('file:///etc/passwd'));assert.equal(publicIP('127.0.0.1'),false);
 const rows=linksFrom({links:[{url:'https://www.google.com/url?q=https%3A%2F%2Fwww.electronjs.org%2Fdocs',title:'Electron'},{url:'https://accounts.google.com/',title:'Sign in'},{url:'javascript:alert(1)',title:'Bad'},{url:'https://www.electronjs.org/docs',title:'duplicate'}]});assert.equal(rows.length,1);
 let calls=0;const search=new WebSearch({enabled:()=>true,searchAPI:async()=>rows,read:async url=>{calls++;return {url,text:'Verified documentation. '.repeat(20)};},model:async()=>({answer:'Ответ [1]',sources:[1]})});const result=await search.search('Electron tray');assert.equal(result.sources[0].url,rows[0].url);assert.match(result.sources[0].title,/\[1\]/);assert.equal(calls,1);
 search.model=async()=>({answer:'Fake',sources:[99]});assert.equal((await search.search('test')).verified,false);
 search.read=async()=>{throw Error('not available');};assert.match((await search.search('test')).text,/прочитать страницы не удалось/);
 search.searchAPI=async()=>{const e=Error('Captcha');e.code='BROWSER_ATTENTION';throw e;};await assert.rejects(()=>search.search('test'),e=>e.code==='BROWSER_ATTENTION');assert.equal(search.busy,false);
 // The subject is searched, not the question around it; Google's own results text is a source and is not read again.
 {let asked,read=0;const s=new WebSearch({enabled:()=>true,searchAPI:async q=>{asked=q;return [{url:'https://www.google.com/search?q=x',title:'Выдача Google: x',text:'Intelligence Index Score — сводный показатель. '.repeat(10)}];},read:async()=>{read++;return {url:'',text:''};},model:async()=>({answer:'Сводный показатель.',sources:[1]})});
  const r=await s.search('Что ты знаешь про Intelligence Index Score?');assert.equal(asked,'Intelligence Index Score');assert.equal(read,0);assert.match(r.text,/^Сводный показатель./);}
 {const {resultsText}=require('../src/search-browser.cjs');assert.equal(resultsText('Все\nКартинки\nкороткий',''),'');assert.match(resultsText('Все\nКартинки\n'+'Обзор от ИИ: индекс считается по набору тестов. '.repeat(10),'x'),/^Обзор от ИИ/);}
 search.enabled=()=>false;await assert.rejects(()=>search.search('test'),/Включите/);
 console.log('Web search: explicit routing, public links, query privacy, citations, reader failures and browser continuation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
