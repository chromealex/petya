// When to offer «Локализация» to someone who has not added it.
module.exports={
 id:'localization',name:'Локализация',
 pitch:'проверю файлы локализации (недостающие ключи, плейсхолдеры, длину) и переведу недостающие строки в новые файлы',
 names:[/(?:^|[^\p{L}])(?:i2 ?localization|string ?tables?|xcstrings|strings\.xml)(?=$|[^\p{L}])/iu],
 topics:[/локализац\p{L}*/iu,/(?:что|какие)[^.?!]{0,30}не переведен\p{L}*|непереведённ\p{L}*|непереведенн\p{L}*|недостающ\p{L}* (?:ключ|перевод|строк)\p{L}*/iu,/(?:переведи|перевести) (?:недостающ|пуст|непереведенн|непереведённ)\p{L}*/iu],
 // Money transfers, moving a task to another status and translating a phrase are not localization files.
 avoid:[/деньг|денежн|оплат|плат[её]ж|на карту|на сч[её]т|в статус|задач|тикет/iu,/переведи (?:эту|этот|эти|фразу|текст|слово|предложение|письмо|сообщение)/iu],
 requests:[/(?:проверь|покажи|переведи|перевести|какие|сколько|что|недостающ|непереведенн|непереведённ)/iu],
 connect:'install',
 ready:settings=>settings.extension_localization==='true'
};
