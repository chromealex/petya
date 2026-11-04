function fileRefs(files) {
  return files.filter(f=>f.id).map(f=>({id:f.id,name:f.name,type:'file'}));
}
// Keep only materials whose text survives the prompt's trailing character budget.
function contextExcerpt(items,limit=16000) {
  let remaining=limit;
  const parts=[],refs=[];
  for(const item of [...items].reverse()){
    if(remaining<=0)break;
    const text=(item.title+' '+item.text).slice(-remaining);
    parts.unshift(text);refs.unshift({id:item.id,name:item.title||item.source,type:'material'});
    remaining-=text.length+1;
  }
  return {context:parts.join('\n'),contextRefs:refs};
}
module.exports={fileRefs,contextExcerpt};
