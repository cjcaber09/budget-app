import type {ReportSnapshot} from '../src/domain/reports';
export const owner='00000000-0000-4000-8000-000000000001';
export const category='00000000-0000-4000-8000-000000000002';
export const context={owner,month:'2026-10-01',timezone:'Asia/Manila',today:'2026-10-09'};
export function rawReport():any {
 return {...context,start:context.month,end:'2026-11-01',totals:{income:'150000',expense:'60000',net:'90000',count:3},categories:[{key:category,id:category,name:'Groceries',color:'#55816A',budget:'50000',spent:'60000',count:2}],sources:[{key:'unspecified',id:null,name:'Unspecified',archived:false,amount:'150000',count:1}],accounts:[{key:'cash',id:null,name:'Cash',archived:false,amount:'60000',count:2,paymentType:'Cash',lastFour:null}],daily:[{day:'2026-10-01',amount:'60000',future:false}],weekly:[{day:'2026-10-01',end:'2026-10-04',amount:'60000',future:false}],monthly:[{day:'2025-11-01',amount:'15000',future:false},{day:'2026-10-01',amount:'60000',future:false}],categoryMonthly:[{key:category,day:'2026-10-01',amount:'60000'}],comparison:{start:'2026-10-01',end:'2026-10-10',previousStart:'2026-09-01',previousEnd:'2026-09-10',current:{income:'150000',expense:'60000',net:'90000'},previous:{income:'0',expense:'15000',net:'-15000'},delta:{income:'150000',expense:'45000',net:'105000'},categories:[{key:category,name:'Groceries',current:'60000',previous:'15000',delta:'45000'}]}};
}
export function decodedReport():ReportSnapshot {const {decodeReportSnapshot}=require('../src/domain/reports');return decodeReportSnapshot(rawReport(),context);}
