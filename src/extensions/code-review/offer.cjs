// When to offer «Код-ревью» to someone who has not added it.
// Neighbours: pull-requests (PR lists, «ждут моего ревью», PR summaries), git («покажи diff», status, commits),
// store-reviews (user reviews in the stores), people's performance reviews, Jira tasks «на ревью», skills
// (code pasted into the message), and «что такое код-ревью» (a concept question).
module.exports={
 id:'code-review',name:'Код-ревью',
 pitch:'проверю ваши изменения перед PR: секреты, отладку, тесты и замечания к конкретным строкам, а исправления отдам Программисту',
 names:[/код[- ]?ревью|code[- ]?review|ревью\s+(?:ветки|изменений|диффа|моих|кода\s+перед)/iu],
 topics:[/(?:проверь|посмотри|глянь|отревьюй|поревьюй)\s+(?:мои|мой|моё|мое)\s+(?:изменени|правк|дифф?|diff|код|ветк)\p{L}*/iu,/(?:отревью|поревью|проревью)\p{L}*/iu],
 avoid:[/отзыв|app\s*store|google\s*play|перф\p{L}*[- ]?ревью|performance|сотрудник|кандидат|годов\p{L}* ревью|задач\p{L}* на ревью|jira|джир|жд\p{L}* (?:моего )?ревью|мне на ревью|покажи (?:git )?дифф?|что такое|как (?:проводить|делать)/iu],
 requests:[/(?:сделай|проведи|проверь|посмотри|глянь|отревьюй|поревьюй|нужн|давай)/iu],
 connect:'install',
 ready:settings=>settings['extension_code-review']==='true'
};
