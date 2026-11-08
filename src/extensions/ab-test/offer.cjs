// When to offer «A/B-тесты» to someone who has not added it. A/B words, significance of a test, SRM and sample
// size are this app; failing CI tests, writing code tests and regex tests are not (ci-builds, coder, regex-cron).
module.exports={
 id:'ab-test',name:'A/B-тесты',
 pitch:'посчитаю значимость A/B-теста по вашим числам или CSV: интервалы, аплифт, SRM, мощность и сколько ещё ждать',
 names:[/(?:^|[^\p{L}\p{N}])(?:a\s?\/\s?b|а\s?\/\s?б|ab[- ]?тест\p{L}*|аб[- ]?тест\p{L}*|сплит[- ]?тест\p{L}*|srm)(?=$|[^\p{L}\p{N}])/iu],
 topics:[/значим\p{L}*\s+(?:ли\s+)?(?:\p{L}+\s+)?(?:тест|эксперимент|разниц|результат)/iu,/сколько\s+(?:нужно|надо)\s+(?:игроков|пользователей|юзеров|людей)\s+(?:для|на|в)\s+(?:тест|эксперимент)/iu,/размер\p{L}* выборки/iu],
 avoid:[/(?:тест\p{L}*)\s+(?:\p{L}+\s+)?(?:упал|упали|сломал|красн|не прош|пада)|(?:упал\p{L}*|сломал\p{L}*|красн\p{L}*)\s+(?:\p{L}+\s+)?тест|(?:напиши|написать|допиши|добавь|покрой)\p{L}*\s+(?:\p{L}+\s+)?тест|юнит[- ]?тест|unit[- ]?test|автотест|регулярк|(?:^|[^\p{L}])regex|(?:запусти|прогони)\p{L}*\s+тест/iu],
 requests:[/(?:посчитай|рассчитай|значим|сколько|есть ли|проверь|какой|сравни)/iu],
 connect:'install',
 ready:settings=>settings['extension_ab-test']==='true'
};
