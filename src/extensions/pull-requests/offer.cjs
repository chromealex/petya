// When to offer «Pull requests» to someone who has not added or connected it.
// Neighbours: store-reviews («отзывы» in App Store / Google Play), jira («задачи на ревью»), git (local commits),
// ci-builds (CI runs), coder (writes code), skills («сделай код-ревью» of pasted code), translation.
module.exports={
 id:'pull-requests',name:'Pull requests',
 pitch:'покажу PR, которые ждут вашего ревью, ваши открытые PR, статус проверок и резюме PR по диффу',
 names:[/(?:^|[^\p{L}])(?:pr|prs|pull[- ]?requests?)(?=$|[^\p{L}])/iu],
 topics:[/пулл?[- ]?ре[кc]?вест\p{L}*|пул[- ]?риквест\p{L}*|пулреквест\p{L}*/iu,
  /жд\p{L}*\s+(?:моего\s+)?ревью|мне\s+(?:на\s+)?ревью|ревью\s+(?:от|для)\s+меня|review[- ]requested/iu],
 avoid:[/отзыв|app store|google play|задач|тикет|jira|джир|из них|переведи|translate|сделай код[- ]?ревью|проверь (?:этот )?код|что такое/iu],
 requests:[/(?:какие|покажи|мои|ждут|резюме|что в|открыт|статус|сколько)/iu],
 connect:'settings',
 ready:settings=>settings['extension_pull-requests']==='true'&&!!String(settings.githubToken||'').trim()
};
