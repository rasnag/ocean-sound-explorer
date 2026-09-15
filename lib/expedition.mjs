export const animals = [
 {id:'owl',name:'Owl',fact:'Owls can hunt in the dark using their excellent hearing.',icon:'🦉',source:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Otus_sunia.ogg'},
 {id:'horse',name:'Horse',fact:'A horse call is called a neigh or a whinny.',icon:'🐴',source:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wiehern.ogg'},
 {id:'dolphin',name:'Dolphin',fact:'Dolphins use clicks and whistles to communicate and find food.',icon:'🐬'},
 {id:'humpback',name:'Humpback whale',fact:'Male humpback whales sing long, patterned songs.',icon:'🐳'},
 {id:'sperm',name:'Sperm whale',fact:'Sperm whales use powerful clicks while hunting deep underwater.',icon:'🐋'},
];

export const rounds = [
 {target:'owl',options:['owl','horse'],warmup:true,prompt:'Which animal made that sound: the owl or the horse?'},
 {target:'horse',options:['horse','owl'],warmup:true,prompt:'Which animal made that sound: the horse or the owl?'},
 {target:'dolphin',options:['dolphin','humpback','sperm'],warmup:false,prompt:'Which ocean animal made that sound: the dolphin, humpback whale, or sperm whale?'},
 {target:'humpback',options:['humpback','dolphin','sperm'],warmup:false,prompt:'Which ocean animal made that sound: the humpback whale, dolphin, or sperm whale?'},
 {target:'sperm',options:['sperm','dolphin','humpback'],warmup:false,prompt:'Which ocean animal made that sound: the sperm whale, dolphin, or humpback whale?'},
];

export function makeExpedition(){return rounds.map(round=>({...round,options:[...round.options]}));}
