// Maintainer helper (not loaded by Petya): downloads each pinned ffmpeg archive of ffmpeg-install.cjs and prints
// its exact size and SHA-256, to paste into SOURCES and into extension.json "downloads". Run from a machine that
// can reach the build hosts: `node src/extensions/converter/pin-ffmpeg.cjs`.
const {createHash}=require('node:crypto');
const {SOURCES}=require('./ffmpeg-install.cjs');
(async()=>{
 for(const [platform,items] of Object.entries(SOURCES))for(const item of items){
  const response=await fetch(item.url,{redirect:'follow'});
  if(!response.ok){console.log(platform,item.url,'HTTP',response.status);continue;}
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of response.body){hash.update(chunk);bytes+=chunk.length;}
  const sha=hash.digest('hex');
  console.log(platform,item.url,'\n  bytes:',bytes,' sha256:',sha,item.sha256&&item.sha256!==sha?' <- DIFFERS from the pinned value':'');
 }
})().catch(e=>{console.error(e);process.exit(1);});
