// When to offer «Отсутствия» to someone who has not added it: who of the team is on vacation, sick leave or a day
// off, when a colleague comes back, the team's vacation schedule. Not the user's own leave or HR questions (days left,
// paperwork), travel («отпуск в Турции»), sprint capacity (sprint planning) or the calendar's meetings.
module.exports={
 id:'absences',name:'Отсутствия',
 pitch:'покажу, кто из команды в отпуске, на больничном или в отгуле, и когда человек вернётся — по отметкам в чате и событиям календаря, только на этом компьютере',
 names:[],
 topics:[/кто\s+(?:у\s+нас\s+|из\s+(?:команды|нас|ребят|коллег)\s+)?(?:сейчас\s+)?(?:в\s+отпуске|на\s+больничном|болеет|в\s+отгуле|отсутствует|уходит\s+в\s+отпуск|будет\s+в\s+отпуске)/iu,
  /(?:отпуска|отсутствия|отгулы)\s+(?:в\s+)?(?:команд|коллег|ребят)\p{L}*|(?:график|календар\p{L}*|план)\s+(?:отпусков|отсутствий)|кто\s+когда\s+(?:в\s+отпуске|уходит\s+в\s+отпуск)/iu,
  /когда\s+\p{L}+\s+(?:вернется|вернётся|выйдет|выходит)\s+(?:из\s+отпуска|с\s+больничного|на\s+работу)/iu],
 avoid:[/турци|египт|мор[еяю]|куда\s+(?:поехать|съездить)|(?:сколько|остал\p{L}*)\s+(?:\p{L}+\s+)?дн\p{L}*\s+отпуск|отпускн|оформ|заявлени|декрет|спринт|ёмкост|емкост|(?:^|\s)(?:я|мне|меня|мой|моя)\s+(?:в\s+)?отпуск/iu],
 requests:[/(?:кто|когда|покажи|какие|график|календар)/iu],
 connect:'install',
 ready:settings=>settings.extension_absences==='true'
};
