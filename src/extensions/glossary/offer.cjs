// When to offer «Глоссарий» to someone who has not added it: the project's own glossary, a project word explained
// «у нас», or terms checked in the localization. General definitions («что такое REST») and other products'
// glossaries («глоссарий Unity») are not this; checking localization files as such is «Локализация».
module.exports={
 id:'glossary',name:'Глоссарий',
 pitch:'соберу глоссарий проекта из локализации, документов и переписки, покажу переводы терминов и найду разнобой в строках',
 names:[],
 topics:[/глоссари\p{L}*/iu,/(?:^|[^\p{L}])термин(?:ы|а|ов|ам|ами|ах|у|ом|е)?(?=$|[^\p{L}])/iu,/термин\p{L}*\s+(?:в\s+|по\s+)?(?:локализац|перевод|строк)\p{L}*/iu,/что\s+(?:у нас\s+)?(?:значит|означает|называется)\s+.{2,40}\s+(?:у нас|в (?:нашем )?проекте|в (?:нашей )?игре)|что у нас (?:значит|означает|называется)/iu],
 avoid:[/[Гг]лоссари\p{L}*\s+(?!проекта|игры|нашего|наш)[A-Z]/u,/(?:медицинск|юридическ|научн)\p{L}*\s+термин/iu,/термин\p{L}* (?:договор|аренд|кредит)/iu],
 requests:[/(?:собери|составь|добавь|внеси|проверь|сверь|покажи|открой|экспорт|выгрузи|что (?:значит|означает|называется))/iu],
 connect:'install',
 ready:settings=>settings.extension_glossary==='true'
};
