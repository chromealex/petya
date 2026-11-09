// «Notion»: the Notion service module (module «notion»). It owns the Notion client (client.cjs), Notion as a
// documentation source of the task decomposition (doc-source.cjs), the connection check of its settings card
// (connection-check.cjs) and the card itself (settings.js). Signing in through the browser goes through Petya's OAuth
// broker (src/service-oauth.cjs, shared with Slack and Asana): its credential is `notionCredential`; a manual token is
// `notionToken`. Moved from Petya's core (src/notion.cjs, the card in src/ui/index.html and src/ui/connections.js);
// the settings keys stay, so a saved connection keeps working.
module.exports={
 name:'notion',
 defaults:{notionToken:'',notionCredential:''},
 secrets:['notionCredential','notionToken'],
 publicFlags:settings=>({hasNotionOAuth:!!settings.notionCredential,hasNotionToken:!!settings.notionToken||!!settings.notionCredential}),
 // A token typed while the browser sign-in is saved would be ignored: the sign-in is disconnected first.
 validate(next,input={}){if(next.notionCredential&&input.notionToken&&input.notionCredential===undefined)throw Error('Сначала отключите вход notion через браузер.');},
 setup(){return {};},
 teardown(){}
};
