import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {AppState,Platform} from 'react-native';
import {VoiceEntry} from '../../src/components/VoiceEntry';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useConnectivityStore} from '../../src/stores/useConnectivityStore';
import {useAppLockStore} from '../../src/stores/useAppLockStore';
import {useVoiceEntryStore} from '../../src/stores/useVoiceEntryStore';
import {localDateKey} from '../../src/domain/transactionDates';
const mockReplace=jest.fn(),mockBack=jest.fn(),mockCall=jest.fn(),mockPermission=jest.fn();
const mockRecorder={uri:'file:///cache/Audio/recording-test.m4a',prepareToRecordAsync:jest.fn(async()=>{}),record:jest.fn(),stop:jest.fn(async()=>{})};
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace,back:mockBack}),useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('expo-audio',()=>({AudioModule:{requestRecordingPermissionsAsync:()=>mockPermission()},RecordingPresets:{HIGH_QUALITY:{}},setAudioModeAsync:jest.fn(async()=>{}),useAudioRecorder:()=>mockRecorder,useAudioRecorderState:()=>({durationMillis:0})}));
jest.mock('../../src/lib/voiceEntry',()=>({callVoice:(...args:unknown[])=>mockCall(...args),cleanupVoiceFiles:async()=>{},removeVoiceFile:async()=>{},voiceContextActive:()=>true}));
jest.mock('../../src/lib/nativeHandoff',()=>({handoffGeneration:()=>0,runNativeHandoff:(_purpose:string,action:()=>Promise<unknown>)=>action()}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({data:[]})}));
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[]})}));
jest.mock('../../src/hooks/useIncomeSources',()=>({useIncomeSources:()=>({data:[]})}));
const owner='00000000-0000-4000-8000-000000000001';
const proposal=()=>({intent:'entry',transcript:'I received twenty pesos.',type:'income',amount:'20.00',currency:'PHP',date:localDateKey(new Date(),'Asia/Manila'),categoryId:null,paymentMethodId:null,incomeSourceId:null,note:'Income',unresolved:[]});
beforeEach(()=>{jest.clearAllMocks();Object.defineProperty(Platform,'OS',{value:'android',configurable:true});Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});usePreferencesStore.getState().setProfile({...defaultProfile(owner),currency:'PHP',timezone:'Asia/Manila'});useConnectivityStore.setState({online:true});useAppLockStore.setState({loaded:true,enabled:false,locked:false,obscured:false});useVoiceEntryStore.getState().set(null);mockPermission.mockResolvedValue({granted:true});mockCall.mockImplementation(async(context?:unknown)=>context?{proposal:proposal()}:{available:true});});
async function record(){render(<VoiceEntry/>);await waitFor(()=>expect(screen.getByText('Start recording')).not.toBeDisabled());fireEvent.press(screen.getByText('Start recording'));await screen.findByText('Stop and process');fireEvent.press(screen.getByText('Stop and process'));}
test('one successful clip opens review with no financial save',async()=>{
 await record();await screen.findByText('Review entry');expect(mockCall).toHaveBeenCalledTimes(2);expect(mockReplace).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Review entry'));expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({pathname:'/transaction/new'}));expect(useVoiceEntryStore.getState().pending?.proposal.amount).toBe('20.00');
});
test('a transfer never opens an ordinary transaction review',async()=>{
 mockCall.mockImplementation(async(context?:unknown)=>context?{proposal:{...proposal(),intent:'transfer'}}:{available:true});
 await record();await screen.findByText(/transfer or balance operation/);expect(screen.queryByText('Review entry')).toBeNull();expect(mockReplace).not.toHaveBeenCalled();
});

test('version two preserves purchase rows and unresolved prices through review navigation',async()=>{
 const purchases=['Rice','Eggs'].map((label,i)=>({label,amount:i?'':'100.00',quantity:null,unitPrice:null,priceNeedsReview:!!i,date:null,currency:null,paymentMethod:null,categoryId:null,type:null}));
 mockCall.mockImplementation(async(context?:unknown)=>context?{proposalVersion:2,proposal:{...proposal(),type:'expense',amount:'',purchases,groupingIssue:null}}:{available:true});
 await record();await screen.findByText('Review entry');fireEvent.press(screen.getByText('Review entry'));
 expect(useVoiceEntryStore.getState().pending?.proposal.purchases).toEqual(purchases);expect(useVoiceEntryStore.getState().pending?.proposal.amount).toBe('');
});

test('incompatible version-two purchases cannot enter review',async()=>{
 mockCall.mockImplementation(async(context?:unknown)=>context?{proposalVersion:2,proposal:{...proposal(),type:'expense',intent:'multiple',purchases:[],groupingIssue:'incompatible_context'}}:{available:true});
 await record();await screen.findByText(/These purchases need separate transactions/);expect(screen.queryByText('Review entry')).toBeNull();
});
test('rate limit prevents microphone access and offers a countdown',async()=>{
 mockCall.mockRejectedValue(Object.assign(new Error('Voice limit reached.'),{retryAfterSeconds:60}));render(<VoiceEntry/>);
 await waitFor(()=>expect(screen.getByText('Start recording')).not.toBeDisabled());fireEvent.press(screen.getByText('Start recording'));
 await screen.findByText(/Try again in/);expect(mockPermission).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
});
test('late processing result after cancel cannot prefill an entry',async()=>{
 let finish!:(value:unknown)=>void;mockCall.mockImplementation((context?:unknown)=>context?new Promise(resolve=>{finish=resolve;}):Promise.resolve({available:true}));
 await record();await screen.findByText('Transcribing and preparing your entry…');
 fireEvent.press(screen.getByText('Cancel'));await act(async()=>{finish({proposal:proposal()});});
 expect(useVoiceEntryStore.getState().pending).toBeNull();expect(screen.queryByText('Review entry')).toBeNull();
});
