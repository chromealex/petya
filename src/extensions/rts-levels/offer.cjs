// When to offer «Генератор уровней» to someone who has not added it: maps for an RTS (players, teams, rivers,
// resources, symmetry) and the engine's own names. Site maps, map services, logging / player / difficulty levels,
// pictures (the artist's) and levels in other engines (Unity, Godot, Unreal) are not it.
module.exports={
 id:'rts-levels',name:'Генератор уровней',
 pitch:'сгенерирую карту для вашего RTS-движка по описанию — игроки и команды, река, симметрия, ресурсы — проверю её, покажу превью и прогоню ботов на баланс; в проект запишу только после подтверждения',
 names:[/(?:^|[^\p{L}])(?:rtsmcp|rts[-\s]?engine|rts[-\s]?движ\p{L}*|ртс[-\s]?движ\p{L}*)(?=$|[^\p{L}])/iu],
 topics:[
  /(?:сгенерируй|сгенерировать|сделай|создай|нарисуй|придумай|построй)\s+(?:мне\s+)?(?:\p{L}+\s+){0,2}(?:карт[ауы]|уровень|левел)[^.?!]{0,60}(?:\d\s*(?:на|vs|v|x|х)\s*\d|игрок|рек[аиуой]|руд[аыу]|ресурс|месторожд|золот|симметрич|старт|остров|каньон|(?:^|[^\p{L}])(?:rts|ртс))/iu,
  /(?:карт[ауы]|уровень)\s+(?:для\s+)?(?:rts|ртс|стратеги\p{L}*)/iu,
  /(?:мои|покажи)\s+(?:rts|ртс)[-\s]*проект\p{L}*/iu
 ],
 avoid:[/(?:^|[^\p{L}])(?:unity|юнити|godot|годот|unreal|анрил|ue[45])(?=$|[^\p{L}])|карт\p{L}*\s+сайта|sitemap|google|гугл|яндекс|maps|mind\s*map|ментальн|банковск|кредитн|картинк|изображени|логировани|уровен\p{L}*\s+(?:игрока|персонажа|героя|сложност|доступа|логов)|баланс\p{L}*\s+(?:юнит|оруж|класс|героев|экономик)/iu],
 requests:[/(?:сгенерируй|сгенерировать|сделай|создай|нарисуй|придумай|построй|покажи)/iu],
 connect:'install',
 ready:settings=>settings['extension_rts-levels']==='true'
};
