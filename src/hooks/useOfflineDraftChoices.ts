import {useEffect, useState} from 'react';
import {loadOfflineDraftChoices, offlineChoicesGeneration} from '../lib/offlineDraftChoicesStorage';
import type {OfflineDraftChoices} from '../domain/offlineDraftChoices';

export function useOfflineDraftChoices(owner: string) {
  const [state, setState] = useState<{loaded:boolean;choices:OfflineDraftChoices|null;error:boolean}>({loaded:false,choices:null,error:false});
  useEffect(() => {
    let active=true;const generation=offlineChoicesGeneration(owner);
    void loadOfflineDraftChoices(owner).then(choices=>{if(active&&generation===offlineChoicesGeneration(owner))setState({loaded:true,choices,error:false});}).catch(()=>{if(active)setState({loaded:true,choices:null,error:true});});
    return()=>{active=false;};
  }, [owner]);
  return state;
}
