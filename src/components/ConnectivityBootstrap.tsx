import {useEffect} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {Platform} from 'react-native';
import {useConnectivityStore} from '../stores/useConnectivityStore';

export function ConnectivityBootstrap() {
  useEffect(() => {
    if(Platform.OS==='web'){
      const update=()=>useConnectivityStore.setState({online:navigator.onLine});
      update();window.addEventListener('online',update);window.addEventListener('offline',update);
      return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
    }
    return NetInfo.addEventListener(state => {
      useConnectivityStore.setState({online: state.isConnected === false || state.isInternetReachable === false ? false : state.isConnected === true ? true : null});
    });
  }, []);
  return null;
}
