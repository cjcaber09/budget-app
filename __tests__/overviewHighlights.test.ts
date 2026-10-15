import {decodeOverviewHighlights} from '../src/domain/overviewHighlights';
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
const context={owner,month:'2026-10-01',timezone:'Asia/Manila',today:'2026-10-16'};
const activity={id,user_id:owner,row_kind:'transaction',type:'expense',category_id:null,category:'',payment_account:'Cash',payment_type:'Cash',last_four:null,note:null,amount:'12.34',financial_date:'2026-10-16',occurred_at:'2026-10-16T00:00:00Z'};
const fixture=()=>({...context,version:1,recent:[activity],categories:[{id:null,key:'uncategorized',name:'Uncategorized',color:'#69736A',spent:'1000000000001'}],methods:[{id,key:'cash',name:'Cash',paymentType:'Cash',lastFour:null,archived:false,count:1004,spent:'-1'}]});
test('decodes exact aggregates without individual caps and permits signed method net spending',()=>{
 const result=decodeOverviewHighlights(fixture(),context);expect(result.categories.data?.[0].spent).toBe(1000000000001);expect(result.methods.data?.[0]).toMatchObject({count:1004,spent:-1});expect(result.recent.data?.[0].amount).toBe(12.34);
});
test.each(['owner','month','timezone','today'])('rejects a mismatched %s for the entire envelope',key=>{
 expect(()=>decodeOverviewHighlights({...fixture(),[key]:'wrong'},context)).toThrow('Highlights changed');
});
test('malformed sections fail independently rather than inventing empty lists',()=>{
 const result=decodeOverviewHighlights({...fixture(),categories:[{...fixture().categories[0],spent:'9007199254740992'}]},context);
 expect(result.categories.error).toBeTruthy();expect(result.recent.data).toHaveLength(1);expect(result.methods.data).toHaveLength(1);
});
test('uses composite identities for a refund sharing an ordinary id',()=>{
 const result=decodeOverviewHighlights({...fixture(),recent:[activity,{...activity,row_kind:'refund',type:'refund',refund_of:id}]},context);
 expect(result.recent.data).toHaveLength(2);
 expect(decodeOverviewHighlights({...fixture(),recent:[activity,activity]},context).recent.error).toBeTruthy();
});
test('rejects foreign records, unrenderable labels, oversized lists and duplicate rank identities',()=>{
 expect(decodeOverviewHighlights({...fixture(),recent:[{...activity,user_id:id}]},context).recent.error).toBeTruthy();
 expect(decodeOverviewHighlights({...fixture(),recent:[{...activity,payment_account:{}}]},context).recent.error).toBeTruthy();
 expect(decodeOverviewHighlights({...fixture(),recent:Array(6).fill(activity)},context).recent.error).toBeTruthy();
 expect(decodeOverviewHighlights({...fixture(),methods:[fixture().methods[0],fixture().methods[0]]},context).methods.error).toBeTruthy();
});
