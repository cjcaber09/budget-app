import {create} from 'zustand';
export const useSetupGuideStore=create<{owner:string|null;visible:boolean;step:number;completed:boolean;loaded:boolean}>(()=>({owner:null,visible:false,step:0,completed:false,loaded:false}));
export function openSetupGuide(owner:string){useSetupGuideStore.setState(s=>({owner,visible:true,step:s.owner===owner?s.step:0,completed:s.owner===owner?s.completed:false}));}
