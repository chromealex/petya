// Capability «video-meeting» of «Календарь» for Google calendars: Google Meet is created by Google together with
// the event (conferenceData.createRequest), so this provider returns the event patch; the link comes back with
// the created event. It fits only a Google calendar's event.
const {randomUUID}=require('node:crypto');
const {accounts}=require('./accounts.cjs');
module.exports={
 id:'google-meet',name:'Google Meet',label:'Google Meet',order:20,
 ready:s=>s.extension_calendar==='true'&&accounts(s).some(a=>a.calendar&&a.provider==='google'),
 fits:c=>c.calendar==='google',
 async run(services,payload){
  if(payload.calendar!=='google')throw Error('Google Meet создаётся только во встрече Google Календаря.');
  return {provider:'google-meet',native:true,patch:{conferenceData:{createRequest:{requestId:randomUUID(),conferenceSolutionKey:{type:'hangoutsMeet'}}}},query:{conferenceDataVersion:'1'}};
 }
};
