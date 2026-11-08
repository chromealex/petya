// When to offer «Поддержка игроков» to someone who has not added or connected it. Neighbours: vendors' support
// («поддержка Unity» is documentation), Petya's own help, «поддержи меня», store reviews (store-reviews), tickets of
// the task tracker (Jira), the Discord community.
module.exports={
 id:'support',name:'Поддержка игроков',
 pitch:'покажу тикеты поддержки из Zendesk: открытые и просроченные по SLA, о чём жалуются игроки, и подготовлю ответ по базе знаний — отправлю только после вашего «Отправить»',
 names:[/zendesk|зендеск\p{L}*/iu],
 topics:[/тикет\p{L}*\s+(?:в\s+|из\s+)?(?:поддержк|саппорт)|(?:тикет\p{L}*|обращени\p{L}*)\s+(?:игрок|пользовател)\p{L}*|(?:в|из)\s+(?:поддержк\p{L}*|саппорт\p{L}*)|поддержк\p{L}*\s+игрок\p{L}*|(?:ответь|ответить)\s+на\s+тикет|тикет\p{L}*\s+про\s+/iu],
 avoid:[/(?:поддержк\p{L}*|саппорт\p{L}*)\s+(?:unity|юнити|apple|google|steam|ios|android|microsoft|discord|дискорд|slack)|техподдержк\p{L}*\s+пет|поддержк\p{L}*\s+пет[иьяю]|поддерж(?:и|ите|ать)(?!\p{L})|поддерживает|отзыв|app\s?store|google\s?play|jira|джир|спринт|youtrack|дискорд|discord/iu],
 requests:[/(?:покажи|сколько|какие|что жалуются|на что жалуются|просроч|открыт|за неделю|за сегодня|ответь)/iu],
 connect:'settings',
 // Added and at least one support source (Zendesk first) connected.
 ready:settings=>settings.extension_support==='true'&&require('./sources.cjs').create({settings}).list().length>0
};
