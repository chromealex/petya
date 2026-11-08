function meetingCaptureError(error) {
  if (/invalid capture constraints/i.test(error.message || '') || error.name === 'OverconstrainedError') {
    return new Error('Не удалось настроить захват системного звука. Полностью закройте Петю и откройте снова, затем выберите источник в системном диалоге. Это ошибка захвата, а не подтверждение отказа в разрешении.');
  }
  if (error.name === 'NotAllowedError') {
    return new Error('Захват не разрешён или выбор источника отменён. Повторите подключение; при необходимости разрешите Пете запись экрана и системного звука в настройках ОС.');
  }
  return error;
}

let meetingCapturePending = false;
async function captureMeetingAudio() {
  if (meetingCapturePending) throw new Error('Предыдущий запрос захвата ещё обрабатывается системой. Если окно выбора не появилось, полностью завершите Петю и откройте снова.');
  let stream, timer, expired = false;
  meetingCapturePending = true;
  try {
    const request = navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const pending = request.then(result => {
      if (expired) { result.getTracks().forEach(track => track.stop()); return; }
      return result;
    }).finally(() => { meetingCapturePending = false; });
    stream = await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error('Система не запустила захват за 20 секунд. Полностью завершите Петю и откройте снова.'));
      }, 20000);
    })]);
    if (!stream.getAudioTracks().some(track => track.readyState === 'live')) {
      const help = window.petyaPlatform === 'darwin'
        ? 'Откройте Системные настройки → Конфиденциальность и безопасность → Запись экрана и системного звука, разрешите доступ Пете, затем полностью завершите приложение и откройте снова.'
        : 'Повторите выбор источника и включите передачу системного звука, если такой переключатель доступен.';
      throw new Error('Источник открыт, но работающая аудиодорожка не получена. ' + help);
    }
    return stream;
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (!timer) meetingCapturePending = false;
    throw meetingCaptureError(error);
  } finally { clearTimeout(timer); }
}

