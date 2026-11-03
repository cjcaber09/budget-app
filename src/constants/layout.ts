// Taller than react-navigation bottom-tabs' default (49px on web) to give
// the floating AddTransactionFab room to rest on top of the bar without
// crowding the tab icons/labels beneath it.
export const TAB_BAR_HEIGHT = 84;
export const TAB_RAISE=28;
export function tabBodyHeight(fontScale:number){return TAB_BAR_HEIGHT+Math.max(0,fontScale-1)*60;}
