import {primaryTabIndex,tabCutoutPath,tabCenter,liquidLaneY,liquidTabPath} from '../../src/domain/tabNavigation';
import {TAB_BAR_HEIGHT} from '../../src/constants/layout';
const routes=['index','transactions','reports','settings','transaction/new','budget/[categoryId]'].map(name=>({name,key:name}));
test('all primary tabs and originating detail tabs resolve',()=>{
 for(let index=0;index<4;index++)expect(primaryTabIndex({index,routes})).toBe(index);
 expect(primaryTabIndex({index:4,routes,history:[{key:'index'},{key:'transaction/new'}]})).toBe(0);
 expect(primaryTabIndex({index:4,routes,history:[{key:'settings'},{key:'transaction/new'}]})).toBe(3);
 expect(primaryTabIndex({index:5,routes,history:[{key:'budget/[categoryId]'}]})).toBe(2);
});
test('all tab circles settle around their icons outside the fixed centre action',()=>{
 for(const width of [320,360,390,560]){
  for(let i=0;i<4;i++){
   const x=tabCenter(i,width);
   expect(liquidLaneY(x,width)).toBe(28);
   expect(Math.abs(x-width/2)).toBeGreaterThanOrEqual(64);
  }
  expect(liquidLaneY(width/2,width)-20).toBeGreaterThan(34);
  expect(liquidLaneY(width/2,width)+20).toBeLessThan(TAB_BAR_HEIGHT);
  for(let a=0;a<width;a+=8)for(let b=0;b<width;b+=16)expect(liquidTabPath(a,b,width)).not.toMatch(/NaN|Infinity/);
  expect(liquidTabPath(tabCenter(0,width),tabCenter(3,width),width)).toBe(liquidTabPath(tabCenter(3,width),tabCenter(0,width),width));
 }
});
test('notch geometry remains finite at all tab centres and phone widths',()=>{
 for(const width of [320,360,390,560])for(let i=0;i<4;i++)expect(tabCutoutPath((i+.5)*width/4,width,72,width<360?24:28)).not.toMatch(/NaN|Infinity/);
});
