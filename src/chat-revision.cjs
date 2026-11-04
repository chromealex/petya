const {createHash} = require('node:crypto');
function revision(ctx, owner) {
  const {state}=ctx.dialogue;
  const topic=state.topics.find(t=>t.id===owner);
  const files=[...ctx.attachments.pending.values()].filter(f=>f.owner===owner).map(f=>f.id);
  const data=[state.composerDrafts?.[owner]||'',files,topic?.versionIndex||0,topic?.versions?.length||1];
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
module.exports={revision};
