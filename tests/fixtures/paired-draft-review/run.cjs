const fs = require('node:fs');
const {composeDraft, structured, extract, revise} = require('../draft-coverage/run.cjs');
const {training, fresh} = require('./data.json');
const old = [...require('../decision-drafts/cases.json'), ...require('../draft-coverage/fresh.json')];
const regressions = require('../draft-coverage/results.json').filter(row => !row.reviewedComplete);
const examples = training.flatMap(({topic,fixed,proposal,variants}) => variants.flatMap(([ending,description,questions]) => [
  {role:'user', content:JSON.stringify({note:[fixed,proposal,ending].join(' ')})},
  {role:'assistant', content:JSON.stringify({summary:topic,description,questions})}
]));
async function run(output) {
  const fd=fs.openSync(output,'wx');
  try {
    const cases=fresh.flatMap(c=>c.variants.map(([state,end])=>({
      id:c.id,state,title:c.title,note:[c.fixed,c.proposal,end].join(' '),group:'fresh'
    })));
    for (const r of regressions) {
      const c=old.find(c=>c.id===r.id);
      cases.push({id:c.id,state:r.state,title:c.title,note:c.common+' '+c[r.state],group:'regression'});
    }
    for (const [i,c] of cases.entries()) {
      const context={id:c.id,title:c.title,at:Date.UTC(2026,0,1),source:'Заметка',text:c.note};
      try { c.draft=await composeDraft('Составь одну задачу Jira по итогам обсуждения.',context); }
      catch (error) { c.draft=null;c.draftError=error.message; }
      c.checklist=await structured(extract,{title:c.title,note:c.note});
      for (const mode of i%2 ? ['paired','baseline'] : ['baseline','paired']) {
        c[mode]=await structured(revise,{note:c.note,checklist:c.checklist,draft:c.draft},mode==='paired'?examples:[]);
      }
      fs.writeSync(fd,JSON.stringify(c)+'\n');
    }
  } finally { fs.closeSync(fd); }
}
run(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
