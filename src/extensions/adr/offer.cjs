// When to offer «Архитектурные решения» to someone who has not added it. Adding is enough (no service).
// Solving equations and problems, a meeting's decisions (Petya's meeting summary), decisions in general («прими
// решение», «помоги решить»), ADR in finance (depositary receipts) and hotels (average daily rate) are not it.
module.exports={
 id:'adr',name:'Архитектурные решения',
 pitch:'оформлю архитектурное решение (ADR) из чата, сводок встреч и поиска по смыслу и сохраню в docs/adr проекта только после того, как вы проверите файл; найду принятые решения и проверю новое на противоречия с цитатами',
 names:[/(?:^|[^\p{L}])(?:ADR|адр)(?=$|[^\p{L}])/u],
 topics:[/архитектурн\p{L}*\s+решени\p{L}*/iu,
  /(?:запиши|зафиксируй|задокументируй)\s+(?:наше\s+|это\s+)?решени[ея]\s*[:—–-]/iu,
  /(?:какие|какое)\s+(?:архитектурн\p{L}*\s+)?решени[яе]\s+(?:мы\s+)?(?:принимали|приняли|принято)\s+(?:про|по|о|об|насч)/iu,
  /противоречит\s+ли\s+.{0,80}(?:решени|ADR)/iu],
 avoid:[/уравнени|задач[уиа]?\s+по\s+(?:математ|физик)|реши\s|помоги\s+решить|прими\s+решение|встреч|созвон|совещани|планерк|акци|депозитар|бирж|котировк|отел|гостиниц|average\s+daily|курс\s+ADR/iu],
 requests:[/(?:запиши|зафиксируй|оформи|напиши|какие|найди|покажи|противоречит|составь)/iu],
 connect:'install',
 ready:settings=>settings.extension_adr==='true'
};
