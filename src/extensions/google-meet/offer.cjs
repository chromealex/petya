// When to offer «Google Meet»: only when Meet is named — «созвон в Meet», «в мите», «гугл мит», a meet.google.com
// link. The English «meeting» / «meetup» and the Russian «митинг», «митап» are not Meet; meetings in general,
// meeting summaries and the calendar are other apps' subjects.
module.exports={
 id:'google-meet',name:'Google Meet',
 pitch:'буду сам записывать созвоны Google Meet из браузера и добавлять ссылку Meet во встречи Google Календаря',
 names:[/google[\s-]*meet(?![\p{L}])|гугл[\s-]*мит(?:е|а|у|ом)?(?![\p{L}])|(?:^|[^\p{L}])(?:в|во|через|по)\s+(?:meet|мит(?:е|у|а)?)(?![\p{L}])|meet\.google\.com/iu],
 topics:[],
 avoid:[/митинг|митап|meeting|meetup/iu],
 connect:'install',
 ready:settings=>settings['extension_google-meet']==='true'
};
