// An empty device ID follows the OS default; a specific device is an explicit override.
const microphonePreference = {
 get() { try { return localStorage.getItem('petya.microphone.selected') || ''; } catch { return ''; } },
 save(id) { try { localStorage.setItem('petya.microphone.selected', id); } catch {} }
};
const microphoneSelect=document.getElementById('microphone-select');
let microphoneDevices=[],microphoneDeviceId=microphonePreference.get();
function selectedMicrophone(){return {id:microphoneDeviceId,label:microphoneSelect.selectedOptions[0]?.textContent||'Системный микрофон'};}
function renderMicrophoneChoices(){
 const options=[new Option('Системный микрофон (по умолчанию)','')];
 const system=microphoneDevices.find(device=>device.deviceId==='default');
 if(system?.label)options[0].textContent='По умолчанию: '+system.label.replace(/^(default|по умолчанию)\s*[-—:]\s*/i,'');
 for(const device of microphoneDevices.filter(device=>device.deviceId&& !['default','communications'].includes(device.deviceId))){
  options.push(new Option(device.label||'Микрофон '+options.length,device.deviceId));
 }
 if(microphoneDeviceId&&!options.some(option=>option.value===microphoneDeviceId)){
  options.push(new Option('Выбранный микрофон недоступен',microphoneDeviceId));
 }
 microphoneSelect.replaceChildren(...options);microphoneSelect.value=microphoneDeviceId;
 document.getElementById('mic-device-name').textContent=selectedMicrophone().label;
 document.getElementById('mic').title=selectedMicrophone().label;
}
async function refreshMicrophones(){
 microphoneDevices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput');
 renderMicrophoneChoices();
}
microphoneSelect.onchange=()=>{
 microphoneDeviceId=microphoneSelect.value;microphonePreference.save(microphoneDeviceId);renderMicrophoneChoices();
 document.dispatchEvent(new Event('petya-microphone-changed'));
};
renderMicrophoneChoices();
navigator.mediaDevices?.addEventListener('devicechange',()=>refreshMicrophones().catch(()=>{}));
refreshMicrophones().catch(()=>{});
