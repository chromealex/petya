// When to offer «Zoom»: only when Zoom is named. «Зум» as in zooming a picture or the screen is not this app.
module.exports={
 id:'zoom',name:'Zoom',
 pitch:'буду сам записывать встречи Zoom, подпишу в расшифровке, кто говорил, и предложу вашу личную комнату Zoom для новых встреч в календаре',
 names:[/(?:^|[^\p{L}])(?:zoom|зум(?:е|а|ом|у)?)(?=$|[^\p{L}])/iu],
 topics:[],
 avoid:[/увелич|уменьш|приблиз|отдал|масштаб|(?:zoom|зум\p{L}*)\s+(?:in|out|фото|фотк|картин|изображ|снимк|экран|камер|объектив)|(?:фото|фотк|картинк|изображени|снимк|камер|объектив)\p{L}*\s+(?:с\s+)?(?:zoom|зум)/iu],
 connect:'install',
 ready:settings=>settings.extension_zoom==='true'
};
