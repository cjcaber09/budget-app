import {updateProgress,updateRestartSafe,type UpdateSafety} from '../../src/domain/appUpdates';
const safe:UpdateSafety={pathname:'/',foreground:true,keyboard:false,mutations:0,blockers:0,help:false,scan:false,accountOperation:false};
test.each(['/', '/transactions', '/reports', '/settings'])('permits deliberate restart from idle %s',pathname=>expect(updateRestartSafe({...safe,pathname})).toBe(true));
test.each([
 {pathname:'/transaction/new'}, {pathname:'/transfer/id'}, {foreground:false}, {keyboard:true}, {mutations:1}, {blockers:1}, {help:true}, {scan:true}, {accountOperation:true},
])('keeps restart behind ongoing work: %j',override=>expect(updateRestartSafe({...safe,...override})).toBe(false));
test.each([undefined,null,NaN,Infinity,-.1,1.1,'0.5'])('never invents progress for %s',value=>expect(updateProgress(value)).toBeUndefined());
test('uses real bounded progress without rounding an unfinished download to complete',()=>{
 expect(updateProgress(0)).toBe(0);expect(updateProgress(.329)).toBe(32);expect(updateProgress(.999)).toBe(99);expect(updateProgress(1)).toBe(100);
});
