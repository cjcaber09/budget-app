import {usePreferencesStore} from '../stores/usePreferencesStore';
import {formatDisplayDate} from '../domain/dateFormat';
import {localDateKey} from '../domain/transactionDates';
export function useDateFormatter(){
 const preference=usePreferencesStore(s=>s.profile?.date_format??'long');
 return (day:string)=>formatDisplayDate(day,preference);
}
export function useDateTimeFormatter(){
 const profile=usePreferencesStore(s=>s.profile);
 return (value:string)=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Date unavailable';
  const zone=profile?.timezone??'UTC';
  return formatDisplayDate(localDateKey(date,zone),profile?.date_format)+' · '+new Intl.DateTimeFormat('en',{timeStyle:'short',timeZone:zone}).format(date);
 };
}
