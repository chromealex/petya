// When the local model says it does not know or is unsure about a public fact, Petya looks it up on the web in the
// background. Questions about the user, the team or work data are never sent to a search engine.
const UNSURE=/(?:не знаю|не уверен|не могу (?:точно |уверенно )?(?:сказать|ответить|подтвердить)|нет (?:точной |актуальной |достоверной |надёжной |надежной )?(?:информации|данных|сведений)|не располагаю|мне (?:не|ничего не) известно|мои (?:знания|данные) (?:ограничены|могут быть устаревшими)|без доступа к интернету|не нашёл|не нашел|затрудняюсь|могу ошибаться|не встречал|не слышал)/iu;
const PRIVATE=/(?:^|[^\p{L}])(?:мо[йяеёи]\p{L}*|мне|меня|мною|наш\p{L}*|мы|нас|нам|задач\p{L}*|баг\p{L}*|тикет\p{L}*|проект\p{L}*|команд\p{L}*|коллег\p{L}*|slack|слак\p{L}*|jira|джир\p{L}*|почт\p{L}*|письм\p{L}*|чат\p{L}*|встреч\p{L}*|пароль|токен)(?![\p{L}])/iu;
function needed(question,answer){const q=String(question||'').trim();return q.length>=6&&q.length<=300&&UNSURE.test(String(answer||''))&&!PRIVATE.test(q);}
// The search query is the subject of the question, without the conversational wrapper around it.
const WRAPPER=/^(?:(?:а|и|слушай|скажи|подскажи)[,\s]+)*(?:(?:что|чего) (?:ты |вы )?(?:знаешь|знаете|слышал\p{L}*|можешь сказать|можешь рассказать|скажешь) (?:про|о|об|насчёт|насчет)|(?:расскажи|расскажите|объясни|объясните)(?: мне)?(?: (?:про|о|об|что такое))?|(?:найди|поищи)(?: мне)?(?: (?:информацию|инфу|что-нибудь))? (?:про|о|об|по)|что (?:такое|это за|значит|означает)|кто (?:такой|такая|такие|это))\s+/iu;
function query(question){return String(question||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(WRAPPER,'').replace(/[?!.]+$/u,'').slice(0,300);}
module.exports={needed,query,UNSURE};
