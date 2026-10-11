import {Platform,Text} from 'react-native';
import {renderRouter,screen,testRouter,within} from 'expo-router/testing-library';
// Router's test harness replaces the shared motion mock. Restore the easing API it omits.
jest.requireMock('react-native-reanimated').cubicBezier=jest.requireActual('../../node_modules/react-native-reanimated/src/css/easing').cubicBezier;
jest.requireMock('react-native-reanimated').useReducedMotion=()=>true;
const TabsLayout=require('../../app/(tabs)/_layout').default;
jest.mock('../../src/hooks/useRecurringRules',()=>({useRecurringCatchUp:()=>{}}));
jest.mock('../../src/hooks/useBudgetAlerts',()=>({useBudgetAlerts:()=>{}}));
jest.mock('../../src/hooks/usePhoneNotifications',()=>({usePhoneNotifications:()=>{}}));
jest.mock('../../src/components/AddTransactionFab',()=>({AddTransactionFab:()=>null}));
jest.mock('../../src/components/MotionPressable',()=>({MotionPressable:require('react-native').Pressable}));
const Page=()=> <Text>Screen content</Text>;
it('keeps the dynamic bill-payment route out of the tab bar and preserves Back to Settings',()=>{
 const navigation=renderRouter({'_layout':TabsLayout,index:Page,transactions:Page,reports:Page,settings:Page,
  'transaction/new':Page,'transaction/[id]':Page,'category/new':Page,'category/[id]':Page,
  'budget/[categoryId]':Page,'recurring/new':Page,'recurring/[id]':Page,'report/[kind]':Page},{initialUrl:'/settings'});
 testRouter.push('/transaction/new?occurrenceId=00000000-0000-4000-8000-000000000001');
 expect(screen.getByText('Record payment')).toBeTruthy();
 const buttons=screen.getAllByRole(Platform.OS==='ios'?'button':'tab').filter(node=>node.props.role===Platform.select({ios:'button',default:'tab'}));
 expect(buttons).toHaveLength(4);
 for(const label of ['Overview','Transactions','Reports','Settings'])expect(buttons.some(node=>within(node).queryByText(label))).toBe(true);
 testRouter.back('/settings');
 testRouter.push('/transaction/new?visit=fresh-manual-visit');
 expect(screen.getByText('Add Transaction')).toBeTruthy();
 expect(navigation.getSearchParams()).not.toHaveProperty('occurrenceId');
});
