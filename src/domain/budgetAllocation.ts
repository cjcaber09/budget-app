export function allocationError(amount:number,current:number,allocated:number,allowance:number|null) {
  if(allowance===null){
    if(amount>0&&amount>=current)return 'Set a monthly allowance on Overview before allocating category budgets.';
    return null;
  }
  if(allocated-current+amount>allowance&&amount>=current)return 'Combined category budgets cannot exceed the monthly allowance. Reduce another category budget or increase the allowance first.';
  return null;
}
export function allocationCapacity(current:number,allocated:number,allowance:number|null) {
  return allowance===null?null:Math.max(0,allowance-allocated+current);
}
