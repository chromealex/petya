// When to offer «Место на диске» to someone who has not added it.
module.exports={
 id:'disk-usage',name:'Место на диске',
 pitch:'покажу, чем забит диск (кэши Xcode, Unity, Gradle, модели Ollama, загрузки) и помогу освободить место — только после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:disk usage|disk space|DerivedData)(?=$|[^\p{L}])/iu],
 topics:[/(?:чем|что) (?:забит|занят)\p{L}* (?:диск|место|мак|ssd)|забит\p{L}* диск|диск забит/iu,/мест\p{L}* на (?:диске|маке|ssd|компе|компьютере|ноутбуке)|свободн\p{L}* мест\p{L}* на|не хватает места на/iu,/освободи\p{L}* (?:место|диск)|почист\p{L}* (?:диск|мак|компьютер)/iu],
 // «место встречи», «свободное место в спринте», «диск в Google Drive» are not the local disk.
 avoid:[/встреч|спринт|календар|google ?drive|гугл[- ]?диск|яндекс[- ]?диск|onedrive|dropbox|icloud|облак|в команде|в бэклоге|на сервере/iu],
 requests:[/(?:покажи|сколько|чем|что можно|освободи|почисти|проверь)/iu],
 connect:'install',
 ready:settings=>settings['extension_disk-usage']==='true'
};
