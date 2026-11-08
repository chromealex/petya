// Capability «video-meeting» of «Google Meet»: a Meet call created by Google together with a Google Calendar event.
// Needs a Google account with calendar access in «Календарь»; otherwise Meet is not listed. `run` only confirms the
// choice ({native:true}); right before the calendar writes the event, `prepareEvent` adds the conference request
// (conferenceData.createRequest with hangoutsMeet and conferenceDataVersion=1) and the join link comes back with
// the created event. `recognizeLink` lets the calendar's known rooms tell Meet links apart.
const {randomUUID}=require('node:crypto');
const {accounts}=require('../calendar/accounts.cjs');
const {recognizeLink}=require('./meet.cjs');
const googleCalendar=s=>s.extension_calendar==='true'&&accounts(s).some(a=>a.calendar&&a.provider==='google');
module.exports={
 id:'google-meet',name:'Google Meet',label:'Google Meet',order:20,
 ready:googleCalendar,
 fits:c=>c.calendar==='google',
 hint:()=>'Ссылку создаст Google вместе со встречей',
 recognizeLink,
 async run(services,payload,check){
  if(payload.calendar!=='google')throw Error('Google Meet создаётся только во встрече Google Календаря.');
  check();
  return {provider:'google-meet',native:true};
 },
 prepareEvent(event){
  if(event.calendar!=='google')throw Error('Google Meet создаётся только во встрече Google Календаря.');
  return {...event,
   body:{...event.body,conferenceData:{createRequest:{requestId:randomUUID(),conferenceSolutionKey:{type:'hangoutsMeet'}}}},
   query:{...event.query,conferenceDataVersion:'1'}};
 }
};
