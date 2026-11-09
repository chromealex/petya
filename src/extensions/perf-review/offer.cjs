// When to offer «Перформанс-ревью»: materials for a colleague's performance review. Not this: code review («ревью
// кода», «код-ревью», PR reviews — «Код-ревью» and «Pull requests»), store reviews, design or document reviews, a 1:1
// («Встречи 1:1») and «что такое перформанс-ревью».
const facts=require('./facts.cjs');
module.exports={
 id:'perf-review',name:'Перформанс-ревью',
 pitch:'соберу материалы к ревью коллеги за период — задачи и инциденты из Jira, PR и код-ревью, решения встреч, договорённости 1:1 — со ссылкой на каждый факт и честным списком того, о чём данных нет',
 names:[/(?:^|[^\p{L}])(?:перф\p{L}*[\s-]?ревью|перформанс[\s-]?ревью|performance[\s-]?review|perf[\s-]?review)(?=$|[^\p{L}])/iu],
 topics:[/материал\p{L}*\s+(?:для|к)\s+ревью\s+\p{Lu}/u,/ревью\s+\p{Lu}\p{Ll}+\s+за\s+(?:полгода|квартал|год|месяц)/u],
 avoid:[/(?:^|[^\p{L}])(?:код\p{L}*|кода|pr|пул\p{L}*|ветк\p{L}*|изменени\p{L}*|диф\p{L}*|diff|дизайн\p{L}*|документ\p{L}*|архитектур\p{L}*|отзыв\p{L}*|app\s*store|google\s*play|1:1|один\s+на\s+один)(?=$|[^\p{L}])|что\s+такое|как\s+(?:провести|проводить|писать)/iu],
 requests:[/(?:собери|подготов|сделай|состав|набросай|нужн|материал)/iu],
 connect:'settings',
 // Added and at least one source of facts connected (Jira or GitHub).
 ready:settings=>settings['extension_perf-review']==='true'&&(facts.jiraConnected(settings)||facts.githubReady(settings))
};
