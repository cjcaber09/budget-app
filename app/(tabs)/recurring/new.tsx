import {PaymentMethodPicker} from '../../../src/components/PaymentMethodPicker';
import { View, ScrollView } from 'react-native';
import {useState} from 'react';
import {createRequestId} from '../../../src/domain/ocr';
import {QueryState} from '../../../src/components/QueryState';
import {usePreferencesStore} from '../../../src/stores/usePreferencesStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddRecurringRule } from '../../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../../src/components/RecurringRuleForm';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function NewRecurringRuleScreen() {
  const {visit}=useLocalSearchParams<{visit?:string}>();
  const owner=usePreferencesStore(state=>state.profile?.user_id);
  return <NewBill key={`${owner}:${visit??'direct'}`}/>;
}
function NewBill() {
  const pageLayout = usePageLayout();
  const router = useRouter();
  const [createId]=useState(createRequestId);
  const query = useCategories();
  const categories=query.data;
  const { mutate: addRecurringRule, isPending: submitting } = useAddRecurringRule();

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <QueryState loading={query.isPending} error={query.isError} retry={()=>void query.refetch()}>
        {categories&&<>
        <RecurringRuleForm paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>}
          categories={categories}
          submitting={submitting} submitLabel="Add Recurring Bill"
          onSubmit={(values) => addRecurringRule({...values,createId}, { onSuccess: () => router.back() })}
        />
        </>}
        </QueryState>
      </View>
    </ScrollView>
  );
}
