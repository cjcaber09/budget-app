import {create} from 'zustand';
import {usePreferencesStore} from './usePreferencesStore';

interface ReportDisplayState {
  hideZeroValues: boolean;
  setHideZeroValues: (value: boolean) => void;
}

// Session-only display choice; report data, exports and saved preferences are unchanged.
export const useReportDisplayStore=create<ReportDisplayState>(set=>({
  hideZeroValues:false,
  setHideZeroValues:hideZeroValues=>set({hideZeroValues}),
}));

usePreferencesStore.subscribe((state,previous)=>{
  if(state.profile?.user_id!==previous.profile?.user_id){
    useReportDisplayStore.setState({hideZeroValues:false});
  }
});
