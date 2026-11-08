// «Zoom»: plugs Zoom into Petya's generic meetings. It provides a meeting source (meeting-source.cjs: Zoom's
// meeting window starts the recording and names the speakers), the user's personal room for the calendar
// (video-meeting.cjs) and scheduled recordings of Zoom events («Петя запишет встречу», meeting-recording.cjs).
// The recording itself, its start mode and the microphone setting are Petya's own (src/features/meeting-memory.cjs);
// there is no meeting bot and no Zoom sign-in.
const room=require('./personal-room.cjs');
const source=require('./meeting-source.cjs');
const meetingSchedule=require('../../meeting-schedule.cjs');
const ID='zoom',KEY='meetingRecordingSchedule';
function validate(next){
 if(next.zoomPersonalLink){const link=room.valid(next.zoomPersonalLink);if(!link)throw Error('Ссылка на личную комнату Zoom — вида https://…zoom.us/j/1234567890.');next.zoomPersonalLink=link;}
 meetingSchedule.validate(next,KEY);
}
// Scheduled recordings (src/meeting-schedule.cjs): from the start time Petya waits for the Zoom meeting source to see
// the meeting and then starts the recording; each one has a stable notification that can be cancelled.
const options=s=>({id:ID,app:'Zoom',key:KEY,enabled:()=>s.settings.extension_zoom==='true',detect:()=>source.detect({settings:s.settings,dataRoot:s.dataRoot})});
function scheduler(s,extra={}){return meetingSchedule.create(s,{...options(s),...extra});}

module.exports={name:'zoom',defaults:{['extension_'+ID]:'false',zoomPersonalLink:'',zoomWindowTitle:'',[KEY]:'[]'},validate,scheduler,
 setup(s){
  const {schedule,ipc}=meetingSchedule.setup(s,options(s));
  const status=()=>({personalLink:room.valid(s.settings.zoomPersonalLink),zoomInstalled:room.installed()});
  const configure=input=>{
   if(typeof input?.personalLink==='string')s.saveSettings({zoomPersonalLink:input.personalLink.trim()},true);
   return status();
  };
  return {meetingSchedule:schedule,ipc:{status,configure,...ipc}};
 }
};
