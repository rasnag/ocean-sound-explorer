export const animals = [
 {id:'dog',name:'Dog',hint:'Woof woof!',fact:'Dogs bark to communicate with people and other dogs.',icon:'🐶',emoji:'🐶',audioUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Barking_of_a_dog.ogg'},
 {id:'cow',name:'Cow',hint:'Moo!',fact:'Cows use different calls to communicate with their herd.',icon:'🐮',emoji:'🐮',audioUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Single_Cow_Moo.ogg'},
 {id:'cat',name:'Cat',hint:'Meow!',fact:'Cats can make dozens of different sounds.',icon:'🐱',emoji:'🐱',audioUrl:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Meow.ogg'},
 {id:'whale',name:'Whale',hint:'A mysterious whale call!',fact:'This was a beluga whale! Belugas make so many squeaks and whistles they are called canaries of the sea.',icon:'🐋',emoji:'🐋',soundId:'beluga'},
 {id:'dolphin-choice',name:'Dolphin',hint:'Clicks and whistles!',fact:'Dolphins use sound to communicate and find food.',icon:'🐬',emoji:'🐬'},
 {id:'seal',name:'Seal',hint:'Barks, grunts and growls!',fact:'Seals make many different sounds above and below water.',icon:'🦭',emoji:'🦭'},
 {id:'beluga',name:'Beluga whale',hint:'Squeaks and whistles!',fact:'Belugas are nicknamed canaries of the sea.',icon:'🐋'},
 {id:'humpback',name:'Humpback whale',hint:'A long, swooping song.',fact:'Male humpback whales sing long songs.',icon:'🐳'},
 {id:'dolphin',name:'Bottlenose dolphin',hint:'Clicks, buzzes and whistles!',fact:'Dolphins use sound to help find their food.',icon:'🐬'},
 {id:'pilot',name:'Pilot whale',hint:'Listen for chirpy whistles.',fact:'Pilot whales live together in family groups.',icon:'🐋'},
 {id:'sperm',name:'Sperm whale',hint:'Click, click, click!',fact:'Sperm whales dive deep to hunt for squid.',icon:'🐋'},
];
export const ROUND_COUNT=3;
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function makeExpedition(rng=Math.random){
 const familiar=animals.filter(a=>['dog','cow','cat'].includes(a.id));
 const familiarTargets=shuffle([animals.find(a=>a.id==='dog'),animals.find(a=>a.id==='cow')],rng);
 const whale=animals.find(a=>a.id==='whale');
 const oceanChoices=['whale','dolphin-choice','seal'].map(id=>animals.find(a=>a.id===id));
 return familiarTargets.map((target,index)=>({target:target.id,present:true,duration:2.8,choices:shuffle(familiar,rng),layers:[{id:target.id,start:0,duration:2.8,offsetFraction:0,gain:1.25,pan:0,target:true}],style:index})).concat([{target:'whale',present:true,duration:4,choices:shuffle(oceanChoices,rng),layers:[{id:'beluga',start:0,duration:4,offsetFraction:rng()*.75,gain:1.15,pan:0,target:true}],style:2,reveal:'Beluga whale'}]);
}
