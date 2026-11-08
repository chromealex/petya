// A recorded meeting in the company memory: what the meeting played through the speakers (`SOUND`) and the user's
// own microphone during it (`MIC`). Both carry the recording's `sessionId`; summaries and service letters add `kind`.
const SOUND='Встреча',MIC='Микрофон';
const isSound=r=>r?.source===SOUND;
// Any part of a recorded meeting (sound, microphone, summary or letter).
const isMeeting=r=>isSound(r)||r?.source===MIC&&!!r.sessionId;
// The spoken parts only: sound and microphone of a recording, not summaries or letters.
const isTalk=r=>(isSound(r)||r?.source===MIC)&&!!r?.sessionId&&!r.kind;
module.exports={SOUND,MIC,isSound,isMeeting,isTalk};
