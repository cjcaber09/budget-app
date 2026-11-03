import {isCalendarDate} from '../../supabase/functions/ocr/shared';
export const DATE_FORMATS=['long','mdy','dmy','iso'] as const;
export type DateFormat=typeof DATE_FORMATS[number];
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
export function formatDisplayDate(day:string,preference:DateFormat='long'):string {
 if(!isCalendarDate(day))return 'Date unavailable';
 const [year,month,date]=day.split('-');
 switch(preference){
  case 'mdy':return `${month}/${date}/${year}`;
  case 'dmy':return `${date}/${month}/${year}`;
  case 'iso':return day;
  default:return `${months[Number(month)-1]} ${Number(date)}, ${year}`;
 }
}
