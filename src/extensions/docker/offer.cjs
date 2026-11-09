// When to offer «Docker» to someone who has not added it.
module.exports={
 id:'docker',name:'Docker',
 pitch:'покажу контейнеры, compose-проекты, образы и логи локального Docker, объясню, почему контейнер падает, а запуск, остановку и очистку сделаю только после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:docker|докер\p{L}*|docker-compose|compose)(?=$|[^\p{L}])/iu],
 topics:[/контейнер\p{L}*/iu,/(?:перезапусти|останови|запусти|рестартани)\p{L}* (?:redis|postgres\p{L}*|mysql|mongo\p{L}*|nginx|kafka|rabbitmq|clickhouse|редис|постгрес\p{L}*)/iu],
 // A Docker image for Python is the Python app; a UI container in Unity; a Dockerfile is code; disk space is disk-usage;
 // a shipping container is not Docker.
 avoid:[/python|питон|unity|юнити|(?:^|[^\p{L}])ui(?=$|[^\p{L}])|uxml|вёрстк|верстк|css|dockerfile|докерфайл|груз|морск|контейнер\p{L}* (?:для|с) (?:мусор|вод|еды|продукт)|(?:образ|image)\p{L}* (?:для|с) /iu],
 requests:[/(?:покажи|какие|что (?:запущено|работает|с)|логи|почему|перезапусти|останови|запусти|подними|сколько|почисти|удали)/iu],
 connect:'install',
 ready:settings=>settings.extension_docker==='true'
};
