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
class AudioListener {
  constructor(onText, onError, options = {}) { this.options = options; this.onText = onText; this.onError = onError; this.active = false; this.generation = 0; }
  async start(meeting = false) {
    if (this.active) return;
    this.active = true; const generation = ++this.generation;
    try {
      await window.petya.ensureSpeech();
      if (!this.active || generation !== this.generation) return;
      if (!meeting && !await window.petya.permission()) throw new Error('Нет разрешения на микрофон. Разрешите его в настройках ОС.');
      const stream = meeting ? await captureMeetingAudio() : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!this.active || generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') throw new Error('Системный звук недоступен. Проверьте разрешение записи звука ОС или импортируйте расшифровку Zoom.');
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
      this.gate = new SpeechGate(this.context.sampleRate); this.chunks = []; this.samples = 0; this.quiet = 0; this.voiced = false; this.queue = []; this.busy = false; this.started = Date.now();
      this.node.port.onmessage = event => {
        if (!this.active || generation !== this.generation) return;
        if(window.petyaSpeaking){this.gate.reset();this.chunks=[];this.samples=0;this.quiet=0;this.voiced=false;this.queue=[];this.started=Date.now();return;}
        const chunk = event.data, duration = chunk.length / this.context.sampleRate;
        const {speaking,chunks}=this.gate.feed(chunk,this.voiced);
        if (speaking) this.options.onSpeech?.(Date.now());
        if (!this.voiced && !speaking) return;
        if(!this.voiced)this.started=Date.now()-chunks.reduce((n,c)=>n+c.length,0)/this.context.sampleRate*1000;
        this.voiced = this.voiced || speaking; this.quiet = speaking ? 0 : this.quiet + duration;
        this.chunks.push(...chunks); this.samples += chunks.reduce((n,c)=>n+c.length,0);
        if (this.voiced && (this.quiet > 0.85 || this.samples / this.context.sampleRate >= 15)) {
          if (this.queue.length >= 3) { this.stop(); this.onError(new Error('Распознавание не успевает за аудио. Выберите более быструю модель whisper и включите запись снова.')); return; }
          this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now() });
          this.chunks = []; this.samples = 0; this.quiet = 0; this.voiced = false; this.started = Date.now(); this.drain(generation);
        }
      };
    } catch (error) { this.stop(); throw error; }
  }
  async drain(generation) {
    if (this.busy) return; this.busy = true;
    try { while (this.active && generation === this.generation && this.queue.length) { const item = this.queue.shift(); const result = await window.petya.transcribe(item.wav); if (this.active && generation === this.generation) {if(result)await this.onText(result,item.at,item.endedAt);else this.options.onUnrecognized?.();} } }
    catch (error) { if (this.active && generation === this.generation) { this.stop(); this.onError(error); } }
    finally { if (generation === this.generation) this.busy = false; }
  }
  async flushContext() {
    if (!this.active || !this.queue) return;
    const generation = this.generation;
    if (this.voiced && this.chunks?.length) {
      this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now() });
      this.chunks = []; this.samples = 0; this.quiet = 0; this.voiced = false; this.started = Date.now();
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
      if (this.node) this.node.port.onmessage = null;
      if (this.stream) this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
      if (this.voiced && this.chunks?.length) this.queue.push({ wav: toWav(this.chunks, this.context.sampleRate), at: this.started, endedAt: Date.now() });
      this.chunks = []; this.voiced = false;
      await this.drain(generation);
      while (this.busy && generation === this.generation) await new Promise(resolve => setTimeout(resolve, 50));
      if (generation === this.generation) this.stop();
    })();
    try { await this.finishing; } finally { this.finishing = null; }
  }
  stop() {
    this.active = false; ++this.generation; this.options.onStop?.();
    if (this.stream) this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); }
    if (this.source) this.source.disconnect();
    if (this.context && this.context.state !== 'closed') this.context.close();
    this.queue = []; this.chunks = []; this.stream = null;
  }
}
