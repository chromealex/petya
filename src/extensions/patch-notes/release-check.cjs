// «Патчноуты» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// the newest patch-notes card of the release in the chats has every language from the settings, and its App Store
// and Google Play texts fit the stores' limits without dropped lines. Read-only: it never writes notes itself.
const notes=require('./notes.cjs');
const {plainVersion}=require('./sources.cjs');
const langs=require('../localization/langs.cjs');
const STORES=['appstore','play'];

// The newest card for the version: [card, at].
function latest(s,version){
 let best=null;
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[]){
  const c=m.extensionData?.patchNotes;if(!c)continue;
  const v=c.version||String(c.title||'').replace(/^Версия\s+/,'');
  if(plainVersion(v)!==plainVersion(version))continue;
  const at=Number(m.at)||0;if(!best||at>=best[1])best=[c,at];
 }
 return best;
}

module.exports={
 checks:[{id:'patchnotes.ready',title:'Патчноут готов на всех языках и в лимитах сторов',group:'Стор и игроки'}],
 ready:()=>true,
 async run(s,release){
  const ask={label:'Написать патчноут',ask:'напиши патчноут к версии '+release.version};
  const found=latest(s,release.version);
  if(!found)return [{id:'patchnotes.ready',status:'unknown',summary:'Патчноут к '+release.version+' ещё не составлен.',action:ask}];
  const [card]=found,need=notes.languages('',s.settings),have=card.languages||[];
  const missing=need.filter(l=>!have.some(h=>langs.same?langs.same(h,l):h===l));
  const evidence=[],over=[];
  for(const lang of have){
   const t=card.texts?.[lang];if(!t)continue;
   evidence.push({text:langs.name(lang)+': '+STORES.map(d=>notes.DESTS[d].label+' '+t[d].count+'/'+t[d].limit).join(', ')});
   for(const d of STORES)if(t[d].dropped||t[d].count>t[d].limit)over.push(langs.name(lang)+' · '+notes.DESTS[d].label+(t[d].dropped?': не влезло строк — '+t[d].dropped:': '+t[d].count+' из '+t[d].limit));
  }
  const problems=[...missing.length?['нет языков: '+missing.map(langs.name).join(', ')]:[],...over];
  if(problems.length)return [{id:'patchnotes.ready',status:'problem',summary:problems.join('; ')+'.',evidence,action:ask}];
  return [{id:'patchnotes.ready',status:'ok',summary:'Есть на '+have.map(langs.name).join(', ')+', всё в лимитах.',evidence}];
 },
 latest
};
