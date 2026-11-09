// «mail» in the semantic tool router (route-tool, src/features/route-tools.cjs): the model picks one of the mail rules
// by its id (`choices`, enabled ones), and asks which one when the choice is unclear (`keepsClarify`). A request for a
// mail service that is not connected gets the connection offer first, as before.
module.exports={
 id:'mail',order:40,
 says:'прочитать почту Google / Microsoft по одному из настроенных навыков',
 rule:'Для mail выбери существующий recipeId, если выбор неоднозначен — clarify.',
 choices:s=>(s.mail?.rules()||[]).filter(r=>r.enabled),
 keepsClarify:question=>/почтов/iu.test(question),
 async run(s,{command,original,route}){
  const offer=await s.serviceAccess.offer('Проверь Gmail: '+command,s.dialogue.active());if(offer)return offer;
  return s.mail?s.mail.run(route.recipeId,original):null;
 }
};
