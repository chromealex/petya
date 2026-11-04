async function mapLimit(items,limit,work){const results=new Array(items.length);let next=0,failed;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(!failed){const index=next++;if(index>=items.length)return;try{results[index]=await work(items[index],index);}catch(error){failed=error;}}}));if(failed)throw failed;return results;}
module.exports={mapLimit};
