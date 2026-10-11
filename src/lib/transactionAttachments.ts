import {Platform} from 'react-native';
import {File} from 'expo-file-system';
import {getDocumentAsync} from 'expo-document-picker';
import {createRequestId} from '../domain/ocr';
import {prepareProofImage} from './prepareProofImage';
import {supabase} from './supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';

export interface ProofFile {id:string;name:string;mime:'image/webp'|'application/pdf';bytes:Uint8Array}
export interface SavedAttachment {id:string;user_id:string;transaction_id:string;file_name:string;mime_type:string;size_bytes:number;object_path:string;status:'pending'|'ready'}
export async function pickProofFile():Promise<ProofFile|null>{
 const result=await getDocumentAsync({type:['image/*','application/pdf'],copyToCacheDirectory:true,multiple:false});
 if(result.canceled)return null;
 const asset=result.assets[0];
 if(asset.mimeType==='application/pdf'||/\.pdf$/i.test(asset.name)){
  if(asset.size&&asset.size>10485760)throw new Error('Choose a PDF under 10 MB.');
  const bytes=Platform.OS==='web'?new Uint8Array(await (await fetch(asset.uri)).arrayBuffer()):await new File(asset.uri).bytes();
  if(bytes.length>10485760||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Choose a valid PDF under 10 MB.');
  return {id:createRequestId(),name:asset.name.replace(/[\u0000-\u001f/\\]/g,'').slice(0,160)||'Receipt.pdf',mime:'application/pdf',bytes};
 }
 return {id:createRequestId(),...await prepareProofImage(asset.uri,asset.name)};
}
export async function uploadProof(transactionId:string,file:ProofFile,owner:string):Promise<void>{
 const checkOwner=()=>{if(usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('Sign in again to upload this attachment.');};
 checkOwner();
 const reserved=await supabase.rpc('reserve_transaction_attachment',{p_transaction:transactionId,p_file:{id:file.id,name:file.name,mime:file.mime,size:file.bytes.length}});
 if(reserved.error)throw new Error(reserved.error.code==='BA003'?'This file draft expired. Finish, reopen the transaction and attach it again.':reserved.error.code==='22023'&&reserved.error.message==='Up to 3 proof files per transaction'?'This transaction already has three attachments. Finish and remove one before adding another.':'Could not prepare the attachment. Retry the upload.');
 const row=reserved.data as SavedAttachment;
 if(!row||row.user_id!==owner||row.transaction_id!==transactionId||row.id!==file.id||row.object_path!==`${owner}/${transactionId}/${file.id}.${file.mime==='application/pdf'?'pdf':'webp'}`)throw new Error('Attachment details could not be confirmed.');
 checkOwner();if(row.status==='ready')return;
 const upload=await supabase.storage.from('budget-tracker-proofs').upload(row.object_path,file.bytes,{contentType:file.mime,upsert:false});
 checkOwner();
 // A lost upload response can leave the object present. The RPC verifies it.
 const finished=await supabase.rpc('finish_transaction_attachment',{p_id:file.id});
 if(finished.error)throw new Error(upload.error?'Could not upload the attachment. Retry the upload.':'Could not confirm the attachment. Retry the upload.');
}
