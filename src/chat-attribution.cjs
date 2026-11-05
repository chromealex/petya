function fileRefs(files,answer='') {
  const refs=files.filter(f=>f.id).map(f=>({id:f.id,name:f.name,type:'file'}));
  const appendix=answer.split('\n\nИсходные строки (дословно):\n').at(1);
  if(!appendix)return refs;
  const rows=appendix.split('\n');
  for(let i=0;i<rows.length-1;i++){
    const match=/^(.+):(\d+)$/.exec(rows[i]);
    if(!match)continue;
    const candidates=files.filter(f=>f.name===match[1]);
    if(candidates.length!==1)continue;
    const file=candidates[0],line=Number(match[2]),ref=refs.find(r=>r.id===file.id);
    if(!ref||file.text?.split('\n')[line-1]?.slice(0,1500)!==rows[i+1])continue;
    (ref.lines||=[]).push(line);
    i++;
  }
  return refs;
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
