// One-time migration from the Zoom-only meeting recorder to generic meetings with meeting sources.
// This is the only core file that reads the old Zoom-named keys; tests/core-meeting-guard.cjs allows it.
//   settings: zoomBotMode → meetingAutoRecord, zoomCaptureMic → meetingCaptureMic, team «zoomName» → meetingName,
//     a muted offer of «zoom-bot» → «zoom». zoomPersonalLink, zoomWindowTitle and meetingRecordingSchedule keep
//     their names and belong to the Zoom extension now.
//   install: the Zoom extension (src/extensions/zoom) is added for users who used Zoom recording before — a saved
//     personal room, scheduled recordings, the old auto-record switch, Zoom names in the team, recordings on disk
//     or meeting transcripts in memory — so nothing they relied on disappears. New users do not get it.
//   memory: transcript rows labelled with the old source name become «Встреча»; the service letter kind is renamed.
// Runs once per company (`meetingMigration` = '1' in the saved settings); the rows check is cheap and idempotent.
//
// Video meeting apps (`videoAppsMigration`, once per company): Google Meet and Microsoft Teams used to be choices of
// «Календарь» itself and are extensions now (src/extensions/google-meet, src/extensions/teams). So that the choice
// does not disappear, «Google Meet» is added for users with a Google account that has calendar access, «Microsoft
// Teams» for users with a Microsoft work or school account that has calendar access (the only accounts that could
// create Teams meetings). Users who never connected a calendar get neither; an explicit decision about either
// switch (the key present in the saved file) is kept.
const fs=require('node:fs');
const path=require('node:path');
const {SOUND}=require('./meeting-talk.cjs');
const MODES=['auto','ask','off'];
const OLD_SOUND='Zoom',OLD_MAIL='zoom-mail',OLD_MAIL_ID='zoommail:',OLD_EXTENSION='zoom-bot',EXTENSION='zoom',SWITCH='extension_zoom';
const state=new WeakMap(),unsaved=new WeakSet();
// The calendar's accounts with calendar access and the extension each kind of account keeps.
const VIDEO_APPS=[['google-meet',a=>a.provider==='google'],['teams',a=>a.provider==='microsoft'&&a.kind==='work']];

function parse(value,fallback){try{const v=JSON.parse(value||'');return v??fallback;}catch{return fallback;}}
function recordingsOnDisk(dataRoot){
 try{return !!dataRoot&&fs.readdirSync(path.join(dataRoot,'meeting-recordings')).some(n=>/^[a-f0-9-]{36}\.json$/.test(n));}catch{return false;}
}
// `settings` are the loaded values (defaults filled in), `saved` the file as written. Returns true when it migrated.
function migrateSettings(settings,saved,{dataRoot=''}={}){
 if(!saved||saved.meetingMigration==='1')return false;
 if(!('meetingAutoRecord' in saved)&&MODES.includes(saved.zoomBotMode))settings.meetingAutoRecord=saved.zoomBotMode;
 if(!('meetingCaptureMic' in saved)&&['true','false'].includes(saved.zoomCaptureMic))settings.meetingCaptureMic=saved.zoomCaptureMic;
 let teamNames=false;
 const team=parse(settings.teamMembers,null);
 if(Array.isArray(team)){
  for(const m of team){if(!m||typeof m!=='object'||!('zoomName' in m))continue;if(m.zoomName&&!m.meetingName)m.meetingName=m.zoomName;if(m.zoomName)teamNames=true;delete m.zoomName;}
  settings.teamMembers=JSON.stringify(team);
 }
 const muted=parse(settings.extensionOffersMuted,[]);
 if(Array.isArray(muted)&&muted.includes(OLD_EXTENSION))settings.extensionOffersMuted=JSON.stringify([...new Set(muted.map(x=>x===OLD_EXTENSION?EXTENSION:x))]);
 const schedule=parse(saved.meetingRecordingSchedule,[]);
 const used=!!saved.zoomPersonalLink||Array.isArray(schedule)&&schedule.length>0||saved.zoomAutoRecord==='true'||!!saved.zoomWindowTitle||teamNames||recordingsOnDisk(dataRoot);
 const decided=SWITCH in saved;
 if(used&&!decided)settings[SWITCH]='true';
 settings.meetingMigration='1';
 state.set(settings,{decided});
 return true;
}
// `settings` hold the decrypted account credentials; `saved` tells what the user already decided. True when it ran.
function migrateVideoApps(settings,saved){
 if(!saved||saved.videoAppsMigration==='1')return false;
 let list=[];try{list=require('./extensions/calendar/accounts.cjs').accounts(settings).filter(a=>a.calendar);}catch{list=[];}
 for(const [id,fits] of VIDEO_APPS){const key='extension_'+id;if(!(key in saved)&&list.some(fits))settings[key]='true';}
 settings.videoAppsMigration='1';
 unsaved.add(settings);
 return true;
}
// Rows of the company memory, renamed in place. Returns how many changed. When this load migrated the settings and
// the memory holds old meeting transcripts, the Zoom extension is added too (unless the user already decided).
function migrateRows(items,settings=null){
 let changed=0,meetings=0;
 for(const r of items||[]){
  if(!r||typeof r!=='object')continue;
  let touched=false;
  if(r.source===OLD_SOUND){r.source=SOUND;touched=true;meetings++;}
  if(r.kind===OLD_MAIL){r.kind='meeting-mail';touched=true;}
  if(typeof r.id==='string'&&r.id.startsWith(OLD_MAIL_ID)){r.id='meetingmail:'+r.id.slice(OLD_MAIL_ID.length);touched=true;}
  if(touched)changed++;
 }
 const pending=settings&&state.get(settings);
 if(pending&&!pending.decided&&meetings)settings[SWITCH]='true';
 return changed;
}
// True once after a migration: the caller saves the settings so the file holds the new keys.
function pending(settings){if(!state.has(settings)&&!unsaved.has(settings))return false;state.delete(settings);unsaved.delete(settings);return true;}
module.exports={migrateSettings,migrateVideoApps,migrateRows,pending,MODES};
