// Capability «meeting-source» of «Microsoft Teams» (src/features/meeting-sources.cjs): a Teams call is seen by its
// window — the desktop app's call window or Teams on the web in a browser tab — through src/desktop-windows.cjs
// (Windows lists windows with their process, macOS only with screen recording access already granted). The
// recording is named by the call window's title (the meeting's subject). Teams shows no speaker names Petya could
// read reliably from a window title, so the source names nobody.
const desktopWindows=require('../../desktop-windows.cjs');
const teams=require('./teams.cjs');

// The call among the windows (`state` from desktopWindows.list): {active, app, windowTitle, title?} or {active:false}.
function fromWindows(state){
 if(!state)return null;
 for(const w of state.windows||[]){
  const call=teams.callOf(w.title,w.app);if(!call)continue;
  return {active:true,app:'Microsoft Teams',windowTitle:w.title,...call.title?{title:call.title}:{}};
 }
 return {active:false};
}
module.exports={
 id:'teams',name:'Microsoft Teams',
 joinLinks:teams.joinLinks,
 recognizeLink:teams.recognizeLink,
 fromWindows,
 async detect(){return fromWindows(await desktopWindows.list());}
};
