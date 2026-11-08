// «Фокус» as a notification policy (src/features/notification-policy.cjs): while a focus session runs, a
// non-urgent system notification is held by the session (kept in focus.json) and shown in one summary when the
// focus ends (feature.cjs `release`). Breaks and paused sessions hold nothing; urgent ones always pass.
module.exports={
 id:'focus',label:'Фокус-сессия',order:10,
 decide(s,n){return require('./feature.cjs').engine(s).holds(n)?{action:'hold',reason:'Идёт фокус-сессия'}:null;},
 accept(s,n){require('./feature.cjs').engine(s).keep(n);}
};
