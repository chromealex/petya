// When to offer «Конвертер» to someone who has not added it.
module.exports={
 id:'converter',name:'Конвертер',
 pitch:'конвертирую картинки, видео, аудио и документы одной фразой — формат, размер, сжатие до нужного веса, гифка из видео; исходники не трогаю',
 names:[/(?:^|[^\p{L}])(?:ffmpeg|handbrake)(?=$|[^\p{L}])/iu],
 topics:[
  /(?:конверт\p{L}*|сконверт\p{L}*|переконверт\p{L}*)[^.?!]{0,30}(?:png|jpe?g|webp|heic|tiff?|gif|svg|mp4|mov|webm|wav|mp3|ogg|m4a|docx|pptx|xlsx|pdf|картинк|изображени|фото|видео|аудио|звук|документ|файл)/iu,
  /(?:сожми|сжать|ужми|уменьши)[^.?!]{0,20}(?:видео|ролик|картинк|фото|изображени|аудио|mp4|mov|png|jpe?g)/iu,
  /(?:сделай|собери|сделать)\s+(?:из\s+\p{L}+\s+)?гифк\p{L}*|гифк\p{L}* из видео|видео в гифк/iu,
  /(?:переведи|перевести|сохрани)\s+(?:\p{L}+\s+)?(?:docx|pptx|xlsx|doc|png|jpe?g|webp|heic|mov|mp4|wav|mp3)\s+в\s+(?:pdf|png|jpe?g|webp|mp4|mp3|gif|wav|ogg|m4a)/iu
 ],
 // Currency converters, text translation, shortening an answer are not files.
 avoid:[/валют|курс\p{L}* (?:доллар|евро|рубл)|доллар|евро|рубл|переведи (?:текст|фраз|слово|письмо|сообщени|на (?:английск|русск|немецк))|сожми (?:ответ|текст|мысль)|единиц\p{L}* измерен|задач/iu],
 requests:[/(?:конверт|сконверт|сожми|сжать|уменьши|сделай|переведи|перевести|сохрани)/iu],
 connect:'install',
 ready:settings=>settings.extension_converter==='true'
};
