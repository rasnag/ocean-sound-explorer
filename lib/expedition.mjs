export const animals = [
 {id:'beluga',name:'Beluga whale',hint:'Squeaks and whistles!',fact:'Belugas are nicknamed canaries of the sea.',icon:'🐋'},
 {id:'humpback',name:'Humpback whale',hint:'A long, swooping song.',fact:'Male humpback whales sing long songs.',icon:'🐳'},
 {id:'dolphin',name:'Bottlenose dolphin',hint:'Clicks, buzzes and whistles!',fact:'Dolphins use sound to help find their food.',icon:'🐬'},
 {id:'pilot',name:'Pilot whale',hint:'Listen for chirpy whistles.',fact:'Pilot whales live together in family groups.',icon:'🐋'},
 {id:'sperm',name:'Sperm whale',hint:'Click, click, click!',fact:'Sperm whales dive deep to hunt for squid.',icon:'🐋'},
];
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// A replay uses the same immutable plan. Only a new expedition rolls new plans.
export function makeExpedition(rng=Math.random){
 const present=shuffle([true,true,true,false,false],rng);
 return animals.map((a,i)=>makeMix(i,present[i],rng));
}
export function makeMix(index,present,rng=Math.random){
 const target=animals[index].id;
 const decoys=shuffle(animals.filter(a=>a.id!==target).map(a=>a.id),rng);
 // Five distinct temporal shapes: chatter, central cluster, quick exchanges,
 // overlapping foreground pair, and a sparse entrance that grows busier.
 const shapes=[
  [[0,5.2],[1.1,4.6],[3.8,4.2],[6.2,3.8]],
  [[0,3.4],[2.8,5.3],[4.3,4.1]],
  [[0,2.8],[1.4,3.2],[3.5,3.2],[5.1,3.1],[7,3]],
  [[0,6.4],[.8,6.5],[5.9,4.1]],
  [[0,4],[3.4,4.9],[5.7,4.3],[7.3,2.7]],
 ];
 const layers=shapes[index].map(([start,duration],j)=>({
  id:decoys[j% (index===3?3:Math.min(4,decoys.length))],
  start:Math.min(start+rng()*.25,10-duration),duration,
  offset:rng()*.8,gain:.13+rng()*.12,pan:(j%2?1:-1)*(.15+rng()*.6),target:false,
 }));
 if(present)layers.push({id:target,start:[1.8,3.0,.7,4.0,5.1][index]+rng()*.35,duration:3.8,offset:0,gain:.3+rng()*.08,pan:rng()*.6-.3,target:true});
 return {target,present,duration:10,layers};
}
