// When to offer «Счётчик слов» to someone who has not added it.
module.exports={
 id:'word-count',name:'Счётчик слов',
 pitch:'посчитаю слова в тексте и покажу самые частые',
 names:[],
 topics:[/(?:посчитай|сосчитай|сколько)\s+слов/iu],
 // Counting messages in a chat is «Статистика чата»; characters and lines are not words.
 avoid:[/сообщени|реплик|символ|строк/iu],
 requests:[/посчитай|сосчитай|сколько/iu],
 connect:'install',
 ready:settings=>settings['extension_word-count']==='true'
};
