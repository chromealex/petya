// «Microsoft Teams»: plugs Teams into Petya's generic meetings like any meeting app. It provides a meeting
// source (meeting-source.cjs: a Teams call window, in the desktop app or a browser, starts the recording), Teams
// meetings for new Outlook events of a work account (video-meeting.cjs, through «Календарь») and scheduled
// recordings of Teams events («Петя запишет встречу», meeting-recording.cjs). The recording, its start mode and the
// microphone are Petya's own (src/features/meeting-memory.cjs); there is no Microsoft sign-in of its own: meetings
// use the calendar's Microsoft account.
const {accounts}=require('../calendar/accounts.cjs');
const source=require('./meeting-source.cjs');
const meetingSchedule=require('../../meeting-schedule.cjs');
const ID='teams',KEY='teamsRecordingSchedule';
function validate(next){meetingSchedule.validate(next,KEY);}
const options=s=>({id:ID,app:'Teams',key:KEY,enabled:()=>s.settings['extension_'+ID]==='true',detect:()=>source.detect({settings:s.settings,dataRoot:s.dataRoot})});
function scheduler(s,extra={}){return meetingSchedule.create(s,{...options(s),...extra});}
// What the settings card shows: which Microsoft accounts can create Teams meetings and whether windows are visible.
function status(settings,{platform=process.platform}={}){
 const list=accounts(settings).filter(a=>a.provider==='microsoft');
 const name=a=>a.email||a.label;
 return {calendar:settings.extension_calendar==='true',microsoftAccounts:list.length,
  work:list.filter(a=>a.calendar&&a.kind==='work').map(name),personal:list.filter(a=>a.kind==='personal').map(name),noCalendar:list.filter(a=>!a.calendar&&a.kind==='work').map(name),
  windows:['darwin','win32'].includes(platform),platform};
}
module.exports={name:'msTeams',defaults:{['extension_'+ID]:'false',[KEY]:'[]'},validate,scheduler,status,
 setup(s){
  const {schedule,ipc}=meetingSchedule.setup(s,options(s));
  return {teamsSchedule:schedule,ipc:{status:()=>status(s.settings),...ipc}};
 }
};
