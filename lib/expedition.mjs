export const animals = [
 {id:'owl',name:'Owl',fact:'Some owls can hear a mouse moving under snow—then plunge in feet-first!',icon:'🦉'},
 {id:'horse',name:'Horse',fact:'Horses can sleep standing up, and baby horses can run just hours after birth!',icon:'🐴'},
 {id:'dog',name:'Dog',fact:'Dogs can hear super-high sounds that human ears cannot hear at all!',icon:'🐶'},
 {id:'dolphin',name:'Dolphin',fact:'Dolphins click, catch the echo, and build a sound-picture of what is ahead!',icon:'🐬'},
 {id:'seal',name:'Seal',fact:'Elephant seals can dive more than a mile deep—far below the sunlight!',icon:'🦭'},
 {id:'whale',name:'Whale',fact:'Humpback whales repeat 20-minute songs for hours at a time!',icon:'🐋'},
];

export const rounds = [
 {target:'owl',options:['owl','horse'],warmup:true,prompt:'Which animal made that sound: the owl or the horse?'},
 {target:'dog',options:['dog','horse'],warmup:true,prompt:'Which animal made that sound: the dog or the horse?'},
 {target:'dolphin',options:['dolphin','seal','whale'],warmup:false,prompt:'Which ocean animal made that sound: the dolphin, seal, or whale?'},
 {target:'seal',options:['seal','dolphin','whale'],warmup:false,prompt:'Which ocean animal made that sound: the seal, dolphin, or whale?'},
 {target:'whale',options:['whale','dolphin','seal'],warmup:false,prompt:'Which ocean animal made that sound: the whale, dolphin, or seal?'},
];

export function makeExpedition(){return rounds.map(round=>({...round,options:[...round.options]}));}
