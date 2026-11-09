// When to offer «Google Диск» to someone who has not added it (or has not given it access yet).
// Only by name (Google Drive / Docs) or by a Docs, Slides or Drive link: «диск» alone is the computer's disk,
// «документ» alone is a local file, and spreadsheet links are «Google Таблицы».
const auth=require('./auth.cjs');
module.exports={
 id:'google-drive',name:'Google Диск',
 pitch:'найду файлы в Google Диске, прочитаю Google Документ и отвечу по нему с цитатами, сохраню ответ Пети в новый документ — только после вашего подтверждения',
 names:[/(?:гугл|google)[\s-]*(?:диск\p{L}*|драйв\p{L}*|drive|док(?:и|ах|ов|ам|е|у|ом|с)?(?=$|[^\p{L}])|docs|документ\p{L}*)/iu],
 topics:[/docs\.google\.com\/(?:document|presentation)\/|drive\.google\.com\//iu],
 // Sheets by name or link are «Google Таблицы»; the computer's disk, local files and other Google products are not it.
 avoid:[/(?:гугл|google)[\s-]*(?:таблиц|sheets?|шит|play|плей|meet|мит|календар|calendar|почт|mail|переводч|translate|карт|maps|аналитик|analytics|cloud|клауд)|docs\.google\.com\/spreadsheets\/|жёстк\p{L}*\s+диск|жестк\p{L}*\s+диск|диск\s+[a-zа-я]:?(?=$|[^\p{L}])|места\s+на\s+диске|забит\p{L}*\s+диск/iu],
 requests:[/(?:покажи|открой|найди|поищи|прочитай|сохрани|запиши|что|какие|последние|недавние|о\s+ч[её]м|подключи)/iu],
 connect:'settings',
 connected:settings=>auth.connected(settings),
 ready:settings=>settings['extension_google-drive']==='true'&&auth.connected(settings)
};
