// When to offer Jira: a plain request to read a project's bugs («проверь баги», «какие баги открыты?», «сколько багов
// в последней версии») — the «bugs» chat kind (dialogue-kind.cjs) answers it once Jira is added and connected. Other
// requests that name Jira belong to the apps built on it (sprint planning, time tracking, screenshot tasks…), so the
// name alone offers nothing; recording, filing or Discord bugs are their apps' subjects.
const READ='(?:сколько|какие|покажи|проверь|посмотри|глянь|список|открыт\\p{L}*|остал\\p{L}*)';
const connected=settings=>!!(settings.jiraUrl&&(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken));
module.exports={
 id:'jira',name:'Jira',
 pitch:'проверю баги проекта в Jira: по версии и приоритетам, с открытыми и закрытыми',
 names:[],
 topics:[new RegExp('(?:^|[^\\p{L}])'+READ+'\\s+(?:\\p{L}+\\s+){0,2}(?:баг|bug)\\p{L}*','iu'),/(?:^|[^\p{L}])(?:баг|bug)\p{L}*\s+(?:в|по|для)\s+(?:\p{L}+\s+)?(?:верси|релиз)\p{L}*/iu],
 avoid:[/дискорд|discord|скрин|запис|запиш|сним|видео|заведи|завед|созда|оформ|фокус|кр[эеа]ш|crash|sentry|сентри|отзыв|playtest|плейтест/iu],
 requests:[/(?:^|[^\p{L}])(?:сколько|какие|покажи|проверь|посмотри|глянь|список|открыт\p{L}*|остал\p{L}*)(?=$|[^\p{L}])/iu],
 connect:'settings',
 connected,
 ready:settings=>settings.module_jira==='true'&&connected(settings)
};
