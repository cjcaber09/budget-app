import {create} from 'zustand';
import type {ImagePickerAsset} from 'expo-image-picker';
export const useRecoveredPickerStore=create<{avatar:{owner:string;asset:ImagePickerAsset}|null;setAvatar:(avatar:{owner:string;asset:ImagePickerAsset}|null)=>void}>(set=>({avatar:null,setAvatar:avatar=>set({avatar})}));
