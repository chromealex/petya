// «Разбор плейтеста», player window: plays the recording from the requested second. The main process calls
// window.playAt(url, seconds) again to jump when another moment is opened.
(()=>{
 const video=document.getElementById('video'),note=document.getElementById('note');
 window.playAt=async(url,at)=>{
  note.hidden=true;
  if(video.dataset.src!==url){
   video.dataset.src=url;video.src=url;
   await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('Видео не открывается в плеере Пети.')),{once:true});});
  }
  video.currentTime=Math.max(0,Math.min(Number(at)||0,(video.duration||0)-0.1));
  try{await video.play();}catch{/* autoplay may wait for a click */}
  return true;
 };
 video.addEventListener('error',()=>{note.textContent='Видео не открывается в плеере Пети — откройте его в системном плеере.';note.hidden=false;});
})();
