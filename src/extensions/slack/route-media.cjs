// Chat route «media»: «разбери скриншот из Slack» — a picture or video from the synced Slack threads
// (media-source.cjs) is attached and inspected (src/media-sources.cjs `turn`).
const SLACK=/(?:slack|слак)/iu;
module.exports={id:'slack-media',stage:'media',order:10,
 turn:async(s,command,{choice})=>!choice&&SLACK.test(command)?require('../../media-sources.cjs').turn(s,command,{service:'slack',name:'Slack'}):null};
