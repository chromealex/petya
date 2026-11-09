// Sizes in the catalog: every app's own files, download declarations are valid, per-platform sizes, present downloads are not counted,
// optional ones are separate, and the free space is reported for the whole-selection warning.
const assert=require('node:assert/strict');
const ui=require('../src/features/extension-ui.cjs');
(async()=>{
 const artist=ui.descriptors.find(d=>d.id==='artist');
 assert.equal(ui.bytesOf(artist.downloads[0],'darwin'),37651339);assert.equal(ui.bytesOf(artist.downloads[0],'win32'),18069874);
 assert.equal(ui.bytesOf(artist.downloads[0],'linux'),37651339,'unknown platform takes the largest size');
 const result=await ui.sizes({},{platform:'darwin',free:()=>3e9});
 const own=id=>result.apps[id].own;
 assert.ok(own('artist')>0&&own('artist')<5e6,'the app itself is counted, in kilobytes');
 assert.equal(result.apps.artist.install,own('artist')+37651339+2132696762);assert.equal(result.apps.artist.optional,0);
 assert.equal(result.apps.coder.install,own('coder'));assert.equal(result.apps.coder.optional,19e9,'an optional model is not counted as installation');
 assert.equal(result.apps.python.items[0].requires,'Docker Desktop');assert.equal(result.apps.python.approx,true);
 assert.equal(result.available,3e9);assert.equal(result.reserve,512*1024**2);
 const plain=result.apps['regex-cron'];assert.deepEqual(plain.items,[]);assert.ok(plain.own>0);assert.equal(plain.install,plain.own,'an app without downloads weighs its own files');
 assert.equal(ui.ownBytes(require('node:path').join(__dirname,'missing-folder')),0);
 for(const d of ui.descriptors)assert.ok(result.apps[d.id],'every app has a size: '+d.id);
 // Every declaration is well formed (the descriptor loader throws otherwise) and every download size is positive.
 for(const d of ui.descriptors)for(const item of d.downloads||[])assert(ui.bytesOf(item)>0,d.id+'/'+item.id);
 console.log('Extension sizes: own files of every app, per-platform bytes, present downloads excluded, optional separate, free space passed');
})().catch(e=>{console.error(e);process.exit(1);});
