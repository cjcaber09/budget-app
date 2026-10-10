import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanupFixtures} from './cleanup.mjs';
import {authDiagnostics} from './auth-diagnostics.mjs';

const remoteText='REMOTE_SENTINEL\nforged log';
test('one failed cleanup cannot skip remaining fixtures or leak remote details',async t=>{
 const previous=process.exitCode,attempted=[];
 const log=t.mock.method(console,'error',()=>{});
 try{
  const complete=await cleanupFixtures([
   ()=>{attempted.push('first');throw new Error(remoteText);},
   ()=>{attempted.push('second');return Promise.resolve();},
   ()=>{attempted.push('third');return Promise.reject(new Error(remoteText));},
  ]);
  assert.equal(complete,false);assert.equal(process.exitCode,1);
  assert.deepEqual(attempted,['first','second','third']);
  assert.deepEqual(log.mock.calls.map(call=>call.arguments),[['FAIL synthetic cleanup. Some fixtures remain; remote error details were not logged.']]);
 }finally{process.exitCode=previous;}
});

test('cleanup failure leaves the original test exception intact',async t=>{
 const previous=process.exitCode;
 t.mock.method(console,'error',()=>{});
 try{
  await assert.rejects(async()=>{
   try{throw new Error('Original assertion failed');}
   finally{await cleanupFixtures([()=>Promise.reject(new Error(remoteText))]);}
  },{message:'Original assertion failed'});
 }finally{process.exitCode=previous;}
});

test('successful cleanup does not mark the command failed',async()=>{
 const previous=process.exitCode;
 assert.equal(await cleanupFixtures([()=>Promise.resolve()]),true);
 assert.equal(process.exitCode,previous);
});

test('SMTP diagnostics emit only fixed labels, booleans and bounded numeric values',()=>{
 const output=authDiagnostics({smtp_host:remoteText,smtp_port:remoteText,smtp_admin_email:remoteText,smtp_user:remoteText,smtp_pass:remoteText,mailer_otp_length:remoteText,mailer_otp_exp:Infinity,password_min_length:{secret:remoteText},jwt_secret:remoteText});
 assert.equal(JSON.stringify(output).includes(remoteText),false);
 assert.equal(output.smtpPort,null);assert.equal(output.otpLength,null);assert.equal(output.otpExpirySeconds,null);assert.equal(output.passwordMinimum,null);
 for(const value of Object.values(output))assert.ok(value===null||typeof value==='boolean');
 const valid=authDiagnostics({smtp_port:'587',mailer_otp_length:8,mailer_otp_exp:3600,password_min_length:8});
 assert.equal(valid.smtpPort,587);assert.equal(valid.otpLength,8);assert.equal(valid.otpExpirySeconds,3600);assert.equal(valid.passwordMinimum,8);
});
