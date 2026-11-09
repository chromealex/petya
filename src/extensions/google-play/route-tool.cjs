// «anr» in the semantic tool router (route-tool, src/features/route-tools.cjs): the model picks it for a request about
// an app's real ANR in Google Play; the request is answered by the ANR reader (the «anr» dialogue kind, anr-kind.cjs).
// Without the connection the request gets the connection offer first, as before.
module.exports={
 id:'anr',order:20,
 says:'проверить реальные ANR приложения в Google Play',
 async run(s,{command}){
  const offer=await s.serviceAccess.offer('Проверь Google Play: '+command,s.dialogue.active());
  return offer||s.dialogue.turn(command,undefined,'anr');
 }
};
