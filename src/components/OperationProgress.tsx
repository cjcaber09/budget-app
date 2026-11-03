import {useEffect,useState} from 'react';
import {Animated,Easing,Text,View} from 'react-native';
import {useReducedMotion} from 'react-native-reanimated';
import {useColors,type} from '../styles/theme';

/** Activity, not a fabricated percentage: the server exposes no work counts. */
export function OperationProgress({label,paused=false}:{label:string;paused?:boolean}){
  const colors=useColors(),reduced=useReducedMotion();
  const [position]=useState(()=>new Animated.Value(0));
  const [width,setWidth]=useState(240);
  useEffect(()=>{
    position.setValue(0);
    if(reduced||paused)return;
    const animation=Animated.loop(Animated.timing(position,{toValue:1,duration:1400,easing:Easing.inOut(Easing.ease),useNativeDriver:true}));
    animation.start();return()=>animation.stop();
  },[paused,reduced,position,width]);
  return <View style={{gap:10,marginVertical:16}}>
    <Text accessibilityLiveRegion="polite" style={{...type.label,color:colors.text}}>{label}</Text>
    <View accessible role="progressbar" aria-valuetext={paused?'Paused; retry required':'In progress; percentage unavailable'} aria-busy={!paused} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{text:paused?'Paused; retry required':'In progress; percentage unavailable'}} accessibilityState={{busy:!paused}} onLayout={event=>setWidth(event.nativeEvent.layout.width)} style={{height:8,borderRadius:4,overflow:'hidden',backgroundColor:colors.surfaceAlt}}>
      <Animated.View style={{height:8,width:width*.4,borderRadius:4,backgroundColor:colors.primary,opacity:paused?0.45:1,transform:[{translateX:reduced||paused?width*.3:position.interpolate({inputRange:[0,1],outputRange:[-width*.4,width]})}]}}/>
    </View>
  </View>;
}
