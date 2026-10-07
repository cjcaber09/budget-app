import { useContext,useState } from 'react';
import { View,Text,TextInput,Switch,Modal,ScrollView,KeyboardAvoidingView,Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Plus,ChevronRight,X,Trash2 } from 'lucide-react-native';
import { MotionPressable } from './MotionPressable';
import { useFormStyles } from '../styles/forms';
import { createThemedStyles,type,useColors } from '../styles/theme';
import { draftItem,parseItemDrafts,type ItemDraft } from '../domain/itemDrafts';
import { centsToDecimal,decimalToCents,MAX_MONEY_CENTS,type TransactionItemKind } from '../../supabase/functions/ocr/shared';
import { formatMoney } from '../domain/money';

const KINDS:[TransactionItemKind,string][]=[['item','Item'],['deduction','Discount'],['tax','Tax'],['fee','Fee'],['adjustment','Adjustment']];
type Direction='income'|'expense'|null;
function kindName(kind:TransactionItemKind,direction:Direction) {
 return direction==='income'&&kind==='item'?'Earning':direction==='income'&&kind==='deduction'?'Deduction':direction==='income'&&kind==='tax'?'Tax withheld':KINDS.find(([value])=>value===kind)![1];
}
export function TransactionItemsEditor({drafts,onChange,transactionType='expense'}:{drafts:ItemDraft[];onChange:(rows:ItemDraft[])=>void;transactionType?:Direction}) {
 const form=useFormStyles();const styles=useStyles();const colors=useColors();
 const [editing,setEditing]=useState<{row:ItemDraft;isNew:boolean;index:number}|null>(null);
 const capped=drafts.length>=100;
 const open=(row:ItemDraft,index:number,isNew=false)=>setEditing({row:{...row},index,isNew});
 return <View style={styles.section}>
  <View accessibilityElementsHidden={!!editing} importantForAccessibility={editing?'no-hide-descendants':'auto'}>
  <View style={styles.titleRow}><Text style={form.title}>{transactionType==='income'?'Income details':'Items'}</Text><Text style={styles.caption}>{drafts.length} {drafts.length===1?'row':'rows'}</Text></View>
  <Text style={form.subtitle}>{drafts.length?'Tap a row to edit its details. Counted rows determine the total.':'Add receipt rows, or keep a single manual amount.'}</Text>
  {drafts.length>0&&<View accessibilityRole="list" style={styles.table}>
   <View style={styles.tableHeader}><Text style={[styles.columnLabel,styles.descriptionColumn]}>Item / details</Text><Text style={[styles.columnLabel,styles.quantityColumn]}>Qty</Text><Text style={[styles.columnLabel,styles.amountColumn]}>Amount</Text><View style={styles.chevronColumn}/></View>
   {drafts.map((row,index)=>{const cents=decimalToCents(row.amount);const amount=cents===null?'Enter amount':formatMoney((row.negative?-cents:cents)/100);const status=row.requiresCountingReview?'Needs review':row.isPaymentSummary?'Payment amount':!row.affectsTotal?'Informational':row.kind==='tax'&&row.taxIncluded?'Included tax':kindName(row.kind,transactionType);
    return <MotionPressable key={row.id} accessibilityLabel={`Edit row ${index+1}`} accessibilityHint={`${row.label||'Untitled item'}, ${amount}, ${status}`} style={styles.tableRow} onPress={()=>open(row,index)}>
     <View style={styles.descriptionColumn}><Text style={styles.itemLabel}>{row.label||'Untitled item'}</Text><Text style={[styles.caption,row.requiresCountingReview&&{color:colors.warning}]}>{status}</Text></View>
     <Text style={styles.quantityColumn}>{row.kind==='item'?(row.quantity??'—'):'—'}</Text>
     <View style={styles.amountColumn}><Text style={styles.itemAmount}>{amount}</Text>{row.kind==='item'&&row.unitPriceCents!==null&&<Text style={styles.unitPrice}>{formatMoney(row.unitPriceCents/100)} each</Text>}</View>
     <ChevronRight size={14} color={colors.subtle}/>
    </MotionPressable>;
   })}
  </View>}
  <View style={[form.optionRow,{marginTop:16}]}>{[['item','Item'],['deduction','Discount / adjustment']].map(([kind,label])=><MotionPressable key={kind} disabled={capped} style={styles.addButton} accessibilityLabel={`Add ${label.toLowerCase()}`} onPress={()=>open({...draftItem(),kind:kind as TransactionItemKind},drafts.length,true)}><Plus size={16} color={colors.primary}/><Text style={styles.addText}>{transactionType==='income'?kind==='item'?'Earning':'Deduction / adjustment':label}</Text></MotionPressable>)}</View>
  {capped&&<Text style={styles.caption}>100-row limit reached. Remove a row to add another.</Text>}
  </View>
  {editing&&<ItemEditorSheet key={editing.row.id} row={editing.row} index={editing.index} isNew={editing.isNew} direction={transactionType} onClose={()=>setEditing(null)} onSave={row=>{if(editing.isNew&&drafts.length>=100)return false;onChange(editing.isNew?[...drafts,row]:drafts.map(item=>item.id===row.id?row:item));setEditing(null);return true;}} onDelete={()=>{onChange(drafts.filter(item=>item.id!==editing.row.id));setEditing(null);}}/>}
 </View>;
}

