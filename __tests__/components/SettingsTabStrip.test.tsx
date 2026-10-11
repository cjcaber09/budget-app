import {fireEvent,render,screen} from '@testing-library/react-native';
import {SettingsTabStrip} from '../../src/components/SettingsTabStrip';
const icon=(()=>null)as any;
const tabs=[{id:'one',label:'First',icon},{id:'two',label:'Second',icon},{id:'three',label:'Third',icon}];
it('offers a scroll cue for concealed tabs and switches it to a return cue at the end',()=>{
 render(<SettingsTabStrip tabs={tabs} selected="one" onSelect={jest.fn()}/>);
 const strip=screen.getByLabelText('Settings tabs');
 fireEvent(strip,'layout',{nativeEvent:{layout:{width:200}}});
 fireEvent(strip,'contentSizeChange',600,48);
 expect(screen.getByLabelText('More settings tabs')).toBeTruthy();
 fireEvent.scroll(strip,{nativeEvent:{contentOffset:{x:400,y:0}}});
 expect(screen.getByLabelText('Back to first settings tabs')).toBeTruthy();
});
