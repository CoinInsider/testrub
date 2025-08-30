export function formatAmount(amount: string | number, decimals: number = 6): string {
  if (typeof amount === 'number') {
    amount = amount.toString();
  }
  const [integer, fractional] = amount.split('.');
  if (!fractional || fractional.length <= decimals) {
    return amount;
  }
  return `${integer}.${fractional.substring(0, decimals)}`;
}
