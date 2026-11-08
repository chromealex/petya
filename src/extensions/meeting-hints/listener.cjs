// «Подсказки на встрече» as a meeting listener (src/features/meeting-stream.cjs): finished phrases and the meeting's
// lifecycle, only while the app is added. Partials are not needed: hints are matched on whole phrases.
const hub=require('./hub.cjs');
module.exports={id:'meeting-hints',partials:false,onEvent:event=>hub.engine?.onEvent(event)};
