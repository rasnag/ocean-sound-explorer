export const animals = [
 {id:'beluga',name:'Beluga whale',hint:'Squeaks and whistles!',fact:'Belugas are nicknamed canaries of the sea.',icon:'🐋'},
 {id:'humpback',name:'Humpback whale',hint:'A long, swooping song.',fact:'Male humpback whales sing long songs.',icon:'🐳'},
 {id:'dolphin',name:'Bottlenose dolphin',hint:'Clicks, buzzes and whistles!',fact:'Dolphins use sound to help find their food.',icon:'🐬'},
 {id:'pilot',name:'Pilot whale',hint:'Listen for chirpy whistles.',fact:'Pilot whales live together in family groups.',icon:'🐋'},
 {id:'sperm',name:'Sperm whale',hint:'Click, click, click!',fact:'Sperm whales dive deep to hunt for squid.',icon:'🐋'},
];
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Replays preserve the clue. New expeditions select fresh casts and arrangements.
export function makeExpedition(rng=Math.random){
 const present=shuffle([true,true,true,false,false],rng);
 const trios=[];
 for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)trios.push([animals[a].id,animals[b].id,animals[c].id]);
 const candidates=animals.map((a,i)=>shuffle(trios.filter(t=>t.includes(a.id)===present[i]),rng));
 const casts=[];
 function choose(i){if(i===5)return true;for(const trio of candidates[i]){if(casts.some(t=>t.join()===trio.join()))continue;casts.push(trio);if(choose(i+1))return true;casts.pop();}return false;}
 choose(0);
 const styles=shuffle([0,1,2,3,4],rng);
 return animals.map((a,i)=>makeMix(i,present[i],rng,casts[i],styles[i]));
}
export function makeMix(index,present,rng=Math.random,cast,style=index){
 const target=animals[index].id;
 const decoys=shuffle(animals.filter(a=>a.id!==target).map(a=>a.id),rng);
 const voices=shuffle(cast||[...(present?[target]:[]),...decoys.slice(0,present?2:3)],rng);
 // Each score uses all three voices, but radically different phrase lengths,
 // entrances and density. Voice roles and score order change every expedition.
 const scores=[
  [[0,0,3.2],[1,2.4,3.4],[2,5.1,4.6],[0,8,2]],
  [[0,0,7.2],[1,.7,6.1],[2,2,7.7]],
  [[0,0,1.8],[1,1.3,2],[2,2.8,2.1],[0,4.4,1.8],[2,5.7,2],[1,7.2,2.7]],
  [[0,0,5.1],[1,4.2,5.6],[2,6.3,3.5],[0,7.5,2.4]],
  [[0,0,2.8],[1,.4,3],[2,1.1,3.4],[1,5.5,3.7],[0,6.7,3.1],[2,7.2,2.7]],
 ];
 const layers=scores[style].map(([voice,start,duration],j)=>({
  id:voices[voice],start:Math.min(start+rng()*.1,10-duration),duration,
  offsetFraction:rng()*.95,gain:voices[voice]===target?.38:(voice===0?.29:.12)+rng()*.04,
  pan:(voice-1)*.65,target:voices[voice]===target,
 }));
 return {target,present,duration:10,layers};
}