// PCM is downsampled to mono 16 kHz WAV; whisper.cpp does not need ffmpeg.
function toWav(chunks, sampleRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0), pcm = new Float32Array(length);
  let offset = 0; for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
  const count = Math.floor(length * 16000 / sampleRate), buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  function label(at, value) { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); }
  label(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); label(8, 'WAVE'); label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) { const start = Math.floor(i * sampleRate / 16000), end = Math.min(length, Math.floor((i + 1) * sampleRate / 16000)); let sum = 0; for (let j = start; j < end; j++) sum += pcm[j]; const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))); view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true); }
  return buffer;
}
// Keep quiet consonants before the first loud syllable instead of one worklet frame.
class SpeechGate {
  constructor(sampleRate){this.sampleRate=sampleRate;this.reset();}
  reset(){this.noise=0.0005;this.pre=[];this.count=0;}
  feed(chunk,voiced){
    let energy=0;for(const sample of chunk)energy+=sample*sample;
    const rms=Math.sqrt(energy/Math.max(1,chunk.length));
    const threshold=Math.max(0.0015,Math.min(0.006,this.noise*3));
    const speaking=rms>threshold;
    if(!voiced&&!speaking)this.noise=this.noise*0.95+rms*0.05;
    if(voiced)return {speaking,chunks:[chunk]};
    this.pre.push(chunk);this.count+=chunk.length;
    // Retain at least 350 ms of the onset, including the current frame.
    while(this.pre.length>1&&this.count-this.pre[0].length>=this.sampleRate*0.35)this.count-=this.pre.shift().length;
    if(!speaking)return {speaking,chunks:[]};
    const chunks=this.pre;this.pre=[];this.count=0;return {speaking,chunks};
  }
}
function audioTail(chunks, samples) {
  const tail = [];
  for (let i = chunks.length - 1; i >= 0 && samples > 0; i--) {
    const part = chunks[i].slice(-samples); tail.unshift(part); samples -= part.length;
  }
  return tail;
}
function stitchSpeech(previous, current) {
  const before = previous.trim().split(/\s+/), after = current.trim().split(/\s+/);
  const normal = word => word.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu, '');
  for (let n = Math.min(8, before.length, after.length); n >= 1; n--) {
    if (before.slice(-n).every((word,i) => normal(word) && normal(word) === normal(after[i]))) return after.slice(n).join(' ');
  }
  return current;
}
class AudioListener {
  constructor(onText, onError, options = {}) { this.options = options; this.onText = onText; this.onError = onError; this.active = false; this.generation = 0; this.inFlight = 0; this.captureEpoch = 0; this.previousText = ''; this.concurrency = 2; }
  async start(meeting = false, deviceId = '') {
    if (this.active) return;
    this.active = true; const generation = ++this.generation;
    try {
      const speech = this.options.recordSegment ? {concurrency:1} : await window.petya.ensureSpeech();this.engine=speech?.engine||'Whisper';
      this.concurrency = Math.max(1, Math.min(4, Number(speech?.concurrency) || 2));
      if (!this.active || generation !== this.generation) return;
      if (!meeting && !await window.petya.permission()) throw new Error('Нет разрешения на микрофон. Разрешите его в настройках ОС.');
      const stream = meeting ? await captureMeetingAudio() : await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? {deviceId:{exact:deviceId}} : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!this.active || generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('Системный звук недоступен. Проверьте разрешение записи звука ОС или добавьте расшифровку встречи текстом.');
      // Video frames are never read or stored; track remains alive for the display session.
      track.onended = () => { this.stop(); this.onError(new Error('Захват звука остановлен системой.')); };
      this.context = new AudioContext(); await this.context.audioWorklet.addModule('pcm-worklet.js');
      if (!this.active || generation !== this.generation) return;
      await this.context.resume();
      if (!this.active || generation !== this.generation) return;
      this.source = this.context.createMediaStreamSource(new MediaStream([track]));
      this.node = new AudioWorkletNode(this.context, 'pcm-capture');
      this.silence = this.context.createGain(); this.silence.gain.value = 0;
      this.source.connect(this.node); this.node.connect(this.silence); this.silence.connect(this.context.destination);
      this.gate = new SpeechGate(this.context.sampleRate); this.chunks = []; this.samples = 0; this.quiet = 0; this.voiced = false; this.queue = []; this.busy = false; this.inFlight = 0; this.previousText = ''; this.overlap = false; this.captureEpoch = 0; this.started = Date.now();
      this.lastFrameAt=Date.now();
      this.captureWatch=setInterval(()=>{
        if(!this.active||generation!==this.generation)return;
        if(['suspended','interrupted'].includes(this.context.state)&&!this.resuming){
          this.resuming=true;
          this.context.resume().catch(error=>{if(this.active){this.stop();this.onError(error);}}).finally(()=>{this.resuming=false;});
        }
        if(Date.now()-this.lastFrameAt>6000){this.stop();this.onError(new Error('Микрофон перестал передавать звук. Выбери микрофон заново или выключи и включи его.'));}
      },1000);
      this.node.port.onmessage = event => {
        if (!this.active || generation !== this.generation) return;
        this.lastFrameAt=Date.now();
        if(this.options.onLevel){let energy=0;for(const sample of event.data)energy+=sample*sample;this.options.onLevel(Math.sqrt(energy/Math.max(1,event.data.length)));}
        if(window.petyaSpeaking&&!this.options.recordSegment){this.options.onState?.('Петя говорит — микрофон временно не распознаёт');this.gate.reset();this.chunks=[];this.samples=0;this.quiet=0;this.voiced=false;this.queue=[];this.previousText='';this.overlap=false;++this.captureEpoch;this.started=Date.now();return;}
        const chunk = event.data, duration = chunk.length / this.context.sampleRate;
        const {speaking,chunks}=this.gate.feed(chunk,this.voiced);
        if (speaking) { this.lastSpeechAt=Date.now(); this.options.onSpeech?.(this.lastSpeechAt);this.options.onState?.('Слышу речь'); }
        else if(!this.voiced&&!this.busy)this.options.onState?.('Слушаю микрофон');
        if (!this.voiced && !speaking) return;
        if(!this.voiced){this.started=Date.now()-chunks.reduce((n,c)=>n+c.length,0)/this.context.sampleRate*1000;this.direct=!!this.options.allowDirect?.();}
        this.voiced = this.voiced || speaking; this.quiet = speaking ? 0 : this.quiet + duration;
        this.chunks.push(...chunks); this.samples += chunks.reduce((n,c)=>n+c.length,0);
        if (this.voiced && (this.quiet > 0.65 || this.samples / this.context.sampleRate >= (this.options.segmentSeconds || 8))) {
          if (this.queue.length + this.inFlight >= 8) { this.stop(); this.onError(new Error('Распознавание не успевает за аудио. Выберите более быструю модель whisper и включите запись снова.')); return; }
          this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now(), overlap: this.overlap, direct: this.direct });
          // Prefer a pause; retain 400 ms when continuous speech forces a cut.
          const tail = this.quiet < 0.18 ? audioTail(this.chunks, Math.ceil(this.context.sampleRate * 0.4)) : [];
          this.chunks = tail; this.samples = tail.reduce((n,c)=>n+c.length,0); this.quiet = 0; this.voiced = tail.length > 0; this.overlap = this.voiced;
          this.started = Date.now() - this.samples / this.context.sampleRate * 1000; this.drain(generation);
        }
      };
    } catch (error) { this.stop(); throw error; }
  }
  async drain(generation) {
    if (this.busy) { this.pump?.(); return; } this.busy = true;
    const pending = [];
    const fill = () => {
      while (this.active && generation === this.generation && this.inFlight < this.concurrency && this.queue.length) {
        const item = this.queue.shift(), epoch = this.captureEpoch;
        this.options.onState?.('Распознаю речь');
        // Attach a rejection handler immediately, including to the second request.
        const promise = new Promise(resolve => resolve(this.options.recordSegment ? this.options.recordSegment(item) : window.petya.transcribe(item.wav))).then(result => ({result}), error => ({error}));
        pending.push({ item, epoch, promise }); this.inFlight++;
      }
    };
    this.pump = fill;
    try {
      fill();
      while (pending.length) {
        const {item, epoch, promise} = pending.shift();
        const {result, error} = await promise;
        if (!this.active || generation !== this.generation) return;
        this.inFlight--;
        if (epoch === this.captureEpoch) {
          if (error) throw error;
          const text = item.overlap ? stitchSpeech(this.previousText, result || '') : result;
          if (result) this.previousText = result;
          if (text) {this.options.onState?.('Текст распознан');await this.onText(text, item.at, item.endedAt, item.direct);}
          else if (result === '') this.options.onUnrecognized?.();
        }
        fill();
      }
    }
    catch (error) { if (this.active && generation === this.generation) { this.stop(); this.onError(error); } }
    finally { if (generation === this.generation) { this.busy = false; this.pump = null; } }
  }
  async flushContext() {
    if (!this.active || !this.queue) return;
    const generation = this.generation;
    if (this.voiced && this.chunks?.length) {
      this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now(), overlap: this.overlap, direct: this.direct });
      this.chunks = []; this.samples = 0; this.quiet = 0; this.voiced = false; this.overlap = false; this.started = Date.now();
    }
    const deadline = Date.now() + 30000;
    this.drain(generation);
    while (this.busy && generation === this.generation) {
      if (Date.now() > deadline) throw new Error('Расшифровка ещё обрабатывает разговор. Повторите команду через несколько секунд.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!this.active || generation !== this.generation) throw new Error('Расшифровка встречи прервалась. Проверьте состояние записи перед повтором команды.');
  }
  async finish() {
    if (this.finishing) return this.finishing;
    if (!this.active) return;
    const generation = this.generation;
    this.finishing = (async () => {
      if(this.captureWatch){clearInterval(this.captureWatch);this.captureWatch=null;}
      if (this.node) this.node.port.onmessage = null;
      if (this.stream) this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
      if (this.voiced && this.chunks?.length) this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now(), overlap: this.overlap, direct: this.direct });
      this.chunks = []; this.voiced = false;
      await this.drain(generation);
      while (this.busy && generation === this.generation) await new Promise(resolve => setTimeout(resolve, 50));
      if (generation === this.generation) this.stop();
    })();
    try { await this.finishing; } finally { this.finishing = null; }
  }
  stop() {
    if(this.captureWatch){clearInterval(this.captureWatch);this.captureWatch=null;}
    this.active = false; ++this.generation; this.options.onStop?.();
    if (this.stream) this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    if (this.source) this.source.disconnect();
    if (this.context && this.context.state !== 'closed') this.context.close();
    this.queue = []; this.chunks = []; this.stream = null; this.inFlight = 0; this.busy = false;
  }
}
