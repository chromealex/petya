// Migration from the Zoom-only recorder to generic meetings (src/meeting-migration.cjs), as main.cjs runs it on
// load: old keys → new keys once without losing values, team names, muted offers, the memory labels, and the Zoom
// extension added automatically only for users who used Zoom recording before. Then the video meeting apps that used to
// be calendar choices: «Google Meet» / «Microsoft Teams» added once for users whose calendar accounts could use them.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const migration=require('../src/meeting-migration.cjs');
const feature=require('../src/features/meeting-memory.cjs');
const zoom=require('../src/extensions/zoom/feature.cjs');
const meet=require('../src/extensions/google-meet/feature.cjs'),teams=require('../src/extensions/teams/feature.cjs');
// What loadSettings does: defaults, then the saved string values of known keys, then the features' migrations.
const defaults={...feature.defaults,...zoom.defaults,...meet.defaults,...teams.defaults,teamMembers:'[]',extensionOffersMuted:'[]',gmailCredential:'',microsoftCredential:'',extension_calendar:'false'};
function load(saved,dataRoot=''){
 const settings={...defaults};for(const key of Object.keys(defaults))if(typeof saved[key]==='string')settings[key]=saved[key];
 const migrated=feature.migrate(settings,saved,{dataRoot});return {settings,migrated};
}
const main=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8');
assert.match(main,/for \(const feature of features\) feature\.migrate\?\.\(settings, saved, \{ dataRoot \}\)/,'loadSettings runs feature migrations');
assert.match(main,/meeting-migration\.cjs'\)\.migrateRows\(items, settings\)/,'loadMemory renames old meeting rows');

// A new user: no file, no migration, nothing installed; the defaults already say «migrated».
assert.equal(defaults.meetingMigration,'1');assert.equal(defaults.extension_zoom,'false');

// An existing user who recorded Zoom meetings with the microphone off and «ask».
{
 const old={zoomBotMode:'ask',zoomCaptureMic:'false',zoomAutoRecord:'false',zoomPersonalLink:'https://us05web.zoom.us/j/9876543210',zoomWindowTitle:'',meetingRecordingSchedule:'[]',
  teamMembers:JSON.stringify([{name:'Сергей',zoomName:'Sergey Ivanov'},{name:'Анна',zoomName:''}]),extensionOffersMuted:JSON.stringify(['zoom-bot','crashes'])};
 const {settings,migrated}=load(old);
 assert.equal(migrated,true);
 assert.equal(settings.meetingAutoRecord,'ask');assert.equal(settings.meetingCaptureMic,'false','values kept');
 assert.equal(settings.zoomPersonalLink,'https://us05web.zoom.us/j/9876543210','the personal room stays with the Zoom extension');
 assert.deepEqual(JSON.parse(settings.teamMembers),[{name:'Сергей',meetingName:'Sergey Ivanov'},{name:'Анна'}]);
 assert.deepEqual(JSON.parse(settings.extensionOffersMuted),['zoom','crashes']);
 assert.equal(settings.extension_zoom,'true','used Zoom: the extension is added so nothing breaks');
 assert.equal(settings.meetingMigration,'1');
 assert.equal(migration.pending(settings),true,'saved once by the meeting feature');assert.equal(migration.pending(settings),false);
 assert.ok(!('zoomBotMode' in settings)&&!('zoomCaptureMic' in settings)&&!('zoomAutoRecord' in settings),'old keys are not carried on: the next save drops them');
 // Saved with the new keys, the next load changes nothing, and later choices win over old leftovers.
 const saved={...settings,meetingAutoRecord:'off',zoomBotMode:'auto'};
 const again=load(saved);assert.equal(again.migrated,false);assert.equal(again.settings.meetingAutoRecord,'off');
}
// Evidence of use, one at a time.
for(const [why,extra] of [['schedule',{meetingRecordingSchedule:JSON.stringify([{id:'a',title:'Синк'}])}],['old auto-record',{zoomAutoRecord:'true'}],['window title',{zoomWindowTitle:'Zoom Meeting'}],['team names',{teamMembers:JSON.stringify([{name:'Олег',zoomName:'Oleg'}])}]]){
 const {settings}=load({zoomBotMode:'auto',zoomCaptureMic:'true',...extra});assert.equal(settings.extension_zoom,'true',why);
}
// Recordings on disk count too.
{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-migration-'));fs.mkdirSync(path.join(dir,'meeting-recordings'));
 assert.equal(load({zoomBotMode:'auto'},dir).settings.extension_zoom,'false','an empty recordings folder is no evidence');
 fs.writeFileSync(path.join(dir,'meeting-recordings','11111111-2222-3333-4444-555555555555.json'),'x');
 assert.equal(load({zoomBotMode:'auto'},dir).settings.extension_zoom,'true');
 fs.rmSync(dir,{recursive:true,force:true});
}
// Never used: only the defaults the old version saved for everybody. Not installed; values still migrated.
{
 const {settings}=load({zoomBotMode:'auto',zoomCaptureMic:'true',zoomAutoRecord:'false',zoomPersonalLink:'',zoomWindowTitle:'',meetingRecordingSchedule:'[]',teamMembers:'[]'});
 assert.equal(settings.extension_zoom,'false');assert.equal(settings.meetingAutoRecord,'auto');assert.equal(settings.meetingCaptureMic,'true');
}
// A user who already decided about the Zoom extension keeps the decision.
assert.equal(load({zoomPersonalLink:'https://zoom.us/j/1234567890',extension_zoom:'false'}).settings.extension_zoom,'false');

// Memory rows: old labels renamed in place; old meeting transcripts are evidence of use when the settings migrate now.
{
 const rows=[{id:'a',source:'Zoom',sessionId:'s',text:'Привет',at:1},{id:'b',source:'Микрофон',sessionId:'s',text:'Да',at:2},{id:'zoommail:s',source:'Zoom',sessionId:'s',kind:'zoom-mail',title:'Письмо Zoom: Итоги',text:'x',at:3},{id:'n',source:'Заметка',text:'z',at:4}];
 const {settings}=load({zoomBotMode:'auto'});assert.equal(settings.extension_zoom,'false');
 assert.equal(migration.migrateRows(rows,settings),2);
 assert.deepEqual(rows.map(r=>[r.id,r.source,r.kind||'']),[['a','Встреча',''],['b','Микрофон',''],['meetingmail:s','Встреча','meeting-mail'],['n','Заметка','']]);
 assert.equal(settings.extension_zoom,'true','meeting transcripts in memory: Zoom recording was used');
 assert.equal(migration.migrateRows(rows,settings),0,'idempotent');
 // Without a settings migration in this load (already migrated), rows are still renamed but nothing is installed.
 const later={...defaults};const more=[{id:'c',source:'Zoom',sessionId:'t',text:'x',at:5}];
 assert.equal(migration.migrateRows(more,later),1);assert.equal(later.extension_zoom,'false');
}
// --- Video meeting apps: Google Meet and Teams used to be calendar choices ---
{
 assert.equal(defaults.videoAppsMigration,'1','a new user has nothing to migrate');
 assert.equal(defaults['extension_google-meet'],'false');assert.equal(defaults.extension_teams,'false');
 const CAL='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
 const google=(scope=CAL)=>JSON.stringify({accounts:[{id:'g1',email:'me@corp.ru',tokens:{scope}}]});
 const microsoft=(email,scope='https://graph.microsoft.com/Calendars.ReadWrite')=>JSON.stringify({accounts:[{id:'m1',email,tokens:{scope}}]});
 const base={meetingMigration:'1',extension_calendar:'true'};
 // A Google calendar user: Meet is added, Teams is not; saved once.
 let r=load({...base,gmailCredential:google()});
 assert.equal(r.migrated,true);assert.equal(r.settings['extension_google-meet'],'true');assert.equal(r.settings.extension_teams,'false');assert.equal(r.settings.videoAppsMigration,'1');
 assert.equal(migration.pending(r.settings),true,'saved once');assert.equal(migration.pending(r.settings),false);
 assert.equal(r.settings.extension_zoom,'false','the video migration never adds Zoom');
 // An Outlook calendar of a work account: Teams; of a personal account: nothing (it never had Teams).
 r=load({...base,microsoftCredential:microsoft('me@corp.com')});assert.equal(r.settings.extension_teams,'true');assert.equal(r.settings['extension_google-meet'],'false');
 r=load({...base,microsoftCredential:microsoft('me@outlook.com')});assert.equal(r.settings.extension_teams,'false','personal Microsoft account');
 // Both kinds of accounts: both apps.
 r=load({...base,gmailCredential:google(),microsoftCredential:microsoft('me@corp.com')});assert.deepEqual([r.settings['extension_google-meet'],r.settings.extension_teams],['true','true']);
 // Mail only (no calendar access) or no accounts at all: nothing added, the migration is still done once.
 r=load({...base,gmailCredential:google('https://www.googleapis.com/auth/gmail.readonly'),microsoftCredential:microsoft('me@corp.com','https://graph.microsoft.com/Mail.Read')});
 assert.deepEqual([r.settings['extension_google-meet'],r.settings.extension_teams],['false','false']);assert.equal(r.migrated,true);
 r=load({...base});assert.deepEqual([r.settings['extension_google-meet'],r.settings.extension_teams],['false','false']);
 // An explicit decision about a switch is kept.
 r=load({...base,gmailCredential:google(),microsoftCredential:microsoft('me@corp.com'),'extension_google-meet':'false',extension_teams:'false'});
 assert.deepEqual([r.settings['extension_google-meet'],r.settings.extension_teams],['false','false']);
 // Only once: after the save, a later load (the user removed Meet) changes nothing.
 r=load({...base,gmailCredential:google(),videoAppsMigration:'1'});assert.equal(r.settings['extension_google-meet'],'false');assert.equal(r.migrated,false);
 // Together with the old Zoom migration in one load: both happen, each by its own evidence.
 r=load({zoomBotMode:'ask',zoomPersonalLink:'https://zoom.us/j/1234567890',gmailCredential:google()});
 assert.deepEqual([r.settings.extension_zoom,r.settings['extension_google-meet'],r.settings.extension_teams,r.settings.meetingAutoRecord],['true','true','false','ask']);
 // Memory rows of a load that migrated only the video apps add no Zoom.
 r=load({...base,gmailCredential:google()});const rows=[{id:'x',source:'Zoom',text:'t',at:1}];
 migration.migrateRows(rows,r.settings);assert.equal(r.settings.extension_zoom,'false');
}
// The migrated settings pass validation.
feature.validate({meetingAutoRecord:'ask',meetingCaptureMic:'false'});
console.log('Meeting migration: old keys to meeting keys once with values kept, team names, muted offers, memory labels, Zoom extension added only after real use, Google Meet / Teams added once for calendar users (work accounts for Teams, decisions kept) passed');
