// When to offer «Идеи для ивентов»: ideas for live-ops events of the game, planning one. An event in the calendar
// (meetings), events in code (UnityEvent, listeners), analytics events and funnels are not it.
module.exports={
 id:'event-ideas',name:'Идеи для ивентов',
 pitch:'предложу ивенты для игры: праздники нужных регионов, что недавно запускали конкуренты, как прошли наши прошлые ивенты, и посчитаю стоимость наград в игровой валюте по конфигам',
 names:[/лайв[- ]?опс\p{L}*|live[- ]?ops/iu],
 topics:[/(?:иде[яиюй]\p{L}*|придума\p{L}*|предлож\p{L}*|подскажи)\s+(?:\p{L}+\s+){0,2}?ивент\p{L}*/iu,
  /(?:какой|какие|какую)\s+(?:\p{L}+\s+){0,1}?ивент\p{L}*\s+(?:провести|запустить|сделать|устроить)/iu,
  /ивент\p{L}*\s+(?:на|к|для)\s+(?:хэллоуин|хеллоуин|нов\p{L}*\s+год|рождеств|валентин|пасх|рамадан|ч[её]рн\p{L}*\s+пятниц|праздник)\p{L}*/iu,
  /запланир\p{L}*\s+(?:\p{L}+\s+)?ивент\p{L}*/iu],
 avoid:[/календар\p{L}*|встреч\p{L}*|созвон\p{L}*|(?:^|[^\p{L}])(?:unity\s*events?|unityevent|listener\p{L}*|eventbus)(?=$|[^\p{L}])|в\s+коде|воронк\p{L}*|аналитик\p{L}*\s+событ|назван\p{L}*|нейминг\p{L}*|слоган\p{L}*/iu],
 requests:[/(?:какой|какие|предложи|придумай|подскажи|запланируй|идеи|покажи)/iu],
 connect:'install',
 ready:settings=>settings['extension_event-ideas']==='true'
};
