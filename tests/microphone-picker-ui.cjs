module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  const original={start:mic.start,stop:mic.stop,refresh:refreshMicrophones,id:microphoneDeviceId,devices:microphoneDevices};
  const starts=[];
  try{
   mic.start=async(meeting,id)=>{starts.push(id);mic.active=true;};
   mic.stop=()=>{mic.active=false;};
   refreshMicrophones=async()=>{};
   microphoneDevices=[{kind:'audioinput',deviceId:'usb-test',label:'USB microphone'}];
   microphoneDeviceId='';renderMicrophoneChoices();
   await toggleMic();
   if(starts[0]!==''||document.querySelector('dialog.microphone-picker'))throw Error('Default microphone must start directly');
   microphoneSelect.value='usb-test';microphoneSelect.dispatchEvent(new Event('change'));
   for(let i=0;i<50&&micStarting;i++)await new Promise(r=>setTimeout(r,10));
   if(starts.at(-1)!=='usb-test'||!mic.active||!$('mic-device-name').textContent.includes('USB microphone'))throw Error('Live microphone switch failed');
   await toggleMic();
   if(mic.active)throw Error('Microphone stop failed');
  }finally{
   mic.active=false;mic.start=original.start;mic.stop=original.stop;refreshMicrophones=original.refresh;
   microphoneDeviceId=original.id;microphoneDevices=original.devices;microphonePreference.save(original.id);updateAudio();
  }
 })()`);
};
