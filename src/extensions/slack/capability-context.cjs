// Widens the tool router's «context-look» capability (src/capabilities.cjs) while Slack is added: the Slack thread
// being read is a context to look at too (route-reference.cjs).
module.exports={id:'slack-context',extends:'context-look',says:'или по треду Slack',services:['slack'],accepts:()=>false};
