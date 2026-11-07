// Voice: language packs, speech synthesis and transcription IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  ctx.handle('voiceLanguageStatus',()=>ctx.languagePacks.statuses());
  ctx.handle('voiceLanguages',()=>({languages:ctx.languagePacks.list(),selected:ctx.settings.communicationLanguage}));
  ctx.handle('voiceLanguageInstall',async code=>{await ctx.languagePacks.install(code);ctx.localVoice.stop();return {languages:ctx.languagePacks.list(),selected:ctx.settings.communicationLanguage};});
  ctx.handle('voiceLanguageCheck',value=>ctx.languagePacks.check(require('./spoken-text.cjs').spokenText(value),ctx.settings.communicationLanguage));
  ctx.handle('synthesizeVoice', async value => {const check=await ctx.languagePacks.check(require('./spoken-text.cjs').spokenText(value),ctx.settings.communicationLanguage);if(check.missing.length)return {languageRequired:check.missing};return ctx.localVoice.speak(value,ctx.settings.communicationLanguage);});
  ctx.handle('stopVoice', () => ctx.localVoice.stop());
  ctx.handle('ensureSpeech', () => ctx.qwenSpeech.available?ctx.qwenSpeech.ensure():ctx.speech.ensure(ctx.settings));
  ctx.handle('transcribe', bytes => module.exports.transcribe(ctx, bytes));
};
module.exports.transcribe = async (ctx, bytes) => {
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 44 || bytes.byteLength > 4e6) throw new Error('Некорректное аудио.');
    const audio=require('./speech-audio.cjs').prepareCommandAudio(bytes);if(!audio)return null;
    if(ctx.qwenSpeech.available)return require('./speech-transcript.cjs').transcriptResult(await ctx.qwenSpeech.transcribe(audio,/^[a-z]{2}$/.test(ctx.settings.communicationLanguage||'')?ctx.settings.communicationLanguage:'ru'));
    const form = new FormData(); form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav'); form.append('language', 'ru'); form.append('response_format', 'json'); form.append('temperature', '0'); form.append('temperature_inc', '0'); form.append('suppress_non_speech', 'true');
    const endpoint = ctx.core.localEndpoint(ctx.settings.whisperUrl);
    try {
      const result = await ctx.speech.run({ ...ctx.settings }, target => ctx.request(ctx.core.localEndpoint(target), { method: 'POST', body: form }));
      if (typeof result?.text !== 'string') throw new Error('Сервер вернул неверный ответ распознавания. Проверьте адрес whisper.cpp.');
      return require('./speech-transcript.cjs').transcriptResult(result.text);
    } catch (error) { throw ctx.speechError(error, endpoint); }
};
