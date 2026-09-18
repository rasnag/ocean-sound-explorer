export const animals = [
 {id:'owl',name:'Owl',fact:'Owls can hunt in the dark using their excellent hearing.',icon:'🦉'},
 {id:'horse',name:'Horse',fact:'A horse call is called a neigh or a whinny.',icon:'🐴'},
 {id:'dog',name:'Dog',fact:'Dogs bark to communicate with people and other dogs.',icon:'🐶'},
 {id:'dolphin',name:'Dolphin',fact:'Dolphins use clicks and whistles to communicate and find food.',icon:'🐬'},
 {id:'seal',name:'Seal',fact:'Seals bark, growl, and make other calls to communicate.',icon:'🦭'},
 {id:'whale',name:'Whale',fact:'Whales sing and call to one another across the ocean.',icon:'🐋'},
];

export const rounds = [
 {target:'owl',options:['owl','horse'],warmup:true,prompt:'Which animal made that sound: the owl or the horse?'},
 {target:'dog',options:['dog','horse'],warmup:true,prompt:'Which animal made that sound: the dog or the horse?'},
 {target:'dolphin',options:['dolphin','seal','whale'],warmup:false,prompt:'Which ocean animal made that sound: the dolphin, seal, or whale?'},
 {target:'seal',options:['seal','dolphin','whale'],warmup:false,prompt:'Which ocean animal made that sound: the seal, dolphin, or whale?'},
 {target:'whale',options:['whale','dolphin','seal'],warmup:false,prompt:'Which ocean animal made that sound: the whale, dolphin, or seal?'},
];

export function makeExpedition(){return rounds.map(round=>({...round,options:[...round.options]}));}
