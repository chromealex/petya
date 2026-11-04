// Align equal paragraphs in order. Prefix/suffix trimming keeps unchanged histories inexpensive.
function chatParagraphDiff(before,after){
  let left=0,right=0;
  while(left<before.length && right<after.length && before[left]===after[right]){left++;right++;}
  const rows=before.slice(0,left).map(text=>({kind:'same',text}));
  let endA=before.length,endB=after.length;
  while(endA>left && endB>right && before[endA-1]===after[endB-1]){endA--;endB--;}
  const positions=new Map();
  for(let i=right;i<endB;i++){if(!positions.has(after[i]))positions.set(after[i],[]);positions.get(after[i]).push(i);}
  for(;left<endA;left++){
    const matches=positions.get(before[left]);
    let lo=0,hi=matches?.length||0;
    while(lo<hi){const mid=(lo+hi)>>1;if(matches[mid]<right)lo=mid+1;else hi=mid;}
    const at=matches?.[lo];
    if(at===undefined){rows.push({kind:'removed',text:before[left]});continue;}
    for(;right<at;right++)rows.push({kind:'added',text:after[right]});
    rows.push({kind:'same',text:before[left]});right++;
  }
  for(;right<endB;right++)rows.push({kind:'added',text:after[right]});
  for(;right<after.length;right++)rows.push({kind:'same',text:after[right]});
  return rows;
}
if(typeof module!=='undefined')module.exports={chatParagraphDiff};
