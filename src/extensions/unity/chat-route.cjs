// Unity Editor requests in chat («покажи префаб Player», «поверни влево» after a prefab), asked by the pipeline
// where Petya's own Unity handler used to run (src/features/chat-routes.cjs, stage 'commands', after Git). The turn
// itself (desktop.cjs) asks to enable the editor when the module is off, so it is asked while the app is off too.
// Not while files are attached: those are the attachment flows' requests.
module.exports={
 id:'unity',stage:'commands',order:20,handlesOff:true,
 capability:{id:'unity',says:'Unity: найти или показать префаб, ошибки консоли, иерархию сцены',examples:['покажи префаб Player','покажи ошибки в консоли Unity','покажи иерархию сцены в Unity'],
  accepts:text=>!!require('./intent.cjs').intent(text)},
 async run(s,_route,{text}){
  if(s.attachments?.list().length)return null;
  return (await s.unity?.turn(text))||null;
 }
};
