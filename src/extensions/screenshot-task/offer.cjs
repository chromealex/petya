// When to offer «Скриншот → задача» to someone who has not added it.
module.exports={
 id:'screenshot-task',name:'Скриншот → задача',
 pitch:'по сочетанию клавиш сниму область экрана, помечу и размою лишнее, набросаю баг по картинке и заведу задачу в вашем трекере — только после вашего нажатия',
 names:[],
 topics:[
  /(?:баг\p{L}*|задач\p{L}*|тикет\p{L}*|issue|баг-репорт)\s+(?:из|по|со|с)\s+(?:этого\s+|этому\s+)?(?:скрин\p{L}*|скриншот\p{L}*|снимк\p{L}* экрана|экрану)/iu,
  /(?:скрин\p{L}*|скриншот\p{L}*)\s+(?:в|во)\s+(?:задач\p{L}*|баг\p{L}*|тикет\p{L}*|jira|джир\p{L}*|asana|асан\p{L}*)/iu
 ],
 // A plain screenshot (Petya's computer control), store screenshots, bugs in code are someone else's.
 avoid:[/скриншот\p{L}* (?:стор|магазин|для стор|app store|google play)|баг\p{L}* в коде|почини|исправь/iu],
 requests:[/(?:сделай|заведи|создай|оформи|запиши|нужен|нужна|скрин)/iu],
 connect:'install',
 ready:settings=>settings['extension_screenshot-task']==='true'
};
