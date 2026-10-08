import {renderHook,waitFor} from '@testing-library/react-native';
import {Platform} from 'react-native';
import {useBudgetAlerts} from '../../src/hooks/useBudgetAlerts';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {useBudgets} from '../../src/hooks/useBudgets';
import {useDashboard} from '../../src/hooks/useDashboard';
import {sendBudgetAlerts} from '../../src/lib/phoneNotifications';
jest.mock('../../src/lib/phoneNotifications',()=>({sendBudgetAlerts:jest.fn(),serializeNotifications:jest.fn(fn=>Promise.resolve().then(fn))}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:jest.fn(()=>({data:null}))}));
jest.mock('../../src/hooks/useBudgets',()=>({useBudgets:jest.fn(()=>({data:[]}))}));
afterEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile(null);});
it('does not send unsupported notifications on web',()=>{const os=Platform.OS;Object.defineProperty(Platform,'OS',{value:'web',configurable:true});renderHook(()=>useBudgetAlerts('1999-01-01'));expect(sendBudgetAlerts).not.toHaveBeenCalled();Object.defineProperty(Platform,'OS',{value:os,configurable:true});});
it('queries current month instead of the historical browsed month',()=>{usePreferencesStore.getState().setProfile({user_id:'u',display_name:'',avatar_path:null,currency:'USD',appearance:'system',timezone:'UTC',budget_notifications:true});renderHook(()=>useBudgetAlerts('1999-01-01'));expect(useDashboard).toHaveBeenCalledWith(new Date().toISOString().slice(0,7)+'-01',expect.any(Boolean));});

it.each(['snapshot','budgets'])('does not process retained data after failed %s refresh, then allows recovery',async(which)=>{
 const os=Platform.OS;Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});
 usePreferencesStore.getState().setProfile({user_id:'u',display_name:'',avatar_path:null,currency:'USD',appearance:'system',timezone:'UTC',budget_notifications:true});
 const month=new Date().toISOString().slice(0,7)+'-01';
 const snapshot={data:{complete:true,timezone:'UTC',month,expenseCents:8000,limitCents:10000,categoryTotals:[{id:'groceries',name:'Groceries',spent:8000}]},isError:which==='snapshot',isFetching:false};
 const budgets={data:[{category_id:'groceries',amount:100}],isError:which==='budgets',isFetching:false};
 jest.mocked(useDashboard).mockReturnValue(snapshot as unknown as ReturnType<typeof useDashboard>);jest.mocked(useBudgets).mockReturnValue(budgets as unknown as ReturnType<typeof useBudgets>);
 const {rerender}=renderHook(()=>useBudgetAlerts('1999-01-01'));expect(sendBudgetAlerts).not.toHaveBeenCalled();
 snapshot.isError=false;budgets.isError=false;rerender({});await waitFor(()=>expect(sendBudgetAlerts).toHaveBeenCalledTimes(1));
 Object.defineProperty(Platform,'OS',{value:os,configurable:true});
});
