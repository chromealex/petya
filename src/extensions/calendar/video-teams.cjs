// Capability «video-meeting» of «Календарь» for Outlook calendars: a Teams meeting is created by Microsoft Graph
// together with the event (isOnlineMeeting); the join link comes back with the created event.
const {accounts}=require('./accounts.cjs');
module.exports={
 id:'teams',name:'Microsoft Teams',label:'Teams',
 ready:s=>s.extension_calendar==='true'&&accounts(s).some(a=>a.calendar&&a.provider==='microsoft'),
 fits:c=>c.calendar==='microsoft',
 async run(services,payload){
  if(payload.calendar!=='microsoft')throw Error('Встреча Teams создаётся только в календаре Outlook.');
  return {provider:'teams',native:true,patch:{isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'}};
 }
};
