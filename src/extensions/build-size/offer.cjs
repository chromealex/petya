// When to offer «Размер билда» to someone who has not added it.
module.exports={
 id:'build-size',name:'Размер билда',
 pitch:'разберу APK, AAB или IPA по категориям и покажу, что выросло между двумя билдами',
 names:[/(?:^|[^\p{L}\p{N}])(?:apk|aab|ipa)(?=$|[^\p{L}\p{N}])/iu],
 topics:[/(?:размер|вес)\p{L}* (?:билда|сборки|apk|aab|ipa|приложения)|(?:билд|сборка|apk|ipa) (?:вырос|выросла|потяжелел\p{L}*|раздул\p{L}*)|из чего состоит (?:билд|сборка|apk|aab|ipa)/iu],
 // Build status, time and crashes belong to CI builds and crash reports; «размер команды/экрана» is not a build.
 avoid:[/(?:упал|упала|сломал|красн|зел[её]н|очеред|дольше|время|минут|тест|крэш|краш|ANR)\p{L}*/iu,/размер\p{L}* (?:команд|экран|шрифт|окна|зарплат)/iu,
  // Making, signing, uploading or installing an APK is CI / store work, not its size.
  /(?:собер|собрат|подпис|подпиш|залей|залить|выложи|загрузи|установ|опублику)\p{L}*/iu],
 requests:[/(?:почему|сравни|покажи|разбери|сколько|из чего|что (?:занимает|внутри|выросло))/iu],
 connect:'install',
 ready:settings=>settings['extension_build-size']==='true'
};
