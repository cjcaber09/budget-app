import {render,screen,fireEvent} from '@testing-library/react-native';
import {RecurringRuleForm} from '../../src/components/RecurringRuleForm';
const categories=[{id:'c',user_id:'u',name:'Rent',color:'#55816A',icon:'home',is_default:false}];
function mount(){const save=jest.fn();render(<RecurringRuleForm categories={categories} submitLabel="Save bill" initialValues={{categoryId:'c',amount:'100',note:'Rent',frequency:'monthly',nextDueDate:'2026-11-15'}} onSubmit={save}/>);return save;}
it('saves per-bill lead time and financial-timezone clock',()=>{
 const save=mount();fireEvent(screen.getByLabelText('Remind me about this bill'),'valueChange',true);fireEvent.press(screen.getByText('3 days before'));fireEvent.changeText(screen.getByLabelText('Reminder time'),'18:30');fireEvent.press(screen.getByText('Save bill'));expect(save).toHaveBeenCalledWith(expect.objectContaining({reminderEnabled:true,reminderDaysBefore:3,reminderTime:'18:30'}));
});
it('blocks an invalid clock but lets the user turn reminders off',()=>{
 const save=mount();fireEvent(screen.getByLabelText('Remind me about this bill'),'valueChange',true);fireEvent.changeText(screen.getByLabelText('Reminder time'),'25:70');fireEvent.press(screen.getByText('Save bill'));expect(save).not.toHaveBeenCalled();expect(screen.getByText(/Enter reminder time/)).toBeTruthy();fireEvent(screen.getByLabelText('Remind me about this bill'),'valueChange',false);fireEvent.press(screen.getByText('Save bill'));expect(save).toHaveBeenCalledWith(expect.objectContaining({reminderEnabled:false,reminderTime:'09:00'}));
});
