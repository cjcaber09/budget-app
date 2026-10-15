import {act,fireEvent,render,screen} from '@testing-library/react-native';
import {Gesture,GestureHandlerRootView,State} from 'react-native-gesture-handler';
import {fireGestureHandler,getByGestureTestId} from 'react-native-gesture-handler/jest-utils';
import {PaymentMethodDeck} from '../../src/components/OverviewAccounts';
import type {PaymentMethod} from '../../src/domain/paymentMethods';
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodDialog:()=>null}));
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[]})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
const make=(id:string):PaymentMethod=>({id,user_id:'owner',name:id,method:'bank_account',payment_type:'Savings account',last_four:null,opening_balance:'0.00',baseline_at:null,archived:false,balance:'10.00',has_activity:true,related_bills:[]});
const scroll=Gesture.Native();
test('buttons cycle and retain selection across refresh; removal chooses next surviving account',()=>{
 const open=jest.fn(),a=make('Alpha'),b=make('Beta'),c=make('Gamma');
 const tree=(rows:PaymentMethod[])=><GestureHandlerRootView><PaymentMethodDeck methods={rows} scrollGesture={scroll} onOpen={open}/></GestureHandlerRootView>;
 const view=render(tree([a,b,c]));fireEvent.press(screen.getByLabelText('Next account'));
 expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();
 view.rerender(tree([a,{...b,balance:'20.00'},c]));expect(screen.getByRole('button',{name:/Beta, Savings account.*20.00/})).toBeTruthy();
 view.rerender(tree([a,c]));expect(screen.getByRole('button',{name:/Gamma, Savings account/})).toBeTruthy();
 fireEvent(screen.getByRole('button',{name:/Gamma, Savings account/}),'accessibilityTap');expect(open).toHaveBeenCalledWith(c);
 fireEvent.press(screen.getByLabelText('Previous account'));expect(screen.getByRole('button',{name:/Alpha, Savings account/})).toBeTruthy();
});
test('a single card has no cycling controls or duplicated accessible cards',()=>{
 render(<GestureHandlerRootView><PaymentMethodDeck methods={[make('Only')]} scrollGesture={scroll} onOpen={jest.fn()}/></GestureHandlerRootView>);
 expect(screen.queryByLabelText('Next account')).toBeNull();expect(screen.getAllByRole('button')).toHaveLength(1);
});
test('a completed pan changes exactly once, short pans stay put and never open details',async()=>{
 const open=jest.fn();render(<GestureHandlerRootView><PaymentMethodDeck methods={[make('Alpha'),make('Beta'),make('Gamma')]} scrollGesture={scroll} onOpen={open}/></GestureHandlerRootView>);
 const pan=async(translationY:number,velocityY=0)=>{await act(async()=>{fireGestureHandler(getByGestureTestId('overview-account-pan'),[{state:State.BEGAN,translationY:0},{state:State.ACTIVE,translationY,velocityY},{state:State.END,translationY,velocityY}]);});await act(async()=>{});};
 await pan(24);expect(screen.getByRole('button',{name:/Alpha, Savings account/})).toBeTruthy();
 await pan(60);expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();
 await pan(-60,-800);expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();
 await pan(8,900);expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();
 await pan(20,800);expect(screen.getByRole('button',{name:/Gamma, Savings account/})).toBeTruthy();
 await pan(60);expect(screen.getByRole('button',{name:/Alpha, Savings account/})).toBeTruthy();expect(open).not.toHaveBeenCalled();
});

test('cancelled drags do not cycle, and animation locks survive until selection commits',()=>{
 const animation=require('react-native-reanimated'),complete:Array<(finished:boolean)=>void>=[];
 const reduced=jest.spyOn(animation,'useReducedMotion').mockReturnValue(false);
 const timing=jest.spyOn(animation,'withTiming').mockImplementation((target:unknown,_config:unknown,done:unknown)=>{complete.push(done as (finished:boolean)=>void);return target;});
 const open=jest.fn(),a=make('Alpha'),b=make('Beta'),c=make('Gamma');
 const tree=(rows:PaymentMethod[])=><GestureHandlerRootView><PaymentMethodDeck methods={rows} scrollGesture={scroll} onOpen={open}/></GestureHandlerRootView>;
 const view=render(tree([a,b,c]));
 act(()=>fireGestureHandler(getByGestureTestId('overview-account-pan'),[{state:State.BEGAN,translationY:0},{state:State.ACTIVE,translationY:60},{state:State.CANCELLED,translationY:60}]));
 expect(complete).toHaveLength(0);expect(screen.getByRole('button',{name:/Alpha, Savings account/})).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Next account'));expect(complete).toHaveLength(1);expect(screen.getByLabelText('Next account')).toBeDisabled();
 act(()=>{complete[0](true);fireGestureHandler(getByGestureTestId('overview-account-pan'),[{state:State.BEGAN,translationY:0},{state:State.ACTIVE,translationY:60},{state:State.END,translationY:60}]);});
 expect(complete).toHaveLength(1);expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Next account'));expect(complete).toHaveLength(2);
 view.rerender(tree([a,b]));act(()=>complete[1](true));expect(screen.getByRole('button',{name:/Beta, Savings account/})).toBeTruthy();expect(open).not.toHaveBeenCalled();
 timing.mockRestore();reduced.mockRestore();
});
