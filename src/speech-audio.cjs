// Live capture emits canonical mono PCM16 WAV at 16 kHz. Keep the
// original padding; reject only digital silence and isolated impulses.
function prepareCommandAudio(bytes) {
 const input=Buffer.from(bytes);
 if(input.length<44||input.toString('ascii',0,4)!=='RIFF'||input.toString('ascii',8,12)!=='WAVE'||input.toString('ascii',12,16)!=='fmt '||input.readUInt32LE(16)!==16||input.readUInt16LE(20)!==1||input.readUInt16LE(22)!==1||input.readUInt32LE(24)!==16000||input.readUInt16LE(34)!==16||input.toString('ascii',36,40)!=='data'||input.readUInt32LE(40)!==input.length-44||(input.length-44)%2)throw Error('Некорректное аудио микрофона.');
 // SpeechGate already decided this contains speech. A second RMS/VAD gate
 // at a different frame size discarded quiet consonants and short replies.
 // Only reject digital silence and isolated sample impulses here.
 let nonzero=0;
 for(let at=44;at<input.length;at+=2)if(Math.abs(input.readInt16LE(at))>1)nonzero++;
 return nonzero>=320?input:null;
}
module.exports={prepareCommandAudio};