function ItemEditorSheet({row,index,isNew,direction,onClose,onSave,onDelete}:{row:ItemDraft;index:number;isNew:boolean;direction:Direction;onClose:()=>void;onSave:(row:ItemDraft)=>boolean;onDelete:()=>void}) {
 const form=useFormStyles();const styles=useStyles();const colors=useColors();const reduced=useReducedMotion();const insets=useContext(SafeAreaInsetsContext);
 const [draft,setDraft]=useState(row);const [price,setPrice]=useState(row.unitPriceCents===null?'':centsToDecimal(row.unitPriceCents));const [error,setError]=useState('');
 const prefix=`Row ${index+1}`;
 const patch=(change:Partial<ItemDraft>)=>{setDraft(value=>({...value,...change}));setError('');};
 function save() {
  if(draft.kind==='item'&&draft.quantity!==null&&(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(draft.quantity)||Number(draft.quantity)<=0)){setError('Quantity must be positive, with up to three decimal places.');return;}
  const unitPrice=draft.kind==='item'&&price.trim()?decimalToCents(price):null;
  if(draft.kind==='item'&&price.trim()&&(!/^\d+(?:\.\d{0,2})?$/.test(price)||unitPrice===null||unitPrice<0||unitPrice>MAX_MONEY_CENTS)){setError('Enter a valid unit price with up to two decimal places.');return;}
  const next={...draft,unitPriceCents:unitPrice};const parsed=parseItemDrafts([next]);
  if(parsed.error){setError(parsed.error.replace('Row 1: ','').replace(/^./,letter=>letter.toUpperCase()));return;}
  if(!onSave(next))setError('100-row limit reached. Cancel and remove a row first.');
 }
 return <Modal visible transparent animationType={reduced?'none':'slide'} onRequestClose={onClose} statusBarTranslucent>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modal}>
   <MotionPressable style={styles.scrim} accessibilityLabel="Close item editor" onPress={onClose}/>
   <View style={[styles.sheet,{paddingBottom:Math.max(insets?.bottom??0,16)}]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
    <View style={styles.grabber}/>
    <View style={styles.sheetHeader}><View style={{flex:1}}><Text accessibilityRole="header" style={styles.sheetTitle}>{isNew?'Add item':'Edit item'}</Text><Text style={styles.caption}>Only this row changes when you save.</Text></View><MotionPressable accessibilityLabel="Cancel item edit" style={styles.closeButton} onPress={onClose}><X size={22} color={colors.text}/></MotionPressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
     <Text style={form.label}>Label</Text><TextInput style={form.input} placeholderTextColor={colors.subtle} accessibilityLabel={`${prefix} label`} placeholder="What is this row for?" value={draft.label} maxLength={200} onChangeText={label=>patch({label})}/>
     <Text style={form.label}>Line amount</Text><TextInput style={form.input} placeholderTextColor={colors.subtle} accessibilityLabel={`${prefix} amount`} keyboardType="decimal-pad" value={draft.amount} placeholder="0.00" onChangeText={amount=>patch({amount})}/>
     <Text style={form.label}>Kind</Text><View style={form.optionRow}>{KINDS.map(([kind])=><MotionPressable key={kind} accessibilityLabel={`${prefix}: ${kindName(kind,direction)}`} accessibilityState={{selected:draft.kind===kind}} style={[form.chip,draft.kind===kind&&form.chipSelected]} onPress={()=>{
      if(kind===draft.kind)return;
      const party=direction==='income'?'recipient':direction==='expense'?'sender':'unknown';
      patch({kind,taxIncluded:false,negative:false,isPaymentSummary:kind==='item'&&draft.isPaymentSummary,feeParty:kind==='fee'?party:null,requiresCountingReview:kind==='fee'&&party==='unknown',quantity:kind==='item'?draft.quantity:null,unitPriceCents:kind==='item'?draft.unitPriceCents:null});if(kind!=='item')setPrice('');
     }}><Text style={draft.kind===kind?form.chipTextSelected:form.chipText}>{kindName(kind,direction)}</Text></MotionPressable>)}</View>
     {draft.kind==='item'&&<><Text style={form.label}>Quantity (optional)</Text><TextInput style={form.input} placeholderTextColor={colors.subtle} accessibilityLabel={`${prefix} quantity`} keyboardType="decimal-pad" value={draft.quantity??''} placeholder="1" onChangeText={quantity=>patch({quantity:quantity.trim()||null})}/><Text style={form.label}>Unit price (optional)</Text><TextInput style={form.input} placeholderTextColor={colors.subtle} accessibilityLabel={`${prefix} unit price`} keyboardType="decimal-pad" value={price} placeholder="0.00" onChangeText={value=>{setPrice(value);setError('');}}/><Text style={[styles.caption,{marginTop:8}]}>The line amount determines the total. Quantity and unit price are details.</Text></>}
     {draft.kind==='tax'&&<View style={styles.toggle}><Text style={styles.toggleText}>Already included in the amount</Text><Switch accessibilityLabel={`${prefix} tax included`} value={draft.taxIncluded} onValueChange={taxIncluded=>patch({taxIncluded})} trackColor={{true:colors.primary}}/></View>}
     {draft.kind==='fee'&&<><Text style={form.label}>Fee charged to</Text><View style={form.optionRow}>{(['sender','recipient','unknown'] as const).map(feeParty=><MotionPressable key={feeParty} style={[form.chip,draft.feeParty===feeParty&&form.chipSelected]} accessibilityState={{selected:draft.feeParty===feeParty}} onPress={()=>patch({feeParty,requiresCountingReview:feeParty==='unknown',affectsTotal:feeParty==='unknown'||feeParty!==(direction==='income'?'recipient':'sender')?false:draft.affectsTotal})}><Text style={draft.feeParty===feeParty?form.chipTextSelected:form.chipText}>{feeParty==='unknown'?'Unclear':feeParty[0].toUpperCase()+feeParty.slice(1)}</Text></MotionPressable>)}</View></>}
     {!draft.isPaymentSummary&&!(draft.kind==='tax'&&draft.taxIncluded)&&<><Text style={form.label}>Impact on total</Text><Text style={styles.caption}>{draft.requiresCountingReview?'Choose whether this row affects the total.':draft.affectsTotal?'Counted in total':'Informational — excluded from total'}</Text><View style={[form.optionRow,{marginTop:8}]}>{[true,false].map(affectsTotal=><MotionPressable key={String(affectsTotal)} accessibilityLabel={`${prefix}: ${affectsTotal?'Include in total':'Informational'}`} accessibilityState={{selected:!draft.requiresCountingReview&&draft.affectsTotal===affectsTotal}} style={[form.chip,!draft.requiresCountingReview&&draft.affectsTotal===affectsTotal&&form.chipSelected]} onPress={()=>patch({affectsTotal,requiresCountingReview:false})}><Text style={!draft.requiresCountingReview&&draft.affectsTotal===affectsTotal?form.chipTextSelected:form.chipText}>{affectsTotal?'Include in total':'Informational'}</Text></MotionPressable>)}</View></>}
     {draft.isPaymentSummary&&<Text style={[styles.caption,{marginTop:16}]}>This payment amount is counted once in the total.</Text>}
     {draft.kind==='adjustment'&&<View style={[form.optionRow,{marginTop:16}]}>{[false,true].map(negative=><MotionPressable key={String(negative)} accessibilityLabel={`${prefix}: ${negative?'Subtract':'Add'}`} accessibilityState={{selected:draft.negative===negative}} style={[form.chip,draft.negative===negative&&form.chipSelected]} onPress={()=>patch({negative})}><Text style={draft.negative===negative?form.chipTextSelected:form.chipText}>{negative?'Subtract':'Add'}</Text></MotionPressable>)}</View>}
     {!!error&&<Text accessibilityRole="alert" style={[form.error,{marginTop:16}]}>{error}</Text>}
     {!isNew&&<MotionPressable accessibilityLabel={`Remove row ${index+1}`} style={styles.deleteButton} onPress={onDelete}><Trash2 size={17} color={colors.danger}/><Text style={styles.deleteText}>Remove this item</Text></MotionPressable>}
    </ScrollView>
    <View style={styles.sheetFooter}><MotionPressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></MotionPressable><MotionPressable accessibilityLabel={isNew?'Save new item':'Save item'} style={styles.saveButton} onPress={save}><Text style={styles.saveText}>{isNew?'Add item':'Save item'}</Text></MotionPressable></View>
   </View>
  </KeyboardAvoidingView>
 </Modal>;
}
const useStyles=createThemedStyles(c=>({
 section:{marginTop:28},titleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},caption:{...type.label,fontWeight:'400',color:c.muted,lineHeight:19},
 table:{borderTopWidth:1,borderBottomWidth:1,borderColor:c.border},tableHeader:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:12,backgroundColor:c.surfaceAlt},columnLabel:{...type.label,color:c.muted,fontSize:12},
 descriptionColumn:{flex:1,minWidth:60,gap:4},quantityColumn:{...type.number,color:c.muted,fontSize:12,width:30,textAlign:'center'},amountColumn:{width:98,alignItems:'flex-end',textAlign:'right',gap:3},chevronColumn:{width:14},
 tableRow:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:16,minHeight:72,borderBottomWidth:1,borderBottomColor:c.border},itemLabel:{...type.body,color:c.text,fontWeight:'500',fontSize:14},itemAmount:{...type.number,color:c.text,fontSize:13,textAlign:'right',lineHeight:19},unitPrice:{...type.label,fontWeight:'400',fontSize:11,color:c.muted,textAlign:'right'},
 addButton:{flexDirection:'row',alignItems:'center',gap:8,minHeight:48,borderWidth:1,borderColor:c.border,borderRadius:8,paddingHorizontal:14,paddingVertical:12},addText:{...type.label,color:c.primary},
 modal:{flex:1,justifyContent:'flex-end'},scrim:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:c.scrim},sheet:{maxHeight:'92%',width:'100%',maxWidth:560,alignSelf:'center',backgroundColor:c.surface,borderTopLeftRadius:20,borderTopRightRadius:20},grabber:{height:4,width:36,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginTop:12},sheetHeader:{flexDirection:'row',alignItems:'center',gap:16,paddingHorizontal:24,paddingTop:16,paddingBottom:8},sheetTitle:{...type.heading,color:c.text,marginBottom:4},closeButton:{width:48,height:48,alignItems:'center',justifyContent:'center'},sheetContent:{paddingHorizontal:24,paddingBottom:20},toggle:{flexDirection:'row',alignItems:'center',gap:12,marginTop:20,minHeight:48},toggleText:{...type.body,color:c.text,flex:1},
 deleteButton:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,minHeight:48,borderWidth:1,borderColor:c.border,borderRadius:10,marginTop:24},deleteText:{...type.label,color:c.danger},sheetFooter:{flexDirection:'row',gap:12,paddingHorizontal:24,paddingTop:14,borderTopWidth:1,borderTopColor:c.border},cancelButton:{minHeight:52,flex:1,borderWidth:1,borderColor:c.border,borderRadius:10,alignItems:'center',justifyContent:'center'},cancelText:{...type.body,color:c.text},saveButton:{minHeight:52,flex:1,backgroundColor:c.primary,borderRadius:10,alignItems:'center',justifyContent:'center'},saveText:{...type.body,color:c.onPrimary,fontWeight:'600'},
}));
