// Petya's core keeps no Google Play: the Android vitals client, the connection (sign-in, service-account key, its
// settings card), ANR as a chat subject (the «anr» dialogue kind and the tool router's «anr») belong to «Google Play»
// (src/extensions/google-play). Fails when a core file names Google Play or the «anr» kind outside the allowed lines,
// and checks that what the core used to have is gone and that the app owns it.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {scan,root}=require('./core-guard-scan.cjs');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const WORDS=/google[\s-]?play|googleplay|гугл[\s-]?пл[еэ]|play\s?console|playdeveloperreporting|['"`]anr['"`]|\banr:/iu;
const TABLE='service-module table (every service module has a row)';
const ALLOWED={
 'src/modules.cjs':{why:TABLE},
 'src/service-access.cjs':{why:TABLE+': names, browser URLs, request words'},
 'src/project-settings.cjs':{why:TABLE,lines:/^const labels=/},
 'src/request-progress.cjs':{why:TABLE,lines:/^const names=\{jira:/},
 'src/main.cjs':{why:TABLE+': the services the dialogue model is told are on; the speech recognition hint words',lines:/services:Object\.entries\(\{jira:'Jira'|^const defaults = /},
 'src/ui/modules.js':{why:TABLE,lines:/^const optionalModules =/},
 'src/ui/app-catalog.js':{why:TABLE+': tile text, icon and saved-credential flags',lines:/^const descriptions=|^googleplay:stroke\(|^const SERVICE_FLAGS=/},
 'src/ui/connection-sidebar.js':{why:TABLE+': sidebar badges',lines:/^const services = \[|^const flags=\{slack:/},
 'src/ui/service-access.js':{why:TABLE,lines:/const names=\{slack:'Slack'/},
 // A saved dashboard widget of the old kind still loads (src/dashboards.cjs normalizes it).
 'src/dashboards.cjs':{why:'the legacy dashboard source kind «anr» of saved dashboards',lines:/^const KINDS=|^if\(kind==='anr'\)/},
 // Store platform codes in purchase reports, not the Google Play service.
 'src/features/purchase-sources.cjs':{why:'purchase report platform codes',lines:/^const PLATFORMS=/},
 'src/live-cases.cjs':{why:'live dialogue cases',lines:/^(?:\{name:|skill\()/}
};
const count=scan({service:'Google Play',words:WORDS,allowed:ALLOWED});

// What the core used to have is gone.
assert.equal(fs.existsSync(path.join(root,'src/google-play.cjs')),false,'the client moved to src/extensions/google-play/client.cjs');
assert.ok(!/googlePlay/.test(/const calls = \[.*\]/.exec(read('src/preload.cjs'))[0]),'no Google Play IPC in the preload');
assert.ok(!/googlePlay|google-play/.test(read('src/main.cjs')),'main.cjs has no Google Play reader or IPC');
assert.ok(!/playCard|Google Play Console/.test(read('src/ui/dialogue.js')),'no Google Play card in the core renderer');
const router=require('../src/intent-router.cjs'),semantic=require('../src/semantic-tools.cjs'),kinds=require('../src/features/dialogue-kinds.cjs');
assert.deepEqual(router.routingRequest('m','x',[],'',{kinds:[]}).format.properties.kind.enum,['chat'],'the topic router has no ANR (nor Jira bugs) without the apps');
assert.ok(!semantic.routingRequest('m','x',{tools:[]}).format.properties.tool.enum.includes('anr'),'the tool router has no ANR without the app');
assert.deepEqual(kinds.RESERVED.includes('anr'),false);

// The app owns them: the switch users have, the card, the reader, the kind and the tool.
const app=JSON.parse(read('src/extensions/google-play/extension.json'));
assert.equal(app.setting,'module_googleplay');assert.equal(app.service,'googleplay');assert.equal(app.settings,true);
assert.equal(app.provides['dialogue-kind'],'anr-kind.cjs');assert.equal(app.provides['route-tool'],'route-tool.cjs');
const feature=require('../src/extensions/google-play/feature.cjs');
assert.deepEqual(feature.defaults,{googlePlayCredential:''},'the settings key stays');assert.deepEqual(feature.secrets,['googlePlayCredential']);
assert.equal(feature.limits.googlePlayCredential,20000);assert.deepEqual(feature.publicFlags({googlePlayCredential:'x'}),{hasGooglePlay:true});
assert.ok(kinds.list().some(k=>k.id==='anr'),'Google Play provides the ANR kind');
const {intent}=require('../src/dialogue.cjs');
assert.equal(intent('ANR за неделю'),'anr');assert.equal(intent('крэши в Google Play'),'chat','Google Play with crashes is «Крэши»\'s');
assert.equal(kinds.serviceOf('anr'),'googleplay');
console.log('Core Google Play guard: '+count+' core files free of Google Play logic and text ('+Object.keys(ALLOWED).length+' table uses allowed); «Google Play» owns the client, connection, card, ANR kind and router tool passed');
