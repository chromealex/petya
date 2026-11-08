// When to offer «Профайлер» to someone who has not added it.
module.exports={
 id:'profiler',name:'Профайлер',
 pitch:'разберу CSV из Unity Profile Analyzer, трассу Chrome или gfxinfo: что съедает кадр по потокам, пики и GC, сравню захваты до и после',
 names:[/(?:^|[^\p{L}])(?:profile analyzer|perfetto|framestats|gfxinfo)(?=$|[^\p{L}])/iu],
 topics:[/профайл\p{L}*|профилировщик\p{L}*|(?:^|[^\p{L}])profiler(?=$|[^\p{L}])/iu,
  /что (?:жр[её]т|ест|съедает|тормозит) (?:кадр|fps|фпс)|(?:^|[^\p{L}])фриз\p{L}*|просадк\p{L}* (?:fps|фпс|кадр\p{L}*)|(?:время|бюджет) кадра|спайк\p{L}* (?:кадр\p{L}*|в кадре)/iu],
 // A user's or a Slack profile, browser devtools and a browser tab's memory are not a game capture; a playtest video
 // («где игрок застрял») is «Разбор плейтеста».
 avoid:[/профил[ьяюе]\p{L}*|браузер\p{L}*|devtools|вкладк\p{L}*|плейтест\p{L}*|(?:^|[^\p{L}])playtest/iu],
 requests:[/(?:разбер|сравни|почему|что|покажи|проанализ|глянь|посмотри)/iu],
 connect:'install',
 ready:settings=>settings.extension_profiler==='true'
};
