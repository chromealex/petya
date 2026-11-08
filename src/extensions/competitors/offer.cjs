// When to offer «Конкуренты» to someone who has not added it. It needs no service connection: App Store facts are
// public. Neighbours: a contest («конкурс»), an opponent in chess or sports, comparing devices, our own store
// reviews and ratings (store-reviews), competitive-advantage talk.
const {NEAR}=require('./query.cjs');
module.exports={
 id:'competitors',name:'Конкуренты',
 pitch:'буду следить за играми-конкурентами в App Store: новые версии и что в них добавили, рейтинг, размер, сравнение с нашими играми',
 names:[],
 topics:[/конкурент\p{L}*/iu,/(?:у кого|чей)\s+(?:\p{L}+\s+)?(?:вырос|упал|поднял|снизил|просел)\p{L}*\s+(?:\p{L}+\s+)?рейтинг/iu,/(?:какие|новые)\s+(?:\p{L}+\s+)?механик\p{L}*\s+(?:\p{L}+\s+){0,2}(?:добавил|появил|ввели)\p{L}*/iu],
 avoid:[NEAR],
 requests:[/(?:что нового|добавь|следи|какие|покажи|у кого|сравни|список)/iu],
 connect:'install',
 ready:settings=>settings.extension_competitors==='true'
};
