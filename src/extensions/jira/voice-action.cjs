// A voice-command action of Jira (voice-action, src/voice-actions.cjs): «Проверить баги в Jira» reads the bugs of the
// project named in the command's text through Petya's Jira reader. Listed while Jira is added; commands saved with the
// old core action «bugs» become this one (`legacy`).
module.exports={
 id:'bugs',label:'Проверить баги в Jira',order:10,legacy:'bugs',
 help:'Укажите запрос с проектом или приложением либо переменной {query}. Петя прочитает баги через Jira; при нехватке данных уточнит выбор.',
 run:async(_services,{output})=>({ask:output,kind:'bugs'})
};
