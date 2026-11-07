const {chartReply} = require('../chart-reply.cjs');
module.exports = {
  type:'chat-stats', name:'Статистика чата', description:'Диаграмма сообщений пользователя и Пети в текущем чате.',
  matches(command) {
    return !/^\s*(?:не |переведи|объясни фразу)/iu.test(command) &&
      /(?:этом|текущем|нашем) чат|этого чата|переписк/iu.test(command) &&
      /сообщени|реплик/iu.test(command) && /сколько|статистик|соотношени|распредел|диаграмм/iu.test(command);
  },
  scope(s,topic) { return topic?.messages || []; },
  answer(command,messages) {
    const rows = [['user','Вы'],['assistant','Петя']].map(([role,label])=>({
      label,count:messages.filter(message=>message.role===role && !message.pending).length
    }));
    return chartReply({kind:'bars',title:'Сообщения в этом чате до запроса',rows,emptyText:'В чате пока нет сообщений.'});
  }
};
