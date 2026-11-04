// Match only direct, standalone personal preference requests, never quotations or source text.
const {NameProfile}=require('./ui/name-profile.js');
function preference(command,settings){
 const match=String(command).trim().match(/^(?:Петя[,!]?\s*)?(?:пожалуйста[,!]?\s*)?(?:не\s+(?:называй|зови)\s+меня|(?:перестань|хватит)\s+(?:называть|звать)\s+меня|не\s+обращайся\s+ко\s+мне\s+как)\s+[«"“]?([\p{L}\p{M}][\p{L}\p{M}'’ -]{0,49}?)[»"”]?(?:[, ]+пожалуйста)?[.!]*$/iu);
 if(!match)return null;
 const form=match[1].trim();
 const blocked=NameProfile.validate(settings.userName,settings.userNameVariants,settings.userNameExcluded).blocked;
 if(!blocked.some(v=>NameProfile.key(v)===NameProfile.key(form)))blocked.push(form);
 const profile=NameProfile.validate(settings.userName,settings.userNameVariants,blocked.join(', '));
 return {patch:{userNameExcluded:profile.excluded},text:'Хорошо, больше не буду так тебя называть. Запомнил.'};
}
module.exports={preference};
