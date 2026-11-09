// The mail rules count on «Развитие» (growth-source, src/growth-sources.cjs): 40 points for each rule that is on,
// keyed by what the rule does, exactly as Petya's core keyed them before the rules moved here, so the points earned
// then stay.
const growth=require('../../growth.cjs');
const FIELDS=['accounts','allAccounts','phrases','days','unread','skipPromotions','priority','instructions'];
const content=r=>Object.fromEntries(FIELDS.map(k=>[k,Array.isArray(r[k])?[...r[k]].sort():r[k]??null]));
const learned=r=>`Когда вы просите «${r.phrases.join('», «')}», проверяю почту за ${r.days} дн.${r.unread?', только непрочитанные':''}${r.skipPromotions?', без рассылок':''}. ${r.instructions||''}`.trim();
module.exports={
 id:'mail-rules',content,learned,
 items:s=>(s.mail?.rules?.()||[]).filter(r=>r.enabled!==false).map(r=>({key:growth.key('recipes',content(r)),title:r.name,points:40,at:r.at??null,source:'Обучение работе с почтой',learned:learned(r)}))
};
