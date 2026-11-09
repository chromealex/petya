// A voice-command action of Google Play (voice-action, src/voice-actions.cjs): «Проверить ANR в Google Play» reads the
// ANR rate of the app named in the command's text from Android vitals. Listed while the Google Play connection is
// added (this app's cards have no switch of their own); commands saved with the old core action «anr» become this one
// (`legacy`).
module.exports={
 id:'anr',label:'Проверить ANR в Google Play',order:20,legacy:'anr',
 help:'Укажите запрос с приложением или переменной {query}. Петя прочитает ANR через Google Play Console; при нехватке данных уточнит выбор.',
 ready:settings=>settings.module_googleplay==='true',
 run:async(_services,{output})=>({ask:output,kind:'anr'})
};
