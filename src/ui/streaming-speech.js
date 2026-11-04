(function(root){
 function boundary(text){
  // Wait for a following separator: a dot may still become a decimal or abbreviation.
  if(text.includes('```'))return 0;
  const re=/[.!?…](?:[»”"')\]]*)\s+/gu;let m;
  while((m=re.exec(text))){const prefix=text.slice(0,m.index+1);if(/(?:\b\d+|[А-ЯA-Z]|\b(?:Mr|Dr)|т\.д|т\.п|т\.е|г|ул|им)\.$/u.test(prefix))continue;return re.lastIndex;}
  return 0;
 }
 class StreamingSpeech{
  constructor({speak,cancel,onIdle=()=>{},onError=()=>{},timer=setTimeout,clear=clearTimeout}){Object.assign(this,{speak,cancel,onIdle,onError,timer,clear});this.epoch=0;this.stopped=true;}
  start(){this.stop();this.stopped=false;this.text='';this.offset=0;this.queue=[];this.running=false;this.complete=false;this.generating=true;this.fillerUsed=false;this.spoken=false;}
  clearWait(){if(this.wait){this.clear(this.wait);this.wait=null;}}
  stop(){this.epoch++;this.stopped=true;this.clearWait();this.queue=[];this.cancel();}
  feed(text){text=text.trimStart();if(this.stopped)return;if(!text.startsWith(this.text)){this.stop();return;}this.text=text;let size;while((size=boundary(this.text.slice(this.offset)))){this.queue.push(this.text.slice(this.offset,this.offset+size));this.offset+=size;}if(this.queue.length)this.clearWait();this.pump();}
  generationEnded(){this.generating=false;this.clearWait();}
  finish(text){if(this.stopped)return;this.generationEnded();if(this.text.trimEnd()===text.trim())text=this.text;this.feed(text);if(this.stopped)return;const tail=this.text.slice(this.offset);if(tail.trim())this.queue.push(tail);this.offset=this.text.length;this.complete=true;this.pump();}
  async pump(){if(this.running||this.stopped)return;const epoch=this.epoch;this.running=true;
   try{while(this.queue.length&&!this.stopped){const next=this.queue.shift();this.spoken=true;await this.speak(next);if(epoch!==this.epoch)return;}}
   catch(error){if(epoch===this.epoch){this.stop();this.onError(error);}return;}
   finally{if(epoch===this.epoch)this.running=false;}
   if(epoch!==this.epoch||this.stopped)return;
   if(this.complete){this.stopped=true;this.onIdle();return;}
   if(this.spoken&&this.generating&&!this.fillerUsed&&!this.wait)this.wait=this.timer(()=>{this.wait=null;if(this.stopped||this.running||this.queue.length||!this.generating)return;this.fillerUsed=true;this.queue.push('Дай подумаю.');this.pump();},2500);
  }
 }
 if(typeof module==='object'&&module.exports)module.exports={StreamingSpeech,boundary};else root.StreamingSpeech=StreamingSpeech;
})(typeof window==='object'?window:globalThis);
