// Download sizes in the catalog: declarations are valid, per-platform sizes, present downloads are not counted,
// optional ones are separate, and the free space is reported for the whole-selection warning.
const assert=require('node:assert/strict');
const ui=require('../src/features/extension-ui.cjs');
(async()=>{
 const artist=ui.descriptors.find(d=>d.id==='artist');
 assert.equal(ui.bytesOf(artist.downloads[0],'darwin'),37651339);assert.equal(ui.bytesOf(artist.downloads[0],'win32'),18069874);
 assert.equal(ui.bytesOf(artist.downloads[0],'linux'),37651339,'unknown platform takes the largest size');
 const result=await ui.sizes({},{platform:'darwin',free:()=>3e9});
 assert.equal(result.apps.artist.install,37651339+2132696762);assert.equal(result.apps.artist.optional,0);
 assert.equal(result.apps.coder.install,0);assert.equal(result.apps.coder.optional,19e9,'an optional model is not counted as installation');
 assert.equal(result.apps.python.items[0].requires,'Docker Desktop');assert.equal(result.apps.python.approx,true);
 assert.equal(result.available,3e9);assert.equal(result.reserve,512*1024**2);
 assert.equal(result.apps['regex-cron'],undefined,'apps without downloads have no entry');
 // Every declaration is well formed (the descriptor loader throws otherwise) and every download size is positive.
 for(const d of ui.descriptors)for(const item of d.downloads||[])assert(ui.bytesOf(item)>0,d.id+'/'+item.id);
 console.log('Extension sizes: per-platform bytes, present downloads excluded, optional separate, free space passed');
})().catch(e=>{console.error(e);process.exit(1);});
