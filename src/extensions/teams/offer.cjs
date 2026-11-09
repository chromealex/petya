// When to offer «Microsoft Teams»: only when Teams is named — «встреча в Teams», «в тимсе», «тимс», a Teams join
// link. «Тимлид», «тимбилдинг», a Slack team and meetings in general are not Teams.
module.exports={
 id:'teams',name:'Microsoft Teams',
 pitch:'буду сам записывать встречи и звонки Teams и создавать встречу Teams вместе с событием Outlook рабочего аккаунта',
 names:[/microsoft[\s-]*teams|(?:^|[^\p{L}])(?:teams|тимс(?:е|а|у|ом|ы)?|тимз(?:е|а|у|ом)?)(?![\p{L}])|teams\.(?:microsoft|live)\.com/iu],
 topics:[],
 // VK Teams (another messenger, its own app) is not Microsoft Teams.
 avoid:[/slack|слак/iu,/(?:vk|вк)[\s-]*(?:teams|тимс\p{L}*)|вктимс|myteam/iu],
 connect:'install',
 ready:settings=>settings.extension_teams==='true'
};
