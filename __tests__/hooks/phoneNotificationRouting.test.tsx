import {act,cleanup,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Platform} from 'react-native';
import {usePhoneNotifications} from '../../src/hooks/usePhoneNotifications';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {useUiStore} from '../../src/stores/useUiStore';
import type {PropsWithChildren} from 'react';
const mockPush=jest.fn();let mockLast:unknown=null;const mockClear=jest.fn(async()=>{mockLast=null;});
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:jest.fn()}}));
jest.mock('../../src/lib/phoneNotifications',()=>({cancelPhoneReminders:jest.fn().mockResolvedValue(undefined),reconcileBillReminders:jest.fn().mockResolvedValue(undefined),serializeNotifications:jest.fn(task=>task())}));
jest.mock('expo-notifications',()=>({getLastNotificationResponse:()=>mockLast,clearLastNotificationResponseAsync:()=>mockClear(),addNotificationResponseReceivedListener:()=>({remove:jest.fn()})}));
const owner='00000000-0000-4000-8000-000000000001';const ruleId='00000000-0000-4000-8000-000000000003';const originalOS=Platform.OS;
const profile={user_id:owner,display_name:'',avatar_path:null,appearance:'system' as const,currency:'USD' as const,timezone:'UTC',bill_notifications:false};
let client:QueryClient;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});mockLast=null;mockPush.mockReset();mockClear.mockClear();Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});usePreferencesStore.getState().setProfile(profile);});
afterEach(()=>{cleanup();client.clear();usePreferencesStore.getState().setProfile(null);Object.defineProperty(Platform,'OS',{value:originalOS,configurable:true});});
function response(data:unknown){return {notification:{request:{content:{data}}}};}
function mount(){return renderHook(()=>usePhoneNotifications(),{wrapper:({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>});}
it('opens a bill with a fresh form visit from a cold notification tap',async()=>{mockLast=response({owner,kind:'bill',ruleId});mount();await waitFor(()=>expect(mockPush).toHaveBeenCalledWith({pathname:'/recurring/[id]',params:{id:ruleId,visit:expect.any(String)}}));expect(mockClear).toHaveBeenCalledTimes(1);});
it('waits for authentication and then opens the notification',async()=>{usePreferencesStore.getState().setProfile(null);mockLast=response({owner,kind:'monthly',month:'2026-09-01'});mount();expect(mockPush).not.toHaveBeenCalled();act(()=>usePreferencesStore.getState().setProfile(profile));await waitFor(()=>expect(mockPush).toHaveBeenCalledWith('/'));expect(useUiStore.getState().selectedMonth).toBe('2026-09-01');});
it('drops another account notification without navigating',async()=>{mockLast=response({owner:'other',kind:'bill',ruleId});mount();await waitFor(()=>expect(mockClear).toHaveBeenCalledTimes(1));expect(mockPush).not.toHaveBeenCalled();});
