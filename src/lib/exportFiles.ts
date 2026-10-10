import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const folder=()=>new Directory(Paths.cache,'budget-exports');
export async function clearExportFiles() {
  if(Platform.OS==='web')return;
  const directory=folder();if(directory.exists)directory.delete();
}
export async function shareCsv(contents:string,filename:string,isCurrent:()=>boolean=()=>true) {
  if(!isCurrent())throw new Error('Account or export settings changed. Please retry.');
  if(Platform.OS==='web'){
    const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(!await Sharing.isAvailableAsync())throw new Error('File sharing is unavailable on this phone.');
  if(!isCurrent())return;
  const directory=folder();directory.create({idempotent:true,intermediates:true});
  const file=new File(directory,filename);
  try{
    file.create({overwrite:true});file.write(contents);
    if(isCurrent())await Sharing.shareAsync(file.uri,{mimeType:'text/csv',UTI:'public.comma-separated-values-text',dialogTitle:'Export CSV'});
  }finally{if(file.exists)file.delete();}
}
