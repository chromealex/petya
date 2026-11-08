// When to offer «Поиск файлов по смыслу» to someone who has not added it.
const route=require('./route.cjs');
module.exports={
 id:'file-search',name:'Поиск файлов по смыслу',
 pitch:'найду ваши файлы по тому, о чём они: код, документы, PDF и презентации в папках проекта — по локальному индексу, ничего не отправляя',
 // «по смыслу» and «документы про …» name the thing itself: «документы про монетизацию» is a file search, not a
 // revenue question.
 names:[/по смыслу/iu,route.BARE],
 // A search verb with a kind of file.
 topics:[{test:text=>!!route.wanted(text)}],
 // The web, «search everything», trackers, wikis, messengers, disk space, conversion and writing code are others'.
 avoid:route.AVOID,
 requests:[/(?:найди|поищи|где|покажи|ищу|документы|файлы|презентации)/iu],
 connect:'install',
 ready:settings=>settings['extension_file-search']==='true'
};
