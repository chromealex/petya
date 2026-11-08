// Meeting sources (src/features/meeting-sources.cjs): declared by extensions in `provides`, counted only while the
// extension is added; detection order and failures, speaker choice by overlap, participants, join links, the
// service letter; invalid declarations refused. Then the real sources (Google Meet, Microsoft Teams, Zoom): each
// registered only with its own extension.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const registry=require('../src/features/meeting-sources.cjs');
(async()=>{
 // --- The real declarations: one source per meeting app, each only while its extension is added ---
 const real=registry.load();
 assert.deepEqual(real.map(x=>[x.id,x.extension,x.setting]),[['google-meet','google-meet','extension_google-meet'],['teams','teams','extension_teams'],['zoom','zoom','extension_zoom']]);
 const settings={};const s={settings,dataRoot:''};
 const live=registry.create(s);
 assert.deepEqual(live.list(),[],'a new user has no meeting source');
 assert.deepEqual(await live.detect(),{active:false});
 assert.equal(live.recognize('https://us02web.zoom.us/j/1234567890'),null);
 settings.extension_zoom='true';
 assert.deepEqual(live.list(),[{id:'zoom',extension:'zoom',name:'Zoom'}],'added from the catalog → registered');
 assert.deepEqual(live.recognize('https://us02web.zoom.us/j/1234567890?pwd=a'),{kind:'zoom',key:'zoom:1234567890',url:'https://us02web.zoom.us/j/1234567890?pwd=a',name:'Zoom',source:'zoom'});
 settings.extension_zoom='false';assert.deepEqual(live.list(),[],'removed → not asked any more');
 assert.equal(live.recognize('https://meet.google.com/abc-defg-hij'),null,'Meet links: only with «Google Meet»');
 settings['extension_google-meet']='true';settings.extension_teams='true';
 assert.deepEqual(live.list().map(x=>x.name),['Google Meet','Microsoft Teams']);
 assert.deepEqual(live.recognize('https://meet.google.com/abc-defg-hij'),{kind:'meet',key:'meet:abc-defg-hij',url:'https://meet.google.com/abc-defg-hij',name:'Google Meet',source:'google-meet'});
 assert.equal(live.recognize('https://teams.live.com/meet/9387162534?p=abcd').source,'teams');
 assert.equal(live.recognize('https://us02web.zoom.us/j/1234567890'),null);
 if(!['darwin','win32'].includes(process.platform))assert.deepEqual(await live.detect(),{active:false},'no window listing here: no meeting, no error');
 assert.equal(live.speaker('google-meet',1,2),'','browser and Teams sources name no speakers');
 settings['extension_google-meet']='false';settings.extension_teams='false';
 // The Zoom source itself: speakers only while it records, participants from its private sample file.
 const zoom=require('../src/extensions/zoom/meeting-source.cjs');
 assert.deepEqual(zoom.speakers({from:0,to:10}),[]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sources-'));
 fs.writeFileSync(path.join(dir,'zoom-speakers-sample.json'),JSON.stringify({at:1,people:['Анна Петрова','Sergey Ivanov']}));
 assert.deepEqual(zoom.participants({dataRoot:dir}).sort(),['Sergey Ivanov','Анна Петрова'].sort());
 assert.equal(zoom.recognizeLink('https://meet.google.com/abc-defg-hij'),null);
 assert.ok(zoom.joinLinks.some(r=>r.test('https://zoom.us/j/1234567890')));
 if(!['darwin','win32'].includes(process.platform))assert.equal(await zoom.detect(),null,'no Zoom window helper here: no detection, no error');

 // --- A fake extensions folder ---
 const ext=(id,json,files)=>{fs.mkdirSync(path.join(dir,id));fs.writeFileSync(path.join(dir,id,'extension.json'),JSON.stringify({id,name:id.toUpperCase(),...json}));for(const [f,src] of Object.entries(files))fs.writeFileSync(path.join(dir,id,f),src);};
 ext('alpha',{setting:'extension_alpha',provides:{'meeting-source':'s.cjs'}},{'s.cjs':"module.exports={detect:async c=>c.settings.alphaOn==='1'?{active:true,title:'Синк'}:{active:false},joinLinks:[/https:\\/\\/alpha\\.example\\/m\\//],speakers:({from,to})=>[{name:'Анна',start:from,end:from+100},{name:'Олег',start:from,end:to},{name:'',start:from,end:to}],participants:()=>['Анна','Олег'],summaryMail:async m=>({subject:'Итоги',text:'Письмо '+m.start})};"});
 ext('beta',{setting:'extension_beta',provides:{'meeting-source':'s.cjs'}},{'s.cjs':"module.exports={id:'beta-calls',name:'Beta Calls',detect:async c=>{if(c.settings.betaFail==='1')throw Error('Нет доступа к окнам');return {active:c.settings.betaOn==='1'};},recognizeLink:u=>u.startsWith('https://beta.example/')?{kind:'beta',key:'beta:'+u.slice(21),url:u}:null,participants:()=>['Олег','Мария']};"});
 const sources=registry.load(dir);
 assert.deepEqual(sources.map(x=>[x.id,x.name]),[['alpha','ALPHA'],['beta-calls','Beta Calls']]);
 const st={settings:{extension_alpha:'true',extension_beta:'true'}},r=registry.create(st,{sources});
 assert.deepEqual(await r.detect(),{active:false});
 st.settings.betaOn='1';assert.deepEqual(await r.detect(),{active:true,source:{id:'beta-calls',name:'Beta Calls'},app:'Beta Calls'});
 st.settings.alphaOn='1';assert.deepEqual(await r.detect(),{active:true,title:'Синк',source:{id:'alpha',name:'ALPHA'},app:'ALPHA'},'the first added source that sees a meeting');
 // A failing source does not hide another one's meeting; alone, its error is reported.
 st.settings.betaFail='1';assert.equal((await r.detect()).source.id,'alpha');
 st.settings.alphaOn='0';await assert.rejects(r.detect(),/Нет доступа к окнам/);st.settings.betaFail='0';
 // Speakers: the name that overlaps the fragment most; empty names ignored; a source without speakers names nobody.
 assert.equal(r.speaker('alpha',1000,5000),'Олег');assert.equal(r.speaker('beta-calls',1000,5000),'');assert.equal(r.speaker('nobody',1,2),'');
 assert.deepEqual(r.participants().sort(),['Анна','Мария','Олег'].sort());
 assert.deepEqual(r.recognize('https://alpha.example/m/77'),{source:'alpha',name:'ALPHA',url:'https://alpha.example/m/77'});
 assert.deepEqual(r.recognize('https://beta.example/r1'),{kind:'beta',key:'beta:r1',url:'https://beta.example/r1',source:'beta-calls',name:'Beta Calls'});
 assert.deepEqual(await r.summaryMail({start:7,end:9},{}),{from:'ALPHA',subject:'Итоги',text:'Письмо 7'});
 st.settings.extension_alpha='false';
 assert.equal(r.recognize('https://alpha.example/m/77'),null);assert.equal(await r.summaryMail({start:7,end:9},{}),null);
 assert.deepEqual(r.list().map(x=>x.id),['beta-calls']);
 // Invalid declarations are refused.
 const bad=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sources-bad-'));fs.mkdirSync(path.join(bad,'x'));
 fs.writeFileSync(path.join(bad,'x','extension.json'),JSON.stringify({id:'x',provides:{'meeting-source':'s.cjs'}}));
 fs.writeFileSync(path.join(bad,'x','s.cjs'),'module.exports={name:"x"};');
 assert.throws(()=>registry.load(bad),/Invalid meeting source/,'detect is required');
 fs.writeFileSync(path.join(bad,'x','s.cjs'),'module.exports={detect(){},joinLinks:["zoom"]};');
 assert.throws(()=>registry.load(bad),/Invalid meeting source/,'join links are regular expressions');
 // Meeting sources are not card buttons: the app-links registry does not list them.
 assert.ok(!require('../src/features/app-links.cjs').load(dir).length);
 fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(bad,{recursive:true,force:true});
 console.log('Meeting sources: Zoom only with its extension, detection order and failures, speaker overlap, participants, join links, service letter, invalid declarations passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
