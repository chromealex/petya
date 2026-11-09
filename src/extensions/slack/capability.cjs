// What the local model's tool router (src/capabilities.cjs, src/semantic-tools.cjs) may restate a request into while
// Slack is added: «что нового в Slack». `owns` — the request is Petya's own, never an offer of another app.
module.exports={id:'slack-digest',says:'что нового в Slack за день, два дня или неделю, кто писал пользователю',examples:['что нового в Slack','что нового в слаке за 2 дня','что мне писали в Slack'],
 services:['slack'],owns:true,accepts:t=>!!require('./digest.cjs').question(t)};
