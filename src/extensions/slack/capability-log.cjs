// Widens the tool router's «build» capability (src/capabilities.cjs) while Slack is added: the build log in the Slack
// thread being read (route-reference.cjs).
module.exports={id:'slack-log',extends:'build',says:'по логу из Slack',examples:['почему упал билд','разбери лог'],services:['slack'],
 accepts:t=>require('./logs.cjs').isLogQuestion(t)};
