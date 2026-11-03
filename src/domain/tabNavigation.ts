export const PRIMARY_TABS=['index','transactions','reports','settings'] as const;
export function primaryTabIndex(state:{index:number;routes:{name:string;key:string}[];history?:{key:string}[]}){
 const focused=state.routes[state.index];
 const current=PRIMARY_TABS.indexOf(focused.name as typeof PRIMARY_TABS[number]);if(current>=0)return current;
 const history=[...(state.history??[])].reverse();
 // With backBehavior=history, primary history entries represent actual visits.
 for(const entry of history){const route=state.routes.find(r=>r.key===entry.key);if(!route)continue;const index=PRIMARY_TABS.indexOf(route.name as typeof PRIMARY_TABS[number]);if(index>=0)return index;}
 if(focused.name.startsWith('report/')||focused.name.startsWith('budget/'))return 2;
 if(focused.name.startsWith('category/')||focused.name.startsWith('recurring/'))return 3;
 return 1;
}
export function tabCutoutPath(x:number,width:number,height:number,radius=28){
 'worklet';
 const edge=radius+16,depth=radius+6,corner=18;
 return `M0 ${corner} Q0 0 ${corner} 0 H${x-edge} C${x-depth} 0 ${x-depth} ${depth} ${x} ${depth} C${x+depth} ${depth} ${x+depth} 0 ${x+edge} 0 H${width-corner} Q${width} 0 ${width} ${corner} V${height} H0 Z`;
}
export function tabCenter(index:number,width:number){
 'worklet';
 return ((index<2?index:index+1)+.5)*width/5;
}
// The lane bends below the fixed notch. Even the 20px end caps clear its floor.
export function liquidLaneY(x:number,width:number){
 'worklet';
 const distance=Math.abs(x-width/2);
 const bend=Math.min(76,width/5);
 return 28+(distance<bend?34*(1+Math.cos(Math.PI*distance/bend))/2:0);
}
export function liquidTabPath(head:number,tail:number,width:number){
 'worklet';
 const left=Math.min(head,tail),right=Math.max(head,tail),span=right-left;
 if(span<.1){const y=liquidLaneY(head,width);return `M${head-20} ${y} a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0 Z`;}
 const stretch=Math.min(1,span/80);
 let upper='',lower='';
 for(let i=0;i<=48;i++){
  const t=i/48,x=left+span*t,y=liquidLaneY(x,width),r=20-10*stretch*Math.sin(Math.PI*t);
  upper+=`${i?'L':'M'}${x} ${y-r} `;
  lower=`L${x} ${y+r} `+lower;
 }
 return `${upper} A20 20 0 0 1 ${right} ${liquidLaneY(right,width)+20} ${lower} A20 20 0 0 1 ${left} ${liquidLaneY(left,width)-20} Z`;
}
