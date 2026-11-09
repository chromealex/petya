// When to offer «Сборки» to someone who has not added or connected it.
// Neighbours: build-size (APK/AAB/IPA size), dependencies (package versions), git (local status/commit),
// pull-requests (PR checks are shown there), unity (local editor builds), and Petya's own Slack build flows:
// «почему упал билд» / «что с билдом» without a CI name are read from Slack threads (the Slack app's logs.cjs,
// build-question.cjs) and repair is build-repair.cjs, so those are never answered with an offer.
const CI_NAME=/github actions|unity (?:cloud build|build automation)|(?:^|[^\p{L}])(?:ci|ci\/cd)(?=$|[^\p{L}])/iu;
module.exports={
 id:'ci-builds',name:'Сборки',
 pitch:'покажу последние запуски GitHub Actions и Unity Build Automation, где упала сборка и первую ошибку из лога',
 names:[CI_NAME],
 topics:[/(?:последн\p{L}*|истори\p{L}*|список)\s+(?:\p{L}+\s+)?(?:сборок|сборки|билдов|билды|прогонов|запусков ci|пайплайн\p{L}*)/iu,
  /(?:статус|состояни\p{L}*)\s+(?:ci|сборок|пайплайн\p{L}*|github actions|workflow\p{L}*)(?=$|[^\p{L}])/iu],
 avoid:[
  // A failure question without a CI name belongs to the Slack build-log flow.
  new RegExp('^(?![\\s\\S]*(?:'+CI_NAME.source+'))[\\s\\S]*(?:пада|упал|слом|ошиб|fail|error|почему|лог)','iu'),
  /размер|сколько весит|(?:^|[^\p{L}])вес(?:ит)?(?=$|[^\p{L}])|зависимост|уязвим|коммит|закоммить|(?:^|[^\p{L}])(?:pr|пулл?[- ]?реквест\p{L}*|pull request)(?=$|[^\p{L}])|ревью|slack|слак|тред|статус билдов|следи за|(?:почини|исправь|пофикси|поправь)\s+(?:\p{L}+\s+)?(?:билд|сборк)|собери|собрать/iu],
 requests:[/(?:почему|покажи|что с|статус|последн|какие|упал|перезапусти)/iu],
 connect:'settings',
 ready:settings=>settings['extension_ci-builds']==='true'&&!!String(settings.githubToken||'').trim()
};
