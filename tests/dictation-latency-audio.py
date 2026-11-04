"""Generate deterministic synthetic microphone fixtures outside the repository."""
import json,sys,wave,os
from pathlib import Path
import torch
import numpy as np
root=Path(__file__).resolve().parent.parent
output=Path(sys.argv[1]);output.mkdir(parents=True,exist_ok=True)
torch.set_num_threads(4)
model=torch.package.PackageImporter(str(root/'runtime/models/petya-voice.pt')).load_pickle('tts_models','model')
model.to('cpu')
for case in json.loads((root/'tests/dictation-latency-cases.json').read_text()):
 if os.environ.get('PETYA_AUDIO_CASES') and case['id'] not in os.environ['PETYA_AUDIO_CASES'].split(','): continue
 if (output/(case['id']+'.wav')).exists() and not os.environ.get('PETYA_AUDIO_CASES'): continue
 spoken=case['text'].replace('JavaScript','Джаваскрипт').replace('Java','Джава').replace('Jira','Джира')
 with torch.inference_mode(): audio=model.apply_tts(text=spoken,speaker='eugene',sample_rate=48000).numpy()
 # Trim silence to make file end a reproducible speech-end reference.
 indices=np.flatnonzero(np.abs(audio)>.003)
 if indices.size: audio=audio[max(0,indices[0]-480):min(len(audio),indices[-1]+480)]
 with wave.open(str(output/(case['id']+'.wav')),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(48000);f.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
 print(case['id'],round(len(audio)/48000,2),flush=True)
