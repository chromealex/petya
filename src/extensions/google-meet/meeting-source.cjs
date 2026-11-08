// Capability «meeting-source» of «Google Meet» (src/features/meeting-sources.cjs): a Meet call is a browser tab, so
// it is seen by the title of a browser window (src/desktop-windows.cjs: Windows lists windows with their process,
// macOS only with screen recording access already granted). Only the active tab's title is visible: a call in a
// background tab is not seen until the user switches to it. The recording is named by the meeting name in the tab,
// or by the calendar's known room for this meeting code. Meet shows no speaker names Petya could read reliably, so
// the source names nobody.
const path=require('node:path');
const desktopWindows=require('../../desktop-windows.cjs');
const {meetingTitle}=require('../calendar/rooms.cjs');
const meet=require('./meet.cjs');

// The call among the windows (`state` from desktopWindows.list): {active, app, windowTitle, title?} or {active:false}.
function fromWindows(state,context={}){
 if(!state)return null;
 for(const w of state.windows||[]){
  if(w.app&&!desktopWindows.isBrowser(w.app))continue;
  const call=meet.callOf(w.title);if(!call)continue;
  const title=call.title||(call.code&&context.dataRoot?meetingTitle(path.join(context.dataRoot,'calendar-rooms.json'),'meet:'+call.code):'');
  return {active:true,app:'Google Meet',windowTitle:w.title,...title?{title}:{}};
 }
 return {active:false};
}
module.exports={
 id:'google-meet',name:'Google Meet',
 joinLinks:meet.joinLinks,
 recognizeLink:meet.recognizeLink,
 fromWindows,
 async detect(context={}){return fromWindows(await desktopWindows.list(),context);}
};
