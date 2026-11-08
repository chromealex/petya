// Capability «video-meeting» of «Microsoft Teams»: a Teams meeting created by Microsoft Graph together with an
// Outlook event (isOnlineMeeting, onlineMeetingProvider teamsForBusiness). Needs a Microsoft work or school account
// with Calendars.ReadWrite in «Календарь»; personal Microsoft accounts cannot create Teams meetings this way, so
// Teams is not offered for them. `run` only confirms the choice ({native:true}); right before the calendar writes
// the event, `prepareEvent` adds the online meeting fields and the join link comes back with the created event.
const {accounts}=require('../calendar/accounts.cjs');
const {recognizeLink}=require('./teams.cjs');
const PERSONAL='Встречу Teams можно создать только в рабочем или учебном аккаунте Microsoft.';
const work=s=>accounts(s).some(a=>a.calendar&&a.provider==='microsoft'&&a.kind==='work');
module.exports={
 id:'teams',name:'Microsoft Teams',label:'Teams',order:30,
 ready:s=>s.extension_calendar==='true'&&work(s),
 fits:c=>c.calendar==='microsoft'&&c.account?.kind!=='personal',
 hint:()=>'Ссылку создаст Microsoft вместе со встречей',
 recognizeLink,
 async run(services,payload,check){
  if(payload.calendar!=='microsoft')throw Error('Встреча Teams создаётся только в календаре Outlook.');
  if(payload.account?.kind==='personal')throw Error(PERSONAL);
  check();
  return {provider:'teams',native:true};
 },
 prepareEvent(event,context={}){
  if(event.calendar!=='microsoft')throw Error('Встреча Teams создаётся только в календаре Outlook.');
  if(context.account?.kind==='personal')throw Error(PERSONAL);
  return {...event,body:{...event.body,isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness'}};
 }
};
