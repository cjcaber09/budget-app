import {darkColors,lightColors} from '../src/styles/theme';

const rgb=(hex:string)=>hex.slice(1).match(/../g)!.map(value=>Number.parseInt(value,16));
function luminance(channels:number[]) {
 const [r,g,b]=channels.map(value=>value/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
 return r*0.2126+g*0.7152+b*0.0722;
}
function contrast(foreground:number[],background:number[]) {
 const a=luminance(foreground),b=luminance(background);
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
const blend=(foreground:string,background:string,opacity:number)=>rgb(foreground).map((value,i)=>value*opacity+rgb(background)[i]*(1-opacity));

test('dark text and placeholders stay readable across page, card and control surfaces',()=>{
 for(const background of [darkColors.background,darkColors.surface,darkColors.surfaceAlt,darkColors.controlBackground,darkColors.inputBackground]){
  for(const foreground of [darkColors.text,darkColors.muted,darkColors.subtle])expect(contrast(rgb(foreground),rgb(background))).toBeGreaterThanOrEqual(4.5);
 }
});
test('primary action labels and selected states have readable contrast',()=>{
 for(const fill of [darkColors.primary,darkColors.primaryHover])expect(contrast(rgb(darkColors.onPrimary),rgb(fill))).toBeGreaterThanOrEqual(4.5);
 expect(contrast(rgb(darkColors.primary),rgb(darkColors.selected))).toBeGreaterThanOrEqual(4.5);
 expect(contrast(rgb(darkColors.onPrimary),blend(darkColors.primary,darkColors.surface,0.88))).toBeGreaterThanOrEqual(4.5);
});
test('control outlines and focus indicators remain distinct including the pressed opacity',()=>{
 for(const background of [darkColors.surface,darkColors.surfaceAlt,darkColors.controlBackground,darkColors.inputBackground]){
  expect(contrast(rgb(darkColors.controlBorder),rgb(background))).toBeGreaterThanOrEqual(3);
  expect(contrast(blend(darkColors.controlBorder,background,0.88),rgb(background))).toBeGreaterThanOrEqual(3);
  expect(contrast(rgb(darkColors.primary),rgb(background))).toBeGreaterThanOrEqual(3);
 }
});
test('new light control roles preserve the existing light surfaces and borders',()=>{
 expect(lightColors.inputBackground).toBe(lightColors.surface);
 expect(lightColors.controlBackground).toBe(lightColors.surface);
 expect(lightColors.controlBorder).toBe(lightColors.border);
});
