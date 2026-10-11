import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {InitialHelp} from '../../src/components/InitialHelp';
import {useHelpStore} from '../../src/stores/useHelpStore';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../../src/stores/useAccountDeletionStore';
const mockSave=jest.fn(),mockRefetch=jest.fn(),mockProfileRefetch=jest.fn();
let mockQuery:any,mockProfile:any,mockPath='/';
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>mockQuery}));
jest.mock('../../src/hooks/useProfile',()=>({useProfile:()=>mockProfile}));
jest.mock('../../src/hooks/useInitializeCash',()=>({useInitializeCash:()=>({mutateAsync:mockSave,isPending:false})}));
jest.mock('expo-router',()=>({usePathname:()=>mockPath}));
const cash={id:'cash',user_id:'owner',method:'cash',opening_balance:null,baseline_at:null,archived:false};
beforeEach(()=>{
 jest.clearAllMocks();useHelpStore.getState().reset();usePreferencesStore.getState().setProfile({...defaultProfile('owner'),currency:'PHP',timezone:'Asia/Manila'});
 useFinancialResetStore.setState({pending:null,starting:false,epoch:0});useAccountDeletionStore.setState({pending:null,starting:false});mockPath='/';
 mockProfile={isSuccess:true,isPending:false,isFetching:false,data:usePreferencesStore.getState().profile,refetch:mockProfileRefetch};
 mockQuery={methods:[{...cash}],data:{owner:'owner',timezone:'Asia/Manila',methods:[{...cash}]},isSuccess:true,isError:false,isFetching:false,dataUpdatedAt:Date.now()+100000,refetch:mockRefetch};
 mockRefetch.mockImplementation(async()=>mockQuery);mockSave.mockResolvedValue({owner:'owner',methodId:'cash',state:'initialized'});
});
function next(){fireEvent.press(screen.getByText('Next'));}
function setupStep(){next();next();next();}
test('unset Cash prompts a four-step guide and saves explicit zero; zero balance never auto-prompts',async()=>{
 const view=render(<InitialHelp/>);expect(screen.getByText('Welcome to Budget Tracker')).toBeTruthy();setupStep();
 fireEvent.press(screen.getByText('Save Cash & finish'));expect(mockSave).not.toHaveBeenCalled();
 fireEvent.changeText(screen.getByLabelText('Cash available now'),'0');fireEvent.press(screen.getByText('Save Cash & finish'));
 await waitFor(()=>expect(mockSave).toHaveBeenCalledWith({methodId:'cash',amount:'0'}));await waitFor(()=>expect(useHelpStore.getState().visible).toBe(false));view.unmount();
 mockQuery.methods=[{...cash,opening_balance:'0.00',baseline_at:'2026-10-12'}];mockQuery.data.methods=mockQuery.methods;
 render(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);act(()=>useHelpStore.getState().open());expect(screen.getByText('Step 1 of 3')).toBeTruthy();next();next();expect(screen.getByText('Done')).toBeTruthy();
});
test('Later suppresses refetch prompts; manual Help reopens it',()=>{
 const view=render(<InitialHelp/>);fireEvent.press(screen.getByText('Later'));view.rerender(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);
 act(()=>useHelpStore.getState().open());expect(screen.getByText('Welcome to Budget Tracker')).toBeTruthy();
});
test('offline manual help remains readable and cannot save unknown Cash',()=>{
 mockQuery={...mockQuery,isSuccess:false,isError:true,methods:undefined,data:undefined};render(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);
 act(()=>useHelpStore.getState().open());setupStep();expect(screen.queryByLabelText('Cash available now')).toBeNull();expect(screen.getByText('Retry Cash setup')).toBeTruthy();expect(mockSave).not.toHaveBeenCalled();
});
test('uncertain saves retain the amount, refresh before retry, and finish if another device initialized Cash',async()=>{
 mockSave.mockRejectedValue(new Error('Could not confirm Cash setup. Refresh Cash before retrying.'));render(<InitialHelp/>);setupStep();
 fireEvent.changeText(screen.getByLabelText('Cash available now'),'1000');fireEvent.press(screen.getByText('Save Cash & finish'));await screen.findByText('Retry Cash setup');
 const updated={...cash,opening_balance:'250.00',baseline_at:'2026-10-12'};
 mockRefetch.mockResolvedValue({isError:false,data:{owner:'owner',timezone:'Asia/Manila',methods:[updated]}});
 fireEvent.press(screen.getByText('Retry Cash setup'));await waitFor(()=>expect(useHelpStore.getState().visible).toBe(false));expect(mockSave).toHaveBeenCalledTimes(1);
});
test('deep links and unconfirmed preferences do not auto-prompt; existing sheets keep help hidden',()=>{
 mockPath='/transaction/new';const view=render(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);mockPath='/';mockProfile.isSuccess=false;view.rerender(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);
 mockProfile.isSuccess=true;act(()=>useHelpStore.getState().block('native-sheet',true));view.rerender(<InitialHelp/>);expect(useHelpStore.getState().visible).toBe(false);
 act(()=>useHelpStore.getState().block('native-sheet',false));expect(useHelpStore.getState().visible).toBe(true);
});

test('failed refresh preserves the draft and blocks a second write until Cash is confirmed unset',async()=>{
 mockSave.mockRejectedValueOnce(new Error('Could not confirm Cash setup.'));render(<InitialHelp/>);setupStep();
 fireEvent.changeText(screen.getByLabelText('Cash available now'),'1000');fireEvent.press(screen.getByText('Save Cash & finish'));await screen.findByText('Retry Cash setup');
 mockRefetch.mockResolvedValueOnce({isError:true,data:undefined});fireEvent.press(screen.getByText('Retry Cash setup'));
 await screen.findByText('Could not refresh Cash. Check your connection and retry.');expect(mockSave).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByText('Retry Cash setup'));await screen.findByText('Save Cash & finish');expect(screen.getByLabelText('Cash available now').props.value).toBe('1,000');
 fireEvent.press(screen.getByText('Save Cash & finish'));await waitFor(()=>expect(mockSave).toHaveBeenCalledTimes(2));expect(mockSave).toHaveBeenLastCalledWith({methodId:'cash',amount:'1000'});
});
