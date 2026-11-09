// When to offer «Сборки» to someone who has not added or connected it.
// Neighbours: build-size (APK/AAB/IPA size), dependencies (package versions), git (local status/commit),
// pull-requests (PR checks are shown there), unity (local editor builds), and Petya's Slack log review:
// «почему упал билд» without a CI name is read from Slack threads (the Slack app's logs.cjs), so it is never answered with an
// offer. The app's own Slack/Jira build flows are offered: «почини билд», «что с билдом», «спроси, что с билдом».
const CI_NAME=/github actions|unity (?:cloud build|build automation)|(?:^|[^\p{L}])(?:ci|ci\/cd)(?=$|[^\p{L}])/iu;
// The phrases of build-repair.cjs (isRepair) and build-question.cjs (isBuildQuestion).
const REPAIR=/^(?:петя[\s,!:—-]+)?(?:пожалуйста[, ]+)?(?:снова\s+)?(?:почини|поправь|исправь|пофикси|починить|исправить)\s+(?:(?:этот|эту|падающий|падающую|сломанный|сломанную)\s+)*(?:билд|сборк[ау])(?=$|[\s,.!?])/iu;
const QUESTION=/^(?:петя[\s,!:—-]+)?(?:ну\s+)?(?:что\s+(?:там\s+)?с\s+(?:этим\s+)?(?:билдом|сборкой)|как\s+(?:там\s+)?(?:билд|сборка)|узнай\s+(?:что\s+с\s+)?(?:билдом|сборкой)|спроси\s+(?:что\s+с\s+)?(?:билдом|сборкой))(?=$|[\s,.!?])/iu;
const slackReady=settings=>settings.module_slack!=='false'&&!!(settings.slackToken||settings.slackCredential);
module.exports={
 id:'ci-builds',name:'Сборки',
 pitch:'покажу последние запуски GitHub Actions и Unity Build Automation, где упала сборка и первую ошибку из лога; спрошу в Slack, что с билдом, и передам починку падающей сборки агенту',
 names:[CI_NAME],
 topics:[/(?:последн\p{L}*|истори\p{L}*|список)\s+(?:\p{L}+\s+)?(?:сборок|сборки|билдов|билды|прогонов|запусков ci|пайплайн\p{L}*)/iu,
  /(?:статус|состояни\p{L}*)\s+(?:ci|сборок|пайплайн\p{L}*|github actions|workflow\p{L}*)(?=$|[^\p{L}])/iu,REPAIR,QUESTION],
 avoid:[
  // A failure question without a CI name belongs to the Slack build-log flow.
  new RegExp('^(?![\\s\\S]*(?:'+CI_NAME.source+'))[\\s\\S]*(?:пада|упал|слом|ошиб|fail|error|почему|лог)','iu'),
  /размер|сколько весит|(?:^|[^\p{L}])вес(?:ит)?(?=$|[^\p{L}])|зависимост|уязвим|коммит|закоммить|(?:^|[^\p{L}])(?:pr|пулл?[- ]?реквест\p{L}*|pull request)(?=$|[^\p{L}])|ревью|slack|слак|тред|статус билдов|следи за|собери|собрать/iu],
 requests:[/(?:почему|покажи|что с|статус|последн|какие|упал|перезапусти|почини|поправь|исправь|пофикси|спроси|узнай|как там)/iu],
 connect:'settings',
 // Connected: GitHub for CI runs, or Slack / Claude–Codex for the build flows (the CI turn itself asks for GitHub).
 ready:settings=>settings['extension_ci-builds']==='true'&&(!!String(settings.githubToken||'').trim()||slackReady(settings)||settings.module_ai==='true')
};
