// «Поиск по всему», ranking: BM25 over everything the sources returned (title words count twice), weighted by the
// term's origin (the user's own words 1, the model's synonyms 0.6), scaled by how many of the user's words an item
// covers, and boosted by recency (up to +50% for today, half of that after a month). Snippets are the densest window
// of matches with the matched words' offsets, so the card highlights them without HTML.
const Q=require('./query.cjs');
const K1=1.2,B=0.75,DAY=86400000;

function prepare(item){
 const title=Q.tokens(item.title),body=Q.tokens(String(item.text||'').slice(0,6000));
 return {...item,_tokens:[...title,...title,...body]};
}
function rank(items,terms,{now=Date.now()}={}){
 if(!terms.length)return [];
 const docs=items.map(prepare);
 const N=docs.length||1,avg=docs.reduce((n,d)=>n+d._tokens.length,0)/N||1;
 const tf=docs.map(d=>terms.map(t=>d._tokens.filter(x=>Q.meets(x,t.stem)).length));
 const df=terms.map((_,i)=>tf.filter(row=>row[i]>0).length);
 const own=terms.filter(t=>!t.extra).length||1;
 const out=[];
 docs.forEach((d,k)=>{
  let score=0,covered=0;
  terms.forEach((t,i)=>{
   const f=tf[k][i];if(!f)return;
   if(!t.extra)covered++;
   const idf=Math.log(1+(N-df[i]+0.5)/(df[i]+0.5));
   score+=t.weight*idf*f*(K1+1)/(f+K1*(1-B+B*d._tokens.length/avg));
  });
  if(score<=0)return;
  const age=Number.isFinite(d.at)&&d.at>0?Math.max(0,(now-d.at)/DAY):365;
  const final=score*(0.4+0.6*covered/own)*(1+0.5*Math.exp(-age/30));
  const {_tokens,...item}=d;
  out.push({...item,score:Math.round(final*1000)/1000,covered});
 });
 return out.sort((a,b)=>b.score-a.score||(b.at||0)-(a.at||0));
}

// The densest ~`size`-character window of matches, cut at word boundaries, with [start, end] of each match in it.
function snippet(text,terms,{size=220}={}){
 const flat=String(text||'').replace(/\s+/g,' ').trim();
 const re=Q.pattern(terms);
 const hits=[];
 if(re)for(const m of flat.matchAll(re)){if(terms.some(t=>Q.meets(Q.stem(m[0]),t.stem)))hits.push([m.index,m.index+m[0].length]);if(hits.length>200)break;}
 if(!hits.length)return {snippet:flat.slice(0,size)+(flat.length>size?'…':''),marks:[]};
 let best=0,bestCount=0;
 for(let i=0;i<hits.length;i++){let n=0;for(let j=i;j<hits.length&&hits[j][1]-hits[i][0]<=size;j++)n++;if(n>bestCount){bestCount=n;best=i;}}
 let start=Math.max(0,hits[best][0]-Math.round(size*0.3));
 if(start>0){const space=flat.indexOf(' ',start);if(space>=0&&space<hits[best][0])start=space+1;}
 let end=Math.min(flat.length,start+size);
 if(end<flat.length){const space=flat.lastIndexOf(' ',end);if(space>hits[best][1])end=space;}
 const lead=start>0?'…':'',tail=end<flat.length?'…':'';
 const marks=hits.filter(([a,b])=>a>=start&&b<=end).map(([a,b])=>[a-start+lead.length,b-start+lead.length]);
 return {snippet:lead+flat.slice(start,end)+tail,marks};
}
module.exports={rank,snippet,K1,B};
