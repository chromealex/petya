// Chat route «digest»: «Что нового в Slack?» (digest.cjs) from the synced messages, or the Slack window on consent.
// A text-only answer is recorded in the open chat with its sources.
module.exports={id:'slack-digest',stage:'digest',
 async turn(s,command,{choice}){
  if(choice||!s.slack)return null;
  const digest=await s.slack.digest.turn(command);if(!digest)return null;
  if(!digest.text||digest.messages)return digest;
  s.dialogue.rememberAction(command,digest.text);
  const topic=s.dialogue.active(),last=topic?.messages?.at(-1);
  if(last?.role==='assistant'){last.by=digest.by;if(digest.sources?.length)last.sources=digest.sources;s.dialogue.persist();}
  return {...digest,topicId:topic?.id,topicTitle:topic?.title,messages:topic?.messages};
 }};
