// The ANR widget with several Google Play apps: a calm prompt (not an error), a search field and a list of names;
// a search narrows the list, a click keeps the app with the widget and reads it.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=c=>win.webContents.executeJavaScript(c);
 const wait=async(code,label)=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout: '+(label||code));};
 const s=globalThis.petyaTestServices;await js('window.chatNavigationReady');
 const day=(y,m,d)=>({year:y,month:m,day:d});
 const apps=[...Array.from({length:30},(_,i)=>({name:'apps/azur.game'+i,displayName:'Game '+i,packageName:'azur.game'+i})),{name:'apps/com.azur.bunkerwars',displayName:'Bunker Wars: WW1 RTS Game',packageName:'com.azur.bunkerwars'}];
 const stub=async(url,o={})=>{url=String(url);
  if(url.includes('oauth2.googleapis.com/token'))return {access_token:'a',expires_in:3600};
  if(url.includes('apps:search'))return {apps};
  if(url.endsWith('/anrRateMetricSet'))return {freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:day(2026,11,8)}]}};
  if(url.endsWith('/anrRateMetricSet:query')){const v=n=>({decimalValue:{value:String(n)}});return {rows:[{startTime:day(2026,11,7),metrics:[{metric:'anrRate',...v(0.004)},{metric:'userPerceivedAnrRate',...v(0.002)},{metric:'userPerceivedAnrRate7dUserWeighted',...v(0.002)}]}]};}
  throw Error('unexpected '+url);};
 Object.defineProperty(s,'request',{get:()=>stub,configurable:true});// services expose request as a getter
 Object.assign(s.settings,{module_googleplay:'true',googlePlayCredential:JSON.stringify({type:'oauth',client:{client_id:'c',client_secret:'x'},refresh_token:'r'})});
 const made=await js("window.petya.feature('dashboards','compose','ANR','general')");
 await js("window.openDashboard?window.openDashboard("+JSON.stringify(made.dashboard.id)+"):null");
 try{await wait("document.querySelector('.dash-widget .dash-choice-option')",'the app list on the card');}catch(e){console.log('DBG',JSON.stringify(await js("window.petya.feature('dashboards','peek',"+JSON.stringify(made.dashboard.id)+")")).slice(0,800),await js("document.querySelector('.dash-screen')?.hidden+' '+document.querySelectorAll('.dash-widget').length"));throw e;}
 const look=await js("(()=>{const c=document.querySelector('.dash-widget');return {error:!!c.querySelector('.dash-widget-error'),ask:c.querySelector('.dash-choice-ask')?.textContent,rows:c.querySelectorAll('.dash-choice-option').length,find:!!c.querySelector('.dash-choice-find')};})()");
 assert.equal(look.error,false,'a question is not an error');assert.match(look.ask,/выберите/);assert.equal(look.rows,12);assert(look.find);
 await js("(()=>{const f=document.querySelector('.dash-choice-find');f.value='bunker';f.dispatchEvent(new Event('input'));})()");
 assert.deepEqual(await js("[...document.querySelectorAll('.dash-choice-name')].map(n=>n.textContent)"),['Bunker Wars: WW1 RTS Game']);
 if(process.env.PETYA_SHOT){await js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing')");await js("(()=>{const f=document.querySelector('.dash-choice-find');f.value='';f.dispatchEvent(new Event('input'));})()");win.show();win.setSize(1280,820);await new Promise(r=>setTimeout(r,600));require('node:fs').writeFileSync(process.env.PETYA_SHOT,(await win.webContents.capturePage()).toPNG());await js("(()=>{const f=document.querySelector('.dash-choice-find');f.value='bunker';f.dispatchEvent(new Event('input'));})()");}
 await js("document.querySelector('.dash-choice-option').click()");
 await wait("[...document.querySelectorAll('.dash-widget-title')].some(t=>t.textContent==='ANR · Bunker Wars: WW1 RTS Game')&&!document.querySelector('.dash-choice')",'the widget reads the chosen app');
 console.log('Dashboard choice UI: a calm prompt with search and a list, «bunker» narrows it, the choice is kept and read passed');
}};
require('../src/main.cjs');
