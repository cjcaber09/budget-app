import {ScrollView,View,Text} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useTransferEntry} from '../../../src/hooks/useTransferEntry';
import {usePaymentMethods} from '../../../src/hooks/usePaymentMethods';
import {TransferEntryForm} from '../../../src/components/TransferEntryForm';
import {QueryState} from '../../../src/components/QueryState';
import {usePageLayout} from '../../../src/styles/pageLayout';
import {useFormStyles} from '../../../src/styles/forms';
import {usePreferencesStore} from '../../../src/stores/usePreferencesStore';
import {useState} from 'react';
import type {PaymentTransfer} from '../../../src/domain/paymentMethods';
export default function TransferScreen(){const {id,visit}=useLocalSearchParams<{id:string;visit?:string}>();const owner=usePreferencesStore(s=>s.profile?.user_id);return <TransferVisit key={`${owner}:${id}:${visit}`} id={id}/>;}
function TransferVisit({id}:{id:string}){
 const query=useTransferEntry(id),methods=usePaymentMethods(),layout=usePageLayout(),form=useFormStyles(),router=useRouter();
 const [snapshot,setSnapshot]=useState<PaymentTransfer|null>(null);
 if(!snapshot&&query.data?.transfer&&!query.isFetching)setSnapshot(query.data.transfer);
 return <ScrollView style={layout.screen} contentContainerStyle={layout.scrollContent} keyboardShouldPersistTaps="handled"><View style={layout.card}>{snapshot?<TransferEntryForm initial={snapshot} methods={methods.methods??[]} onClose={()=>router.back()}/>:<QueryState loading={query.isPending||query.isFetching} error={query.isError} retry={()=>void query.refetch()}>{query.isSuccess?<Text style={form.subtitle}>This transfer is no longer available.</Text>:null}</QueryState>}</View></ScrollView>;
}
