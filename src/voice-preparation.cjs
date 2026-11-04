// One speculative classifier at a time; only the newest exact transcript can be reused.
class VoicePreparation {
 constructor(prepare){this.prepare=prepare;this.epoch=0;this.busy=false;this.queued=null;this.current=null;}
 update(text,key){if(this.current?.text===text&&this.current.key===key)return;this.current=null;this.queued={text,key,epoch:++this.epoch};this.drain();}
 async drain(){if(this.busy)return;this.busy=true;try{while(this.queued){const item=this.queued;this.queued=null;try{const prepared=this.prepare(item.text);if(prepared)await prepared.result;if(item.epoch===this.epoch)this.current={...item,prepared};}catch{}}}finally{this.busy=false;}}
 take(text,key){const item=this.current;this.clear();return item?.text===text&&item.key===key?item.prepared:undefined;}
 clear(){++this.epoch;this.queued=null;this.current=null;}
}
module.exports={VoicePreparation};
