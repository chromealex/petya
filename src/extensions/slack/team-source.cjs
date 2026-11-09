// Slack as a team source for «Заполни команду» (src/team-sources.cjs): the members of a channel the request names or
// the project's channel (roster.cjs), profile titles, contacts and deactivated accounts (profiles.cjs), and the Slack
// window when the API is rate-limited.
const modules=require('../../modules.cjs');
module.exports={id:'slack',name:'Slack',order:10,
 ready:settings=>modules.enabled(settings,'slack')&&!!(settings.slackToken||settings.slackCredential),
 scope:(settings,topic)=>[settings.module_slack,settings.slackCredential,settings.slackToken,settings.slackChannels,topic?.slackSource?.url],
 roster:(s,command)=>s.slack?s.slack.roster.collect(command):null,
 profiles:(s,wanted)=>require('./profiles.cjs').slackProfiles(s.settings,s.request,wanted),
 screen:s=>s.slack.readScreen()};
