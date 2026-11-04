"""Generate comparison samples without changing the active voice selection."""
import os,sys,json,time,wave
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.chdir(Path(__file__).resolve().parent.parent)
sys.path.insert(0,'src')
from voice_numbers import spoken_numbers
import numpy as np
import mlx.core as mx
from mlx_audio.tts.utils import load_model
start=time.monotonic();model=load_model('runtime/models/qwen-tts-base');print('loaded',time.monotonic()-start,flush=True)
cases=json.loads(Path('docs/voice-quality/cases.json').read_text());rows=[]
for name,text in cases.items():
 mx.random.seed(42)
 normalized=spoken_numbers(text,'en' if name=='en' else 'ru');start=time.monotonic()
 results=list(model.generate(text=normalized,ref_audio='docs/voice-comparison/eugene.wav',ref_text='Привет, я здесь. С какого проекта начнём?',lang_code='auto',max_tokens=600,temperature=.6,verbose=False))
 audio=np.concatenate([np.array(r.audio) for r in results]);rate=results[0].sample_rate
 with wave.open('docs/voice-quality/unified-'+name+'.wav','wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
 row={'case':name,'spoken_text':normalized,'synthesis_seconds':round(time.monotonic()-start,2),'audio_seconds':round(len(audio)/rate,2)};rows.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
Path('docs/voice-quality/unified-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
