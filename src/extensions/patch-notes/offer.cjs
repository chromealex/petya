// When to offer «Патчноуты» to someone who has not added it.
// Neighbours: meeting notes and summaries (meetings), news in Slack or mail, translation keys (localization), store
// reviews, build size. Changes written in the message itself are the skill library's job (release-notes,
// patch-notes-players, changelog-from-commits), so a request with an inline list is not an offer.
module.exports={
 id:'patch-notes',name:'Патчноуты',
 pitch:'соберу изменения версии из Jira, git и PR, напишу «Что нового» для App Store и Google Play в их лимитах на нужных языках и отдельный чейнджлог для команды',
 names:[/патч[- ]?ноу?т\p{L}*|patch[- ]?notes?|ч[еэ]й?нджлог\p{L}*|changelog/iu],
 topics:[/что\s+нового\s+(?:для\s+(?:стор|игрок|app\s*store|google\s*play)|в\s+(?:верси|релиз|обновлени)\p{L}*)/iu,
  /анонс\p{L}*\s+(?:обновлени|апдейт|верси|релиз)\p{L}*/iu,
  /(?:release[- ]?notes?|релиз[- ]?ноу?т\p{L}*)\s+(?:к|для|по)\s+(?:верси|релиз|спринт|v?\d)/iu,
  /список\s+изменений\s+(?:верси|релиз|между)/iu],
 avoid:[/заметк\p{L}*\s+(?:встреч|созвон)|сводк\p{L}*\s+встреч|что\s+нового\s+в\s+(?:slack|слак|чат|канал|почт|telegram|телеграм|jira|джир)|(?:патч|notes|ч[еэ]й?нджлог|changelog|обновлени\p{L}*)[^:\n]{0,40}:\s*\S[^:\n]{6,}[,;\n]|(?:сделай|создай)\s+скилл|перевед|перевод/iu],
 requests:[/(?:напиши|составь|собери|сделай|подготовь|что\s+нового|анонс|между|к\s+верси|для\s+стор)/iu],
 connect:'install',
 ready:settings=>settings['extension_patch-notes']==='true'
};
