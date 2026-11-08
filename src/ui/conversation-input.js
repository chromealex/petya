// A self-contained presence check must not resume an old clarification or tool.
class ConversationInput {
 static isProjectCatalogQuestion(raw){
 const text=String(raw).trim().replace(/^(?:петя|petya|petia|petja)(?=$|[\s,:.!?—-])[\s,:.!?—-]*/iu,'').replace(/^(?:а|и)\s+/iu,'').replace(/[.!?？]+$/u,'').trim();
 if (/^(?:(?:ещ[её] раз|снова)\s+)?(?:(?:прочитай|повтори|назови|перечисли|озвучь)\s+(?:мне\s+)?(?:названия\s+проектов|проекты)|названия\s+проектов\s+(?:прочитай|повтори|назови|перечисли|озвучь))$/iu.test(text)) return true;
 return /^(?:какие\s+(?:(?:у тебя|у нас)\s+)?проекты(?:\s+(?:у тебя|у нас))?(?:\s+(?:есть|сохранены|доступны|подключены|ты знаешь))?|какие\s+проекты\s+(?:ты\s+)?(?:знаешь|помнишь)|(?:покажи|перечисли|назови)\s+(?:мне\s+)?(?:(?:все|известные|сохранённые|сохраненные|доступные|подключённые|подключенные)\s+)?(?:список\s+)?проект(?:ы|ов)|список\s+проектов)$/iu.test(text);
}
  static presenceReply(text) {
    const value = String(text).trim().replace(/^(?:петя|petya|petia|petja)(?=$|[\s,:.!?—-])[\s,:.!?—-]*/iu, '').replace(/[.!?？]+$/u, '').trim();
    if (!/^(?:(?:ты\s+)?(?:тут|здесь|на связи)|ты\s+меня\s+слышишь|слышишь\s+меня)$/iu.test(value)) return null;
    return { handled: true, presence: true, text: 'Да, я здесь. Чем помочь?', messages: [
      { role: 'user', text: String(text).trim() },
      { role: 'assistant', text: 'Да, я здесь. Чем помочь?' }
    ] };
  }
}
if (typeof module !== 'undefined') module.exports = { ConversationInput };
