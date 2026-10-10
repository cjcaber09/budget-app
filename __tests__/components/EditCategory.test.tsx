import {render,screen,fireEvent} from '@testing-library/react-native';
import EditCategoryScreen from '../../app/(tabs)/category/[id]';
const mockDelete=jest.fn(),mockBack=jest.fn();
let mockError: Error|null=null;
jest.mock('expo-router',()=>({useRouter:()=>({back:mockBack}),useLocalSearchParams:()=>({id:'category-1',name:'Food',color:'#55816A',visit:'visit-1'})}));
jest.mock('../../src/hooks/useCategories',()=>({
 useUpdateCategory:()=>({mutate:jest.fn(),isPending:false}),
 useDeleteCategory:()=>({mutate:mockDelete,isPending:false,isError:!!mockError,error:mockError}),
}));
beforeEach(()=>{mockDelete.mockReset();mockBack.mockReset();mockError=null;});
it('requires confirmation and supports cancelling without deleting',()=>{
 render(<EditCategoryScreen/>);
 fireEvent.press(screen.getByLabelText('Delete category'));
 expect(mockDelete).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Cancel'));
 expect(screen.queryByText('Confirm delete')).toBeNull();
});
it('deletes only the selected category and returns after success',()=>{
 mockDelete.mockImplementation((id,options)=>options.onSuccess());
 render(<EditCategoryScreen/>);
 fireEvent.press(screen.getByLabelText('Delete category'));
 fireEvent.press(screen.getByText('Confirm delete'));
 expect(mockDelete).toHaveBeenCalledWith('category-1',expect.any(Object));
 expect(mockBack).toHaveBeenCalledTimes(1);
});
it('keeps the form available when deletion is rejected',()=>{
 mockError=new Error('Reassign this category’s transactions and bills first.');
 render(<EditCategoryScreen/>);
 expect(screen.getByText(mockError.message)).toBeTruthy();
 expect(screen.getByDisplayValue('Food')).toBeTruthy();
 expect(mockBack).not.toHaveBeenCalled();
});
