import {encryptedStorage} from './encryptedStorage';
import {useSetupGuideStore} from '../stores/useSetupGuideStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
const prefix='budget-tracker:setup:v1:';
const generations=new Map<string,number>();
export async function loadSetupProgress(owner:string){
 const generation=generations.get(owner)??0,raw=await encryptedStorage.getItem(prefix+owner);
 const data=raw?JSON.parse(raw):{owner,step:0,completed:false};
 if(data.owner!==owner||!Number.isInteger(data.step)||data.step<0||data.step>4||typeof data.completed!=='boolean')throw new Error('Setup progress could not be read.');
 if(usePreferencesStore.getState().profile?.user_id===owner&&generation===(generations.get(owner)??0))useSetupGuideStore.setState(s=>({owner,step:s.visible&&s.owner===owner?s.step:data.step,completed:data.completed,loaded:true}));
}
export async function saveSetupProgress(owner:string,step:number,completed=false){
 const generation=generations.get(owner)??0;
 if(usePreferencesStore.getState().profile?.user_id!==owner)return;
 await encryptedStorage.setItem(prefix+owner,JSON.stringify({owner,step,completed}));
 if(usePreferencesStore.getState().profile?.user_id!==owner||generation!==(generations.get(owner)??0))return;
 useSetupGuideStore.setState({owner,step,completed,loaded:true});
}
export async function clearSetupProgress(owner:string){generations.set(owner,(generations.get(owner)??0)+1);useSetupGuideStore.setState({owner:null,visible:false,step:0,completed:false,loaded:false});await encryptedStorage.removeItem(prefix+owner);}
