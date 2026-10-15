import {render,screen,fireEvent} from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';
const mockLogout=jest.fn();
let mockParams:{section?:string;visit?:string}={};
jest.mock('../../src/components/FinancialReset',()=>({FinancialResetSettings:()=>{const {Text}=require('react-native');return <Text>Clear records</Text>;}}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({data:[]})}));
jest.mock('../../src/hooks/useRecurringRules',()=>({useRecurringRules:()=>({data:[]})}));
jest.mock('../../src/hooks/useOcr',()=>({useOcrScans:()=>({data:[]}),useDeleteOcrScan:()=>({mutate:jest.fn()})}));
jest.mock('../../src/lib/supabase',()=>({supabase:{auth:{signOut:()=>mockLogout()}}}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useLocalSearchParams:()=>mockParams}));
jest.mock('../../src/components/ProfileSettings',()=>({ProfileSettings:({section}:{section:string})=>{
 const {Text,TextInput,View}=require('react-native');const [draft,setDraft]=require('react').useState('');
 return <View><Text>{section==='profile'?'Profile controls':'Preference controls'}</Text><TextInput accessibilityLabel="Profile draft" value={draft} onChangeText={setDraft}/></View>;
}}));
jest.mock('../../src/components/AccountDeletion',()=>({AccountDeletionSettings:()=>{const {Text}=require('react-native');return <Text>Delete account</Text>;}}));
jest.mock('../../src/components/IncomeSources',()=>({IncomeSourcesSettings:()=>{const {Text}=require('react-native');return <Text>Income sources</Text>;}}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodsSettings:()=>{const {Text}=require('react-native');return <Text>Payment methods</Text>;}}));
jest.mock('../../src/components/NotificationSettings',()=>({NotificationSettings:()=>{const {Text}=require('react-native');return <Text>Budget alerts</Text>;}}));
beforeEach(()=>{mockLogout.mockClear();mockParams={};});
it('defaults to categories, bills and scan history',()=>{
 render(<SettingsScreen/>);
 expect(screen.getByRole('tab',{name:'Categories & Bills'}).props.accessibilityState.selected).toBe(true);
 for(const label of ['Categories','Bills','Scan history'])expect(screen.getByText(label)).toBeTruthy();
 expect(screen.queryByText('Income sources')).toBeNull();
 expect(screen.queryByText('Delete account')).toBeNull();
});
it('opens Sources for a fresh Overview request without discarding mounted profile drafts',()=>{
 const view=render(<SettingsScreen/>);fireEvent.press(screen.getByRole('tab',{name:'Profile'}));fireEvent.changeText(screen.getByLabelText('Profile draft'),'Keep this');
 mockParams={section:'sources',visit:'cash-visit'};view.rerender(<SettingsScreen/>);expect(screen.getByRole('tab',{name:'Sources'}).props.accessibilityState.selected).toBe(true);
 fireEvent.press(screen.getByRole('tab',{name:'Profile'}));expect(screen.getByLabelText('Profile draft').props.value).toBe('Keep this');
});
it('groups each section and keeps logout available on every tab',()=>{
 render(<SettingsScreen/>);
 for(const [tab,labels] of [
  ['Profile',['Profile controls','Clear records','Delete account']],['Preferences',['Preference controls']],
  ['Sources',['Income sources','Payment methods']],['Notifications',['Budget alerts']],
  ['Categories & Bills',['Scan history']],
 ] as const){
  fireEvent.press(screen.getByRole('tab',{name:tab}));
  for(const label of labels)expect(screen.getByText(label)).toBeTruthy();
  if(tab!=='Profile')expect(screen.queryByText('Delete account')).toBeNull();
  fireEvent.press(screen.getByLabelText('Logout'));
 }
 expect(mockLogout).toHaveBeenCalledTimes(5);
});
it('preserves a profile draft when switching between tabs',()=>{
 render(<SettingsScreen/>);
 fireEvent.press(screen.getByRole('tab',{name:'Profile'}));
 fireEvent.changeText(screen.getByLabelText('Profile draft'),'Unsaved name');
 fireEvent.press(screen.getByRole('tab',{name:'Sources'}));
 fireEvent.press(screen.getByRole('tab',{name:'Preferences'}));
 fireEvent.press(screen.getByRole('tab',{name:'Profile'}));
 expect(screen.getByLabelText('Profile draft').props.value).toBe('Unsaved name');
});
