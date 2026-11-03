// Speech activity, not transcription arrival, defines the end of a spoken turn.
class VoiceTurn {
  static isNewQuestion(text) { return /[?？]\s*$/.test(text) || /^(?:а\s+)?(?:что|почему|зачем|как|сколько|посмотри|проверь|объясни|верн[её]мся|новая тема|не создавай)(?=$|[\s,.!?])/iu.test(text); }
  constructor({ dispatch, pending = () => false, status = () => {}, now = Date.now, schedule = (fn, delay) => setTimeout(fn, delay), cancel = id => clearTimeout(id) }) {
    Object.assign(this, { dispatch, pending, status, now, schedule, cancel });
    this.reset();
  }
  reset() { if (this.timer) this.cancel(this.timer); this.timer = null; this.active = false; this.parts = []; this.lastSpeech = 0; this.at = 0; this.deadline = 0; }
  arm() { this.reset(); this.active = true; this.deadline = this.now() + 12000; this.wait(); }
  activity(at = this.now()) { this.lastSpeech = at; if (this.active) { this.deadline = at + 12000; this.wait(); } }
  wait(delay = 1800) { if (this.timer) this.cancel(this.timer); this.timer = this.schedule(() => this.check(), delay); }
  feed(speech, at, endedAt) {
    const value = speech.trim();
    const match = /(?:^|[\s,.!?])петя(?=$|[\s,:.!?—-])[\s,:.!?—-]*(.*)$/iu.exec(value);
    const preceding = match ? value.slice(0, match.index).trim() : '';
    if (match && !this.active) { const activity = this.lastSpeech; this.arm(); this.lastSpeech = activity; this.at = at; }
    if (!this.active) return { consumed: false };
    const part = match ? ((this.parts.length && preceding ? preceding+' ' : '')+match[1]).trim() : value;
    if (/^(?:отмена|отмени|стоп|не надо)[.!?\s]*$/iu.test(part)) { this.reset(); this.status('Отменено'); return { consumed: true, preceding, cancelled: true }; }
    if (part) { if (!this.at) this.at = at; this.parts.push(part); }
    // A delayed Whisper response must not erase newer microphone activity.
    this.lastSpeech = Math.max(this.lastSpeech, endedAt || at || this.now());
    this.deadline = this.now() + 12000;
    this.status(this.parts.length ? 'Дослушиваю команду…' : 'Слушаю команду…');
    this.wait(Math.max(100, this.lastSpeech + 1800 - this.now()));
    return { consumed: true, preceding };
  }
  check() {
    this.timer = null;
    if (!this.active) return;
    if (this.pending()) { this.wait(100); return; }
    const text = this.parts.join(' ').trim();
    if (!text) { if (this.now() >= this.deadline) { this.reset(); this.status('Команда не прозвучала. Скажите «Петя», когда будете готовы.'); } else this.wait(200); return; }
    if (this.now() - this.lastSpeech < 1800) { this.wait(this.lastSpeech + 1800 - this.now()); return; }
    if (/(?:^|\s)(?:и|или|но|чтобы|для|по|с|в|к|на|из|про|если|потому что)[,.!?\s]*$/iu.test(text)) {
      if (this.now() >= this.deadline) { this.reset(); this.status('Фраза не закончена. Повторите команду целиком.'); }
      else { this.status('Продолжите фразу, я слушаю…'); this.wait(500); }
      return;
    }
    const at = this.at; this.reset();
    Promise.resolve().then(() => this.dispatch(text, at)).catch(error => this.status(error.message, true));
  }
}
if (typeof module !== 'undefined') module.exports = { VoiceTurn };
