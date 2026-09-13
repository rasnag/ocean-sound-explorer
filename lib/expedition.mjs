export const animals = [
 {id:'beluga',name:'Beluga whale',hint:'Squeaks and whistles!',fact:'Belugas are nicknamed canaries of the sea.',icon:'🐋'},
 {id:'humpback',name:'Humpback whale',hint:'A long, swooping song.',fact:'Male humpback whales sing long songs.',icon:'🐳'},
 {id:'dolphin',name:'Bottlenose dolphin',hint:'Clicks, buzzes and whistles!',fact:'Dolphins use sound to help find their food.',icon:'🐬'},
 {id:'pilot',name:'Pilot whale',hint:'Listen for chirpy whistles.',fact:'Pilot whales live together in family groups.',icon:'🐋'},
 {id:'sperm',name:'Sperm whale',hint:'Click, click, click!',fact:'Sperm whales dive deep to hunt for squid.',icon:'🐋'},
];
export const ROUND_COUNT=3;
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function makeExpedition(rng=Math.random){
 // Confidence ramp: start with visually distinct ocean animals, then make the final round a closer whale-vs-whale discovery.
 const targets=shuffle(animals,rng).slice(0,ROUND_COUNT);
 return targets.map((target,index)=>{
  let decoys;
  if(index<2){
   // Give young explorers an easier first couple of guesses: prefer the dolphin as a distinctive option.
   const others=animals.filter(a=>a.id!==target.id);
   const dolphin=others.find(a=>a.id==='dolphin');
   const whales=shuffle(others.filter(a=>a.id!=='dolphin'),rng);
   decoys=shuffle([...(dolphin?[dolphin]:[]),...whales],rng).slice(0,2);
  }else{
   // The last round is the discovery challenge: similar-looking whale choices are intentional.
   decoys=shuffle(animals.filter(a=>a.id!==target.id&&a.id!=='dolphin'),rng).slice(0,2);
  }
  const choices=shuffle([target,...decoys],rng);
  const duration=4;
  return {target:target.id,present:true,duration,choices,layers:[{id:target.id,start:0,duration,offsetFraction:rng()*.75,gain:1.15,pan:0,target:true}],style:index};
 });
}
