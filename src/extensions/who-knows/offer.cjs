// When to offer «Кто знает» to someone who has not added it: a search for a person who knows a subject of the
// project or wrote a piece of its code. Factual questions («кто знает, когда релиз»), «кто ты» and «знаешь ли ты…»
// are not this; the team directory itself («заполни команду») and roles («кто тестировщик») are Petya's own.
const {TOPICS,AVOID}=require('./query.cjs');
module.exports={
 id:'who-knows',name:'Кто знает',
 pitch:'подскажу, кто в команде разбирается в теме: по истории Git, задачам Jira, переписке Slack и встречам — с основаниями',
 names:[],
 topics:TOPICS,
 avoid:[...AVOID,/(?:заполн|обнов|добав)\p{L}*\s+(?:\p{L}+\s+)?команд/iu],
 requests:[/(?:^|[^\p{L}])(?:кто|к кому|кого|с кем)(?=$|[^\p{L}])/iu],
 connect:'install',
 ready:settings=>settings['extension_who-knows']==='true'
};
