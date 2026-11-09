// When to offer «Подписки и продления» to someone who has not added it: what they pay for regularly, what renews or
// is charged soon, how much goes to services, when a domain / certificate / license expires. Not subscribing to
// channels or mailing lists, signing documents, extending a sprint or focus, prices of products or followers.
module.exports={
 id:'subscriptions',name:'Подписки и продления',
 pitch:'найду в вашей почте подписки и продления: сколько уходит в месяц, когда следующее списание, когда истекают домены и лицензии — всё остаётся на этом компьютере',
 names:[/подписк\p{L}*\s+и\s+продлени\p{L}*/iu],
 topics:[/за\s+что\s+(?:я\s+)?(?:плачу|плат\p{L}*)\s+(?:каждый\s+месяц|ежемесячно|регулярно|в\s+месяц)/iu,
  /(?:мои|какие\s+у\s+меня)\s+(?:платн\p{L}*\s+)?подписк\p{L}*/iu,
  /сколько\s+(?:у\s+меня\s+|я\s+)?(?:уходит|трачу|плачу|тратится|отдаю)\s+(?:в\s+месяц\s+)?на\s+(?:подписк|сервис)\p{L}*/iu,
  /что\s+(?:у\s+меня\s+)?(?:продлится|спишется|будет\s+списан\p{L}*)/iu,
  /когда\s+(?:истекает|заканчивается|продлевать|продлить)\s+(?:мой\s+)?(?:домен|лицензи|сертификат)\p{L}*|когда\s+(?:следующее\s+)?списание\s+за/iu],
 avoid:[/подпиш\p{L}*|отпиш\p{L}*|подписчик\p{L}*|подпис\p{L}*\s+(?:на\s+(?:канал|рассылк|тред|уведомлени)|документ|договор)|продли\s+(?:спринт|фокус|дедлайн|встречу)|переговорк|сколько\s+стоит/iu],
 requests:[/(?:^|[^\p{L}])(?:за\s+что|какие|мои|сколько|что|когда|покажи)/iu],
 connect:'install',
 ready:settings=>settings.extension_subscriptions==='true',
 connected:settings=>settings.mailRecords==='true'
};
