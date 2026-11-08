// «Google Meet»: plugs Google Meet into Petya's generic meetings like any meeting app. It provides a meeting
// source (meeting-source.cjs: a Meet call's browser tab starts the recording), Meet links for new Google Calendar
// events (video-meeting.cjs, through «Календарь») and scheduled recordings of Meet events («Петя запишет встречу»,
// meeting-recording.cjs). The recording, its start mode and the microphone are Petya's own
// (src/features/meeting-memory.cjs); there is no Google sign-in of its own: links use the calendar's Google account.
const {accounts}=require('../calendar/accounts.cjs');
const source=require('./meeting-source.cjs');
const meetingSchedule=require('../../meeting-schedule.cjs');
const ID='google-meet',KEY='googleMeetRecordingSchedule';
function validate(next){meetingSchedule.validate(next,KEY);}
const options=s=>({id:ID,app:'Google Meet',key:KEY,enabled:()=>s.settings['extension_'+ID]==='true',detect:()=>source.detect({settings:s.settings,dataRoot:s.dataRoot})});
function scheduler(s,extra={}){return meetingSchedule.create(s,{...options(s),...extra});}
// What the settings card shows: where Meet links are created and whether call tabs can be seen here.
function status(settings,{platform=process.platform}={}){
 const google=accounts(settings).filter(a=>a.provider==='google');
 const ready=google.filter(a=>a.calendar);
 const chosen=ready.find(a=>a.key===settings.calendarAccount)||ready[0]||null;
 return {calendar:settings.extension_calendar==='true',googleAccounts:google.length,calendarAccounts:ready.map(a=>a.email||a.label),linksAccount:chosen?chosen.email||chosen.label:'',windows:['darwin','win32'].includes(platform),platform};
}
module.exports={name:'googleMeet',defaults:{['extension_'+ID]:'false',[KEY]:'[]'},validate,scheduler,status,
 setup(s){
  const {schedule,ipc}=meetingSchedule.setup(s,options(s));
  return {googleMeetSchedule:schedule,ipc:{status:()=>status(s.settings),...ipc}};
 }
};
